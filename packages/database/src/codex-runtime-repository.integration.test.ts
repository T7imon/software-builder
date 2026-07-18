import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CODEX_CLI_VERSION,
  FakeAgentRuntime,
  canonicalAgentOperationDigest,
  codexPlannerOutputDigest,
  type AgentResult,
  type AgentTask,
  type CodexRuntimeGuard,
} from "@software-builder/agent-runtime";
import type { ProjectId } from "@software-builder/core";
import { deriveWorkspaceGitBranch, deriveWorkspaceRelativePath } from "@software-builder/project-workspace";
import type {
  PlanningJobResult,
  PlanningJobRole,
  PlanningResultOutcome,
  PlanningStatusView,
} from "@software-builder/workflow-engine";
import {
  AgentJobLeaseLostError,
  AgentJobRepository,
  PostgresCodexRuntimeRepository,
  PostgresPlanningOrchestratorRepository,
  createAgentJobCompletionContext,
} from "./index.js";
import { migrate, resetDatabase } from "./migrations.js";

const adminUrl = process.env.TEST_DATABASE_URL;
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const output = {
  status: "SUCCEEDED" as const,
  summary: "Synthetic persistent Codex planner result.",
  requirements: ["Keep the run read-only."],
  assumptions: [],
  openQuestions: [],
  recommendedNextStep: "Review the bounded synthetic plan.",
};

