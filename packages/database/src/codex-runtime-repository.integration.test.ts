import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CODEX_CLI_VERSION,
  FakeAgentRuntime,
  NodeCodexProcessLauncher,
  assertProcessLaunchReceipt,
  canonicalAgentOperationDigest,
  codexPlannerOutputDigest,
  createProcessLaunchReceiptForTest,
  createWorkerProcessIdentityForTest,
  type AgentResult,
  type AgentTask,
  type CodexRuntimeGuard,
  type ProcessLaunchBinding,
  type ProcessLaunchReceipt,
  type WorkerProcessIdentity,
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
import { RegisteredWorkerProcessFixtureForTest } from "./agent-job-test-fixture.js";
import { migrate, resetDatabase } from "./migrations.js";

const adminUrl = process.env.TEST_DATABASE_URL;
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const testWorkers = new RegisteredWorkerProcessFixtureForTest("codex-runtime-repository-integration");
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
    const claim = await testWorkers.claimNext(runtimeJobs, `codex-setup-${role.toLowerCase()}`, `claim-${randomUUID()}`, 120_000);
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
    const claim = await testWorkers.claimNext(runtimeJobs, `codex-worker-${label}`, `codex-claim-${label}`, 120_000);
    if (!claim || claim.jobId !== enqueued.jobId) throw new Error(`Unexpected Codex claim for ${label}`);
    await runtimeJobs.authorizeRuntimeStart({
      ...jobGuard(claim),
      jobVersion: claim.jobVersion,
      leaseGeneration: claim.leaseGeneration,
    });
    return {
      claim,
      guard: {
        jobId: claim.jobId,
        workerId: claim.workerId,
        workerProcessIdentity: claim.workerProcessIdentity,
        processLaunchId: claim.processLaunchId,
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

  function jobGuard(claim: NonNullable<Awaited<ReturnType<AgentJobRepository["claimNext"]>>>) {
    return { jobId: claim.jobId, workerId: claim.workerId, workerProcessIdentity: claim.workerProcessIdentity, processLaunchId: claim.processLaunchId, claimId: claim.claimId, fencingToken: claim.fencingToken };
  }

  function launchBinding(
    claim: NonNullable<Awaited<ReturnType<AgentJobRepository["claimNext"]>>>,
    overrides: Partial<ProcessLaunchBinding> = {},
  ): ProcessLaunchBinding {
    if (!claim.assignment) throw new Error("Synthetic Codex claim requires an assignment");
    return {
      parentWorkerInstanceId: claim.workerProcessIdentity.instanceId,
      workerId: claim.workerId,
      projectId: claim.projectId,
      jobId: claim.jobId,
      taskId: claim.task.taskId,
      attemptId: claim.task.attemptId,
      runId: claim.task.runId,
      assignmentId: claim.assignment.assignmentId,
      claimId: claim.claimId,
      leaseGeneration: claim.leaseGeneration,
      fencingToken: claim.fencingToken,
      jobVersion: claim.jobVersion + 1,
      ...overrides,
    };
  }

  async function identityAtomicSnapshot(
    claim: NonNullable<Awaited<ReturnType<AgentJobRepository["claimNext"]>>>,
  ): Promise<Record<string, unknown>> {
    return (await admin.query<Record<string, unknown>>(`SELECT
      to_jsonb(job) job,to_jsonb(run) run,
      COALESCE((SELECT jsonb_agg(to_jsonb(result_row) ORDER BY result_row.id) FROM builder.agent_runtime_results result_row WHERE result_row.project_id=$2 AND result_row.run_id=$3),'[]'::jsonb) results,
      COALESCE((SELECT jsonb_agg(to_jsonb(assignment_row) ORDER BY assignment_row.assignment_id) FROM builder.agent_assignments assignment_row WHERE assignment_row.project_id=$2 AND assignment_row.job_id=$1),'[]'::jsonb) assignments,
      COALESCE((SELECT jsonb_agg(to_jsonb(inbox_row) ORDER BY inbox_row.id) FROM builder.inbox_events inbox_row WHERE inbox_row.project_id=$2),'[]'::jsonb) inbox,
      COALESCE((SELECT jsonb_agg(to_jsonb(outbox_row) ORDER BY outbox_row.created_at,outbox_row.id) FROM builder.outbox_events outbox_row WHERE outbox_row.project_id=$2),'[]'::jsonb) outbox,
      COALESCE((SELECT jsonb_agg(to_jsonb(audit_row) ORDER BY audit_row.created_at,audit_row.event_id) FROM builder.agent_job_audit_events audit_row WHERE audit_row.project_id=$2 AND audit_row.job_id=$1),'[]'::jsonb) audit,
      COALESCE((SELECT jsonb_agg(to_jsonb(evidence_row) ORDER BY evidence_row.evidence_id) FROM builder.runtime_termination_evidence evidence_row WHERE evidence_row.project_id=$2 AND evidence_row.job_id=$1),'[]'::jsonb) evidence,
      COALESCE((SELECT jsonb_agg(to_jsonb(worker_row) ORDER BY worker_row.worker_process_instance_id) FROM (SELECT worker_process_instance_id,logical_worker_id,ownership_digest,policy_version,runtime_version,registered_at FROM builder.worker_process_instances WHERE logical_worker_id=$4 OR worker_process_instance_id IN (job.worker_process_instance_id,run.worker_process_instance_id)) worker_row),'[]'::jsonb) worker_instances,
      COALESCE((SELECT jsonb_agg(to_jsonb(receipt_row) ORDER BY receipt_row.process_launch_id) FROM builder.process_launch_receipts receipt_row WHERE receipt_row.project_id=$2 AND receipt_row.job_id=$1),'[]'::jsonb) process_launch_receipts,
      (SELECT to_jsonb(codex_row) FROM builder.codex_exec_runs codex_row WHERE codex_row.project_id=$2 AND codex_row.job_id=$1) codex
      FROM builder.background_jobs job JOIN builder.agent_runtime_runs run ON run.project_id=job.project_id AND run.run_id=job.agent_run_id
      WHERE job.id=$1 AND job.project_id=$2`,[claim.jobId,claim.projectId,claim.task.runId,claim.workerId])).rows[0]!;
  }

  async function insertProcessLaunchReceiptDirect(
    binding: ProcessLaunchBinding,
    receipt: ProcessLaunchReceipt,
    identity: WorkerProcessIdentity,
  ): Promise<void> {
    await admin.query(`INSERT INTO builder.process_launch_receipts(
      project_id,process_launch_id,parent_worker_process_instance_id,worker_ownership_digest,logical_worker_id,
      job_id,task_id,attempt_id,run_id,assignment_id,claim_id,lease_generation,fencing_token,job_version,
      receipt_digest,binding_digest,process_id_digest,policy_version
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,[
      binding.projectId,receipt.processLaunchId,identity.instanceId,identity.ownershipDigest,binding.workerId,
      binding.jobId,binding.taskId,binding.attemptId,binding.runId,binding.assignmentId,binding.claimId,
      binding.leaseGeneration,binding.fencingToken,binding.jobVersion,receipt.receiptDigest,receipt.bindingDigest,
      receipt.processIdDigest,receipt.policyVersion,
    ]);
  }

  async function completionContext(claim: NonNullable<Awaited<ReturnType<AgentJobRepository["claimNext"]>>>) {
    const current = await runtimeJobs.loadClaim(jobGuard(claim));
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
    ).rejects.toThrow(/exact active runtime fence|process identity authority/);
    await expect(
      codex.complete({
        guard: value.guard,
        runId: value.claim.task.runId,
        promptSha256: value.promptSha256,
        output,
        completedAt: "2026-01-01T00:00:01.000Z",
      }),
    ).rejects.toBeInstanceOf(AgentJobLeaseLostError);
    const reclaimed = await testWorkers.claimNext(runtimeJobs, "codex-worker-reclaimed", "codex-claim-reclaimed", 120_000);
    if (!reclaimed || reclaimed.jobId !== value.claim.jobId) throw new Error("Codex recovery job was not reclaimed");
    await runtimeJobs.authorizeRuntimeStart({
      ...jobGuard(reclaimed),
      jobVersion: reclaimed.jobVersion,
      leaseGeneration: reclaimed.leaseGeneration,
    });
    const recovered = await codex.authorizeStart({
      ...start,
      guard: {
        jobId: reclaimed.jobId,
        workerId: reclaimed.workerId,
        workerProcessIdentity:reclaimed.workerProcessIdentity,
        processLaunchId:reclaimed.processLaunchId,
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
    const reclaimed = await testWorkers.claimNext(runtimeJobs, "codex-terminal-worker", "codex-terminal-claim", 120_000);
    if (!reclaimed || reclaimed.jobId !== value.claim.jobId) throw new Error("Codex terminal job was not reclaimed");
    await runtimeJobs.authorizeRuntimeStart({
      ...jobGuard(reclaimed),
      jobVersion: reclaimed.jobVersion,
      leaseGeneration: reclaimed.leaseGeneration,
    });
    const replay = await codex.authorizeStart({
      ...start,
      guard: {
        jobId: reclaimed.jobId,
        workerId: reclaimed.workerId,
        workerProcessIdentity:reclaimed.workerProcessIdentity,
        processLaunchId:reclaimed.processLaunchId,
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
    await runtimeJobs.beginCancellationAttempt(jobGuard(value.claim));
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
      jobGuard(value.claim),
      "REJECTED",
      "TERMINATION_EVIDENCE_MISSING",
      0,
      0,
    );
    await admin.query("UPDATE builder.background_jobs SET available_at=clock_timestamp()+interval '1 day' WHERE id=$1",[value.claim.jobId]);
  }, 30_000);

  it("binds one real harmless child receipt and atomically rejects malformed and coherent authority forgeries", async () => {
    const value = await claimedCodexJob("process-launch-binding");
    expect((await codex.authorizeStart({
      guard: value.guard,
      runId: value.claim.task.runId,
      promptSha256: value.promptSha256,
      cliVersion: CODEX_CLI_VERSION,
      startedAt: "2026-01-01T00:00:00.000Z",
    })).action).toBe("START");
    const binding = launchBinding(value.claim);
    const syntheticReceipt = createProcessLaunchReceiptForTest(4242, binding, "55".repeat(32), "66".repeat(32));
    const swappedIdentity = createWorkerProcessIdentityForTest("9a".repeat(32), "9b".repeat(32));
    await runtimeJobs.registerWorkerProcess(value.claim.workerId, swappedIdentity);

    let before = await identityAtomicSnapshot(value.claim);
    await expect(codex.bindProcessLaunch({
      guard: value.guard,
      runId: value.claim.task.runId,
      binding,
      receipt: undefined as never,
    })).rejects.toThrow(/RECEIPT_INVALID/);
    expect(await identityAtomicSnapshot(value.claim)).toEqual(before);
    await expect(codex.bindProcessLaunch({
      guard: value.guard,
      runId: value.claim.task.runId,
      binding,
      receipt: { ...syntheticReceipt, receiptDigest: `sha256:${"7".repeat(64)}` as never },
    })).rejects.toThrow(/RECEIPT_PROOF_INVALID/);
    expect(await identityAtomicSnapshot(value.claim)).toEqual(before);
    await expect(codex.bindProcessLaunch({
      guard: value.guard,
      runId: value.claim.task.runId,
      binding: { ...binding, claimId: "swapped-claim" },
      receipt: syntheticReceipt,
    })).rejects.toThrow(/RECEIPT_PROOF_INVALID/);
    expect(await identityAtomicSnapshot(value.claim)).toEqual(before);

    await expect(admin.query(
      "UPDATE builder.background_jobs SET worker_process_instance_id=$2,worker_ownership_digest=$3 WHERE id=$1",
      [value.claim.jobId, swappedIdentity.instanceId, swappedIdentity.ownershipDigest],
    )).rejects.toThrow(/authoritative fenced reclaim|exact registered worker/i);
    expect(await identityAtomicSnapshot(value.claim)).toEqual(before);
    await expect(admin.query(
      "UPDATE builder.agent_runtime_runs SET worker_process_instance_id=$3,worker_ownership_digest=$4 WHERE project_id=$1 AND run_id=$2",
      [value.claim.projectId, value.claim.task.runId, swappedIdentity.instanceId, swappedIdentity.ownershipDigest],
    )).rejects.toThrow(/authoritative claim/i);
    expect(await identityAtomicSnapshot(value.claim)).toEqual(before);
    await expect(admin.query(
      "UPDATE builder.agent_runtime_runs SET worker_process_instance_id=NULL,worker_ownership_digest=NULL WHERE project_id=$1 AND run_id=$2",
      [value.claim.projectId, value.claim.task.runId],
    )).rejects.toThrow(/cannot be cleared after authoritative claim binding/i);
    expect(await identityAtomicSnapshot(value.claim)).toEqual(before);

    const coherentForgeries: Array<[ProcessLaunchBinding, WorkerProcessIdentity, string, string]> = [
      [launchBinding(value.claim, { parentWorkerInstanceId: swappedIdentity.instanceId }), swappedIdentity, "71", "72"],
      [launchBinding(value.claim, { claimId: "coherent-stale-claim" }), value.claim.workerProcessIdentity, "73", "74"],
      [launchBinding(value.claim, { leaseGeneration: value.claim.leaseGeneration + 1 }), value.claim.workerProcessIdentity, "75", "76"],
      [launchBinding(value.claim, { fencingToken: value.claim.fencingToken + 1 }), value.claim.workerProcessIdentity, "77", "78"],
      [launchBinding(value.claim, { jobVersion: binding.jobVersion + 1 }), value.claim.workerProcessIdentity, "79", "7a"],
    ];
    for (const [forgedBinding, identity, identitySeed, proofSeed] of coherentForgeries) {
      const forgedReceipt = createProcessLaunchReceiptForTest(
        4242,
        forgedBinding,
        identitySeed.repeat(32),
        proofSeed.repeat(32),
      );
      before = await identityAtomicSnapshot(value.claim);
      await expect(insertProcessLaunchReceiptDirect(forgedBinding, forgedReceipt, identity)).rejects.toThrow(
        /exact active worker\/claim\/run\/assignment binding/,
      );
      expect(await identityAtomicSnapshot(value.claim)).toEqual(before);
    }

    const launched = NodeCodexProcessLauncher.create().start({
      executable: process.execPath,
      arguments: ["-e", "process.stdin.resume();process.stdin.once('end',()=>process.exit(0));"],
      workingDirectory: process.cwd(),
      environment: {},
      launchBinding: binding,
    });
    const receipt = launched.launchReceipt;
    assertProcessLaunchReceipt(receipt, binding);
    expect(Number.isSafeInteger(receipt.processId) && receipt.processId > 0).toBe(true);
    let childFinished = false;
    let bound: CodexRuntimeGuard | undefined;
    try {
      bound = await codex.bindProcessLaunch({ guard: value.guard, runId: value.claim.task.runId, binding, receipt });
      expect(bound.processLaunchId).toBe(receipt.processLaunchId);
      value.claim.processLaunchId = receipt.processLaunchId;
      await launched.writePrompt("");
      expect(await launched.wait()).toEqual({ code: 0, signal: null });
      childFinished = true;
    } finally {
      if (!childFinished) launched.kill();
    }
    const persisted = (await admin.query<{ process_id_digest: string; metadata: string }>(
      "SELECT receipt.process_id_digest,audit.metadata::text metadata FROM builder.process_launch_receipts receipt JOIN builder.agent_job_audit_events audit ON audit.project_id=receipt.project_id AND audit.job_id=receipt.job_id AND audit.event_type='PROCESS_LAUNCH_BOUND' WHERE receipt.project_id=$1 AND receipt.job_id=$2",
      [value.claim.projectId, value.claim.jobId],
    )).rows[0]!;
    expect(persisted.process_id_digest).toBe(receipt.processIdDigest);
    expect(persisted.metadata).not.toContain(receipt.launchProof);
    expect(persisted.metadata).not.toContain(String(receipt.processId));

    before = await identityAtomicSnapshot(value.claim);
    await expect(admin.query(
      "UPDATE builder.agent_runtime_runs SET worker_process_instance_id=$3,worker_ownership_digest=$4 WHERE project_id=$1 AND run_id=$2",
      [value.claim.projectId, value.claim.task.runId, swappedIdentity.instanceId, swappedIdentity.ownershipDigest],
    )).rejects.toThrow(/authoritative claim|authoritative fenced reclaim/i);
    expect(await identityAtomicSnapshot(value.claim)).toEqual(before);
    await expect(codex.complete({
      guard: value.guard,
      runId: value.claim.task.runId,
      promptSha256: value.promptSha256,
      output,
      completedAt: "2026-01-01T00:00:01.000Z",
    })).rejects.toBeInstanceOf(AgentJobLeaseLostError);
    expect(await identityAtomicSnapshot(value.claim)).toEqual(before);
    await expect(admin.query(
      "UPDATE builder.process_launch_receipts SET receipt_digest=$3 WHERE project_id=$1 AND process_launch_id=$2",
      [value.claim.projectId, receipt.processLaunchId, `sha256:${"8".repeat(64)}`],
    )).rejects.toThrow(/append-only|immutable/i);
    expect(await codex.complete({
      guard: bound!,
      runId: value.claim.task.runId,
      promptSha256: value.promptSha256,
      output,
      completedAt: "2026-01-01T00:00:01.000Z",
    })).toMatchObject({ state: "SUCCEEDED" });
    const current = await runtimeJobs.loadClaim(jobGuard(value.claim));
    await runtimeJobs.complete(createAgentJobCompletionContext(current), successResult(current));
  }, 60_000);

  it("clears a prior launch only on same-process authoritative reclaim and rebinds under the new claim", async () => {
    const value = await claimedCodexJob("same-process-reclaim");
    const firstBinding = launchBinding(value.claim);
    const firstReceipt = createProcessLaunchReceiptForTest(4242, firstBinding, "81".repeat(32), "82".repeat(32));
    await insertProcessLaunchReceiptDirect(firstBinding, firstReceipt, value.claim.workerProcessIdentity);
    await admin.query("UPDATE builder.background_jobs SET process_launch_id=$2 WHERE id=$1", [value.claim.jobId, firstReceipt.processLaunchId]);
    await admin.query(`UPDATE builder.agent_runtime_runs SET
      process_identity=$3,process_launch_receipt_digest=$4,process_launch_binding_digest=$5,process_id_digest=$6,
      runtime_started_at=clock_timestamp()
      WHERE project_id=$1 AND run_id=$2`,[
      value.claim.projectId,value.claim.task.runId,firstReceipt.processLaunchId,firstReceipt.receiptDigest,
      firstReceipt.bindingDigest,firstReceipt.processIdDigest,
    ]);
    value.claim.processLaunchId = firstReceipt.processLaunchId;
    await admin.query("UPDATE builder.background_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [value.claim.jobId]);

    const reclaimed = await runtimeJobs.claimNext(
      value.claim.workerId,
      "codex-same-process-reclaim-new-claim",
      120_000,
      value.claim.workerProcessIdentity,
    );
    if (!reclaimed || reclaimed.jobId !== value.claim.jobId) throw new Error("Same-process reclaim did not win");
    expect(reclaimed.workerProcessIdentity).toEqual(value.claim.workerProcessIdentity);
    expect(reclaimed.claimId).not.toBe(value.claim.claimId);
    expect(reclaimed.leaseGeneration).toBeGreaterThan(value.claim.leaseGeneration);
    expect(reclaimed.fencingToken).toBeGreaterThan(value.claim.fencingToken);
    expect(reclaimed.processLaunchId).toBeNull();
    await expect(runtimeJobs.heartbeat(jobGuard(value.claim), 120_000)).rejects.toBeInstanceOf(AgentJobLeaseLostError);
    const cleared = (await admin.query<{ job_launch: string | null; runtime_launch: string | null; runtime_started_at: Date | null; receipts: number }>(`SELECT
      job.process_launch_id job_launch,run.process_identity runtime_launch,run.runtime_started_at,
      (SELECT count(*)::int FROM builder.process_launch_receipts receipt WHERE receipt.project_id=job.project_id AND receipt.job_id=job.id) receipts
      FROM builder.background_jobs job JOIN builder.agent_runtime_runs run ON run.project_id=job.project_id AND run.run_id=job.agent_run_id
      WHERE job.id=$1`,[value.claim.jobId])).rows[0]!;
    expect(cleared).toEqual({ job_launch: null, runtime_launch: null, runtime_started_at: null, receipts: 1 });

    await runtimeJobs.authorizeRuntimeStart({
      ...jobGuard(reclaimed),
      jobVersion: reclaimed.jobVersion,
      leaseGeneration: reclaimed.leaseGeneration,
    });
    const reclaimedGuard: CodexRuntimeGuard = {
      jobId: reclaimed.jobId,
      workerId: reclaimed.workerId,
      workerProcessIdentity: reclaimed.workerProcessIdentity,
      processLaunchId: reclaimed.processLaunchId,
      claimId: reclaimed.claimId,
      fencingToken: reclaimed.fencingToken,
      leaseGeneration: reclaimed.leaseGeneration,
      claimedJobVersion: reclaimed.jobVersion,
    };
    expect((await codex.authorizeStart({
      guard: reclaimedGuard,
      runId: reclaimed.task.runId,
      promptSha256: value.promptSha256,
      cliVersion: CODEX_CLI_VERSION,
      startedAt: "2026-01-01T00:00:02.000Z",
    })).action).toBe("START");
    const secondBinding = launchBinding(reclaimed);
    const secondReceipt = createProcessLaunchReceiptForTest(4242, secondBinding, "83".repeat(32), "84".repeat(32));
    const rebound = await codex.bindProcessLaunch({
      guard: reclaimedGuard,
      runId: reclaimed.task.runId,
      binding: secondBinding,
      receipt: secondReceipt,
    });
    expect(rebound.processLaunchId).toBe(secondReceipt.processLaunchId);
    expect(secondReceipt.processLaunchId).not.toBe(firstReceipt.processLaunchId);
    expect(Number((await admin.query<{ count: string }>(
      "SELECT count(*) count FROM builder.process_launch_receipts WHERE project_id=$1 AND job_id=$2",
      [reclaimed.projectId, reclaimed.jobId],
    )).rows[0]!.count)).toBe(2);
    reclaimed.processLaunchId = secondReceipt.processLaunchId;
    expect(await codex.complete({
      guard: rebound,
      runId: reclaimed.task.runId,
      promptSha256: value.promptSha256,
      output,
      completedAt: "2026-01-01T00:00:03.000Z",
    })).toMatchObject({ state: "SUCCEEDED" });
    await runtimeJobs.complete(await completionContext(reclaimed), successResult(reclaimed));
  }, 60_000);

  it("persists two valid reused-PID receipts under separate process contexts and rejects a PostgreSQL launch swap", async () => {
    const first = await claimedCodexJob("pid-reuse-first");
    const firstBinding = launchBinding(first.claim);
    expect((await codex.authorizeStart({guard:first.guard,runId:first.claim.task.runId,promptSha256:first.promptSha256,cliVersion:CODEX_CLI_VERSION,startedAt:"2026-01-01T00:00:00.000Z"})).action).toBe("START");
    const firstReceipt = createProcessLaunchReceiptForTest(4242, firstBinding, "91".repeat(32), "92".repeat(32));
    const firstBound = await codex.bindProcessLaunch({guard:first.guard,runId:first.claim.task.runId,binding:firstBinding,receipt:firstReceipt});
    first.claim.processLaunchId = firstReceipt.processLaunchId;

    const second = await claimedCodexJob("pid-reuse-second");
    const secondBinding = launchBinding(second.claim);
    expect((await codex.authorizeStart({guard:second.guard,runId:second.claim.task.runId,promptSha256:second.promptSha256,cliVersion:CODEX_CLI_VERSION,startedAt:"2026-01-01T00:00:00.000Z"})).action).toBe("START");
    const secondReceipt = createProcessLaunchReceiptForTest(4242, secondBinding, "93".repeat(32), "94".repeat(32));
    const secondBound = await codex.bindProcessLaunch({guard:second.guard,runId:second.claim.task.runId,binding:secondBinding,receipt:secondReceipt});
    second.claim.processLaunchId = secondReceipt.processLaunchId;

    expect(firstReceipt.processLaunchId).not.toBe(secondReceipt.processLaunchId);
    expect(firstReceipt.receiptDigest).not.toBe(secondReceipt.receiptDigest);
    expect(firstReceipt.processIdDigest).not.toBe(secondReceipt.processIdDigest);
    const persisted = await admin.query<{ process_launch_id: string; receipt_digest: string; process_id_digest: string }>(
      "SELECT process_launch_id,receipt_digest,process_id_digest FROM builder.process_launch_receipts WHERE process_launch_id=ANY($1::text[]) ORDER BY process_launch_id",
      [[firstReceipt.processLaunchId, secondReceipt.processLaunchId]],
    );
    expect(persisted.rows).toHaveLength(2);
    expect(new Set(persisted.rows.map((row) => row.process_launch_id)).size).toBe(2);
    expect(new Set(persisted.rows.map((row) => row.receipt_digest)).size).toBe(2);
    expect(new Set(persisted.rows.map((row) => row.process_id_digest)).size).toBe(2);

    const before = [await identityAtomicSnapshot(first.claim), await identityAtomicSnapshot(second.claim)];
    await expect(admin.query(
      "UPDATE builder.background_jobs SET process_launch_id=$2 WHERE id=$1",
      [second.claim.jobId, firstReceipt.processLaunchId],
    )).rejects.toThrow(/immutable within a claim|authoritative/i);
    expect([await identityAtomicSnapshot(first.claim), await identityAtomicSnapshot(second.claim)]).toEqual(before);

    expect(await codex.complete({guard:firstBound,runId:first.claim.task.runId,promptSha256:first.promptSha256,output,completedAt:"2026-01-01T00:00:01.000Z"})).toMatchObject({state:"SUCCEEDED"});
    await runtimeJobs.complete(await completionContext(first.claim), successResult(first.claim));
    expect(await codex.complete({guard:secondBound,runId:second.claim.task.runId,promptSha256:second.promptSha256,output,completedAt:"2026-01-01T00:00:01.000Z"})).toMatchObject({state:"SUCCEEDED"});
    await runtimeJobs.complete(await completionContext(second.claim), successResult(second.claim));
  }, 90_000);
});
