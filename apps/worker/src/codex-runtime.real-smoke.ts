import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CodexExecProvider,
  FakeAgentRuntime,
  NodeCodexProcessLauncher,
  WorkerProcessBootIdentity,
  canonicalAgentOperationDigest,
  type AgentResult,
  type AgentTask,
  type CodexChildProcess,
  type CodexProcessLauncher,
  type CodexProcessSpec,
} from "@software-builder/agent-runtime";
import type { ProjectId } from "@software-builder/core";
import {
  AgentJobRepository,
  PostgresCodexRuntimeRepository,
  PostgresPlanningOrchestratorRepository,
  PostgresWorkspaceRegistrationStore,
  createAgentJobCompletionContext,
  migrate,
  resetDatabase,
} from "@software-builder/database";
import { ProjectWorkspaceManager, loadWorkspaceConfig } from "@software-builder/project-workspace";
import type {
  PlanningJobResult,
  PlanningJobRole,
  PlanningResultOutcome,
  PlanningStatusView,
} from "@software-builder/workflow-engine";
import { CodexRuntimeContextResolver } from "./codex-runtime-context.js";
import { readWorkerConfiguration } from "./config.js";
import { PostgresRuntimeStore } from "./postgres-runtime-store.js";
import { createAgentRuntime } from "./runtime-factory.js";

const enabled = process.env.AGENT_RUNTIME === "codex"
  && process.env.CODEX_REAL_SMOKE_TEST === "1"
  && typeof process.env.BUILDER_CODEX_HOME === "string"
  && process.env.BUILDER_CODEX_HOME.length > 0;
const smokeWorkerId = "codex-real-smoke-worker";
const smokeWorkerBootIdentity = WorkerProcessBootIdentity.create();
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

class CountingLauncher implements CodexProcessLauncher {
  readonly specs: CodexProcessSpec[] = [];
  constructor(private readonly inner = NodeCodexProcessLauncher.create()) {}
  start(spec: CodexProcessSpec): CodexChildProcess {
    this.specs.push(spec);
    return this.inner.start(spec);
  }
}

const waitForDatabaseQuiescence = async (pool: Pool, timeoutMs = 5_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const active = await pool.query<{ count: string }>(
      "SELECT count(*) count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()",
    );
    if (Number(active.rows[0]!.count) === 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  }
  throw new Error("Timed out waiting for Codex smoke database quiescence");
};

async function workspaceDigest(workspacePath: string): Promise<string> {
  const entries: string[] = [];
  const pending = [workspacePath];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (current === workspacePath && entry.name === ".git") continue;
      const absolute = join(current, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error("SMOKE_WORKSPACE_SYMLINK_FORBIDDEN");
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) {
        const name = relative(workspacePath, absolute).replaceAll("\\", "/");
        entries.push(`${name}\0${digest((await readFile(absolute)).toString("base64"))}`);
      }
    }
  }
  return digest(entries.sort().join("\n"));
}

async function removeSmokeRoot(path: string): Promise<void> {
  try {
    const [canonicalTemp, canonicalPath, info] = await Promise.all([realpath(tmpdir()), realpath(path), lstat(path)]);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      dirname(canonicalPath) !== canonicalTemp ||
      !canonicalPath.startsWith(join(canonicalTemp, "builder-codex-real-smoke-"))
    ) return;
    await rm(canonicalPath, { recursive: true, force: true });
  } catch {
    // The smoke result remains authoritative; cleanup failure is handled by the enclosing test process.
  }
}

interface GitProbeResult {
  readonly exitCode: number;
  readonly stdout: string;
}

interface GitStateSnapshot {
  readonly head: string;
  readonly branch: string;
  readonly status: string;
  readonly unstagedDiff: string;
  readonly stagedDiff: string;
}

