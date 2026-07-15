import type { QueryResultRow } from "pg";
import { agentRoles,type AgentRole } from "./agent-registry.js";
import type { ProjectCapability } from "./types.js";

export const agentAssignmentStatuses=["ASSIGNED","RELEASED"] as const;
export type AgentAssignmentStatus=(typeof agentAssignmentStatuses)[number];

export interface AgentAssignment {
  readonly assignmentId:string;
  readonly projectId:string;
  readonly jobId:string;
  readonly requiredRole:AgentRole;
  readonly agentId:string;
  readonly agentKey:string;
  readonly agentVersion:number;
  readonly assignmentStatus:AgentAssignmentStatus;
  readonly createdAt:Date;
  readonly createdBy:string;
  readonly releasedAt?:Date;
  readonly releasedBy?:string;
}

export interface AssignActiveAgentInput {
  readonly assignmentId:string;
  readonly projectId:string;
  readonly jobId:string;
  readonly requiredRole:AgentRole;
  readonly createdBy:string;
}

export interface ReleaseAgentAssignmentInput {
  readonly assignmentId:string;
  readonly projectId:string;
  readonly jobId:string;
  readonly releasedBy:string;
}

export interface AgentAssignmentRepository {
  assignActiveAgent(capability:ProjectCapability,input:AssignActiveAgentInput):Promise<AgentAssignment>;
  getAssignmentByJob(capability:ProjectCapability,jobId:string):Promise<AgentAssignment|undefined>;
  listAssignmentsByProject(capability:ProjectCapability):Promise<readonly AgentAssignment[]>;
  releaseAssignment(capability:ProjectCapability,input:ReleaseAgentAssignmentInput):Promise<AgentAssignment>;
}

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actorPattern=/^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/;
const secretMaterial=/(?:sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|npm_[a-z0-9]{20,}|pypi-[a-z0-9_-]{20,}|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|bearer\s+[a-z0-9._~+/-]{12,}|(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\s*[:=]|aws[_-]?(?:access|secret)|[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@|-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----)/i;

function assertUuid(value:string,label:string):void {if(!uuidPattern.test(value))throw new Error(`${label} ist ungueltig.`);}
function assertActor(value:string,label:string):void {if(!actorPattern.test(value)||secretMaterial.test(value))throw new Error(`${label} ist ungueltig.`);}
function assertRole(value:AgentRole):void {if(!(agentRoles as readonly unknown[]).includes(value))throw new Error("requiredRole ist ungueltig.");}
function validateAssignmentInput(input:AssignActiveAgentInput):void {assertUuid(input.assignmentId,"assignmentId");assertUuid(input.projectId,"projectId");assertUuid(input.jobId,"jobId");assertRole(input.requiredRole);assertActor(input.createdBy,"createdBy");}
function validateReleaseInput(input:ReleaseAgentAssignmentInput):void {assertUuid(input.assignmentId,"assignmentId");assertUuid(input.projectId,"projectId");assertUuid(input.jobId,"jobId");assertActor(input.releasedBy,"releasedBy");}

export class AgentAssignmentService {
  constructor(private readonly repository:AgentAssignmentRepository){}
  assignActiveAgent(capability:ProjectCapability,input:AssignActiveAgentInput):Promise<AgentAssignment>{validateAssignmentInput(input);return this.repository.assignActiveAgent(capability,input);}
  getAssignmentByJob(capability:ProjectCapability,jobId:string):Promise<AgentAssignment|undefined>{assertUuid(jobId,"jobId");return this.repository.getAssignmentByJob(capability,jobId);}
  listAssignmentsByProject(capability:ProjectCapability):Promise<readonly AgentAssignment[]>{return this.repository.listAssignmentsByProject(capability);}
  releaseAssignment(capability:ProjectCapability,input:ReleaseAgentAssignmentInput):Promise<AgentAssignment>{validateReleaseInput(input);return this.repository.releaseAssignment(capability,input);}
}

interface AssignmentRow extends QueryResultRow {assignment_id:string;project_id:string;job_id:string;required_role:AgentRole;agent_id:string;agent_key:string;agent_version:number;assignment_status:AgentAssignmentStatus;created_at:Date;created_by:string;released_at:Date|null;released_by:string|null;}
interface ActiveAgentRow extends QueryResultRow {agent_id:string;agent_key:string;version:number;}
interface AgentKeyRow extends QueryResultRow {agent_key:string;}
interface JobRow extends QueryResultRow {job_type:string;task_role:string|null;}
export interface AgentAssignmentSession {readonly projectId:string;query<R extends QueryResultRow=QueryResultRow>(sql:string,values?:readonly unknown[]):Promise<{rows:R[];rowCount:number|null}>;}
export type AgentAssignmentTransaction=<T>(capability:ProjectCapability,operation:string,action:(session:AgentAssignmentSession)=>Promise<T>)=>Promise<T>;

const assignmentColumns="assignment_id,project_id,job_id,required_role,agent_id,agent_key,agent_version,assignment_status,created_at,created_by,released_at,released_by";
const mapAssignment=(row:AssignmentRow):AgentAssignment=>({assignmentId:row.assignment_id,projectId:row.project_id,jobId:row.job_id,requiredRole:row.required_role,agentId:row.agent_id,agentKey:row.agent_key,agentVersion:row.agent_version,assignmentStatus:row.assignment_status,createdAt:row.created_at,createdBy:row.created_by,...(row.released_at?{releasedAt:row.released_at}:{}),...(row.released_by?{releasedBy:row.released_by}:{})});
const sameUuid=(left:string,right:string)=>left.toLowerCase()===right.toLowerCase();
const assignmentMatches=(row:AssignmentRow,input:AssignActiveAgentInput)=>sameUuid(row.assignment_id,input.assignmentId)&&sameUuid(row.project_id,input.projectId)&&sameUuid(row.job_id,input.jobId)&&row.required_role===input.requiredRole&&row.created_by===input.createdBy;

/** Transaction-aware assignment used when job creation and process state must commit atomically. */
export async function assignActiveAgentInSession(session:AgentAssignmentSession,input:AssignActiveAgentInput):Promise<AgentAssignment>{
  validateAssignmentInput(input);
  if(!sameUuid(session.projectId,input.projectId))throw new Error("AGENT_ASSIGNMENT_PROJECT_MISMATCH: Capability und projectId weichen ab.");
  await session.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`agent-assignment:${input.jobId}`]);
  const existing=(await session.query<AssignmentRow>(`SELECT ${assignmentColumns} FROM builder.agent_assignments WHERE job_id=$1 FOR UPDATE`,[input.jobId])).rows[0];
  if(existing){
    if(!assignmentMatches(existing,input))throw new Error("AGENT_ASSIGNMENT_CONFLICT: jobId ist bereits widerspruechlich gebunden.");
    if(existing.assignment_status==="RELEASED")throw new Error("AGENT_ASSIGNMENT_RELEASED: freigegebene Zuweisungen sind terminal.");
    return mapAssignment(existing);
  }
  const job=(await session.query<JobRow>(`SELECT job.job_type,task.role task_role
    FROM builder.background_jobs job
    LEFT JOIN builder.agent_runtime_tasks task ON task.project_id=job.project_id AND task.run_id=job.agent_run_id
    WHERE job.project_id=$1 AND job.id=$2 FOR UPDATE OF job`,[input.projectId,input.jobId])).rows[0];
  if(!job)throw new Error("AGENT_ASSIGNMENT_JOB_NOT_FOUND: jobId ist im Projekt unbekannt.");
  if(job.job_type==="AGENT_RUNTIME"){
    if(!job.task_role)throw new Error("AGENT_ASSIGNMENT_RUNTIME_TASK_MISSING: Fake-Agent-Task ist unbekannt.");
    const canonicalRole=job.task_role==="LEGAL"?"LEGAL_DE_EU":job.task_role;
    if(canonicalRole!==input.requiredRole)throw new Error("AGENT_ASSIGNMENT_ROLE_MISMATCH: requiredRole passt nicht zur Fake-Agent-Taskrolle.");
  }
  const keys=(await session.query<AgentKeyRow>("SELECT DISTINCT agent_key FROM builder.agent_registry_versions WHERE role=$1 ORDER BY agent_key",[input.requiredRole])).rows;
  for(const key of keys)await session.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`agent-registry:${key.agent_key}`]);
  const candidates=(await session.query<ActiveAgentRow>(`SELECT agent_id,agent_key,version FROM builder.agent_registry_versions
    WHERE role=$1 AND status='ACTIVE' ORDER BY agent_key,version FOR UPDATE`,[input.requiredRole])).rows;
  if(candidates.length===0)throw new Error("AGENT_ASSIGNMENT_NO_ACTIVE_AGENT: fuer requiredRole ist kein ACTIVE Agent vorhanden.");
  if(candidates.length>1)throw new Error("AGENT_ASSIGNMENT_AMBIGUOUS_ACTIVE_AGENT: fuer requiredRole existiert mehr als ein ACTIVE agentKey.");
  const active=candidates[0]!;
  const inserted=(await session.query<AssignmentRow>(`INSERT INTO builder.agent_assignments(assignment_id,project_id,job_id,required_role,agent_id,agent_key,agent_version,assignment_status,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,'ASSIGNED',$8) RETURNING ${assignmentColumns}`,[input.assignmentId,input.projectId,input.jobId,input.requiredRole,active.agent_id,active.agent_key,active.version,input.createdBy])).rows[0]!;
  return mapAssignment(inserted);
}

