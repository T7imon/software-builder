import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type { ProjectId } from "@software-builder/core";
import type { ProjectWorkflow, WorkflowPersistenceProjection } from "@software-builder/workflow-engine";
import type { BootstrapCapability, BootstrapCapabilityVerifier, BuilderProject, CommandEnvelope, CommandResult, CreateProjectInput, EntityMutation, ProjectCapability, ProjectCapabilityVerifier, ProjectContextIssuer, TaskRecord, VerifiedProjectCapability } from "./types.js";
import { PostgresAgentAssignmentRepository } from "./agent-assignment.js";
import { PostgresAgentRegistryRepository } from "./agent-registry.js";
import { PostgresPlanningOrchestratorRepository } from "./planning-orchestrator-repository.js";
import { PostgresWorkspaceRegistrationStore, type WorkspaceRepositoryLock, type WorkspaceRepositoryQuery, type WorkspaceRepositoryTransaction } from "./workspace-repository.js";

export interface WorkflowLeaseGuard {
  readonly jobId: string;
  readonly workerId: string;
  readonly claimIdempotencyKey: string;
  readonly fencingToken: number;
  readonly allowedStatuses: readonly string[];
}
export type WorkflowLeaseGuardResult = "VALID" | "VERSION_CONFLICT" | "LEASE_INVALID";

export * from "./capabilities.js";
export * from "./types.js";
export * from "./workflow-repository.js";
export * from "./agent-job-repository.js";
export * from "./agent-assignment.js";
export * from "./agent-registry.js";
export * from "./planning-orchestrator-repository.js";
export * from "./workspace-repository.js";
export * from "./codex-runtime-repository.js";
export { migrate, resetDatabase } from "./migrations.js";

interface ProjectRow { id: string; project_type: "FULL_STACK_WEB"; status: BuilderProject["status"]; version: number; created_at: Date; updated_at: Date; }
interface TaskRow { id: string; project_id: string; milestone_id: string; task_type: string; statement_ref: string; acceptance_criteria_ref: string; status: TaskRecord["status"]; repair_count: number; version: number; created_at: Date; updated_at: Date; }
type EntityKind = EntityMutation["kind"];
type MutationFor<K extends EntityKind> = Extract<EntityMutation, { kind: K }>;
const aggregateTypes:Record<EntityKind,string>={project_brief:"PROJECT_BRIEF",product_specification:"PRODUCT_SPECIFICATION",workflow_definition:"WORKFLOW_DEFINITION",milestone:"MILESTONE",workflow_stage:"WORKFLOW_STAGE",task:"TASK",task_dependency:"TASK_DEPENDENCY",workflow_run:"WORKFLOW_EXECUTION",attempt:"ATTEMPT",agent_definition:"AGENT_DEFINITION",agent_thread:"AGENT_THREAD",agent_run:"AGENT_RUN",artifact:"ARTIFACT",decision:"DECISION",finding:"FINDING",gate_result:"GATE_RESULT",repository_connection:"REPOSITORY_CONNECTION",deployment:"DEPLOYMENT",inbox_event:"INBOX_EVENT"};
const readSession = Symbol("readSession"); const bootstrapSession = Symbol("bootstrapSession"); const finishCommand = Symbol("finishCommand");

const mapProject = (row: ProjectRow): BuilderProject => ({ id: row.id, projectType: row.project_type, status: row.status, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at });
const mapTask = (row: TaskRow): TaskRecord => ({ id: row.id, projectId: row.project_id, milestoneId: row.milestone_id, taskType: row.task_type, statementRef: row.statement_ref, acceptanceCriteriaRef: row.acceptance_criteria_ref, status: row.status, repairCount: row.repair_count, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at });

const secretPattern = /(?:sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|npm_[a-z0-9]{20,}|pypi-[a-z0-9_-]{20,}|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|bearer\s+[a-z0-9._~+/-]{12,}|(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\s*[:=]|aws[_-]?(?:access|secret)|[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@|-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----)/i;
const secretFieldPattern = /^(?:apiKey|accessToken|refreshToken|clientSecret|password|passwd|privateKey|secret|secretValue)$/i;
export function validatePersistenceInput(value: unknown, path = "input"): void {
  if (typeof value === "string") {
    if (value.length === 0 || value.length > 2048) throw new Error(`${path} muss 1..2048 Zeichen enthalten.`);
    if (secretPattern.test(value)) throw new Error(`${path} enthaelt mutmassliches Secret-Material.`);
  } else if (Array.isArray(value)) value.forEach((entry, index) => validatePersistenceInput(entry, `${path}[${index}]`));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, entry]) => {
    if (secretFieldPattern.test(key) && entry !== undefined && entry !== null) throw new Error(`${path}.${key} ist ein verbotenes Secret-Feld.`);
    validatePersistenceInput(entry, `${path}.${key}`);
  });
}
function validateEnvelope(envelope: CommandEnvelope): void {
  validatePersistenceInput(envelope);
  if (!/^[0-9a-f]{64}$/.test(envelope.requestDigest)) throw new Error("requestDigest muss SHA-256 hex sein.");
  if (envelope.schemaVersion < 1) throw new Error("schemaVersion muss positiv sein.");
}

class ProjectSession {
  constructor(readonly projectId: ProjectId, private readonly client: PoolClient) {}
  query<R extends QueryResultRow = QueryResultRow>(sql: string, values: readonly unknown[] = []) { return this.client.query<R>(sql, [...values]); }
}

class DomainRepository<K extends EntityKind> {
  constructor(protected readonly db: PostgresDatabase, private readonly kind: K, private readonly table: string) {}
  append(capability: ProjectCapability, envelope: CommandEnvelope, mutation: Omit<MutationFor<K>, "kind">): Promise<CommandResult> {
    return this.db.executeCommand(capability, envelope, { ...mutation, kind: this.kind } as MutationFor<K>);
  }
  async findById(capability: ProjectCapability, id: string): Promise<Readonly<Record<string, unknown>> | undefined> {
    validatePersistenceInput(id, "id");
    return this.db[readSession](capability, `${this.kind}:read`, async (session) => {
      const result = await session.query(`SELECT * FROM builder.${this.table} WHERE project_id = $1 AND id = $2`, [session.projectId, id]);
      return result.rows[0];
    });
  }
}