const waitForDatabaseQuiescence = async (pool: Pool, timeoutMs = 5_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const active = await pool.query<{ count: string }>(
      "SELECT count(*) count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()",
    );
    if (Number(active.rows[0]!.count) === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for Codex repository test database quiescence");
};

describe("Codex Exec runtime PostgreSQL integration", () => {
  let admin: Pool;
  let orchestrator: PostgresPlanningOrchestratorRepository;
  let runtimeJobs: AgentJobRepository;
  let codex: PostgresCodexRuntimeRepository;
  const versions = new Map<PlanningJobRole, number>();
  const identities = new Map<PlanningJobRole, { agentId: string; agentKey: string }>();

  beforeAll(async () => {
    if (!adminUrl) {
      throw new Error("TEST_DATABASE_URL ist fuer Codex-Exec-Integration verpflichtend; Skips sind nicht zulaessig.");
    }
    const parsed = new URL(adminUrl);
    if (!parsed.pathname.toLowerCase().endsWith("_test")) throw new Error("TEST_DATABASE_URL muss auf _test enden.");
    admin = new Pool({ connectionString: adminUrl });
    await waitForDatabaseQuiescence(admin);
    await resetDatabase(admin, { connectionString: adminUrl, environment: "test" });
    expect(await migrate(admin)).toEqual([]);
    orchestrator = PostgresPlanningOrchestratorRepository.forTestHarness(admin);
    runtimeJobs = new AgentJobRepository(admin);
    codex = new PostgresCodexRuntimeRepository(admin);
    for (const role of ["PLANNER", "ARCHITECT", "SECURITY", "LEGAL_DE_EU"] as const) await activateRole(role);
  }, 30_000);

  afterAll(async () => {
    if (admin) {
      await admin.end();
      const cleanup = new Pool({ connectionString: adminUrl! });
      try {
        await waitForDatabaseQuiescence(cleanup);
        await resetDatabase(cleanup, { connectionString: adminUrl!, environment: "test" });
      } finally {
        await cleanup.end();
      }
    }
  }, 30_000);

  async function activateRole(role: PlanningJobRole): Promise<void> {
    const identity = { agentId: randomUUID(), agentKey: `codex-${role.toLowerCase().replaceAll("_", "-")}` };
    identities.set(role, identity);
    const version = (versions.get(role) ?? 0) + 1;
    versions.set(role, version);
    await admin.query(
      "INSERT INTO builder.agent_registry_identities(agent_key,agent_id,created_by) VALUES($1,$2,'codex-integration')",
      [identity.agentKey, identity.agentId],
    );
    await admin.query(
      `INSERT INTO builder.agent_registry_versions(
        agent_id,agent_key,display_name,role,description,version,revision,status,instructions,
        allowed_capabilities,forbidden_capabilities,created_by
      ) VALUES($1,$2,$3,$4,'Synthetic Codex integration planning agent.',1,1,'ACTIVE',
        'Process only the assigned synthetic Development planning task.',
        ARRAY['planning.synthetic'],ARRAY['production.deploy','github.write'],'codex-integration')`,
      [identity.agentId, identity.agentKey, `Codex ${role}`, role],
    );
  }

  async function completeRuntimeRole(status: PlanningStatusView, role: PlanningJobRole): Promise<PlanningJobResult> {
    const planningJob = (await orchestrator.listPlanningJobs(status.projectId, status.planningRunId)).find(
      (item) => item.role === role,
    );
    if (!planningJob) throw new Error(`Missing ${role} planning job`);
    const claim = await runtimeJobs.claimNext(`codex-setup-${role.toLowerCase()}`, `claim-${randomUUID()}`, 120_000);
    if (!claim || claim.jobId !== planningJob.backgroundJobId) throw new Error(`Unexpected runtime claim for ${role}`);
    const result = (await new FakeAgentRuntime().startRun({
      runId: claim.task.runId,
      projectId: claim.projectId,
      taskId: claim.task.taskId,
      attemptId: claim.task.attemptId,
      idempotencyKey: `codex-setup-${claim.jobId}-${claim.fencingToken}`,
      requestDigest: canonicalAgentOperationDigest("startRun", claim.task),
      fencingToken: claim.fencingToken,
      task: claim.task,
    })).result;
    if (!result) throw new Error("Fake setup runtime produced no planning result");
    await runtimeJobs.complete(createAgentJobCompletionContext(claim), result);
    const runtimeResultId = (await admin.query<{ agent_result_id: string }>(
      "SELECT agent_result_id FROM builder.background_jobs WHERE id=$1",
      [claim.jobId],
    )).rows[0]!.agent_result_id;
    return planningResult(planningJob.id, runtimeResultId, status.projectRevision, result);
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

  async function approvedProject(label: string): Promise<{ projectId: ProjectId; projectRevision: string; planningRunId: string }> {
    const projectId = randomUUID() as ProjectId;
    const projectRevision = digest(`codex-approved:${label}`);
    const owner = `codex-owner-${label}`;
    await admin.query("INSERT INTO builder.projects(id,project_type,status) VALUES($1,'FULL_STACK_WEB','PLANNING')", [projectId]);
    let status = await orchestrator.startPlanning(projectId, projectRevision, owner);
    status = await orchestrator.handleJobResult(
      projectId,
      status.planningRunId,
      await completeRuntimeRole(status, "PLANNER"),
    );
    status = await orchestrator.handleJobResult(
      projectId,
      status.planningRunId,
      await completeRuntimeRole(status, "ARCHITECT"),
    );
    const security = await completeRuntimeRole(status, "SECURITY");
    const legal = await completeRuntimeRole(status, "LEGAL_DE_EU");
    await orchestrator.handleJobResult(projectId, status.planningRunId, security);
    status = await orchestrator.handleJobResult(projectId, status.planningRunId, legal);
    status = await orchestrator.recordOwnerDecision(
      projectId,
      status.planningRunId,
      "APPROVE",
      owner,
      `codex-approved-${label}`,
    );
    expect(status.status).toBe("READY_FOR_IMPLEMENTATION");
    return { projectId, projectRevision, planningRunId: status.planningRunId };
  }

  async function readyWorkspace(projectId: ProjectId, planningRunId: string, projectRevision: string): Promise<string> {
    const workspaceId = randomUUID();
    await admin.query(
      `INSERT INTO builder.project_workspaces(
        project_id,workspace_id,planning_run_id,project_revision,relative_path,git_branch,status,created_by
      ) VALUES($1,$2,$3,$4,$5,$6,'CREATING','codex-integration')`,
      [
        projectId,
        workspaceId,
        planningRunId,
        projectRevision,
        deriveWorkspaceRelativePath(projectId, projectRevision as never),
        deriveWorkspaceGitBranch(projectId, projectRevision as never),
      ],
    );
    await admin.query(
      "UPDATE builder.project_workspaces SET status='READY',ready_at=clock_timestamp() WHERE project_id=$1 AND workspace_id=$2 AND status='CREATING'",
      [projectId, workspaceId],
    );
    return workspaceId;
  }

  async function claimedCodexJob(label: string): Promise<{
    claim: NonNullable<Awaited<ReturnType<AgentJobRepository["claimNext"]>>>;
    guard: CodexRuntimeGuard;
    promptSha256: string;
  }> {
    const approved = await approvedProject(label);
    const workspaceId = await readyWorkspace(approved.projectId, approved.planningRunId, approved.projectRevision);
    const planner = identities.get("PLANNER")!;
    const task: AgentTask = {
      schemaVersion: 1,
      projectId: approved.projectId,
      taskId: randomUUID(),
      attemptId: randomUUID(),
      runId: randomUUID(),
      role: "PLANNER",
      scenario: "SUCCESS",
      inputRef: `synthetic/codex-${label}`,
      repairOrdinal: 0,
    };
    const enqueued = await runtimeJobs.enqueue({
      task,
      messageId: randomUUID(),
      consumerIdentity: `codex-integration-${label}`,
      idempotencyKey: `codex-enqueue-${label}-${task.runId}`,
      requestDigest: canonicalAgentOperationDigest("enqueue", task),
      traceId: randomUUID(),
      maxRetries: 0,
    });
    const assignmentId = randomUUID();
    await admin.query(
      `INSERT INTO builder.agent_assignments(
        assignment_id,project_id,job_id,required_role,agent_id,agent_key,agent_version,created_by
      ) VALUES($1,$2,$3,'PLANNER',$4,$5,1,'codex-integration')`,
      [assignmentId, approved.projectId, enqueued.jobId, planner.agentId, planner.agentKey],
    );
    await codex.bindJob({
      projectId: approved.projectId,
      jobId: enqueued.jobId,
      projectRevision: approved.projectRevision,
      workspaceId,
      assignmentId,
      agentId: planner.agentId,
      agentKey: planner.agentKey,
      agentVersion: 1,
      planningTask: `Produce one bounded synthetic plan for ${label}.`,
      createdBy: "codex-integration",
    });
    const claim = await runtimeJobs.claimNext(`codex-worker-${label}`, `codex-claim-${label}`, 120_000);
    if (!claim || claim.jobId !== enqueued.jobId) throw new Error(`Unexpected Codex claim for ${label}`);
    await runtimeJobs.authorizeRuntimeStart({
      jobId: claim.jobId,
      workerId: claim.workerId,
      claimId: claim.claimId,
      fencingToken: claim.fencingToken,
      jobVersion: claim.jobVersion,
      leaseGeneration: claim.leaseGeneration,
    });
    return {
      claim,
      guard: {
        jobId: claim.jobId,
        workerId: claim.workerId,
        claimId: claim.claimId,
        fencingToken: claim.fencingToken,
        leaseGeneration: claim.leaseGeneration,
        claimedJobVersion: claim.jobVersion,
      },
      promptSha256: digest(`codex-prompt-${label}`),
    };
  }

  function successResult(claim: NonNullable<Awaited<ReturnType<AgentJobRepository["claimNext"]>>>): AgentResult {
    return {
      schemaVersion: 1,
      projectId: claim.projectId,
      taskId: claim.task.taskId,
      attemptId: claim.task.attemptId,
      runId: claim.task.runId,
      status: "SUCCESS",
      findings: [],
      artifacts: [{
        schemaVersion: 1,
        artifactId: `codex/planner/${claim.task.runId}`,
        kind: "REPORT",
        objectRef: `codex/planner-output/${claim.task.runId}`,
        digest: codexPlannerOutputDigest(output),
      }],
      decisions: [],
      errorCode: null,
    };
  }

  async function completionContext(claim: NonNullable<Awaited<ReturnType<AgentJobRepository["claimNext"]>>>) {
    const current = await runtimeJobs.loadClaim({ jobId: claim.jobId, workerId: claim.workerId, claimId: claim.claimId, fencingToken: claim.fencingToken });
    return createAgentJobCompletionContext(current);
  }

  function failureResult(
    claim: NonNullable<Awaited<ReturnType<AgentJobRepository["claimNext"]>>>,
  ): AgentResult {
    return {
      schemaVersion: 1,
      projectId: claim.projectId,
      taskId: claim.task.taskId,
      attemptId: claim.task.attemptId,
      runId: claim.task.runId,
      status: "ERROR",
      findings: [],
      artifacts: [],
      decisions: [],
      errorCode: "CODEX_RECOVERY_REQUIRED",
    };
  }

  it("reserves one persistent start under parallel calls and completes with sanitized structured metadata", async () => {
    const value = await claimedCodexJob("parallel");
    const start = {
      guard: value.guard,
      runId: value.claim.task.runId,
      promptSha256: value.promptSha256,
      cliVersion: CODEX_CLI_VERSION,
      startedAt: "2026-01-01T00:00:00.000Z",
    };
    const decisions = await Promise.all([codex.authorizeStart(start), codex.authorizeStart(start)]);
    expect(decisions.map((decision) => decision.action).sort()).toEqual(["IN_FLIGHT", "START"]);
    const completed = await codex.complete({
      guard: value.guard,
      runId: value.claim.task.runId,
      promptSha256: value.promptSha256,
      output,
      completedAt: "2026-01-01T00:00:01.000Z",
      threadId: "thread/synthetic",
      model: "gpt-5.4",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    expect(completed).toMatchObject({ state: "SUCCEEDED", output, threadId: "thread/synthetic" });
    expect(await codex.load(value.claim.jobId)).toEqual(completed);
    const audit = await admin.query<{ error_code: string | null; policy_event: string | null }>(
      "SELECT error_code,policy_event FROM builder.codex_exec_audit_events WHERE job_id=$1 ORDER BY created_at",
      [value.claim.jobId],
    );
    expect(audit.rows).toEqual([
      { error_code: null, policy_event: null },
      { error_code: null, policy_event: null },
    ]);
    await runtimeJobs.complete(await completionContext(value.claim), successResult(value.claim));
    await expect(
      admin.query("UPDATE builder.codex_exec_runs SET model='tampered' WHERE job_id=$1", [value.claim.jobId]),
    ).rejects.toThrow(/transition is invalid or terminal/);
  }, 30_000);

  it("rejects a stale late result and atomically requires explicit recovery after a reclaimed ambiguous run", async () => {
    const value = await claimedCodexJob("recovery");
    const start = {
      guard: value.guard,
      runId: value.claim.task.runId,
      promptSha256: value.promptSha256,
      cliVersion: CODEX_CLI_VERSION,
      startedAt: "2026-01-01T00:00:00.000Z",
    };
    expect((await codex.authorizeStart(start)).action).toBe("START");
    await admin.query(
      "UPDATE builder.background_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [value.claim.jobId],
    );
    await expect(
      admin.query(
        `UPDATE builder.codex_exec_runs
         SET state='FAILED',error_code='CODEX_PROCESS_FAILED',completed_at=clock_timestamp()
         WHERE job_id=$1`,
        [value.claim.jobId],
      ),
    ).rejects.toThrow(/exact active runtime fence/);
    await expect(
      codex.complete({
        guard: value.guard,
        runId: value.claim.task.runId,
        promptSha256: value.promptSha256,
        output,
        completedAt: "2026-01-01T00:00:01.000Z",
      }),
    ).rejects.toBeInstanceOf(AgentJobLeaseLostError);
    const reclaimed = await runtimeJobs.claimNext("codex-worker-reclaimed", "codex-claim-reclaimed", 120_000);
    if (!reclaimed || reclaimed.jobId !== value.claim.jobId) throw new Error("Codex recovery job was not reclaimed");
    await runtimeJobs.authorizeRuntimeStart({
      jobId: reclaimed.jobId,
      workerId: reclaimed.workerId,
      claimId: reclaimed.claimId,
      fencingToken: reclaimed.fencingToken,
      jobVersion: reclaimed.jobVersion,
      leaseGeneration: reclaimed.leaseGeneration,
    });
    const recovered = await codex.authorizeStart({
      ...start,
      guard: {
        jobId: reclaimed.jobId,
        workerId: reclaimed.workerId,
        claimId: reclaimed.claimId,
        fencingToken: reclaimed.fencingToken,
        leaseGeneration: reclaimed.leaseGeneration,
        claimedJobVersion: reclaimed.jobVersion,
      },
    });
    expect(recovered).toMatchObject({ action: "RECOVERY_REQUIRED", run: { state: "RECOVERY_REQUIRED" } });
    await runtimeJobs.complete(await completionContext(reclaimed), failureResult(reclaimed));
  }, 30_000);

  it("replays a terminal Codex ledger after process restart without reserving a second turn", async () => {
    const value = await claimedCodexJob("terminal-replay");
    const start = {
      guard: value.guard,
      runId: value.claim.task.runId,
      promptSha256: value.promptSha256,
      cliVersion: CODEX_CLI_VERSION,
      startedAt: "2026-01-01T00:00:00.000Z",
    };
    expect((await codex.authorizeStart(start)).action).toBe("START");
    await codex.complete({
      guard: value.guard,
      runId: value.claim.task.runId,
      promptSha256: value.promptSha256,
      output,
      completedAt: "2026-01-01T00:00:01.000Z",
    });
    await admin.query(
      "UPDATE builder.background_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [value.claim.jobId],
    );
    const reclaimed = await runtimeJobs.claimNext("codex-terminal-worker", "codex-terminal-claim", 120_000);
    if (!reclaimed || reclaimed.jobId !== value.claim.jobId) throw new Error("Codex terminal job was not reclaimed");
    await runtimeJobs.authorizeRuntimeStart({
      jobId: reclaimed.jobId,
      workerId: reclaimed.workerId,
      claimId: reclaimed.claimId,
      fencingToken: reclaimed.fencingToken,
      jobVersion: reclaimed.jobVersion,
      leaseGeneration: reclaimed.leaseGeneration,
    });
    const replay = await codex.authorizeStart({
      ...start,
      guard: {
        jobId: reclaimed.jobId,
        workerId: reclaimed.workerId,
        claimId: reclaimed.claimId,
        fencingToken: reclaimed.fencingToken,
        leaseGeneration: reclaimed.leaseGeneration,
        claimedJobVersion: reclaimed.jobVersion,
      },
    });
    expect(replay).toMatchObject({ action: "TERMINAL", run: { state: "SUCCEEDED", output } });
    expect(Number((await admin.query<{ count: string }>(
      "SELECT count(*) count FROM builder.codex_exec_audit_events WHERE job_id=$1 AND event_type='START_RESERVED'",
      [value.claim.jobId],
    )).rows[0]!.count)).toBe(1);
    await runtimeJobs.complete(await completionContext(reclaimed), successResult(reclaimed));
  }, 30_000);

  it("persists only a non-authoritative Codex cancellation ledger under the exact active cancellation fence", async () => {
    const value = await claimedCodexJob("cancellation");
    expect((await codex.authorizeStart({
      guard: value.guard,
      runId: value.claim.task.runId,
      promptSha256: value.promptSha256,
      cliVersion: CODEX_CLI_VERSION,
      startedAt: "2026-01-01T00:00:00.000Z",
    })).action).toBe("START");
    await runtimeJobs.requestCancel(value.claim.jobId);
    await runtimeJobs.beginCancellationAttempt({
      jobId: value.claim.jobId,
      workerId: value.claim.workerId,
      claimId: value.claim.claimId,
      fencingToken: value.claim.fencingToken,
    });
    const cancelled = await codex.fail({
      guard: value.guard,
      runId: value.claim.task.runId,
      promptSha256: value.promptSha256,
      state: "CANCELLED",
      errorCode: "CODEX_CANCELLED",
      completedAt: "2026-01-01T00:00:01.000Z",
    });
    expect(cancelled).toMatchObject({ state: "CANCELLED", errorCode: "CODEX_CANCELLED" });
    await expect(codex.complete({
      guard: value.guard,
      runId: value.claim.task.runId,
      promptSha256: value.promptSha256,
      output,
      completedAt: "2026-01-01T00:00:02.000Z",
    })).rejects.toBeInstanceOf(AgentJobLeaseLostError);
    await runtimeJobs.recordCancellationFailure(
      {
        jobId: value.claim.jobId,
        workerId: value.claim.workerId,
        claimId: value.claim.claimId,
        fencingToken: value.claim.fencingToken,
      },
      "REJECTED",
      "TERMINATION_EVIDENCE_MISSING",
      0,
      0,
    );
  }, 30_000);
});
