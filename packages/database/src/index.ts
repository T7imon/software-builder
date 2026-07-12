import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type { ProjectId } from "@software-builder/core";
import type { BootstrapCapability, BootstrapCapabilityVerifier, BuilderProject, CommandEnvelope, CommandResult, CreateProjectInput, EntityMutation, ProjectCapability, ProjectCapabilityVerifier, ProjectContextIssuer, TaskRecord, VerifiedProjectCapability } from "./types.js";

export * from "./capabilities.js";
export * from "./types.js";

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