export class PostgresAgentAssignmentRepository implements AgentAssignmentRepository {
  constructor(private readonly transaction:AgentAssignmentTransaction){}

  assignActiveAgent(capability:ProjectCapability,input:AssignActiveAgentInput):Promise<AgentAssignment>{return this.transaction(capability,"agent_assignment:append",session=>assignActiveAgentInSession(session,input));}

  getAssignmentByJob(capability:ProjectCapability,jobId:string):Promise<AgentAssignment|undefined>{return this.transaction(capability,"agent_assignment:read",async session=>{const row=(await session.query<AssignmentRow>(`SELECT ${assignmentColumns} FROM builder.agent_assignments WHERE project_id=$1 AND job_id=$2`,[session.projectId,jobId])).rows[0];return row?mapAssignment(row):undefined;});}

  listAssignmentsByProject(capability:ProjectCapability):Promise<readonly AgentAssignment[]>{return this.transaction(capability,"agent_assignment:read",async session=>(await session.query<AssignmentRow>(`SELECT ${assignmentColumns} FROM builder.agent_assignments WHERE project_id=$1 ORDER BY created_at,assignment_id`,[session.projectId])).rows.map(mapAssignment));}

  releaseAssignment(capability:ProjectCapability,input:ReleaseAgentAssignmentInput):Promise<AgentAssignment>{return this.transaction(capability,"agent_assignment:append",async session=>{
    this.assertProject(session,input.projectId);
    await session.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`agent-assignment:${input.jobId}`]);
    const existing=(await session.query<AssignmentRow>(`SELECT ${assignmentColumns} FROM builder.agent_assignments WHERE project_id=$1 AND job_id=$2 FOR UPDATE`,[input.projectId,input.jobId])).rows[0];
    if(!existing)throw new Error("AGENT_ASSIGNMENT_NOT_FOUND: Zuweisung ist unbekannt.");
    if(!sameUuid(existing.assignment_id,input.assignmentId))throw new Error("AGENT_ASSIGNMENT_CONFLICT: assignmentId passt nicht zur Job-Zuweisung.");
    if(existing.assignment_status==="RELEASED"){
      if(existing.released_by!==input.releasedBy)throw new Error("AGENT_ASSIGNMENT_RELEASE_CONFLICT: RELEASED ist bereits anders gebunden.");
      return mapAssignment(existing);
    }
    const released=(await session.query<AssignmentRow>(`UPDATE builder.agent_assignments SET assignment_status='RELEASED',released_at=clock_timestamp(),released_by=$3
      WHERE project_id=$1 AND assignment_id=$2 AND assignment_status='ASSIGNED' RETURNING ${assignmentColumns}`,[input.projectId,input.assignmentId,input.releasedBy])).rows[0];
    if(!released)throw new Error("AGENT_ASSIGNMENT_RELEASE_CONFLICT: Zuweisung konnte nicht freigegeben werden.");
    return mapAssignment(released);
  });}

  private assertProject(session:AgentAssignmentSession,projectId:string):void {if(!sameUuid(session.projectId,projectId))throw new Error("AGENT_ASSIGNMENT_PROJECT_MISMATCH: Capability und projectId weichen ab.");}
}