class ReadRepository {
  constructor(private readonly db: PostgresDatabase, private readonly table: string) {}
  async findById(capability: ProjectCapability, id: string): Promise<Readonly<Record<string, unknown>> | undefined> {
    validatePersistenceInput(id, "id");
    return this.db[readSession](capability, `${this.table}:read`, async (session) => {
      const result = await session.query(`SELECT * FROM builder.${this.table} WHERE project_id = $1 AND id = $2`, [session.projectId, id]);
      return result.rows[0];
    });
  }
}

class AuditRepository extends ReadRepository {
  constructor(private readonly database:PostgresDatabase){super(database,"audit_events");}
  verifyChain(capability:ProjectCapability):Promise<boolean>{return this.database[readSession](capability,"audit_event:verify",async session=>(await session.query<{valid:boolean}>("SELECT builder.verify_audit_chain($1) valid",[session.projectId])).rows[0]?.valid===true);}
}

class ProjectRepository {
  constructor(private readonly db: PostgresDatabase) {}
  async create(capability: BootstrapCapability, input: CreateProjectInput, envelope: CommandEnvelope): Promise<BuilderProject> {
    await this.db.verifyBootstrap(capability,envelope.actorIdentityId,envelope.actorScope);
    validatePersistenceInput(input); validateEnvelope(envelope);
    const id = input.id ?? randomUUID();
    if (id !== envelope.aggregateId) throw new Error("Project-ID und Command-Aggregat stimmen nicht ueberein.");
    if(envelope.aggregateType!=="PROJECT") throw new Error("Project-Command benoetigt Aggregattyp PROJECT.");
    return this.db[bootstrapSession](id as ProjectId,envelope, async (session) => {
      await session.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`bootstrap:${id}`]);
      const existingProject = await session.query<ProjectRow>("SELECT * FROM builder.projects WHERE id=$1",[id]);
      if (existingProject.rows[0]) {
        const prior = await session.query<{ request_digest: string; status: string; aggregate_type: string; aggregate_id: string }>("SELECT request_digest,status,aggregate_type,aggregate_id FROM builder.idempotency_records WHERE project_id=$1 AND actor_scope=$2 AND idempotency_key=$3",[id,envelope.actorScope,envelope.idempotencyKey]);
        if (prior.rows[0]?.request_digest !== envelope.requestDigest || prior.rows[0]?.status !== "COMPLETED" || prior.rows[0]?.aggregate_type !== envelope.aggregateType || prior.rows[0]?.aggregate_id !== envelope.aggregateId) throw new Error("Projekt existiert ohne passende abgeschlossene Idempotency-Aufzeichnung.");
        return mapProject(existingProject.rows[0]);
      }
      const result = await session.query<ProjectRow>(`INSERT INTO builder.projects(id,project_type,status) VALUES ($1,$2,$3) RETURNING *`, [id, input.projectType ?? "FULL_STACK_WEB", input.status ?? "IDEA_VALIDATION"]);
      await session.query("INSERT INTO builder.idempotency_records(project_id,actor_scope,idempotency_key,request_digest,aggregate_type,aggregate_id,status) VALUES ($1,$2,$3,$4,$5,$6,'STARTED')",[id,envelope.actorScope,envelope.idempotencyKey,envelope.requestDigest,envelope.aggregateType,envelope.aggregateId]);
      await this.db[finishCommand](session, envelope, id, false);
      return mapProject(result.rows[0]!);
    });
  }
  async findById(capability: ProjectCapability): Promise<BuilderProject | undefined> {
    return this.db[readSession](capability,"project:read", async (session) => {
      const result = await session.query<ProjectRow>("SELECT * FROM builder.projects WHERE id=$1", [session.projectId]);
      return result.rows[0] ? mapProject(result.rows[0]) : undefined;
    });
  }
}

class TaskRepository extends DomainRepository<"task"> {
  constructor(db: PostgresDatabase) { super(db, "task", "tasks"); }
  async get(capability: ProjectCapability, id: string): Promise<TaskRecord | undefined> {
    return this.db[readSession](capability,"task:read", async (session) => {
      const result = await session.query<TaskRow>("SELECT * FROM builder.tasks WHERE project_id=$1 AND id=$2", [session.projectId, id]);
      return result.rows[0] ? mapTask(result.rows[0]) : undefined;
    });
  }
}

export class PostgresDatabase {
  readonly agentAssignments = new PostgresAgentAssignmentRepository((capability,operation,action)=>this[readSession](capability,operation,action));
  readonly agentRegistry = new PostgresAgentRegistryRepository((capability,operation,action)=>this[readSession](capability,operation,action));
  readonly projects = new ProjectRepository(this);
  readonly projectBriefs = new DomainRepository(this, "project_brief", "project_briefs");
  readonly productSpecifications = new DomainRepository(this, "product_specification", "product_specifications");
  readonly workflowDefinitions = new DomainRepository(this, "workflow_definition", "workflow_definitions");
  readonly milestones = new DomainRepository(this, "milestone", "milestones");
  readonly workflowStages = new DomainRepository(this, "workflow_stage", "workflow_stages");
  readonly tasks = new TaskRepository(this);
  readonly taskDependencies = new DomainRepository(this, "task_dependency", "task_dependencies");
  readonly workflowRuns = new DomainRepository(this, "workflow_run", "workflow_runs");
  readonly attempts = new DomainRepository(this, "attempt", "attempts");
  readonly agentDefinitions = new DomainRepository(this, "agent_definition", "agent_definitions");
  readonly agentThreads = new DomainRepository(this, "agent_thread", "agent_threads");
  readonly agentRuns = new DomainRepository(this, "agent_run", "agent_runs");
  readonly artifacts = new DomainRepository(this, "artifact", "artifacts");
  readonly decisions = new DomainRepository(this, "decision", "decisions");
  readonly findings = new DomainRepository(this, "finding", "findings");
  readonly gateResults = new DomainRepository(this, "gate_result", "gate_results");
  readonly repositoryConnections = new DomainRepository(this, "repository_connection", "repository_connections");
  readonly deployments = new DomainRepository(this, "deployment", "deployments");
  readonly inboxEvents = new DomainRepository(this, "inbox_event", "inbox_events");
  readonly auditEvents = new AuditRepository(this);
  readonly auditCheckpoints = new ReadRepository(this, "audit_checkpoints");
  readonly backgroundJobs = new ReadRepository(this, "background_jobs");
  readonly outboxEvents = new ReadRepository(this, "outbox_events");

