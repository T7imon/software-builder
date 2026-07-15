import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentJobClaim, CodexClaimContextBinding } from "@software-builder/database";
import type { ReadyWorkspaceReader, VerifiedWorkspace, WorkspaceConfig } from "@software-builder/project-workspace";
import { CodexRuntimeContextResolver } from "./codex-runtime-context.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const projectId = "00000000-0000-4000-8000-000000000001";
const projectRevision = "a".repeat(64);
const workspaceId = "00000000-0000-4000-8000-000000000002";
const assignmentId = "00000000-0000-4000-8000-000000000003";
const agentId = "00000000-0000-4000-8000-000000000004";
const jobId = "00000000-0000-4000-8000-000000000005";
const gitBranch = "builder/project-00000000/revision-aaaaaaaaaaaaaaaa";
const temporaryDirectories: string[] = [];

const task = {
  schemaVersion: 1 as const,
  projectId,
  taskId: "task/planner",
  attemptId: "attempt/planner",
  runId: "run/planner",
  role: "PLANNER" as const,
  scenario: "SUCCESS" as const,
  inputRef: "synthetic/planner-input",
  repairOrdinal: 0,
};

const claim: AgentJobClaim = {
  jobId,
  projectId,
  task,
  assignment: { assignmentId, agentId, agentKey: "synthetic-planner", agentVersion: 1 },
  workerId: "worker/synthetic",
  claimId: "claim/synthetic",
  fencingToken: 1,
  leaseGeneration: 1,
  jobVersion: 1,
  leaseExpiresAt: new Date("2026-01-01T00:01:00.000Z"),
  retryCount: 0,
  maxRetries: 0,
  cancelRequested: false,
  cancellationRequestId: null,
  cancellationSequence: null,
  completionSequence: null,
  runtimeWatermark: 0,
  cancelAttemptCount: 0,
  cancelMaxAttempts: 3,
  cancelRemainingAttempts: 3,
  cancelLastOutcome: null,
  cancelLastErrorCode: null,
  cancelConfirmedAt: null,
  cancelConfirmationKind: null,
};

