import type { Pool, PoolClient, QueryResultRow } from "pg";
import {
  CODEX_CLI_VERSION,
  assertProcessLaunchReceipt,
  assertWorkerProcessIdentity,
  deriveWorkerOwnershipDigest,
  parseCodexPlannerOutput,
  parseProcessLaunchId,
  type CodexPersistentRun,
  type CodexPolicyEvent,
  type CodexRunState,
  type CodexRuntimeFailureCode,
  type CodexRuntimeGuard,
  type CodexRuntimePersistence,
  type CodexStartDecision,
  type CodexUsage,
} from "@software-builder/agent-runtime";
import { AgentJobLeaseLostError } from "./agent-job-repository.js";

type Queryable = Pick<Pool, "connect" | "query">;

export interface CodexJobBindingInput {
  readonly projectId: string;
  readonly jobId: string;
  readonly projectRevision: string;
  readonly workspaceId: string;
  readonly assignmentId: string;
  readonly agentId: string;
  readonly agentKey: string;
  readonly agentVersion: number;
  readonly planningTask: string;
  readonly createdBy: string;
}

export interface CodexJobBinding extends CodexJobBindingInput {
  readonly requiredRole: "PLANNER";
  readonly createdAt: Date;
}

export interface CodexClaimContextBinding extends CodexJobBinding {
  readonly registryInstructions: string;
  readonly registryRole: "PLANNER";
  readonly assignmentRole: "PLANNER";
  readonly assignmentStatus: "ASSIGNED";
  readonly workspaceStatus: "READY";
  readonly workspaceGitBranch: string;
}

interface BindingRow extends QueryResultRow {
  project_id: string;
  job_id: string;
  project_revision: string;
  workspace_id: string;
  assignment_id: string;
  required_role: "PLANNER";
  agent_id: string;
  agent_key: string;
  agent_version: number;
  planning_task: string;
  created_by: string;
  created_at: Date;
}

interface ContextRow extends BindingRow {
  registry_instructions: string;
  registry_role: "PLANNER";
  assignment_role: "PLANNER";
  assignment_status: "ASSIGNED";
  workspace_status: "READY";
  workspace_git_branch: string;
}