  private constructor(private readonly pool: Pool, private readonly contextIssuer: ProjectContextIssuer, private readonly capabilityVerifier: ProjectCapabilityVerifier, private readonly bootstrapVerifier: BootstrapCapabilityVerifier) {}
  static async connectRuntime(connectionString: string, contextIssuer: ProjectContextIssuer, capabilityVerifier: ProjectCapabilityVerifier, bootstrapVerifier: BootstrapCapabilityVerifier): Promise<PostgresDatabase> {
    const pool = new Pool({ connectionString, application_name: "software-builder-runtime" });
    const identity = await pool.query<{ current_user: string; session_user: string; rolsuper: boolean; rolbypassrls: boolean; runtime_member: boolean; forbidden_member: boolean }>(
      `SELECT current_user,session_user,role.rolsuper,role.rolbypassrls,
       pg_has_role(current_user,'builder_runtime','MEMBER') AS runtime_member,
       (pg_has_role(current_user,'builder_schema_owner','MEMBER') OR pg_has_role(current_user,'builder_queue_owner','MEMBER') OR pg_has_role(current_user,'builder_job_claimer','MEMBER') OR pg_has_role(current_user,'builder_audit_writer','MEMBER') OR pg_has_role(current_user,'builder_context_issuer','MEMBER') OR pg_has_role(current_user,'builder_role_provisioner','MEMBER')) AS forbidden_member
       FROM pg_roles role WHERE role.rolname=current_user`,
    );
    const row = identity.rows[0];
    if (!row || row.current_user !== "builder_app_login" || row.session_user !== "builder_app_login" || row.rolsuper || row.rolbypassrls || !row.runtime_member || row.forbidden_member) {
      await pool.end(); throw new Error("DATABASE_URL ist keine isolierte Builder-Runtime-Identitaet.");
    }
    return new PostgresDatabase(pool,contextIssuer, capabilityVerifier, bootstrapVerifier);
  }

  async createPlanningOrchestrator(capability:ProjectCapability):Promise<PostgresPlanningOrchestratorRepository>{
    const binding=await this.claim(capability,"planning:read");
    return PostgresPlanningOrchestratorRepository.forProject(async(request,action)=>{
      const verified=await this.claim(capability,request.operation);
      if(verified.capabilityId!==binding.capabilityId||verified.projectId!==binding.projectId||verified.subject!==binding.subject)throw new Error("PLANNING_CAPABILITY_BINDING_CHANGED");
      if(request.projectId.toLowerCase()!==verified.projectId.toLowerCase())throw new Error("PLANNING_CAPABILITY_PROJECT_MISMATCH");
      if(request.actor!==undefined&&request.actor!==verified.subject)throw new Error("PLANNING_CAPABILITY_ACTOR_MISMATCH");
      return this.transaction(verified,session=>action({projectId:session.projectId,subject:verified.subject,query:(sql,values=[])=>session.query(sql,values)}));
    });
  }

  async createWorkspaceRegistrationStore(capability:ProjectCapability):Promise<PostgresWorkspaceRegistrationStore>{
    const binding=await this.claim(capability,"workspace:read");
    const verifyBinding=async(operation:"workspace:read"|"workspace:append")=>{
      const verified=await this.claim(capability,operation);
      if(verified.capabilityId!==binding.capabilityId||verified.projectId!==binding.projectId||verified.subject!==binding.subject)throw new Error("WORKSPACE_CAPABILITY_BINDING_CHANGED");
      return verified;
    };
    const transaction:WorkspaceRepositoryTransaction=async(operation,action)=>{
      const verified=await verifyBinding(operation);
      return this.transaction(verified,session=>action({query:(sql,values=[])=>session.query(sql,values)}));
    };
    const lock:WorkspaceRepositoryLock=async(lockName,action)=>{
      await verifyBinding("workspace:append");
      const client=await this.pool.connect();
      try{
        await client.query("SELECT pg_advisory_lock(hashtextextended($1,0))",[lockName]);
        const lockedTransaction:WorkspaceRepositoryTransaction=async(operation,transactionAction)=>{
          const verified=await verifyBinding(operation);
          const contextGrant=await this.contextIssuer.issueContext(verified);
          await client.query("BEGIN");
          try{
            await client.query("SELECT builder.consume_project_context($1)",[contextGrant]);
            const query:WorkspaceRepositoryQuery={query:(sql,values=[])=>client.query(sql,[...values])};
            const result=await transactionAction(query);
            await client.query("COMMIT");
            return result;
          }catch(error){await client.query("ROLLBACK");throw error;}
        };
        return await action(lockedTransaction);
      }finally{
        await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",[lockName]).catch(()=>undefined);
        client.release();
      }
    };
    return new PostgresWorkspaceRegistrationStore(binding.projectId,binding.subject,transaction,lock);
  }