async function gitProbe(workspacePath: string, args: readonly string[]): Promise<GitProbeResult> {
  return new Promise((resolveOutput, reject) => {
    const child = spawn("git", [...args], {
      cwd: workspacePath,
      shell: false,
      windowsHide: process.platform === "win32",
      env: {
        ...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
        ...(process.env.PATHEXT === undefined ? {} : { PATHEXT: process.env.PATHEXT }),
        ...(process.env.SystemRoot === undefined ? {} : { SystemRoot: process.env.SystemRoot }),
        ...(process.env.WINDIR === undefined ? {} : { WINDIR: process.env.WINDIR }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderrBytes = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > 1024 * 1024) child.kill();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > 64 * 1024) child.kill();
    });
    child.once("error", () => reject(new Error("SMOKE_GIT_FAILED")));
    child.once("close", (code) => {
      if (code === null) reject(new Error("SMOKE_GIT_FAILED"));
      else resolveOutput({ exitCode: code, stdout });
    });
  });
}

async function gitOutput(workspacePath: string, args: readonly string[]): Promise<string> {
  const result = await gitProbe(workspacePath, args);
  if (result.exitCode !== 0) throw new Error("SMOKE_GIT_FAILED");
  return result.stdout;
}

async function gitStateSnapshot(workspacePath: string): Promise<GitStateSnapshot> {
  const head = await gitProbe(workspacePath, ["rev-parse", "--verify", "HEAD"]);
  if (![0, 1, 128].includes(head.exitCode)) throw new Error("SMOKE_GIT_FAILED");
  return {
    head: head.exitCode === 0 ? head.stdout : "UNBORN_HEAD",
    branch: await gitOutput(workspacePath, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    status: await gitOutput(workspacePath, ["status", "--porcelain=v1", "--untracked-files=all"]),
    unstagedDiff: await gitOutput(workspacePath, ["diff", "--no-ext-diff", "--binary", "--"]),
    stagedDiff: await gitOutput(workspacePath, ["diff", "--cached", "--no-ext-diff", "--binary", "--"]),
  };
}

describe.skipIf(!enabled)("real Codex Exec PLANNER smoke", () => {
  let admin: Pool;
  let temporaryRoot: string;
  const adminUrl = process.env.TEST_DATABASE_URL;
  const identities = new Map<PlanningJobRole, { agentId: string; agentKey: string }>();

  beforeAll(async () => {
    if (!adminUrl) throw new Error("TEST_DATABASE_URL is required for the opt-in Codex smoke test");
    const parsed = new URL(adminUrl);
    if (!parsed.pathname.toLowerCase().endsWith("_test") || !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
      throw new Error("The Codex smoke test is restricted to a loopback _test database");
    }
    admin = new Pool({ connectionString: adminUrl });
    await waitForDatabaseQuiescence(admin);
    await resetDatabase(admin, { connectionString: adminUrl, environment: "test" });
    expect(await migrate(admin)).toEqual([]);
    temporaryRoot = await mkdtemp(join(tmpdir(), "builder-codex-real-smoke-"));
  }, 30_000);

  afterAll(async () => {
    if (admin) await admin.end();
    if (temporaryRoot) await removeSmokeRoot(temporaryRoot);
    if (adminUrl) {
      const cleanup = new Pool({ connectionString: adminUrl });
      try {
        await waitForDatabaseQuiescence(cleanup);
        await resetDatabase(cleanup, { connectionString: adminUrl, environment: "test" });
      } finally {
        await cleanup.end();
      }
    }
  }, 30_000);

  async function activateRole(role: PlanningJobRole): Promise<void> {
    const identity = { agentId: randomUUID(), agentKey: `smoke-${role.toLowerCase().replaceAll("_", "-")}` };
    identities.set(role, identity);
    await admin.query(
      "INSERT INTO builder.agent_registry_identities(agent_key,agent_id,created_by) VALUES($1,$2,'codex-smoke')",
      [identity.agentKey, identity.agentId],
    );
    await admin.query(
      `INSERT INTO builder.agent_registry_versions(
        agent_id,agent_key,display_name,role,description,version,revision,status,instructions,
        allowed_capabilities,forbidden_capabilities,created_by
      ) VALUES($1,$2,$3,$4,'Synthetic Codex smoke planning agent.',1,1,'ACTIVE',
        'Read the synthetic workspace and produce only the assigned bounded plan.',
        ARRAY['planning.synthetic'],ARRAY['production.deploy','github.write','network.search'],'codex-smoke')`,
      [identity.agentId, identity.agentKey, `Smoke ${role}`, role],
    );
  }

  function planningResult(
    jobId: string,
    runtimeResultId: string,
    projectRevision: string,
    result: AgentResult,
    outcome: PlanningResultOutcome = "PASS",
  ): PlanningJobResult {
    const artifact = result.artifacts[0]!;
    return {
      jobId,
      runtimeResultId,
      projectRevision,
      outcome,
      objectRef: artifact.objectRef,
      digest: artifact.digest,
      requirements: [],
    };
  }

  it("executes exactly one read-only synthetic PLANNER turn without workspace, Git, MCP, or web effects", async () => {
    const configuration = readWorkerConfiguration(process.env);
    expect(configuration).toMatchObject({ agentRuntime: "codex", codexRealSmokeTest: true });
    if (!configuration.builderCodexHome || !adminUrl) throw new Error("CODEX_SMOKE_CONFIGURATION_MISSING");
    for (const role of ["PLANNER", "ARCHITECT", "SECURITY", "LEGAL_DE_EU"] as const) await activateRole(role);

    const orchestrator = PostgresPlanningOrchestratorRepository.forTestHarness(admin);
    const runtimeJobs = new AgentJobRepository(admin);
    const smokeWorkerIdentity = smokeWorkerBootIdentity.get();
    await runtimeJobs.registerWorkerProcess(smokeWorkerId, smokeWorkerIdentity);
    const codexRepository = new PostgresCodexRuntimeRepository(admin);
    const completeRuntimeRole = async (status: PlanningStatusView, role: PlanningJobRole): Promise<PlanningJobResult> => {
      const planningJob = (await orchestrator.listPlanningJobs(status.projectId, status.planningRunId)).find(
        (item) => item.role === role,
      );
      if (!planningJob) throw new Error(`Missing ${role} smoke planning job`);
      const claim = await runtimeJobs.claimNext(smokeWorkerId, `claim-${randomUUID()}`, 120_000, smokeWorkerIdentity);
      if (!claim || claim.jobId !== planningJob.backgroundJobId) throw new Error(`Unexpected smoke setup claim for ${role}`);
      const result = (await new FakeAgentRuntime().startRun({
        runId: claim.task.runId,
        projectId: claim.projectId,
        taskId: claim.task.taskId,
        attemptId: claim.task.attemptId,
        idempotencyKey: `smoke-setup-${claim.jobId}-${claim.fencingToken}`,
        requestDigest: canonicalAgentOperationDigest("startRun", claim.task),
        fencingToken: claim.fencingToken,
        task: claim.task,
      })).result;
      if (!result) throw new Error("Fake smoke setup runtime produced no result");
      await runtimeJobs.complete(createAgentJobCompletionContext(claim), result);
      const runtimeResultId = (await admin.query<{ agent_result_id: string }>(
        "SELECT agent_result_id FROM builder.background_jobs WHERE id=$1",
        [claim.jobId],
      )).rows[0]!.agent_result_id;
      return planningResult(planningJob.id, runtimeResultId, status.projectRevision, result);
    };

    const projectId = randomUUID() as ProjectId;
    const projectRevision = digest("codex-real-smoke-approved-revision");
    const owner = "codex-smoke-owner";
    await admin.query("INSERT INTO builder.projects(id,project_type,status) VALUES($1,'FULL_STACK_WEB','PLANNING')", [projectId]);
    let planning = await orchestrator.startPlanning(projectId, projectRevision, owner);
    planning = await orchestrator.handleJobResult(
      projectId,
      planning.planningRunId,
      await completeRuntimeRole(planning, "PLANNER"),
    );
    planning = await orchestrator.handleJobResult(
      projectId,
      planning.planningRunId,
      await completeRuntimeRole(planning, "ARCHITECT"),
    );
    const security = await completeRuntimeRole(planning, "SECURITY");
    const legal = await completeRuntimeRole(planning, "LEGAL_DE_EU");
    await orchestrator.handleJobResult(projectId, planning.planningRunId, security);
    planning = await orchestrator.handleJobResult(projectId, planning.planningRunId, legal);
    planning = await orchestrator.recordOwnerDecision(
      projectId,
      planning.planningRunId,
      "APPROVE",
      owner,
      "codex-smoke-owner-approval",
    );
    expect(planning.status).toBe("READY_FOR_IMPLEMENTATION");

    const workspaceRoot = join(temporaryRoot, "workspaces");
    await mkdir(workspaceRoot);
    const workspaceConfig = await loadWorkspaceConfig(
      { BUILDER_WORKSPACE_ROOT: workspaceRoot },
      { builderRepositoryRoot: repositoryRoot },
    );
    const workspaceStore = PostgresWorkspaceRegistrationStore.forTestHarness(
      admin,
      projectId,
      owner,
      adminUrl,
    );
    const workspaceManager = new ProjectWorkspaceManager(workspaceConfig, workspaceStore);
    await workspaceManager.createWorkspace({
      projectId,
      projectRevision: projectRevision as never,
      createdBy: owner,
    });
    const workspace = await workspaceManager.getReadyWorkspace({
      projectId,
      projectRevision: projectRevision as never,
    });
    await writeFile(
      join(workspace.absolutePath, "PROJECT.md"),
      "# Synthetic read-only planner smoke\n\nPlan a tiny status endpoint. No implementation is requested.\n",
      "utf8",
    );
    await workspaceManager.getReadyWorkspace({ projectId, projectRevision: projectRevision as never });

    const planner = identities.get("PLANNER")!;
    const task: AgentTask = {
      schemaVersion: 1,
      projectId,
      taskId: randomUUID(),
      attemptId: randomUUID(),
      runId: randomUUID(),
      role: "PLANNER",
      scenario: "SUCCESS",
      inputRef: "synthetic/codex-real-smoke",
      repairOrdinal: 0,
    };
    const enqueued = await runtimeJobs.enqueue({
      task,
      messageId: randomUUID(),
      consumerIdentity: "codex-real-smoke",
      idempotencyKey: `codex-smoke-enqueue-${task.runId}`,
      requestDigest: canonicalAgentOperationDigest("enqueue", task),
      traceId: randomUUID(),
      maxRetries: 0,
    });
    const assignmentId = randomUUID();
    await admin.query(
      `INSERT INTO builder.agent_assignments(
        assignment_id,project_id,job_id,required_role,agent_id,agent_key,agent_version,created_by
      ) VALUES($1,$2,$3,'PLANNER',$4,$5,1,'codex-real-smoke')`,
      [assignmentId, projectId, enqueued.jobId, planner.agentId, planner.agentKey],
    );
    await codexRepository.bindJob({
      projectId,
      jobId: enqueued.jobId,
      projectRevision,
      workspaceId: workspace.workspaceId,
      assignmentId,
      agentId: planner.agentId,
      agentKey: planner.agentKey,
      agentVersion: 1,
      planningTask: "Read PROJECT.md and return one concise requirements plan for the synthetic status endpoint.",
      createdBy: "codex-real-smoke",
    });
    const claim = await runtimeJobs.claimNext(smokeWorkerId, "codex-real-smoke-claim", 120_000, smokeWorkerIdentity);
    if (!claim || claim.jobId !== enqueued.jobId) throw new Error("Unexpected real Codex smoke claim");

    const beforeDigest = await workspaceDigest(workspace.absolutePath);
    const beforeGitState = await gitStateSnapshot(workspace.absolutePath);
    expect(beforeGitState.branch.trim()).toBe(workspace.gitBranch);
    expect(beforeGitState.unstagedDiff).toBe("");
    expect(beforeGitState.stagedDiff).toBe("");
    const launcher = new CountingLauncher();
    const provider = new CodexExecProvider(launcher);
    const contextResolver = new CodexRuntimeContextResolver({
      repository: codexRepository,
      workspaceReader: workspaceManager,
      workspaceConfig,
      environment: process.env,
      builderCodexHome: configuration.builderCodexHome,
      ...(configuration.codexModel === undefined ? {} : { model: configuration.codexModel }),
    });
    const store = new PostgresRuntimeStore(runtimeJobs, claim);
    const runtime = await createAgentRuntime({
      mode: "codex",
      store,
      claim,
      codexRepository,
      codexContextResolver: contextResolver,
      codexProvider: provider,
    });
    await runtimeJobs.authorizeRuntimeStart({
      jobId: claim.jobId,
      workerId: claim.workerId,
      workerProcessIdentity:claim.workerProcessIdentity,
      processLaunchId:claim.processLaunchId,
      claimId: claim.claimId,
      fencingToken: claim.fencingToken,
      jobVersion: claim.jobVersion,
      leaseGeneration: claim.leaseGeneration,
    });
    const status = await runtime.startRun(store.command("startRun"));
    const diagnosticRun = await codexRepository.load(claim.jobId);
    if (status.state !== "SUCCEEDED" || status.result?.status !== "SUCCESS") {
      throw new Error([
        "CODEX_SMOKE_DIAGNOSTIC",
        `runtimeState=${status.state}`,
        `resultStatus=${status.result?.status ?? "NONE"}`,
        `resultErrorCode=${status.result?.errorCode ?? "NONE"}`,
        `ledgerState=${diagnosticRun?.state ?? "NONE"}`,
        `ledgerErrorCode=${diagnosticRun?.errorCode ?? "NONE"}`,
        `policyEvent=${diagnosticRun?.policyEvent ?? "NONE"}`,
        `hasThreadId=${Boolean(diagnosticRun?.threadId)}`,
        `hasModel=${Boolean(diagnosticRun?.model)}`,
        `outputStatus=${diagnosticRun?.output?.status ?? "NONE"}`,
        ...(diagnosticRun?.output
          ? [
              `outputSummary=${JSON.stringify(diagnosticRun.output.summary)}`,
              `outputRecommendedNextStep=${JSON.stringify(diagnosticRun.output.recommendedNextStep)}`,
              `requirementsCount=${diagnosticRun.output.requirements.length}`,
              `assumptionsCount=${diagnosticRun.output.assumptions.length}`,
              `openQuestionsCount=${diagnosticRun.output.openQuestions.length}`,
            ]
          : []),
      ].join(";"));
    }
    expect(status).toMatchObject({ state: "SUCCEEDED", terminal: true, result: { status: "SUCCESS" } });
    if (!status.result) throw new Error("Real Codex smoke returned no structured result");
    await store.persistProgress(status);
    const completionClaim = await runtimeJobs.loadClaim(store.guard());
    await runtimeJobs.complete(createAgentJobCompletionContext(completionClaim), status.result);

    expect(launcher.specs).toHaveLength(1);
    expect(launcher.specs[0]!.executable).toBe(process.execPath);
    expect(launcher.specs[0]!.arguments).toContain("--ignore-user-config");
    expect(launcher.specs[0]!.arguments).toContain("read-only");
    expect(launcher.specs[0]!.arguments).toContain('web_search="disabled"');
    expect(await workspaceDigest(workspace.absolutePath)).toBe(beforeDigest);
    expect(await gitStateSnapshot(workspace.absolutePath)).toEqual(beforeGitState);
    const ledger = (await admin.query<{ state: string; policy_event: string | null }>(
      "SELECT state,policy_event FROM builder.codex_exec_runs WHERE job_id=$1",
      [claim.jobId],
    )).rows[0];
    expect(ledger).toEqual({ state: "SUCCEEDED", policy_event: null });
    expect((await codexRepository.load(claim.jobId))?.output).toMatchObject({
      status: "SUCCEEDED",
      requirements: expect.any(Array),
      assumptions: expect.any(Array),
      openQuestions: expect.any(Array),
      recommendedNextStep: expect.any(String),
    });
    expect(Number((await admin.query<{ count: string }>(
      "SELECT count(*) count FROM builder.codex_exec_audit_events WHERE job_id=$1 AND event_type='START_RESERVED'",
      [claim.jobId],
    )).rows[0]!.count)).toBe(1);
  }, 300_000);
});