interface RunRow extends QueryResultRow {
  project_id: string;
  job_id: string;
  run_id: string;
  state: CodexRunState;
  prompt_sha256: string;
  cli_version: string;
  worker_id: string;
  worker_process_instance_id: string;
  worker_ownership_digest: string;
  process_launch_id: string | null;
  process_launch_receipt_digest: string | null;
  process_launch_binding_digest: string | null;
  process_id_digest: string | null;
  claim_id: string;
  lease_generation: string;
  fencing_token: string;
  claimed_job_version: string;
  thread_id: string | null;
  model: string | null;
  usage: CodexUsage | null;
  output: unknown | null;
  error_code: CodexRuntimeFailureCode | null;
  policy_event: CodexPolicyEvent | null;
  started_at: Date;
  completed_at: Date | null;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const projectUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const revision = /^[0-9a-f]{64}$/u;
const reference = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/u;
const actor = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/u;
const key = /^[a-z][a-z0-9-]{0,63}$/u;
const digest = /^[0-9a-f]{64}$/u;
const secret = /(?:sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|npm_[a-z0-9]{20,}|pypi-[a-z0-9_-]{20,}|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|bearer\s+[a-z0-9._~+/-]{12,}|(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\s*[:=]|aws[_-]?(?:access|secret)|[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@|-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----)/iu;

function assertGuard(guard: CodexRuntimeGuard): void {
  assertWorkerProcessIdentity(guard.workerProcessIdentity);
  if(guard.processLaunchId!==null)parseProcessLaunchId(guard.processLaunchId);
  if (!uuid.test(guard.jobId) || !reference.test(guard.workerId) || !reference.test(guard.claimId)) throw new Error("CODEX_GUARD_INVALID");
  for (const value of [guard.fencingToken, guard.leaseGeneration, guard.claimedJobVersion]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("CODEX_GUARD_INVALID");
  }
}

function assertBinding(input: CodexJobBindingInput): void {
  if (!projectUuid.test(input.projectId) || !uuid.test(input.jobId) || !uuid.test(input.workspaceId) || !uuid.test(input.assignmentId) || !uuid.test(input.agentId)) throw new Error("CODEX_BINDING_INVALID");
  if (!revision.test(input.projectRevision) || !key.test(input.agentKey) || !Number.isSafeInteger(input.agentVersion) || input.agentVersion < 1) throw new Error("CODEX_BINDING_INVALID");
  if (!actor.test(input.createdBy) || secret.test(input.createdBy) || input.planningTask.trim().length === 0 || input.planningTask.length > 2_000 || secret.test(input.planningTask)) throw new Error("CODEX_BINDING_INVALID");
}

function mapBinding(row: BindingRow): CodexJobBinding {
  return {
    projectId: row.project_id,
    jobId: row.job_id,
    projectRevision: row.project_revision,
    workspaceId: row.workspace_id,
    assignmentId: row.assignment_id,
    requiredRole: row.required_role,
    agentId: row.agent_id,
    agentKey: row.agent_key,
    agentVersion: row.agent_version,
    planningTask: row.planning_task,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapRun(row: RunRow): CodexPersistentRun {
  return {
    jobId: row.job_id,
    runId: row.run_id,
    state: row.state,
    promptSha256: row.prompt_sha256,
    startedAt: row.started_at.toISOString(),
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at.toISOString() }),
    ...(row.output === null ? {} : { output: parseCodexPlannerOutput(row.output) }),
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    ...(row.policy_event === null ? {} : { policyEvent: row.policy_event }),
    ...(row.thread_id === null ? {} : { threadId: row.thread_id }),
    ...(row.model === null ? {} : { model: row.model }),
    ...(row.usage === null ? {} : { usage: row.usage }),
  };
}

const bindingColumns = `project_id,job_id,project_revision,workspace_id,assignment_id,required_role,
  agent_id,agent_key,agent_version,planning_task,created_by,created_at`;
const runColumns = `project_id,job_id,run_id,state,prompt_sha256,cli_version,worker_id,claim_id,
  worker_process_instance_id,worker_ownership_digest,process_launch_id,process_launch_receipt_digest,process_launch_binding_digest,process_id_digest,
  lease_generation,fencing_token,claimed_job_version,thread_id,model,usage,output,error_code,policy_event,started_at,completed_at`;

function sameBinding(left: CodexJobBinding, right: CodexJobBindingInput): boolean {
  return left.projectId.toLowerCase() === right.projectId.toLowerCase()
    && left.jobId.toLowerCase() === right.jobId.toLowerCase()
    && left.projectRevision === right.projectRevision
    && left.workspaceId.toLowerCase() === right.workspaceId.toLowerCase()
    && left.assignmentId.toLowerCase() === right.assignmentId.toLowerCase()
    && left.agentId.toLowerCase() === right.agentId.toLowerCase()
    && left.agentKey === right.agentKey
    && left.agentVersion === right.agentVersion
    && left.planningTask === right.planningTask
    && left.createdBy === right.createdBy;
}

export class PostgresCodexRuntimeRepository implements CodexRuntimePersistence {
  constructor(private readonly pool: Queryable) {}

  async bindJob(input: CodexJobBindingInput): Promise<CodexJobBinding> {
    assertBinding(input);
    return this.tx(async (client) => {
      const inserted = await client.query<BindingRow>(`INSERT INTO builder.codex_exec_job_bindings(
          project_id,job_id,project_revision,workspace_id,assignment_id,required_role,
          agent_id,agent_key,agent_version,planning_task,created_by
        ) VALUES($1,$2,$3,$4,$5,'PLANNER',$6,$7,$8,$9,$10)
        ON CONFLICT(project_id,job_id) DO NOTHING RETURNING ${bindingColumns}`,
      [input.projectId,input.jobId,input.projectRevision,input.workspaceId,input.assignmentId,input.agentId,input.agentKey,input.agentVersion,input.planningTask,input.createdBy]);
      const row = inserted.rows[0] ?? (await client.query<BindingRow>(`SELECT ${bindingColumns} FROM builder.codex_exec_job_bindings WHERE project_id=$1 AND job_id=$2 FOR SHARE`, [input.projectId,input.jobId])).rows[0];
      if (!row) throw new Error("CODEX_BINDING_NOT_FOUND");
      const result = mapBinding(row);
      if (!sameBinding(result, input)) throw new Error("CODEX_BINDING_CONFLICT");
      return result;
    });
  }

  async loadBindingForClaim(guard: CodexRuntimeGuard): Promise<CodexClaimContextBinding> {
    assertGuard(guard);
    return this.tx(async (client) => {
      const row = (await client.query<ContextRow>(`SELECT ${bindingColumns.split(",").map((column) => `binding.${column.trim()}`).join(",")},
          registry.instructions registry_instructions,registry.role registry_role,
          assignment.required_role assignment_role,assignment.assignment_status,
          workspace.status workspace_status,workspace.git_branch workspace_git_branch
        FROM builder.background_jobs job
        JOIN builder.codex_exec_job_bindings binding ON binding.project_id=job.project_id AND binding.job_id=job.id
        JOIN builder.agent_assignments assignment ON assignment.project_id=binding.project_id AND assignment.assignment_id=binding.assignment_id
        JOIN builder.agent_registry_versions registry ON registry.agent_id=binding.agent_id AND registry.agent_key=binding.agent_key AND registry.version=binding.agent_version
        JOIN builder.project_workspaces workspace ON workspace.project_id=binding.project_id AND workspace.workspace_id=binding.workspace_id
        WHERE job.id=$1 AND job.lease_owner=$2 AND job.claim_idempotency_key=$3 AND job.fencing_token=$4
          AND job.lease_generation=$5 AND job.job_version=$6 AND job.status IN ('CLAIMED','CANCELLING')
          AND job.worker_process_instance_id=$7 AND job.worker_ownership_digest=$8
          AND job.process_launch_id IS NOT DISTINCT FROM $9
          AND job.lease_expires_at>clock_timestamp() FOR SHARE OF job,binding,assignment,registry,workspace`,
      [guard.jobId,guard.workerId,guard.claimId,guard.fencingToken,guard.leaseGeneration,guard.claimedJobVersion,guard.workerProcessIdentity.instanceId,deriveWorkerOwnershipDigest(guard.workerProcessIdentity.instanceId,guard.workerProcessIdentity.ownershipProof),guard.processLaunchId])).rows[0];
      if (!row) throw new AgentJobLeaseLostError();
      if (row.assignment_role !== "PLANNER" || row.registry_role !== "PLANNER" || row.assignment_status !== "ASSIGNED" || row.workspace_status !== "READY") throw new Error("CODEX_CONTEXT_BINDING_INVALID");
      return {
        ...mapBinding(row),
        registryInstructions: row.registry_instructions,
        registryRole: row.registry_role,
        assignmentRole: row.assignment_role,
        assignmentStatus: row.assignment_status,
        workspaceStatus: row.workspace_status,
        workspaceGitBranch: row.workspace_git_branch,
      };
    });
  }

  async authorizeStart(input: Parameters<CodexRuntimePersistence["authorizeStart"]>[0]): Promise<CodexStartDecision> {
    assertGuard(input.guard);
    if (!reference.test(input.runId) || !digest.test(input.promptSha256) || input.cliVersion !== CODEX_CLI_VERSION || Number.isNaN(Date.parse(input.startedAt))) throw new Error("CODEX_START_INVALID");
    return this.tx(async (client) => {
      const projectId = await this.lockOwnedAfterDispatch(client, input.guard);
      const existing = (await client.query<RunRow>(`SELECT ${runColumns} FROM builder.codex_exec_runs WHERE project_id=$1 AND job_id=$2 FOR UPDATE`, [projectId,input.guard.jobId])).rows[0];
      if (existing) {
        if (existing.run_id !== input.runId || existing.prompt_sha256 !== input.promptSha256 || existing.cli_version !== input.cliVersion) throw new Error("CODEX_START_CONFLICT");
        if (existing.state !== "DISPATCHED") return { action: "TERMINAL", run: mapRun(existing) };
        if (existing.worker_id === input.guard.workerId && existing.worker_process_instance_id===input.guard.workerProcessIdentity.instanceId && existing.worker_ownership_digest===input.guard.workerProcessIdentity.ownershipDigest && existing.process_launch_id===input.guard.processLaunchId && existing.claim_id === input.guard.claimId && Number(existing.fencing_token) === input.guard.fencingToken && Number(existing.lease_generation) === input.guard.leaseGeneration) {
          return { action: "IN_FLIGHT", run: mapRun(existing) };
        }
        const recovered = (await client.query<RunRow>(`UPDATE builder.codex_exec_runs SET state='RECOVERY_REQUIRED',error_code='CODEX_RECOVERY_REQUIRED',
            completed_at=clock_timestamp(),recovery_fencing_token=$3
          WHERE project_id=$1 AND job_id=$2 AND state='DISPATCHED' RETURNING ${runColumns}`,
        [projectId,input.guard.jobId,input.guard.fencingToken])).rows[0];
        if (!recovered) throw new AgentJobLeaseLostError();
        await this.audit(client, projectId, input.guard.jobId, input.runId, "RECOVERY_REQUIRED", input.guard.fencingToken, "CODEX_RECOVERY_REQUIRED");
        return { action: "RECOVERY_REQUIRED", run: mapRun(recovered) };
      }
      const inserted = (await client.query<RunRow>(`INSERT INTO builder.codex_exec_runs(
          project_id,job_id,run_id,state,prompt_sha256,cli_version,worker_id,worker_process_instance_id,worker_ownership_digest,claim_id,lease_generation,fencing_token,claimed_job_version,started_at
        ) VALUES($1,$2,$3,'DISPATCHED',$4,$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp()) RETURNING ${runColumns}`,
      [projectId,input.guard.jobId,input.runId,input.promptSha256,input.cliVersion,input.guard.workerId,input.guard.workerProcessIdentity.instanceId,input.guard.workerProcessIdentity.ownershipDigest,input.guard.claimId,input.guard.leaseGeneration,input.guard.fencingToken,input.guard.claimedJobVersion])).rows[0]!;
      await this.audit(client, projectId, input.guard.jobId, input.runId, "START_RESERVED", input.guard.fencingToken);
      return { action: "START", run: mapRun(inserted) };
    });
  }

  async bindProcessLaunch(input: Parameters<CodexRuntimePersistence["bindProcessLaunch"]>[0]): Promise<CodexRuntimeGuard> {
    assertGuard(input.guard);assertProcessLaunchReceipt(input.receipt,input.binding);
    if(input.guard.processLaunchId!==null||input.binding.parentWorkerInstanceId!==input.guard.workerProcessIdentity.instanceId||input.binding.workerId!==input.guard.workerId||input.binding.jobId!==input.guard.jobId||input.binding.claimId!==input.guard.claimId||input.binding.leaseGeneration!==input.guard.leaseGeneration||input.binding.fencingToken!==input.guard.fencingToken||input.binding.jobVersion!==input.guard.claimedJobVersion+1||input.binding.runId!==input.runId)throw new AgentJobLeaseLostError();
    return this.tx(async client=>{
      const projectId=await this.lockOwnedAfterDispatch(client,input.guard);
      if(projectId.toLowerCase()!==input.binding.projectId.toLowerCase())throw new AgentJobLeaseLostError();
      const inserted=await client.query(`INSERT INTO builder.process_launch_receipts(
        project_id,process_launch_id,parent_worker_process_instance_id,worker_ownership_digest,logical_worker_id,
        job_id,task_id,attempt_id,run_id,assignment_id,claim_id,lease_generation,fencing_token,job_version,
        receipt_digest,binding_digest,process_id_digest,policy_version
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT(process_launch_id) DO NOTHING RETURNING process_launch_id`,[projectId,input.receipt.processLaunchId,input.guard.workerProcessIdentity.instanceId,input.guard.workerProcessIdentity.ownershipDigest,input.guard.workerId,input.guard.jobId,input.binding.taskId,input.binding.attemptId,input.runId,input.binding.assignmentId,input.guard.claimId,input.guard.leaseGeneration,input.guard.fencingToken,input.binding.jobVersion,input.receipt.receiptDigest,input.receipt.bindingDigest,input.receipt.processIdDigest,input.receipt.policyVersion]);
      if(inserted.rowCount!==1)throw new AgentJobLeaseLostError();
      const job=await client.query("UPDATE builder.background_jobs SET process_launch_id=$2 WHERE project_id=$1 AND id=$3 AND worker_process_instance_id=$4 AND worker_ownership_digest=$5 AND lease_owner=$6 AND claim_idempotency_key=$7 AND lease_generation=$8 AND fencing_token=$9 AND job_version=$10 AND process_launch_id IS NULL",[projectId,input.receipt.processLaunchId,input.guard.jobId,input.guard.workerProcessIdentity.instanceId,input.guard.workerProcessIdentity.ownershipDigest,input.guard.workerId,input.guard.claimId,input.guard.leaseGeneration,input.guard.fencingToken,input.binding.jobVersion]);if(job.rowCount!==1)throw new AgentJobLeaseLostError();
      const runtime=await client.query("UPDATE builder.agent_runtime_runs SET process_identity=$3,process_launch_receipt_digest=$4,process_launch_binding_digest=$5,process_id_digest=$6,runtime_started_at=clock_timestamp() WHERE project_id=$1 AND run_id=$2 AND worker_process_instance_id=$7 AND worker_ownership_digest=$8 AND process_identity IS NULL AND runtime_started_at IS NULL AND result_id IS NULL",[projectId,input.runId,input.receipt.processLaunchId,input.receipt.receiptDigest,input.receipt.bindingDigest,input.receipt.processIdDigest,input.guard.workerProcessIdentity.instanceId,input.guard.workerProcessIdentity.ownershipDigest]);if(runtime.rowCount!==1)throw new AgentJobLeaseLostError();
      const codex=await client.query("UPDATE builder.codex_exec_runs SET process_launch_id=$3,process_launch_receipt_digest=$4,process_launch_binding_digest=$5,process_id_digest=$6 WHERE project_id=$1 AND job_id=$2 AND state='DISPATCHED' AND worker_process_instance_id=$7 AND worker_ownership_digest=$8 AND process_launch_id IS NULL",[projectId,input.guard.jobId,input.receipt.processLaunchId,input.receipt.receiptDigest,input.receipt.bindingDigest,input.receipt.processIdDigest,input.guard.workerProcessIdentity.instanceId,input.guard.workerProcessIdentity.ownershipDigest]);if(codex.rowCount!==1)throw new AgentJobLeaseLostError();
      await client.query("INSERT INTO builder.agent_job_audit_events(project_id,job_id,event_type,fencing_token,metadata) VALUES($1,$2,'PROCESS_LAUNCH_BOUND',$3,$4::jsonb)",[projectId,input.guard.jobId,input.guard.fencingToken,JSON.stringify({workerProcessInstanceId:input.guard.workerProcessIdentity.instanceId,workerOwnershipDigest:input.guard.workerProcessIdentity.ownershipDigest,processLaunchId:input.receipt.processLaunchId,receiptDigest:input.receipt.receiptDigest,bindingDigest:input.receipt.bindingDigest,processIdDigest:input.receipt.processIdDigest,policyVersion:input.receipt.policyVersion})]);
      return{...input.guard,processLaunchId:input.receipt.processLaunchId};
    });
  }

  async complete(input: Parameters<CodexRuntimePersistence["complete"]>[0]): Promise<CodexPersistentRun> {
    const output = parseCodexPlannerOutput(input.output);
    if (output.status !== "SUCCEEDED") throw new Error("CODEX_COMPLETION_INVALID");
    return this.finish(input.guard,input.runId,input.promptSha256,"SUCCEEDED",input.completedAt,output,undefined,undefined,input.threadId,input.model,input.usage);
  }

  async fail(input: Parameters<CodexRuntimePersistence["fail"]>[0]): Promise<CodexPersistentRun> {
    const output = input.output === undefined ? undefined : parseCodexPlannerOutput(input.output);
    if (output?.status === "SUCCEEDED") throw new Error("CODEX_FAILURE_OUTPUT_INVALID");
    return this.finish(input.guard,input.runId,input.promptSha256,input.state,input.completedAt,output,input.errorCode,input.policyEvent,input.threadId,input.model,input.usage);
  }

  async load(jobId: string): Promise<CodexPersistentRun | undefined> {
    if (!uuid.test(jobId)) throw new Error("CODEX_JOB_ID_INVALID");
    const row = (await this.pool.query<RunRow>(`SELECT ${runColumns} FROM builder.codex_exec_runs WHERE job_id=$1`, [jobId])).rows[0];
    return row ? mapRun(row) : undefined;
  }

  private async finish(
    guard: CodexRuntimeGuard,
    runId: string,
    promptSha256: string,
    state: Exclude<CodexRunState,"DISPATCHED"|"RECOVERY_REQUIRED">,
    completedAt: string,
    output?: ReturnType<typeof parseCodexPlannerOutput>,
    errorCode?: CodexRuntimeFailureCode,
    policyEvent?: CodexPolicyEvent,
    threadId?: string,
    model?: string,
    usage?: CodexUsage,
  ): Promise<CodexPersistentRun> {
    assertGuard(guard);
    if (!reference.test(runId) || !digest.test(promptSha256) || Number.isNaN(Date.parse(completedAt))) throw new Error("CODEX_COMPLETION_INVALID");
    return this.tx(async (client) => {
      const projectId = await this.lockOwnedAfterDispatch(client, guard, state !== "SUCCEEDED");
      const row = (await client.query<RunRow>(`UPDATE builder.codex_exec_runs SET state=$4,output=$5::jsonb,error_code=$6,policy_event=$7,
          thread_id=$8,model=$9,usage=$10::jsonb,completed_at=clock_timestamp()
        WHERE project_id=$1 AND job_id=$2 AND run_id=$3 AND state='DISPATCHED' AND prompt_sha256=$11
          AND worker_id=$12 AND claim_id=$13 AND lease_generation=$14 AND fencing_token=$15 AND claimed_job_version=$16
          AND worker_process_instance_id=$17 AND worker_ownership_digest=$18 AND process_launch_id IS NOT DISTINCT FROM $19
        RETURNING ${runColumns}`,
      [projectId,guard.jobId,runId,state,output===undefined?null:JSON.stringify(output),errorCode??null,policyEvent??null,threadId??null,model??null,usage===undefined?null:JSON.stringify(usage),promptSha256,guard.workerId,guard.claimId,guard.leaseGeneration,guard.fencingToken,guard.claimedJobVersion,guard.workerProcessIdentity.instanceId,guard.workerProcessIdentity.ownershipDigest,guard.processLaunchId])).rows[0];
      if (!row) throw new AgentJobLeaseLostError();
      await this.audit(client,projectId,guard.jobId,runId,state==="SUCCEEDED"?"SUCCEEDED":state==="POLICY_VIOLATION"?"POLICY_VIOLATION":"FAILED",guard.fencingToken,errorCode,policyEvent);
      return mapRun(row);
    });
  }

  private async lockOwnedAfterDispatch(
    client: PoolClient,
    guard: CodexRuntimeGuard,
    allowCancelling = false,
  ): Promise<string> {
    const row = (await client.query<{project_id:string}>(`SELECT job.project_id FROM builder.background_jobs job
      JOIN builder.agent_runtime_runs runtime ON runtime.project_id=job.project_id AND runtime.run_id=job.agent_run_id
      JOIN builder.codex_exec_job_bindings binding ON binding.project_id=job.project_id AND binding.job_id=job.id
      JOIN builder.agent_assignments assignment ON assignment.project_id=binding.project_id AND assignment.assignment_id=binding.assignment_id
        AND assignment.job_id=binding.job_id AND assignment.required_role='PLANNER' AND assignment.assignment_status='ASSIGNED'
        AND assignment.agent_id=binding.agent_id AND assignment.agent_key=binding.agent_key AND assignment.agent_version=binding.agent_version
      JOIN builder.agent_registry_versions registry ON registry.agent_id=binding.agent_id AND registry.agent_key=binding.agent_key
        AND registry.version=binding.agent_version AND registry.role='PLANNER'
      JOIN builder.project_workspaces workspace ON workspace.project_id=binding.project_id AND workspace.workspace_id=binding.workspace_id
        AND workspace.project_revision=binding.project_revision AND workspace.status='READY'
      WHERE job.id=$1 AND job.lease_owner=$2 AND job.claim_idempotency_key=$3 AND job.fencing_token=$4
        AND job.lease_generation=$5 AND job.lease_expires_at>clock_timestamp()
        AND job.worker_process_instance_id=$8 AND job.worker_ownership_digest=$9
        AND job.process_launch_id IS NOT DISTINCT FROM $10
        AND runtime.runtime_start_dispatched_at IS NOT NULL
        AND runtime.runtime_snapshot='{}'::jsonb
        AND runtime.runtime_fencing_token=0 AND runtime.result_id IS NULL
        AND runtime.workload_id IS NULL
        AND (($10::text IS NULL AND runtime.runtime_started_at IS NULL AND runtime.process_identity IS NULL)
          OR ($10::text IS NOT NULL AND runtime.runtime_started_at IS NOT NULL AND runtime.process_identity=$10))
        AND (
          (job.status='CLAIMED' AND job.cancel_requested_at IS NULL
            AND job.job_version IN ($6::bigint,$6::bigint+1)
            AND runtime.runtime_start_job_version=job.job_version AND runtime.state='RUNNING')
          OR ($7::boolean AND job.status='CANCELLING' AND job.cancel_requested_at IS NOT NULL
            AND job.cancellation_request_id IS NOT NULL AND job.cancellation_sequence IS NOT NULL
            AND runtime.runtime_start_job_version<job.cancellation_sequence
            AND job.cancellation_sequence<=job.job_version AND runtime.state='CANCELLATION_REQUESTED')
        )
      FOR UPDATE OF job`,
    [guard.jobId,guard.workerId,guard.claimId,guard.fencingToken,guard.leaseGeneration,guard.claimedJobVersion,allowCancelling,guard.workerProcessIdentity.instanceId,deriveWorkerOwnershipDigest(guard.workerProcessIdentity.instanceId,guard.workerProcessIdentity.ownershipProof),guard.processLaunchId])).rows[0];
    if (!row) throw new AgentJobLeaseLostError();
    return row.project_id;
  }

  private async audit(client: PoolClient, projectId: string, jobId: string, runId: string, eventType: string, fencingToken: number, errorCode?: string, policyEvent?: CodexPolicyEvent): Promise<void> {
    await client.query(`INSERT INTO builder.codex_exec_audit_events(project_id,job_id,run_id,event_type,fencing_token,error_code,policy_event)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [projectId,jobId,runId,eventType,fencingToken,errorCode??null,policyEvent??null]);
  }

  private async tx<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