const binding: CodexClaimContextBinding = {
  projectId,
  jobId,
  projectRevision,
  workspaceId,
  assignmentId,
  requiredRole: "PLANNER",
  agentId,
  agentKey: "synthetic-planner",
  agentVersion: 1,
  planningTask: "Create one bounded synthetic plan.",
  createdBy: "synthetic-context-test",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  registryInstructions: "Plan only the assigned synthetic task.",
  registryRole: "PLANNER",
  assignmentRole: "PLANNER",
  assignmentStatus: "ASSIGNED",
  workspaceStatus: "READY",
  workspaceGitBranch: gitBranch,
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(): Promise<{
  workspacePath: string;
  codexHome: string;
  workspaceConfig: WorkspaceConfig;
  verified: VerifiedWorkspace;
}> {
  const root = await mkdtemp(join(tmpdir(), "builder-codex-context-"));
  temporaryDirectories.push(root);
  const workspaceRoot = join(root, "workspaces");
  const workspacePath = join(workspaceRoot, "project");
  const codexHome = join(root, "codex-home");
  await Promise.all([mkdir(workspacePath, { recursive: true }), mkdir(codexHome)]);
  return {
    workspacePath,
    codexHome,
    workspaceConfig: {
      workspaceRoot,
      canonicalWorkspaceRoot: workspaceRoot,
      builderRepositoryRoot: repositoryRoot,
    },
    verified: {
      workspaceId: workspaceId as never,
      projectId: projectId as never,
      projectRevision: projectRevision as never,
      status: "READY",
      absolutePath: workspacePath,
      relativePath: "project",
      gitBranch,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: "synthetic-context-test",
      readyAt: new Date("2026-01-01T00:00:00.000Z"),
      archivedAt: null,
      failureCode: null,
      gitStatus: [],
    },
  };
}

function resolver(
  value: Awaited<ReturnType<typeof fixture>>,
  overrides: {
    reader?: ReadyWorkspaceReader;
    home?: string;
    environment?: Readonly<Record<string, string | undefined>>;
    loadedBinding?: CodexClaimContextBinding;
  } = {},
): CodexRuntimeContextResolver {
  return new CodexRuntimeContextResolver({
    repository: {
      loadBindingForClaim: vi.fn(async () => overrides.loadedBinding ?? binding),
    } as never,
    workspaceReader: overrides.reader ?? { getReadyWorkspace: vi.fn(async () => value.verified) },
    workspaceConfig: value.workspaceConfig,
    environment: overrides.environment ?? {
      PATH: "synthetic-path",
      USERPROFILE: join(value.workspaceConfig.workspaceRoot, "synthetic-user"),
      OPENAI_API_KEY: "must-not-pass",
      DATABASE_PASSWORD: "must-not-pass",
    },
    builderCodexHome: overrides.home === undefined ? value.codexHome : overrides.home,
  });
}

describe("CodexRuntimeContextResolver", () => {
  it("binds the exact persistent READY workspace, assignment, local CLI, and filtered environment", async () => {
    const value = await fixture();
    const context = await resolver(value).resolve(claim);
    expect(context).toMatchObject({
      projectId,
      projectRevision,
      workspaceId,
      workspacePath: value.workspacePath,
      builderCodexHome: value.codexHome,
      assignmentRole: "PLANNER",
      registryRole: "PLANNER",
      cli: { packageVersion: "0.144.4" },
      childEnvironment: { CODEX_HOME: value.codexHome, PATH: "synthetic-path" },
    });
    expect(JSON.stringify(context.childEnvironment)).not.toContain("must-not-pass");
  });

  it("rejects missing, mismatched, and archived workspace state before any provider exists", async () => {
    const value = await fixture();
    await expect(
      resolver(value, {
        reader: { getReadyWorkspace: vi.fn(async () => ({ ...value.verified, gitBranch: "builder/wrong" })) },
      }).resolve(claim),
    ).rejects.toThrow("CODEX_WORKSPACE_BINDING_MISMATCH");
    await expect(
      resolver(value, {
        reader: { getReadyWorkspace: vi.fn(async () => Promise.reject(new Error("WORKSPACE_ARCHIVED"))) },
      }).resolve(claim),
    ).rejects.toThrow("WORKSPACE_ARCHIVED");
  });

  it("rejects project-local Codex configuration", async () => {
    const value = await fixture();
    await mkdir(join(value.workspacePath, ".codex"));
    await expect(resolver(value).resolve(claim)).rejects.toMatchObject({ code: "CODEX_PROJECT_CONFIG_FORBIDDEN" });
  });

  it("rejects absent or workspace-overlapping dedicated CODEX_HOME", async () => {
    const value = await fixture();
    await expect(resolver(value, { home: "" }).resolve(claim)).rejects.toMatchObject({
      code: "BUILDER_CODEX_HOME_REQUIRED",
    });
    await expect(resolver(value, { home: value.workspacePath }).resolve(claim)).rejects.toMatchObject({
      code: "BUILDER_CODEX_HOME_UNSAFE",
    });
  });

  it("rejects assignment and role mismatches before workspace verification", async () => {
    const value = await fixture();
    const workspaceReader = { getReadyWorkspace: vi.fn(async () => value.verified) };
    await expect(
      resolver(value, {
        reader: workspaceReader,
        loadedBinding: { ...binding, assignmentId: "00000000-0000-4000-8000-000000000099" },
      }).resolve(claim),
    ).rejects.toThrow("CODEX_ASSIGNMENT_BINDING_MISMATCH");
    expect(workspaceReader.getReadyWorkspace).not.toHaveBeenCalled();
    await expect(resolver(value).resolve({ ...claim, task: { ...task, role: "EXECUTOR" } })).rejects.toThrow(
      "CODEX_ROLE_UNSUPPORTED",
    );
  });
});
