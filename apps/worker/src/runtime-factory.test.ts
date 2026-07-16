import { describe, expect, it, vi } from "vitest";
import {
  FakeAgentRuntime,
  canonicalAgentOperationDigest,
  type CodexRuntimeContext,
  type RuntimeStore,
} from "@software-builder/agent-runtime";
import type { AgentJobClaim } from "@software-builder/database";
import { createAgentRuntime } from "./runtime-factory.js";

const projectId = "00000000-0000-4000-8000-000000000001";
const task = {
  schemaVersion: 1 as const,
  projectId,
  taskId: "task/planner",
  attemptId: "attempt/planner",
  runId: "run/planner",
  role: "PLANNER" as const,
  scenario: "SUCCESS" as const,
  inputRef: "synthetic/planner",
  repairOrdinal: 0,
};
const claim: AgentJobClaim = {
  jobId: "00000000-0000-4000-8000-000000000002",
  projectId,
  task,
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
const store: RuntimeStore = { load: vi.fn(async () => undefined), save: vi.fn(async () => undefined) };
const context: CodexRuntimeContext = {
  guard: {
    jobId: claim.jobId,
    workerId: claim.workerId,
    claimId: claim.claimId,
    fencingToken: claim.fencingToken,
    leaseGeneration: claim.leaseGeneration,
    claimedJobVersion: claim.jobVersion,
  },
  assignmentRef: "00000000-0000-4000-8000-000000000003",
  agentId: "00000000-0000-4000-8000-000000000004",
  agentKey: "synthetic-planner",
  agentVersion: 1,
  assignmentRole: "PLANNER",
  registryRole: "PLANNER",
  registryInstructions: "Plan only the bounded task.",
  projectId,
  projectRevision: "a".repeat(64),
  workspaceId: "00000000-0000-4000-8000-000000000005",
  workspacePath: "C:\\synthetic-workspace",
  repositoryRoot: "C:\\synthetic-repository",
  planningTask: "Produce one plan.",
  taskDigest: canonicalAgentOperationDigest("enqueue", task),
  builderCodexHome: "C:\\synthetic-codex-home",
  childEnvironment: { CODEX_HOME: "C:\\synthetic-codex-home" },
  cli: {
    packageName: "@openai/codex",
    packageVersion: "0.132.0",
    packageRoot: "C:\\node_modules\\@openai\\codex",
    binPath: "C:\\node_modules\\@openai\\codex\\bin\\codex.js",
  },
  outputSchemaPath: "C:\\codex-planner-output.schema.json",
  timeoutMs: 1_000,
};

describe("createAgentRuntime", () => {
  it("returns the Fake runtime by default without resolving Codex context or touching the provider", async () => {
    const resolve = vi.fn(async () => context);
    const execute = vi.fn();
    const runtime = await createAgentRuntime({
      mode: "fake",
      store,
      claim,
      codexContextResolver: { resolve } as never,
      codexProvider: { execute },
    });
    expect(runtime).toBeInstanceOf(FakeAgentRuntime);
    expect(resolve).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("constructs the Codex runtime only after explicit activation and context resolution", async () => {
    const resolve = vi.fn(async () => context);
    const runtime = await createAgentRuntime({
      mode: "codex",
      store,
      claim,
      codexRepository: {} as never,
      codexContextResolver: { resolve } as never,
      codexProvider: { execute: vi.fn() },
    });
    expect(runtime).not.toBeInstanceOf(FakeAgentRuntime);
    expect(resolve).toHaveBeenCalledWith(claim);
  });

  it.each(["ARCHITECT", "SECURITY", "LEGAL", "EXECUTOR", "QA", "REVIEWER", "ORCHESTRATOR"])(
    "rejects the unsupported %s role before resolving context",
    async (role) => {
      const resolve = vi.fn(async () => context);
      await expect(
        createAgentRuntime({
          mode: "codex",
          store,
          claim: { ...claim, task: { ...claim.task, role: role as never } },
          codexRepository: {} as never,
          codexContextResolver: { resolve } as never,
        }),
      ).rejects.toThrow("CODEX_ROLE_UNSUPPORTED");
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it("never falls back to fake when Codex is explicitly selected but not configured", async () => {
    await expect(createAgentRuntime({ mode: "codex", store, claim })).rejects.toThrow("CODEX_RUNTIME_NOT_CONFIGURED");
  });
});