  async verifyBootstrap(capability: BootstrapCapability,subject:string,actorScope:string): Promise<void> { await this.bootstrapVerifier.verifyBootstrap(capability,subject,actorScope); }
  private async claim(capability: ProjectCapability,operation:string,envelope?:CommandEnvelope): Promise<VerifiedProjectCapability> {
    const verified=await this.capabilityVerifier.verifyProject(capability,{audience:"persistence",operation});
    if(envelope && (envelope.actorIdentityId!==verified.subject || envelope.actorScope!==verified.actorScope)) throw new Error("Command-Actor stimmt nicht mit Capability-Claim ueberein.");
    return verified;
  }
  private async transaction<T>(claim:VerifiedProjectCapability, operation: (session: ProjectSession) => Promise<T>): Promise<T> {
    const contextGrant=await this.contextIssuer.issueContext(claim);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT builder.consume_project_context($1)",[contextGrant]);
      const result = await operation(new ProjectSession(claim.projectId, client));
      await client.query("COMMIT"); return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async [readSession]<T>(capability: ProjectCapability, operationName:string, operation: (session: ProjectSession) => Promise<T>): Promise<T> { return this.transaction(await this.claim(capability,operationName), operation); }
  async [bootstrapSession]<T>(projectId: ProjectId,envelope:CommandEnvelope, operation: (session: ProjectSession) => Promise<T>): Promise<T> { return this.transaction({kind:"project",projectId,expiresAt:new Date(Date.now()+30_000),capabilityId:randomUUID(),subject:envelope.actorIdentityId,actorScope:envelope.actorScope,audience:"persistence",operation:"project:create",allowedOperations:["project:create"],allowedRoles:[envelope.actorScope]}, operation); }

  async executeCommand(capability: ProjectCapability, envelope: CommandEnvelope, mutation: EntityMutation): Promise<CommandResult> {
    validateEnvelope(envelope); validatePersistenceInput(mutation);
    if(!mutation.id || mutation.id!==envelope.aggregateId) throw new Error("Mutation-ID und Command-Aggregat muessen identisch sein.");
    if(envelope.aggregateType!==aggregateTypes[mutation.kind]) throw new Error("Command-Aggregattyp passt nicht zur Repository-Tabelle.");
    const verified=await this.claim(capability,`${mutation.kind}:append`,envelope); const projectId=verified.projectId;
    return this.transaction(verified, async (session) => {
      const inserted = await session.query(`INSERT INTO builder.idempotency_records(project_id,actor_scope,idempotency_key,request_digest,aggregate_type,aggregate_id,status) VALUES ($1,$2,$3,$4,$5,$6,'STARTED') ON CONFLICT DO NOTHING RETURNING id`, [projectId,envelope.actorScope,envelope.idempotencyKey,envelope.requestDigest,envelope.aggregateType,envelope.aggregateId]);
      const record = await session.query<{ request_digest: string; result_ref: string | null; status: string; aggregate_type: string; aggregate_id: string }>(`SELECT request_digest,result_ref,status,aggregate_type,aggregate_id FROM builder.idempotency_records WHERE project_id=$1 AND actor_scope=$2 AND idempotency_key=$3 FOR UPDATE`, [projectId,envelope.actorScope,envelope.idempotencyKey]);
      const existing = record.rows[0]!;
      if (existing.aggregate_type !== envelope.aggregateType || existing.aggregate_id !== envelope.aggregateId) throw new Error("Idempotency-Key wurde fuer ein abweichendes Aggregat wiederverwendet.");
      if (existing.request_digest !== envelope.requestDigest) throw new Error("Idempotency-Key wurde mit abweichendem Request-Digest wiederverwendet.");
      if (inserted.rowCount === 0 && existing.status === "COMPLETED" && existing.result_ref) return { resultRef: existing.result_ref, duplicate: true };
      const resultRef = await applyMutation(session, mutation, envelope.idempotencyKey);
      return this[finishCommand](session, envelope, resultRef, false);
    });
  }

  async createWorkflowState(capability: BootstrapCapability, subject: string, actorScope: string, project: ProjectWorkflow, snapshot: string, projection: WorkflowPersistenceProjection): Promise<void> {
    await this.verifyBootstrap(capability,subject,actorScope);
    validatePersistenceInput(project);
    if(snapshot.length<2||snapshot.length>10_000_000)throw new Error("Workflow-Snapshot ist ungueltig oder zu gross.");
    await this[bootstrapSession](project.projectId as ProjectId,{ actorIdentityId:subject,actorScope } as CommandEnvelope,async(session)=>{
      await session.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`workflow:${project.projectId}`]);
      if((await session.query("SELECT 1 FROM builder.workflow_aggregates WHERE project_id=$1",[project.projectId])).rowCount) throw new Error("WORKFLOW_PROJECT_ALREADY_EXISTS");
      await session.query("INSERT INTO builder.projects(id,status) VALUES($1,'PLANNING') ON CONFLICT(id) DO NOTHING",[project.projectId]);
      await session.query(`INSERT INTO builder.workflow_aggregates(project_id,phase,aggregate_version,storage_version,policy_version,revision_digest,state_snapshot) VALUES($1,$2,$3,0,$4,$5,$6::jsonb)`,[project.projectId,project.phase,project.version,project.policyVersion,project.revisionDigest,snapshot]);
      const emitted=await persistWorkflowProjection(session,projection);
      if(emitted===0)await appendWorkflowStateMutation(session,subject,snapshot,projection);
    });
  }

  async readWorkflowState(capability: ProjectCapability): Promise<{ readonly snapshot:string; readonly storageVersion:number; readonly databaseNow:Date }|null> {
    return this[readSession](capability,"workflow_state:read",async(session)=>{
      const row=(await session.query<{state_snapshot:unknown;storage_version:string;database_now:Date}>("SELECT state_snapshot,storage_version,clock_timestamp() database_now FROM builder.workflow_aggregates WHERE project_id=$1",[session.projectId])).rows[0];
      return row?{snapshot:JSON.stringify(row.state_snapshot),storageVersion:Number(row.storage_version),databaseNow:row.database_now}:null;
    });
  }

  async validateWorkflowLease(capability:ProjectCapability,expectedStorageVersion:number,guard:WorkflowLeaseGuard):Promise<WorkflowLeaseGuardResult>{
    const verified=await this.claim(capability,"workflow_state:append");
    return this.transaction(verified,async(session)=>{
      const aggregate=await session.query<{storage_version:string}>("SELECT storage_version FROM builder.workflow_aggregates WHERE project_id=$1 FOR UPDATE",[session.projectId]);
      if(Number(aggregate.rows[0]?.storage_version)!==expectedStorageVersion)return "VERSION_CONFLICT";
      return await workflowLeaseIsValid(session,guard)?"VALID":"LEASE_INVALID";
    });
  }

  async compareAndSwapWorkflowState(capability: ProjectCapability, expectedStorageVersion:number, snapshot:string, projection:WorkflowPersistenceProjection, leaseGuard?:WorkflowLeaseGuard):Promise<WorkflowLeaseGuardResult>{
    validatePersistenceInput(projection.project);
    if(snapshot.length<2||snapshot.length>10_000_000)throw new Error("Workflow-Snapshot ist ungueltig oder zu gross.");
    const verified=await this.claim(capability,"workflow_state:append");
    return this.transaction(verified,async(session)=>{
      const aggregate=await session.query<{storage_version:string}>("SELECT storage_version FROM builder.workflow_aggregates WHERE project_id=$1 FOR UPDATE",[session.projectId]);
      if(Number(aggregate.rows[0]?.storage_version)!==expectedStorageVersion)return "VERSION_CONFLICT";
      if(leaseGuard&&!await workflowLeaseIsValid(session,leaseGuard))return "LEASE_INVALID";
      const updated=await session.query(`UPDATE builder.workflow_aggregates SET phase=$3,aggregate_version=$4,storage_version=storage_version+1,policy_version=$5,revision_digest=$6,state_snapshot=$7::jsonb WHERE project_id=$1 AND storage_version=$2`,[session.projectId,expectedStorageVersion,projection.project.phase,projection.project.version,projection.project.policyVersion,projection.project.revisionDigest,snapshot]);
      if(updated.rowCount!==1)return "VERSION_CONFLICT";
      const emitted=await persistWorkflowProjection(session,projection);
      if(emitted===0)await appendWorkflowStateMutation(session,verified.subject,snapshot,projection);
      return "VALID";
    });
  }

  async [finishCommand](session: ProjectSession, envelope: CommandEnvelope, resultRef: string, duplicate: boolean): Promise<CommandResult> {
    const eventKey=createHash("sha256").update(`${envelope.actorScope}\0${envelope.idempotencyKey}`).digest("hex");
    await session.query(`SELECT builder.append_audit_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [session.projectId,envelope.aggregateType,envelope.aggregateId,envelope.actorIdentityId,envelope.transition,envelope.priorState ?? null,envelope.newState,envelope.reasonCode,envelope.policyVersion,eventKey]);
    await session.query(`INSERT INTO builder.outbox_events(project_id,event_type,aggregate_type,aggregate_id,schema_version,policy_version,idempotency_key,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING')`, [session.projectId,envelope.eventType,envelope.aggregateType,envelope.aggregateId,envelope.schemaVersion,envelope.policyVersion,eventKey]);
    if (envelope.enqueueJob) await session.query(`INSERT INTO builder.background_jobs(project_id,job_type,aggregate_type,aggregate_id,schema_version,policy_version,idempotency_key,expected_aggregate_version,trace_id,max_retries,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING')`, [session.projectId,envelope.enqueueJob.jobType,envelope.aggregateType,envelope.aggregateId,envelope.schemaVersion,envelope.policyVersion,eventKey,envelope.enqueueJob.expectedAggregateVersion,envelope.enqueueJob.traceId,envelope.enqueueJob.maxRetries ?? 3]);
    await session.query(`UPDATE builder.idempotency_records SET status='COMPLETED',result_ref=$4 WHERE project_id=$1 AND actor_scope=$2 AND idempotency_key=$3`, [session.projectId,envelope.actorScope,envelope.idempotencyKey,resultRef]);
    return { resultRef, duplicate };
  }
  async checkHealth(): Promise<boolean> { return (await this.pool.query<{ ok: number }>("SELECT 1 AS ok")).rows[0]?.ok === 1; }
  async close(): Promise<void> { await this.pool.end(); await this.contextIssuer.close(); }
}

export class PostgresProjectContextIssuer implements ProjectContextIssuer {
  private constructor(private readonly pool:Pool) {}
  static async connect(connectionString:string):Promise<PostgresProjectContextIssuer>{const pool=new Pool({connectionString,application_name:"software-builder-context-issuer"});const row=(await pool.query<{current_user:string;issuer_member:boolean}>("SELECT current_user,pg_has_role(current_user,'builder_context_issuer','MEMBER') issuer_member")).rows[0];if(row?.current_user!=="builder_context_login"||!row.issuer_member){await pool.end();throw new Error("CONTEXT_DATABASE_URL ist keine Context-Issuer-Identitaet.");}return new PostgresProjectContextIssuer(pool);}
  async issueContext(claim:VerifiedProjectCapability):Promise<string>{const row=(await this.pool.query<{grant_token:string}>("SELECT builder.issue_project_context($1,$2,$3,$4,$5,$6,$7) grant_token",[claim.projectId,claim.capabilityId,claim.subject,claim.actorScope,claim.audience,claim.operation,claim.expiresAt])).rows[0];if(!row?.grant_token)throw new Error("Project context grant konnte nicht ausgestellt werden.");return row.grant_token;}
  async close():Promise<void>{await this.pool.end();}
}

async function applyMutation(session: ProjectSession, mutation: EntityMutation, idempotencyKey: string): Promise<string> {
  const id = mutation.id ?? randomUUID();
  switch (mutation.kind) {
    case "project_brief": await session.query(`INSERT INTO builder.project_briefs(id,project_id,schema_version,classification,content_object_ref,status) VALUES ($1,$2,$3,$4,$5,$6)`,[id,session.projectId,mutation.schemaVersion,mutation.classification,mutation.contentObjectRef ?? null,mutation.status]); break;
    case "product_specification": await session.query(`INSERT INTO builder.product_specifications(id,project_id,schema_version,revision,content_digest,object_ref,status,supersedes_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[id,session.projectId,mutation.schemaVersion,mutation.revision,mutation.contentDigest,mutation.objectRef,mutation.status,mutation.supersedesId ?? null]); break;
    case "workflow_definition": await session.query(`INSERT INTO builder.workflow_definitions(id,project_id,name,schema_version,revision,definition_digest,status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[id,session.projectId,mutation.name,mutation.schemaVersion,mutation.revision,mutation.definitionDigest,mutation.status]); break;
    case "milestone": await session.query(`INSERT INTO builder.milestones(id,project_id,planner_m_id,ordinal,status,acceptance_policy_id) VALUES ($1,$2,$3,$4,$5,$6)`,[id,session.projectId,mutation.plannerMilestoneId,mutation.ordinal,mutation.status,mutation.acceptancePolicyId]); break;
    case "workflow_stage": await session.query(`INSERT INTO builder.workflow_stages(id,project_id,workflow_definition_id,milestone_id,name,ordinal,status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[id,session.projectId,mutation.workflowDefinitionId ?? null,mutation.milestoneId,mutation.name,mutation.ordinal,mutation.status]); break;
    case "task": await session.query(`INSERT INTO builder.tasks(id,project_id,milestone_id,task_type,statement_ref,acceptance_criteria_ref,status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[id,session.projectId,mutation.milestoneId,mutation.taskType,mutation.statementRef,mutation.acceptanceCriteriaRef,mutation.status]); break;
    case "task_dependency": await session.query(`INSERT INTO builder.task_dependencies(id,project_id,predecessor_task_id,successor_task_id,status) VALUES ($1,$2,$3,$4,'ACTIVE')`,[id,session.projectId,mutation.predecessorTaskId,mutation.successorTaskId]); break;
    case "workflow_run": await session.query(`INSERT INTO builder.workflow_runs(id,project_id,workflow_definition_id,task_id,policy_snapshot_id,requested_by,status,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[id,session.projectId,mutation.workflowDefinitionId,mutation.taskId,mutation.policySnapshotId,mutation.requestedBy,mutation.status,idempotencyKey]); break;
    case "attempt": await session.query(`INSERT INTO builder.attempts(id,project_id,task_id,workflow_run_id,kind,ordinal,base_revision_digest,output_revision_digest,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,session.projectId,mutation.taskId,mutation.workflowRunId,mutation.attemptKind,mutation.ordinal,mutation.baseRevisionDigest ?? null,mutation.outputRevisionDigest ?? null,mutation.status]); break;
    case "agent_definition": await session.query(`INSERT INTO builder.agent_definitions(id,project_id,role,adapter_version,policy_version,status) VALUES ($1,$2,$3,$4,$5,$6)`,[id,session.projectId,mutation.role,mutation.adapterVersion,mutation.policyVersion,mutation.status]); break;
    case "agent_thread": await session.query(`INSERT INTO builder.agent_threads(id,project_id,provider_thread_ref,status) VALUES ($1,$2,$3,$4)`,[id,session.projectId,mutation.providerThreadRef ?? null,mutation.status]); break;
    case "agent_run": await session.query(`INSERT INTO builder.agent_runs(id,project_id,attempt_id,agent_definition_id,agent_thread_id,role,provider_profile_id,adapter_version,sdk_runtime_version,model_policy_id,provider_thread_ref,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,session.projectId,mutation.attemptId,mutation.agentDefinitionId,mutation.agentThreadId ?? null,mutation.role,mutation.providerProfileId ?? null,mutation.adapterVersion,mutation.sdkRuntimeVersion,mutation.modelPolicyId,mutation.providerThreadRef ?? null,mutation.status]); break;
    case "artifact": await session.query(`INSERT INTO builder.artifacts(id,project_id,artifact_type,schema_version,revision,content_digest,object_ref,created_by_role,status,supersedes_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,session.projectId,mutation.artifactType,mutation.schemaVersion,mutation.revision,mutation.contentDigest,mutation.objectRef ?? null,mutation.createdByRole,mutation.status,mutation.supersedesId ?? null]); break;
    case "decision": await session.query(`INSERT INTO builder.decisions(id,project_id,subject_type,subject_id,decision,rationale_ref,evidence_ref,supersedes_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[id,session.projectId,mutation.subjectType,mutation.subjectId,mutation.decision,mutation.rationaleRef ?? null,mutation.evidenceRef ?? null,mutation.supersedesId ?? null]); break;
    case "finding": await session.query(`INSERT INTO builder.findings(id,project_id,subject_type,subject_id,fingerprint,severity,status,evidence_ref,supersedes_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,session.projectId,mutation.subjectType,mutation.subjectId,mutation.fingerprint,mutation.severity,mutation.status,mutation.evidenceRef ?? null,mutation.supersedesId ?? null]); break;
    case "gate_result": await session.query(`INSERT INTO builder.gate_results(id,project_id,gate_name,subject_type,subject_id,result,policy_version,evidence_ref,supersedes_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,session.projectId,mutation.gateName,mutation.subjectType,mutation.subjectId,mutation.result,mutation.policyVersion,mutation.evidenceRef ?? null,mutation.supersedesId ?? null]); break;
    case "repository_connection": await session.query(`INSERT INTO builder.repository_connections(id,project_id,provider_profile_id,external_owner_id,external_repository_id,visibility,status,idempotency_key,configuration_digest,gate_result_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,session.projectId,mutation.providerProfileId ?? null,mutation.externalOwnerId ?? null,mutation.externalRepositoryId ?? null,mutation.visibility,mutation.status,idempotencyKey,mutation.configurationDigest ?? null,mutation.gateResultId ?? null]); break;
    case "deployment": await session.query(`INSERT INTO builder.deployments(id,project_id,artifact_id,action_class,target_class,status,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[id,session.projectId,mutation.artifactId,mutation.actionClass,mutation.targetClass,mutation.status,idempotencyKey]); break;
    case "inbox_event": await session.query(`INSERT INTO builder.inbox_events(id,project_id,consumer_identity,message_id,status) VALUES ($1,$2,$3,$4,$5)`,[id,session.projectId,mutation.consumerIdentity,mutation.messageId,mutation.status]); break;
  }
  return id;
}

async function workflowLeaseIsValid(session:ProjectSession,guard:WorkflowLeaseGuard):Promise<boolean>{
  const row=(await session.query<{status:string;lease_owner:string|null;claim_idempotency_key:string|null;fencing_token:string|null;lease_active:boolean}>(`SELECT status,lease_owner,claim_idempotency_key,fencing_token,
    lease_expires_at IS NOT NULL AND lease_expires_at > clock_timestamp() lease_active
    FROM builder.background_jobs WHERE project_id=$1 AND id=$2 FOR UPDATE`,[session.projectId,guard.jobId])).rows[0];
  return Boolean(row&&guard.allowedStatuses.includes(row.status)&&row.lease_owner===guard.workerId&&row.claim_idempotency_key===guard.claimIdempotencyKey&&Number(row.fencing_token)===guard.fencingToken&&row.lease_active);
}

const stableUuid=(value:string):string=>{const hex=createHash("sha256").update(value).digest("hex").slice(0,32).split("");hex[12]="4";hex[16]=(["8","9","a","b"] as const)[Number.parseInt(hex[16]!,16)%4]!;return `${hex.slice(0,8).join("")}-${hex.slice(8,12).join("")}-${hex.slice(12,16).join("")}-${hex.slice(16,20).join("")}-${hex.slice(20).join("")}`;};
const json=(value:unknown):string=>JSON.stringify(value);
async function assertImmutableRow(session:ProjectSession,sql:string,parameters:readonly unknown[],label:string):Promise<void>{
  if((await session.query(sql,[...parameters])).rowCount!==1)throw new Error(`Immutable Workflow-Projektion kollidiert: ${label}.`);
}
async function persistWorkflowProjection(session:ProjectSession,projection:WorkflowPersistenceProjection):Promise<number>{
  const projectId=session.projectId;
  if(projection.project.projectId!==projectId)throw new Error("Workflow-Projektion ist falsch projektgebunden.");
  await session.query("INSERT INTO builder.workflow_revisions(project_id,aggregate_version,revision_digest,phase) VALUES($1,$2,$3,$4) ON CONFLICT(project_id,aggregate_version) DO NOTHING",[projectId,projection.project.version,projection.project.revisionDigest,projection.project.phase]);
  await assertImmutableRow(session,"SELECT 1 FROM builder.workflow_revisions WHERE project_id=$1 AND aggregate_version=$2 AND revision_digest=$3 AND phase=$4",[projectId,projection.project.version,projection.project.revisionDigest,projection.project.phase],"workflow_revisions");
  for(const item of projection.idempotencyRecords){
    const actorScope=`WORKFLOW_${item.kind}`;const key=createHash("sha256").update(`${item.kind}\0${item.scopeKey}`).digest("hex");
    await session.query("INSERT INTO builder.idempotency_records(project_id,actor_scope,idempotency_key,request_digest,aggregate_type,aggregate_id,result_ref,status) VALUES($1,$2,$3,$4,'WORKFLOW',$1,$5,'COMPLETED') ON CONFLICT(project_id,actor_scope,idempotency_key) DO NOTHING",[projectId,actorScope,key,item.requestHash,item.resultRef]);
    await assertImmutableRow(session,"SELECT 1 FROM builder.idempotency_records WHERE project_id=$1 AND actor_scope=$2 AND idempotency_key=$3 AND request_digest=$4 AND result_ref=$5 AND status='COMPLETED'",[projectId,actorScope,key,item.requestHash,item.resultRef],"idempotency_records");
  }

  const evidence=new Map<string,{kind:string;revisionDigest:string;contentDigest:string;payload:unknown}>();
  const addEvidence=(kind:string,value:{id:string;revisionDigest:string;contentDigest:string}|undefined)=>{if(value)evidence.set(value.id,{kind,revisionDigest:value.revisionDigest,contentDigest:value.contentDigest,payload:value});};
  for(const gate of projection.gates)evidence.set(gate.id,{kind:`GATE:${gate.name}`,revisionDigest:gate.subjectRevisionDigest,contentDigest:gate.evidenceDigest,payload:gate});
  for(const assessment of projection.legalAssessments)addEvidence("LEGAL_ASSESSMENT",assessment.evidence);
  for(const requirement of projection.legalRequirements){addEvidence("LEGAL_REQUIREMENT_SUBMISSION",requirement.submittedEvidence);addEvidence("LEGAL_REQUIREMENT_DECISION",requirement.verificationEvidence);}
  for(const decision of projection.counselDecisions)addEvidence("COUNSEL_DECISION",decision.evidence);
  for(const hold of projection.holds){addEvidence("HOLD_SOURCE",hold.sourceEvidence);addEvidence("HOLD_CLEARANCE",hold.clearingEvidence?.evidenceRef);}
  for(const item of evidence.values()){
    const id=(item.payload as {id:string}).id;const payload=json(item.payload);
    await session.query("INSERT INTO builder.workflow_evidence(project_id,evidence_id,evidence_kind,revision_digest,content_digest,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(project_id,evidence_id) DO NOTHING",[projectId,id,item.kind,item.revisionDigest,item.contentDigest,payload]);
    await assertImmutableRow(session,"SELECT 1 FROM builder.workflow_evidence WHERE project_id=$1 AND evidence_id=$2 AND evidence_kind=$3 AND revision_digest=$4 AND content_digest=$5 AND payload=$6::jsonb",[projectId,id,item.kind,item.revisionDigest,item.contentDigest,payload],"workflow_evidence");
  }

  for(const item of projection.legalAssessments){const payload=json(item);await session.query("INSERT INTO builder.legal_assessments(project_id,assessment_id,status,revision_digest,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(project_id,assessment_id) DO NOTHING",[projectId,item.id,item.status,item.revisionDigest,payload]);await assertImmutableRow(session,"SELECT 1 FROM builder.legal_assessments WHERE project_id=$1 AND assessment_id=$2 AND status=$3 AND revision_digest=$4 AND payload=$5::jsonb",[projectId,item.id,item.status,item.revisionDigest,payload],"legal_assessments");}
  for(const item of projection.legalRequirements)await session.query(`INSERT INTO builder.legal_requirements(project_id,requirement_id,assessment_id,state,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(project_id,requirement_id) DO UPDATE SET state=EXCLUDED.state,payload=EXCLUDED.payload`,[projectId,item.id,item.assessmentId,item.state,json(item)]);
  for(const item of projection.counselCases)await session.query(`INSERT INTO builder.counsel_cases(project_id,counsel_case_id,assessment_id,state,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(project_id,counsel_case_id) DO UPDATE SET state=EXCLUDED.state,payload=EXCLUDED.payload`,[projectId,item.id,item.assessmentId,item.state,json(item)]);
  for(const item of projection.counselDecisions){const payload=json(item);await session.query("INSERT INTO builder.counsel_decisions(project_id,decision_id,counsel_case_id,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(project_id,decision_id) DO NOTHING",[projectId,item.id,item.counselCaseId,payload]);await assertImmutableRow(session,"SELECT 1 FROM builder.counsel_decisions WHERE project_id=$1 AND decision_id=$2 AND counsel_case_id=$3 AND payload=$4::jsonb",[projectId,item.id,item.counselCaseId,payload],"counsel_decisions");}
  for(const item of projection.holds)await session.query(`INSERT INTO builder.project_holds(project_id,hold_id,hold_type,state,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(project_id,hold_id) DO UPDATE SET state=EXCLUDED.state,payload=EXCLUDED.payload`,[projectId,item.id,item.holdType,item.state,json(item)]);
  const holdIds=new Set(projection.holds.map(item=>item.id));
  for(const item of projection.holdClearances)if(holdIds.has(item.holdCode)){const payload=json(item);await session.query("INSERT INTO builder.hold_clearances(project_id,clearance_id,hold_id,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(project_id,clearance_id) DO NOTHING",[projectId,item.id,item.holdCode,payload]);await assertImmutableRow(session,"SELECT 1 FROM builder.hold_clearances WHERE project_id=$1 AND clearance_id=$2 AND hold_id=$3 AND payload=$4::jsonb",[projectId,item.id,item.holdCode,payload],"hold_clearances");}

  const maxFence=Math.max(0,...projection.jobs.map(item=>item.fencingToken??0));
  await session.query("INSERT INTO builder.workflow_fence_counters(project_id,last_fencing_token) VALUES($1,$2) ON CONFLICT(project_id) DO UPDATE SET last_fencing_token=GREATEST(builder.workflow_fence_counters.last_fencing_token,EXCLUDED.last_fencing_token)",[projectId,maxFence]);
  for(const item of projection.jobs){
    const terminalAt=item.completedAt??item.cancelledAt??null;
    await session.query(`INSERT INTO builder.background_jobs(id,project_id,job_type,aggregate_type,aggregate_id,schema_version,policy_version,idempotency_key,expected_aggregate_version,trace_id,status,claimed_at,claimed_by,terminal_at,phase,revision_digest,operation_scope,lease_owner,claim_idempotency_key,lease_expires_at,fencing_token,workflow_payload)
      VALUES($1,$2,$3,'WORKFLOW',$2,1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19::jsonb)
      ON CONFLICT(project_id,id) DO UPDATE SET status=EXCLUDED.status,claimed_at=EXCLUDED.claimed_at,claimed_by=EXCLUDED.claimed_by,terminal_at=EXCLUDED.terminal_at,phase=EXCLUDED.phase,revision_digest=EXCLUDED.revision_digest,operation_scope=EXCLUDED.operation_scope,lease_owner=EXCLUDED.lease_owner,claim_idempotency_key=EXCLUDED.claim_idempotency_key,lease_expires_at=EXCLUDED.lease_expires_at,fencing_token=EXCLUDED.fencing_token,workflow_payload=EXCLUDED.workflow_payload`,
      [item.id,projectId,item.type,projection.project.policyVersion,createHash("sha256").update(`workflow-job\0${item.idempotencyKey}`).digest("hex"),item.aggregateVersion,stableUuid(`trace:${item.id}`),item.status,item.claimedAt??null,item.leaseOwner??null,terminalAt,item.phase,item.revisionDigest,json(item.operationScope),item.leaseOwner??null,item.claimIdempotencyKey??null,item.leaseExpiresAt??null,item.fencingToken??null,json(item)]);
  }
  for(const item of projection.terminationEvidence){const payload=json(item);await session.query("INSERT INTO builder.termination_evidence(project_id,evidence_id,job_id,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(project_id,evidence_id) DO NOTHING",[projectId,item.id,item.jobId,payload]);await assertImmutableRow(session,"SELECT 1 FROM builder.termination_evidence WHERE project_id=$1 AND evidence_id=$2 AND job_id=$3 AND payload=$4::jsonb",[projectId,item.id,item.jobId,payload],"termination_evidence");}

  let emitted=0;
  for(const event of projection.auditEvents){
    const payload=json(event);
    if((await session.query("SELECT 1 FROM builder.workflow_transition_details WHERE project_id=$1 AND event_id=$2",[projectId,event.id])).rowCount){await assertImmutableRow(session,"SELECT 1 FROM builder.workflow_transition_details WHERE project_id=$1 AND event_id=$2 AND aggregate_version=$3 AND payload=$4::jsonb",[projectId,event.id,event.sequence,payload],"workflow_transition_details");continue;}
    const eventKey=createHash("sha256").update(`workflow-transition\0${event.id}`).digest("hex");
    const audit=(await session.query<{id:string}>("SELECT builder.append_audit_event($1,'WORKFLOW',$1,$2,$3,$4,$5,$6,$7,$8) id",[projectId,event.actorId,`PHASE_${event.newPhase}`,event.previousPhase,event.newPhase,event.reason,event.policyVersion,eventKey])).rows[0]!;
    await session.query("INSERT INTO builder.workflow_transition_details(project_id,event_id,audit_event_id,aggregate_version,payload) VALUES($1,$2,$3,$4,$5::jsonb)",[projectId,event.id,audit.id,event.sequence,payload]);
    await appendWorkflowMessageRows(session,projectId,eventKey,"WORKFLOW_TRANSITION",event.id);
    emitted++;
  }
  for(const event of projection.jobEvents){
    const payload=json(event);const inserted=await session.query("INSERT INTO builder.job_audit_events(project_id,event_id,job_id,event_type,previous_hash,event_hash,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(project_id,event_id) DO NOTHING",[projectId,event.id,event.jobId,event.type,event.previousHash,event.eventHash,payload]);
    await assertImmutableRow(session,"SELECT 1 FROM builder.job_audit_events WHERE project_id=$1 AND event_id=$2 AND job_id=$3 AND event_type=$4 AND previous_hash IS NOT DISTINCT FROM $5 AND event_hash=$6 AND payload=$7::jsonb",[projectId,event.id,event.jobId,event.type,event.previousHash,event.eventHash,payload],"job_audit_events");
    if(inserted.rowCount){await appendWorkflowMessageRows(session,projectId,createHash("sha256").update(`workflow-job-event\0${event.id}`).digest("hex"),`WORKFLOW_JOB_${event.type}`,event.id);emitted++;}
  }
  return emitted;
}

async function appendWorkflowStateMutation(session:ProjectSession,actorId:string,snapshot:string,projection:WorkflowPersistenceProjection):Promise<void>{
  const digest=createHash("sha256").update(snapshot).digest("hex");const eventKey=createHash("sha256").update(`workflow-state\0${session.projectId}\0${digest}`).digest("hex");
  await session.query("SELECT builder.append_audit_event($1,'WORKFLOW',$1,$2,'STATE_MUTATED',$3,$3,'PERSISTENT_WORKFLOW_MUTATION',$4,$5)",[session.projectId,actorId,projection.project.phase,projection.project.policyVersion,eventKey]);
  await appendWorkflowMessageRows(session,session.projectId,eventKey,"WORKFLOW_STATE_MUTATED",`state:${digest}`);
}

async function appendWorkflowMessageRows(session:ProjectSession,projectId:string,eventKey:string,eventType:string,eventId:string):Promise<void>{
  await session.query("INSERT INTO builder.outbox_events(project_id,event_type,aggregate_type,aggregate_id,schema_version,policy_version,idempotency_key,status) VALUES($1,$2,'WORKFLOW',$1,1,'workflow-persistence-1',$3,'PENDING') ON CONFLICT(project_id,idempotency_key) DO NOTHING",[projectId,eventType,eventKey]);
  await session.query("INSERT INTO builder.inbox_events(project_id,consumer_identity,message_id,status,processed_at) VALUES($1,'workflow-repository',$2,'PROCESSED',clock_timestamp()) ON CONFLICT(consumer_identity,message_id) DO NOTHING",[projectId,stableUuid(`inbox:${eventId}`)]);
}
