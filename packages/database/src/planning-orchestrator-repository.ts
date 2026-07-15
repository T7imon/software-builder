import { createHash } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import { canonicalAgentOperationDigest, parseAgentResult, type AgentTask } from "@software-builder/agent-runtime";
import {
  assertImplementationExecutorResult,
  assertImplementationIdentity,
  assertImplementationReviewResult,
  assertImplementationStart,
  assertOutcomeAllowedForRole,
  assertOwnerDecisionInput,
  assertPlanningIdentity,
  assertPlanningJobResult,
  assertPlanningStart,
  isTerminalImplementationState,
  isTerminalPlanningState,
  type ImplementationExecutorResult,
  type ImplementationJobRole,
  type ImplementationJobView,
  type ImplementationReviewResult,
  type ImplementationReviewRole,
  type ImplementationReviewView,
  type ImplementationState,
  type ImplementationStatusView,
  type PlanningJobResult,
  type PlanningJobRole,
  type PlanningJobView,
  type PlanningOrchestrator,
  type PlanningOwnerDecision,
  type PlanningRequirementInput,
  type PlanningState,
  type PlanningStatusView,
  type SyntheticImplementationArtifact,
} from "@software-builder/workflow-engine";
import { assignActiveAgentInSession, type AgentAssignment } from "./agent-assignment.js";
import { enqueueAgentJobInSession } from "./agent-job-repository.js";

export type PlanningPersistenceOperation="planning:read"|"planning:append";
export interface PlanningRepositorySession {
  readonly projectId:string;
  readonly subject:string;
  query<R extends QueryResultRow=QueryResultRow>(sql:string,values?:readonly unknown[]):Promise<{rows:R[];rowCount:number|null}>;
}
export interface PlanningTransactionRequest {readonly projectId:string;readonly operation:PlanningPersistenceOperation;readonly actor?:string;}
export type PlanningRepositoryTransaction=<T>(request:PlanningTransactionRequest,action:(session:PlanningRepositorySession)=>Promise<T>)=>Promise<T>;

interface RunRow extends QueryResultRow {
  id:string;project_id:string;project_revision:string;status:PlanningState;requested_by:string;
  blocked_at:Date|null;block_code:string|null;block_role:PlanningJobRole|null;created_at:Date;updated_at:Date;
  decision:PlanningOwnerDecision|null;decided_by:string|null;reason_ref:string|null;decided_at:Date|null;approved_project_revision:string|null;
}
interface JobRow extends QueryResultRow {
  id:string;project_id:string;planning_run_id:string;project_revision:string;role:PlanningJobRole;
  prerequisite_job_id:string|null;architecture_job_id:string|null;background_job_id:string;runtime_run_id:string;
  assignment_id:string;agent_id:string;agent_key:string;agent_version:number;input_ref:string;
  runtime_result_id:string|null;outcome:"PASS"|"PASS_WITH_REQUIREMENTS"|"BLOCK"|null;
  result_object_ref:string|null;result_digest:string|null;completed_at:Date|null;created_at:Date;
}
interface RequirementRow extends QueryResultRow {planning_job_id:string;requirement_code:string;requirement_ref:string;}
interface RuntimeResultRow extends QueryResultRow {job_status:string;runtime_status:string;runtime_run_id:string;result_payload:unknown;}

interface ImplementationRunRow extends QueryResultRow {
  id:string;project_id:string;planning_run_id:string;project_revision:string;status:ImplementationState;requested_by:string;
  blocked_at:Date|null;block_code:string|null;block_role:ImplementationJobRole|null;created_at:Date;updated_at:Date;
  implementation_result_id:string|null;runtime_result_id:string|null;executor_job_id:string|null;agent_id:string|null;
  agent_key:string|null;agent_version:number|null;artifacts:unknown|null;summary:string|null;executor_created_at:Date|null;
  executor_status:"SUCCEEDED"|"FAILED"|"CANCELLED"|null;accepted_at:Date|null;
}
interface ImplementationJobRow extends QueryResultRow {
  id:string;project_id:string;implementation_run_id:string;project_revision:string;role:ImplementationJobRole;
  executor_result_id:string|null;background_job_id:string;runtime_run_id:string;assignment_id:string;
  agent_id:string;agent_key:string;agent_version:number;input_ref:string;created_at:Date;
}
interface ImplementationReviewRow extends QueryResultRow {
  review_result_id:string;project_id:string;implementation_run_id:string;project_revision:string;review_job_id:string;
  implementation_result_id:string;role:ImplementationReviewRole;runtime_result_id:string;
  outcome:"PASS"|"CHANGES_REQUESTED"|"PASS_WITH_REQUIREMENTS"|"BLOCK";
  result_object_ref:string;result_digest:string;created_at:Date;accepted_at:Date;
}
interface ImplementationRequirementRow extends QueryResultRow {review_result_id:string;requirement_code:string;requirement_ref:string;}

const runColumns=`run.id,run.project_id,run.project_revision,run.status,run.requested_by,run.blocked_at,run.block_code,run.block_role,run.created_at,run.updated_at,
  decision.decision,decision.decided_by,decision.reason_ref,decision.decided_at,decision.approved_project_revision`;
const jobColumns=`job.id,job.project_id,job.planning_run_id,job.project_revision,job.role,job.prerequisite_job_id,job.architecture_job_id,
  job.background_job_id,job.runtime_run_id,job.assignment_id,assignment.agent_id,assignment.agent_key,assignment.agent_version,job.input_ref,
  job.runtime_result_id,job.outcome,job.result_object_ref,job.result_digest,job.completed_at,job.created_at`;
const roleOrder:Record<PlanningJobRole,number>={PLANNER:0,ARCHITECT:1,SECURITY:2,LEGAL_DE_EU:3};
const implementationRunColumns=`run.id,run.project_id,run.planning_run_id,run.project_revision,run.status,run.requested_by,
  run.blocked_at,run.block_code,run.block_role,run.created_at,run.updated_at,
  result.implementation_result_id,result.runtime_result_id,result.executor_job_id,result.agent_id,result.agent_key,result.agent_version,
  result.artifacts,result.summary,result.created_at executor_created_at,result.status executor_status,result.accepted_at`;
const implementationJobColumns=`job.id,job.project_id,job.implementation_run_id,job.project_revision,job.role,job.executor_result_id,
  job.background_job_id,job.runtime_run_id,job.assignment_id,assignment.agent_id,assignment.agent_key,assignment.agent_version,job.input_ref,job.created_at`;
const implementationReviewColumns=`result.review_result_id,result.project_id,result.implementation_run_id,result.project_revision,result.review_job_id,
  result.implementation_result_id,result.role,result.runtime_result_id,result.outcome,result.result_object_ref,result.result_digest,result.created_at,result.accepted_at`;
const implementationRoleOrder:Record<ImplementationJobRole,number>={EXECUTOR:0,QA:1,REVIEWER:2,SECURITY:3,LEGAL_DE_EU:4};

class PlanningAgentUnavailableError extends Error {
  constructor(readonly role:PlanningJobRole,readonly blockCode:string,cause:unknown){super(blockCode,{cause});this.name="PlanningAgentUnavailableError";}
}
class ImplementationAgentUnavailableError extends Error {
  constructor(readonly role:ImplementationJobRole,readonly blockCode:string,cause:unknown){super(blockCode,{cause});this.name="ImplementationAgentUnavailableError";}
}

export class PostgresPlanningOrchestratorRepository implements PlanningOrchestrator {
  private constructor(private readonly transaction:PlanningRepositoryTransaction) {}

  static forProject(transaction:PlanningRepositoryTransaction):PostgresPlanningOrchestratorRepository{return new PostgresPlanningOrchestratorRepository(transaction);}
  static forTestHarness(pool:Pick<Pool,"connect">):PostgresPlanningOrchestratorRepository{return new PostgresPlanningOrchestratorRepository(async(request,action)=>{
    const client=await pool.connect();try{await client.query("BEGIN");const identity=(await client.query<{current_user:string;database_name:string}>("SELECT current_user,current_database() database_name")).rows[0];if(identity?.current_user!=="builder_migrator"||!identity.database_name.toLowerCase().endsWith("_test"))throw new Error("PLANNING_ADMIN_ADAPTER_TEST_ONLY");const result=await action({projectId:request.projectId,subject:request.actor??"planning-test-harness",query:(sql,values=[])=>client.query(sql,[...values])});await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  });}

  async startPlanning(projectId:string,projectRevision:string,requestedBy:string):Promise<PlanningStatusView>{
    assertPlanningStart(projectId,projectRevision,requestedBy);
    return this.inProject({projectId,operation:"planning:append",actor:requestedBy},async client=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`planning-start:${projectId}:${projectRevision}`]);
      const existing=await this.findRunByRevision(client,projectId,projectRevision,true);
      if(existing){if(existing.requested_by!==requestedBy)throw new Error("PLANNING_START_CONFLICT");return mapRun(existing);}
      if(!(await client.query("SELECT 1 FROM builder.projects WHERE id=$1",[projectId])).rowCount)throw new Error("PLANNING_PROJECT_NOT_FOUND");
      const planningRunId=stableUuid(`planning-run\0${projectId}\0${projectRevision}`);
      await client.query("INSERT INTO builder.planning_runs(id,project_id,project_revision,status,requested_by) VALUES($1,$2,$3,'PLANNING',$4)",[planningRunId,projectId,projectRevision,requestedBy]);
      const run=await this.lockRun(client,projectId,planningRunId);
      await this.tryCreateAuthorizedJobs(client,run,[{role:"PLANNER"}]);
      return this.loadStatusWith(client,projectId,planningRunId);
    });
  }

  async handleJobResult(projectId:string,planningRunId:string,result:PlanningJobResult):Promise<PlanningStatusView>{
    assertPlanningIdentity(projectId,planningRunId);assertPlanningJobResult(result);
    return this.inProject({projectId,operation:"planning:append"},async client=>{
      const run=await this.lockRun(client,projectId,planningRunId);
      if(run.project_revision!==result.projectRevision)throw new Error("PLANNING_PROJECT_REVISION_MISMATCH");
      const job=await this.lockJob(client,projectId,planningRunId,result.jobId);
      assertOutcomeAllowedForRole(job.role,result);
      if(job.runtime_result_id){
        if(await this.isIdenticalResult(client,job,result))return this.loadStatusWith(client,projectId,planningRunId);
        throw new Error("PLANNING_RESULT_CONFLICT");
      }
      if(isTerminalPlanningState(run.status))throw new Error("PLANNING_STALE_RESULT");
      this.assertRoleState(job.role,run.status);
      await this.verifySuccessfulRuntimeResult(client,job,result);
      for(const requirement of result.requirements)await client.query(`INSERT INTO builder.planning_review_requirements(project_id,planning_run_id,planning_job_id,requirement_code,requirement_ref)
        VALUES($1,$2,$3,$4,$5)`,[projectId,planningRunId,job.id,requirement.code,requirement.ref]);
      await client.query(`UPDATE builder.planning_jobs SET runtime_result_id=$4,outcome=$5,result_object_ref=$6,result_digest=$7,completed_at=clock_timestamp()
        WHERE project_id=$1 AND planning_run_id=$2 AND id=$3 AND runtime_result_id IS NULL`,[projectId,planningRunId,job.id,result.runtimeResultId,result.outcome,result.objectRef,result.digest]);

      if(job.role==="PLANNER"){
        const current=await this.lockRun(client,projectId,planningRunId);
        const created=await this.tryCreateAuthorizedJobs(client,current,[{role:"ARCHITECT",prerequisiteJobId:job.id}]);
        if(created)await this.transition(client,current,"ARCHITECTURE_REVIEW");
      }else if(job.role==="ARCHITECT"){
        const current=await this.lockRun(client,projectId,planningRunId);
        const created=await this.tryCreateAuthorizedJobs(client,current,[
          {role:"SECURITY",prerequisiteJobId:job.id,architectureJobId:job.id},
          {role:"LEGAL_DE_EU",prerequisiteJobId:job.id,architectureJobId:job.id},
        ]);
        if(created)await this.transition(client,current,"SECURITY_LEGAL_REVIEW");
      }else if(result.outcome==="BLOCK"){
        await this.blockRun(client,run,"REVIEW_BLOCK",job.role);
      }else{
        const reviews=await client.query<{role:PlanningJobRole;outcome:string|null}>("SELECT role,outcome FROM builder.planning_jobs WHERE project_id=$1 AND planning_run_id=$2 AND role IN ('SECURITY','LEGAL_DE_EU') FOR UPDATE",[projectId,planningRunId]);
        if(reviews.rows.length===2&&reviews.rows.every(review=>review.outcome==="PASS"||review.outcome==="PASS_WITH_REQUIREMENTS"))await this.transition(client,run,"WAITING_FOR_OWNER_APPROVAL");
      }
      return this.loadStatusWith(client,projectId,planningRunId);
    });
  }

  async recordOwnerDecision(projectId:string,planningRunId:string,decision:PlanningOwnerDecision,decidedBy:string,reason:string):Promise<PlanningStatusView>{
    assertPlanningIdentity(projectId,planningRunId);assertOwnerDecisionInput(decision,decidedBy,reason);
    return this.inProject({projectId,operation:"planning:append",actor:decidedBy},async client=>{
      const run=await this.lockRun(client,projectId,planningRunId);
      const existing=(await client.query<{decision:PlanningOwnerDecision;decided_by:string;reason_ref:string;approved_project_revision:string|null}>("SELECT decision,decided_by,reason_ref,approved_project_revision FROM builder.planning_owner_decisions WHERE project_id=$1 AND planning_run_id=$2",[projectId,planningRunId])).rows[0];
      if(existing){
        const expectedRevision=decision==="APPROVE"?run.project_revision:null;
        if(existing.decision===decision&&existing.decided_by===decidedBy&&existing.reason_ref===reason&&existing.approved_project_revision===expectedRevision)return this.loadStatusWith(client,projectId,planningRunId);
        throw new Error("PLANNING_OWNER_DECISION_CONFLICT");
      }
      if(run.status!=="WAITING_FOR_OWNER_APPROVAL")throw new Error("PLANNING_OWNER_DECISION_NOT_ALLOWED");
      await client.query(`INSERT INTO builder.planning_owner_decisions(project_id,planning_run_id,decision,decided_by,reason_ref,approved_project_revision)
        VALUES($1,$2,$3,$4,$5,$6)`,[projectId,planningRunId,decision,decidedBy,reason,decision==="APPROVE"?run.project_revision:null]);
      await this.transition(client,run,decision==="APPROVE"?"READY_FOR_IMPLEMENTATION":"REJECTED");
      return this.loadStatusWith(client,projectId,planningRunId);
    });
  }

  async getPlanningStatus(projectId:string,planningRunId:string):Promise<PlanningStatusView>{
    assertPlanningIdentity(projectId,planningRunId);return this.inProject({projectId,operation:"planning:read"},client=>this.loadStatusWith(client,projectId,planningRunId));
  }

  async listPlanningJobs(projectId:string,planningRunId:string):Promise<readonly PlanningJobView[]>{
    assertPlanningIdentity(projectId,planningRunId);
    return this.inProject({projectId,operation:"planning:read"},async client=>{
      if(!(await this.findRun(client,projectId,planningRunId,"SHARE")))throw new Error("PLANNING_RUN_NOT_FOUND");
      const jobs=(await client.query<JobRow>(`SELECT ${jobColumns} FROM builder.planning_jobs job JOIN builder.agent_assignments assignment
        ON assignment.project_id=job.project_id AND assignment.assignment_id=job.assignment_id
        WHERE job.project_id=$1 AND job.planning_run_id=$2
        ORDER BY CASE job.role WHEN 'PLANNER' THEN 0 WHEN 'ARCHITECT' THEN 1 WHEN 'SECURITY' THEN 2 ELSE 3 END`,[projectId,planningRunId])).rows;
      const requirements=(await client.query<RequirementRow>(`SELECT planning_job_id,requirement_code,requirement_ref FROM builder.planning_review_requirements
        WHERE project_id=$1 AND planning_run_id=$2 ORDER BY planning_job_id,requirement_code,requirement_ref`,[projectId,planningRunId])).rows;
      return jobs.map(job=>mapJob(job,requirements.filter(requirement=>requirement.planning_job_id===job.id)));
    });
  }

  async resumePlanning(projectId:string,planningRunId:string):Promise<PlanningStatusView>{
    assertPlanningIdentity(projectId,planningRunId);
    return this.inProject({projectId,operation:"planning:append"},async client=>{
      let run=await this.lockRun(client,projectId,planningRunId);
      if(isTerminalPlanningState(run.status))return mapRun(run);
      const jobs=await this.loadJobs(client,projectId,planningRunId);
      const byRole=new Map(jobs.map(job=>[job.role,job]));
      if(run.status==="PLANNING"){
        const planner=byRole.get("PLANNER");
        if(!planner){await this.tryCreateAuthorizedJobs(client,run,[{role:"PLANNER"}]);}
        else if(planner.outcome==="PASS"){
          const created=byRole.has("ARCHITECT")||await this.tryCreateAuthorizedJobs(client,run,[{role:"ARCHITECT",prerequisiteJobId:planner.id}]);
          if(created)await this.transition(client,run,"ARCHITECTURE_REVIEW");
        }
      }else if(run.status==="ARCHITECTURE_REVIEW"){
        const planner=byRole.get("PLANNER");if(!planner?.outcome)throw new Error("PLANNING_PERSISTENCE_INTEGRITY_ERROR");
        let architect=byRole.get("ARCHITECT");
        if(!architect){await this.tryCreateAuthorizedJobs(client,run,[{role:"ARCHITECT",prerequisiteJobId:planner.id}]);architect=(await this.loadJobs(client,projectId,planningRunId)).find(job=>job.role==="ARCHITECT");}
        if(architect?.outcome==="PASS"){
          const reviews=(await this.loadJobs(client,projectId,planningRunId)).filter(job=>job.role==="SECURITY"||job.role==="LEGAL_DE_EU");
          const specs=(["SECURITY","LEGAL_DE_EU"] as const).filter(role=>!reviews.some(job=>job.role===role)).map(role=>({role,prerequisiteJobId:architect!.id,architectureJobId:architect!.id}));
          const created=specs.length===0||await this.tryCreateAuthorizedJobs(client,run,specs);
          if(created)await this.transition(client,run,"SECURITY_LEGAL_REVIEW");
        }
      }else if(run.status==="SECURITY_LEGAL_REVIEW"){
        const architect=byRole.get("ARCHITECT");if(architect?.outcome!=="PASS")throw new Error("PLANNING_PERSISTENCE_INTEGRITY_ERROR");
        const specs=(["SECURITY","LEGAL_DE_EU"] as const).filter(role=>!byRole.has(role)).map(role=>({role,prerequisiteJobId:architect.id,architectureJobId:architect.id}));
        if(specs.length)await this.tryCreateAuthorizedJobs(client,run,specs);
        run=await this.lockRun(client,projectId,planningRunId);
        if(run.status==="BLOCKED")return mapRun(run);
        const reviews=(await this.loadJobs(client,projectId,planningRunId)).filter(job=>job.role==="SECURITY"||job.role==="LEGAL_DE_EU");
        const block=reviews.find(job=>job.outcome==="BLOCK");
        if(block)await this.blockRun(client,run,"REVIEW_BLOCK",block.role);
        else if(reviews.length===2&&reviews.every(job=>job.outcome==="PASS"||job.outcome==="PASS_WITH_REQUIREMENTS"))await this.transition(client,run,"WAITING_FOR_OWNER_APPROVAL");
      }
      return this.loadStatusWith(client,projectId,planningRunId);
    });
  }

  async startImplementation(projectId:string,planningRunId:string,projectRevision:string,requestedBy:string):Promise<ImplementationStatusView>{
    assertImplementationStart(projectId,planningRunId,projectRevision,requestedBy);
    return this.inProject({projectId,operation:"planning:append",actor:requestedBy},async client=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`implementation-start:${projectId}:${projectRevision}`]);
      const planning=(await client.query<{project_revision:string;status:PlanningState;decision:PlanningOwnerDecision|null;approved_project_revision:string|null}>(`SELECT run.project_revision,run.status,decision.decision,decision.approved_project_revision
        FROM builder.planning_runs run LEFT JOIN builder.planning_owner_decisions decision
          ON decision.project_id=run.project_id AND decision.planning_run_id=run.id
        WHERE run.project_id=$1 AND run.id=$2 FOR UPDATE OF run`,[projectId,planningRunId])).rows[0];
      if(!planning)throw new Error("IMPLEMENTATION_PLANNING_RUN_NOT_FOUND");
      if(planning.project_revision!==projectRevision)throw new Error("IMPLEMENTATION_PROJECT_REVISION_MISMATCH");
      if(planning.status!=="READY_FOR_IMPLEMENTATION"||planning.decision!=="APPROVE"||planning.approved_project_revision!==projectRevision)throw new Error("IMPLEMENTATION_OWNER_APPROVAL_REQUIRED");
      const existing=await this.findImplementationRunByRevision(client,projectId,projectRevision,true);
      if(existing){
        if(!sameUuid(existing.planning_run_id,planningRunId)||existing.requested_by!==requestedBy)throw new Error("IMPLEMENTATION_START_CONFLICT");
        return mapImplementationRun(existing);
      }
      const implementationRunId=stableUuid(`implementation-run\0${projectId.toLowerCase()}\0${projectRevision}`);
      await client.query(`INSERT INTO builder.implementation_runs(id,project_id,planning_run_id,project_revision,status,requested_by)
        VALUES($1,$2,$3,$4,'IMPLEMENTING',$5)`,[implementationRunId,projectId,planningRunId,projectRevision,requestedBy]);
      const run=await this.lockImplementationRun(client,projectId,implementationRunId);
      await this.tryCreateImplementationJobs(client,run,[{role:"EXECUTOR"}]);
      return this.loadImplementationStatusWith(client,projectId,implementationRunId);
    });
  }

  async handleExecutorResult(projectId:string,implementationRunId:string,result:ImplementationExecutorResult):Promise<ImplementationStatusView>{
    assertImplementationIdentity(projectId,implementationRunId);assertImplementationExecutorResult(result);
    if(result.projectId.toLowerCase()!==projectId.toLowerCase())throw new Error("IMPLEMENTATION_RESULT_PROJECT_MISMATCH");
    return this.inProject({projectId,operation:"planning:append"},async client=>{
      const run=await this.lockImplementationRun(client,projectId,implementationRunId);
      if(run.project_revision!==result.projectRevision)throw new Error("IMPLEMENTATION_PROJECT_REVISION_MISMATCH");
      const job=await this.lockImplementationJob(client,projectId,implementationRunId,result.executorJobId);
      if(job.role!=="EXECUTOR")throw new Error("IMPLEMENTATION_EXECUTOR_JOB_MISMATCH");
      const existing=await this.findExecutorResultByJob(client,projectId,implementationRunId,job.id);
      if(existing){
        if(sameExecutorResult(existing,result))return this.loadImplementationStatusWith(client,projectId,implementationRunId);
        throw new Error("IMPLEMENTATION_EXECUTOR_RESULT_CONFLICT");
      }
      if(isTerminalImplementationState(run.status)||run.status!=="IMPLEMENTING")throw new Error("IMPLEMENTATION_STALE_EXECUTOR_RESULT");
      await this.verifyImplementationExecutorRuntime(client,job,result);
      await client.query(`INSERT INTO builder.implementation_executor_results(
          implementation_result_id,project_id,implementation_run_id,project_revision,executor_job_id,runtime_result_id,
          agent_id,agent_key,agent_version,artifacts,summary,status,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,[
        result.implementationResultId,projectId,implementationRunId,result.projectRevision,result.executorJobId,result.runtimeResultId??null,
        result.agentId,result.agentKey,result.agentVersion,JSON.stringify(result.artifacts),result.summary,result.status,result.createdAt,
      ]);
      const current=await this.lockImplementationRun(client,projectId,implementationRunId);
      if(result.status==="SUCCEEDED"){
        const created=await this.tryCreateImplementationJobs(client,current,(["QA","REVIEWER","SECURITY","LEGAL_DE_EU"] as const).map(role=>({role,executorResultId:result.implementationResultId})));
        if(created)await this.transitionImplementation(client,current,"IMPLEMENTATION_REVIEW");
      }else await this.transitionImplementation(client,current,result.status==="FAILED"?"IMPLEMENTATION_FAILED":"IMPLEMENTATION_CANCELLED");
      return this.loadImplementationStatusWith(client,projectId,implementationRunId);
    });
  }

  async handleImplementationReviewResult(projectId:string,implementationRunId:string,result:ImplementationReviewResult):Promise<ImplementationStatusView>{
    assertImplementationIdentity(projectId,implementationRunId);assertImplementationReviewResult(result);
    if(result.projectId.toLowerCase()!==projectId.toLowerCase())throw new Error("IMPLEMENTATION_REVIEW_PROJECT_MISMATCH");
    return this.inProject({projectId,operation:"planning:append"},async client=>{
      const run=await this.lockImplementationRun(client,projectId,implementationRunId);
      if(run.project_revision!==result.projectRevision)throw new Error("IMPLEMENTATION_PROJECT_REVISION_MISMATCH");
      const job=await this.lockImplementationJob(client,projectId,implementationRunId,result.reviewJobId);
      if(job.role==="EXECUTOR"||job.role!==result.role||!sameUuid(job.executor_result_id,result.implementationResultId))throw new Error("IMPLEMENTATION_REVIEW_BINDING_MISMATCH");
      const existing=await this.findReviewResultByJob(client,projectId,implementationRunId,job.id);
      if(existing){
        const requirements=await this.loadImplementationRequirements(client,projectId,implementationRunId,existing.review_result_id);
        if(sameReviewResult(existing,requirements,result))return this.loadImplementationStatusWith(client,projectId,implementationRunId);
        throw new Error("IMPLEMENTATION_REVIEW_RESULT_CONFLICT");
      }
      if(isTerminalImplementationState(run.status)||run.status!=="IMPLEMENTATION_REVIEW")throw new Error("IMPLEMENTATION_STALE_REVIEW_RESULT");
      await this.verifyImplementationReviewRuntime(client,job,result);
      for(const requirement of result.requirements)await client.query(`INSERT INTO builder.implementation_review_requirements(
          project_id,implementation_run_id,review_result_id,review_job_id,requirement_code,requirement_ref)
        VALUES($1,$2,$3,$4,$5,$6)`,[projectId,implementationRunId,result.reviewResultId,result.reviewJobId,requirement.code,requirement.ref]);
      await client.query(`INSERT INTO builder.implementation_review_results(
          review_result_id,project_id,implementation_run_id,project_revision,review_job_id,implementation_result_id,role,
          runtime_result_id,outcome,result_object_ref,result_digest,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[
        result.reviewResultId,projectId,implementationRunId,result.projectRevision,result.reviewJobId,result.implementationResultId,
        result.role,result.runtimeResultId,result.outcome,result.objectRef,result.digest,result.createdAt,
      ]);
      const reviews=await this.loadImplementationReviewRows(client,projectId,implementationRunId,true);
      if(reviews.length===4)await this.applyImplementationReviewDecision(client,run,reviews);
      return this.loadImplementationStatusWith(client,projectId,implementationRunId);
    });
  }

  async getImplementationStatus(projectId:string,implementationRunId:string):Promise<ImplementationStatusView>{
    assertImplementationIdentity(projectId,implementationRunId);
    return this.inProject({projectId,operation:"planning:read"},client=>this.loadImplementationStatusWith(client,projectId,implementationRunId));
  }

  async listImplementationJobs(projectId:string,implementationRunId:string):Promise<readonly ImplementationJobView[]>{
    assertImplementationIdentity(projectId,implementationRunId);
    return this.inProject({projectId,operation:"planning:read"},async client=>{
      if(!(await this.findImplementationRun(client,projectId,implementationRunId,"SHARE")))throw new Error("IMPLEMENTATION_RUN_NOT_FOUND");
      return(await this.loadImplementationJobs(client,projectId,implementationRunId)).map(mapImplementationJob);
    });
  }

  async listImplementationReviews(projectId:string,implementationRunId:string):Promise<readonly ImplementationReviewView[]>{
    assertImplementationIdentity(projectId,implementationRunId);
    return this.inProject({projectId,operation:"planning:read"},async client=>{
      if(!(await this.findImplementationRun(client,projectId,implementationRunId,"SHARE")))throw new Error("IMPLEMENTATION_RUN_NOT_FOUND");
      const reviews=await this.loadImplementationReviewRows(client,projectId,implementationRunId,false);
      const requirements=await this.loadAllImplementationRequirements(client,projectId,implementationRunId);
      return reviews.map(review=>mapImplementationReview(review,requirements.filter(item=>item.review_result_id===review.review_result_id)));
    });
  }

  async resumeImplementation(projectId:string,implementationRunId:string):Promise<ImplementationStatusView>{
    assertImplementationIdentity(projectId,implementationRunId);
    return this.inProject({projectId,operation:"planning:append"},async client=>{
      let run=await this.lockImplementationRun(client,projectId,implementationRunId);
      if(isTerminalImplementationState(run.status))return mapImplementationRun(run);
      let jobs=await this.loadImplementationJobs(client,projectId,implementationRunId);
      if(!jobs.some(job=>job.role==="EXECUTOR")){
        await this.tryCreateImplementationJobs(client,run,[{role:"EXECUTOR"}]);
        run=await this.lockImplementationRun(client,projectId,implementationRunId);
        if(isTerminalImplementationState(run.status))return mapImplementationRun(run);
        jobs=await this.loadImplementationJobs(client,projectId,implementationRunId);
      }
      const executor=run.implementation_result_id?run:await this.findImplementationRun(client,projectId,implementationRunId,"UPDATE");
      if(!executor?.implementation_result_id)return this.loadImplementationStatusWith(client,projectId,implementationRunId);
      if(executor.executor_status==="FAILED"){
        if(run.status!=="IMPLEMENTING")throw new Error("IMPLEMENTATION_PERSISTENCE_INTEGRITY_ERROR");
        await this.transitionImplementation(client,run,"IMPLEMENTATION_FAILED");
        return this.loadImplementationStatusWith(client,projectId,implementationRunId);
      }
      if(executor.executor_status==="CANCELLED"){
        if(run.status!=="IMPLEMENTING")throw new Error("IMPLEMENTATION_PERSISTENCE_INTEGRITY_ERROR");
        await this.transitionImplementation(client,run,"IMPLEMENTATION_CANCELLED");
        return this.loadImplementationStatusWith(client,projectId,implementationRunId);
      }
      if(executor.executor_status!=="SUCCEEDED")throw new Error("IMPLEMENTATION_PERSISTENCE_INTEGRITY_ERROR");
      const reviewRoles=["QA","REVIEWER","SECURITY","LEGAL_DE_EU"] as const;
      const missing=reviewRoles.filter(role=>!jobs.some(job=>job.role===role)).map(role=>({role,executorResultId:executor.implementation_result_id!}));
      if(missing.length){
        await this.tryCreateImplementationJobs(client,run,missing);
        run=await this.lockImplementationRun(client,projectId,implementationRunId);
        if(isTerminalImplementationState(run.status))return mapImplementationRun(run);
      }
      if(run.status==="IMPLEMENTING"){
        await this.transitionImplementation(client,run,"IMPLEMENTATION_REVIEW");
        run=await this.lockImplementationRun(client,projectId,implementationRunId);
      }
      const reviews=await this.loadImplementationReviewRows(client,projectId,implementationRunId,true);
      if(reviews.length===4)await this.applyImplementationReviewDecision(client,run,reviews);
      return this.loadImplementationStatusWith(client,projectId,implementationRunId);
    });
  }

  private async tryCreateImplementationJobs(client:PlanningRepositorySession,run:ImplementationRunRow,specs:readonly {role:ImplementationJobRole;executorResultId?:string}[]):Promise<boolean>{
    await client.query("SAVEPOINT implementation_authorized_jobs");
    try{
      for(const spec of specs)await this.createImplementationJob(client,run,spec);
      await client.query("RELEASE SAVEPOINT implementation_authorized_jobs");return true;
    }catch(error){
      await client.query("ROLLBACK TO SAVEPOINT implementation_authorized_jobs");await client.query("RELEASE SAVEPOINT implementation_authorized_jobs");
      if(error instanceof ImplementationAgentUnavailableError){await this.blockImplementationRun(client,run,error.blockCode,error.role);return false;}
      throw error;
    }
  }

  private async createImplementationJob(client:PlanningRepositorySession,run:ImplementationRunRow,spec:{role:ImplementationJobRole;executorResultId?:string}):Promise<void>{
    const prior=(await client.query<{executor_result_id:string|null}>("SELECT executor_result_id FROM builder.implementation_jobs WHERE implementation_run_id=$1 AND role=$2",[run.id,spec.role])).rows[0];
    if(prior){
      if(!sameUuid(prior.executor_result_id,spec.executorResultId??null))throw new Error("IMPLEMENTATION_JOB_CONFLICT");
      return;
    }
    const implementationJobId=stableUuid(`implementation-job\0${run.id}\0${spec.role}`);
    const runtimeRunId=stableUuid(`implementation-runtime-run\0${run.id}\0${spec.role}`);
    const inputRef=spec.role==="EXECUTOR"
      ?`implementation/${run.id}/executor/${run.project_revision}`
      :`implementation/${run.id}/review/${spec.role.toLowerCase()}/${spec.executorResultId}`;
    const task:AgentTask={
      schemaVersion:1,projectId:run.project_id,taskId:stableUuid(`implementation-task\0${run.id}\0${spec.role}`),
      attemptId:stableUuid(`implementation-attempt\0${run.id}\0${spec.role}`),runId:runtimeRunId,
      role:spec.role==="LEGAL_DE_EU"?"LEGAL":spec.role,scenario:"SUCCESS",inputRef,repairOrdinal:0,
    };
    const enqueue=await enqueueAgentJobInSession(client,{
      task,messageId:stableUuid(`implementation-message\0${run.id}\0${spec.role}`),consumerIdentity:"implementation-orchestrator",
      idempotencyKey:`implementation:${run.id}:${spec.role}`,requestDigest:canonicalAgentOperationDigest("enqueue",task),
      traceId:stableUuid(`implementation-trace\0${run.id}\0${spec.role}`),maxRetries:0,
    });
    let assignment:AgentAssignment;
    try{
      assignment=await assignActiveAgentInSession({projectId:run.project_id,query:(sql,values=[])=>client.query(sql,[...values])},{
        assignmentId:stableUuid(`implementation-assignment\0${run.id}\0${spec.role}`),projectId:run.project_id,
        jobId:enqueue.jobId,requiredRole:spec.role,createdBy:"implementation-orchestrator",
      });
    }catch(error){
      const message=String(error);
      if(message.includes("AGENT_ASSIGNMENT_NO_ACTIVE_AGENT"))throw new ImplementationAgentUnavailableError(spec.role,"NO_ACTIVE_AGENT_VERSION",error);
      if(message.includes("AGENT_ASSIGNMENT_AMBIGUOUS_ACTIVE_AGENT"))throw new ImplementationAgentUnavailableError(spec.role,"AMBIGUOUS_ACTIVE_AGENT_VERSION",error);
      throw error;
    }
    await client.query(`INSERT INTO builder.implementation_jobs(
        id,project_id,implementation_run_id,project_revision,role,executor_result_id,background_job_id,runtime_run_id,assignment_id,input_ref)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[
      implementationJobId,run.project_id,run.id,run.project_revision,spec.role,spec.executorResultId??null,
      enqueue.jobId,runtimeRunId,assignment.assignmentId,inputRef,
    ]);
  }

  private async verifyImplementationExecutorRuntime(client:PlanningRepositorySession,job:ImplementationJobRow,result:ImplementationExecutorResult):Promise<void>{
    const runtime=(await client.query<{job_status:string;runtime_result_id:string|null;runtime_status:string|null;runtime_run_id:string|null;result_payload:unknown|null}>(`SELECT background.status job_status,background.agent_result_id runtime_result_id,
        runtime.status runtime_status,runtime.run_id runtime_run_id,runtime.result_payload
      FROM builder.background_jobs background LEFT JOIN builder.agent_runtime_results runtime
        ON runtime.project_id=background.project_id AND runtime.id=background.agent_result_id
      WHERE background.project_id=$1 AND background.id=$2 FOR UPDATE OF background`,[job.project_id,job.background_job_id])).rows[0];
    if(!runtime||!sameUuid(runtime.runtime_result_id,result.runtimeResultId??null))throw new Error("IMPLEMENTATION_RUNTIME_RESULT_BINDING_MISMATCH");
    if(!sameUuid(job.agent_id,result.agentId)||job.agent_key!==result.agentKey||job.agent_version!==result.agentVersion)throw new Error("IMPLEMENTATION_RESULT_ASSIGNMENT_MISMATCH");
    if(result.status==="CANCELLED"){
      if(runtime.job_status!=="CANCELLED")throw new Error("IMPLEMENTATION_RUNTIME_RESULT_NOT_CANCELLED");
      if(result.runtimeResultId!==undefined){
        if(runtime.runtime_status!=="CANCELLED"||runtime.runtime_run_id!==job.runtime_run_id||!runtime.result_payload)throw new Error("IMPLEMENTATION_RUNTIME_RESULT_BINDING_MISMATCH");
        const payload=parseAgentResult(runtime.result_payload);if(payload.projectId!==job.project_id||payload.runId!==job.runtime_run_id)throw new Error("IMPLEMENTATION_RUNTIME_RESULT_BINDING_MISMATCH");
      }
      return;
    }
    if(!runtime.result_payload||runtime.runtime_run_id!==job.runtime_run_id)throw new Error("IMPLEMENTATION_RUNTIME_RESULT_BINDING_MISMATCH");
    const payload=parseAgentResult(runtime.result_payload);
    if(payload.projectId!==job.project_id||payload.runId!==job.runtime_run_id)throw new Error("IMPLEMENTATION_RUNTIME_RESULT_BINDING_MISMATCH");
    if(result.status==="SUCCEEDED"){
      if(runtime.job_status!=="SUCCEEDED"||runtime.runtime_status!=="SUCCESS"||!result.artifacts.every(expected=>payload.artifacts.some(artifact=>artifact.objectRef===expected.objectRef&&artifact.digest===expected.digest)))throw new Error("IMPLEMENTATION_RUNTIME_RESULT_NOT_SUCCESSFUL");
    }else if(runtime.job_status!=="FAILED"||(runtime.runtime_status!=="ERROR"&&runtime.runtime_status!=="TIMEOUT"))throw new Error("IMPLEMENTATION_RUNTIME_RESULT_NOT_FAILED");
  }

  private async verifyImplementationReviewRuntime(client:PlanningRepositorySession,job:ImplementationJobRow,result:ImplementationReviewResult):Promise<void>{
    const runtime=(await client.query<RuntimeResultRow>(`SELECT background.status job_status,runtime.status runtime_status,runtime.run_id runtime_run_id,runtime.result_payload
      FROM builder.background_jobs background JOIN builder.agent_runtime_results runtime
        ON runtime.project_id=background.project_id AND runtime.id=background.agent_result_id
      WHERE background.project_id=$1 AND background.id=$2 AND runtime.id=$3 FOR UPDATE OF background`,[job.project_id,job.background_job_id,result.runtimeResultId])).rows[0];
    if(!runtime||runtime.job_status!=="SUCCEEDED"||runtime.runtime_status!=="SUCCESS"||runtime.runtime_run_id!==job.runtime_run_id)throw new Error("IMPLEMENTATION_REVIEW_RUNTIME_NOT_SUCCESSFUL");
    const payload=parseAgentResult(runtime.result_payload);
    if(payload.projectId!==job.project_id||payload.runId!==job.runtime_run_id||!payload.artifacts.some(artifact=>artifact.objectRef===result.objectRef&&artifact.digest===result.digest))throw new Error("IMPLEMENTATION_REVIEW_RUNTIME_BINDING_MISMATCH");
  }

  private async applyImplementationReviewDecision(client:PlanningRepositorySession,run:ImplementationRunRow,reviews:readonly ImplementationReviewRow[]):Promise<void>{
    const block=reviews.filter(review=>review.outcome==="BLOCK").sort((left,right)=>implementationRoleOrder[left.role]-implementationRoleOrder[right.role])[0];
    if(block){await this.blockImplementationRun(client,run,"REVIEW_BLOCK",block.role);return;}
    if(reviews.some(review=>review.outcome==="CHANGES_REQUESTED")){await this.transitionImplementation(client,run,"CHANGES_REQUESTED");return;}
    if(reviews.every(review=>review.outcome==="PASS"||review.outcome==="PASS_WITH_REQUIREMENTS")){await this.transitionImplementation(client,run,"READY_FOR_DELIVERY");return;}
    throw new Error("IMPLEMENTATION_REVIEW_BARRIER_INCOMPLETE");
  }

  private async transitionImplementation(client:PlanningRepositorySession,run:ImplementationRunRow,status:ImplementationState):Promise<void>{
    const updated=await client.query("UPDATE builder.implementation_runs SET status=$3,updated_at=clock_timestamp() WHERE project_id=$1 AND id=$2 AND status=$4",[run.project_id,run.id,status,run.status]);
    if(!updated.rowCount)throw new Error("IMPLEMENTATION_STATE_CONFLICT");
  }
  private async blockImplementationRun(client:PlanningRepositorySession,run:ImplementationRunRow,code:string,role:ImplementationJobRole):Promise<void>{
    const updated=await client.query("UPDATE builder.implementation_runs SET status='BLOCKED',blocked_at=clock_timestamp(),block_code=$3,block_role=$4,updated_at=clock_timestamp() WHERE project_id=$1 AND id=$2 AND status=$5",[run.project_id,run.id,code,role,run.status]);
    if(!updated.rowCount)throw new Error("IMPLEMENTATION_STATE_CONFLICT");
  }

  private async loadImplementationStatusWith(query:PlanningRepositorySession,projectId:string,implementationRunId:string):Promise<ImplementationStatusView>{
    const run=await this.findImplementationRun(query,projectId,implementationRunId,false);if(!run)throw new Error("IMPLEMENTATION_RUN_NOT_FOUND");return mapImplementationRun(run);
  }
  private async lockImplementationRun(client:PlanningRepositorySession,projectId:string,implementationRunId:string):Promise<ImplementationRunRow>{
    const run=await this.findImplementationRun(client,projectId,implementationRunId,"UPDATE");if(!run)throw new Error("IMPLEMENTATION_RUN_NOT_FOUND");return run;
  }
  private async findImplementationRun(query:PlanningRepositorySession,projectId:string,implementationRunId:string,lock:"UPDATE"|"SHARE"|false):Promise<ImplementationRunRow|undefined>{
    return(await query.query<ImplementationRunRow>(`SELECT ${implementationRunColumns} FROM builder.implementation_runs run
      LEFT JOIN builder.implementation_executor_results result
        ON result.project_id=run.project_id AND result.implementation_run_id=run.id
      WHERE run.project_id=$1 AND run.id=$2${lock?` FOR ${lock} OF run`:""}`,[projectId,implementationRunId])).rows[0];
  }
  private async findImplementationRunByRevision(query:PlanningRepositorySession,projectId:string,projectRevision:string,lock:boolean):Promise<ImplementationRunRow|undefined>{
    return(await query.query<ImplementationRunRow>(`SELECT ${implementationRunColumns} FROM builder.implementation_runs run
      LEFT JOIN builder.implementation_executor_results result
        ON result.project_id=run.project_id AND result.implementation_run_id=run.id
      WHERE run.project_id=$1 AND run.project_revision=$2${lock?" FOR UPDATE OF run":""}`,[projectId,projectRevision])).rows[0];
  }
  private async lockImplementationJob(client:PlanningRepositorySession,projectId:string,implementationRunId:string,jobId:string):Promise<ImplementationJobRow>{
    const job=(await client.query<ImplementationJobRow>(`SELECT ${implementationJobColumns} FROM builder.implementation_jobs job
      JOIN builder.agent_assignments assignment ON assignment.project_id=job.project_id AND assignment.assignment_id=job.assignment_id
      WHERE job.project_id=$1 AND job.implementation_run_id=$2 AND job.id=$3 FOR UPDATE OF job`,[projectId,implementationRunId,jobId])).rows[0];
    if(!job)throw new Error("IMPLEMENTATION_JOB_NOT_FOUND");return job;
  }
  private async loadImplementationJobs(query:PlanningRepositorySession,projectId:string,implementationRunId:string):Promise<ImplementationJobRow[]>{
    return(await query.query<ImplementationJobRow>(`SELECT ${implementationJobColumns} FROM builder.implementation_jobs job
      JOIN builder.agent_assignments assignment ON assignment.project_id=job.project_id AND assignment.assignment_id=job.assignment_id
      WHERE job.project_id=$1 AND job.implementation_run_id=$2`,[projectId,implementationRunId])).rows.sort((left,right)=>implementationRoleOrder[left.role]-implementationRoleOrder[right.role]);
  }
  private async findExecutorResultByJob(query:PlanningRepositorySession,projectId:string,implementationRunId:string,jobId:string):Promise<ImplementationRunRow|undefined>{
    return(await query.query<ImplementationRunRow>(`SELECT ${implementationRunColumns} FROM builder.implementation_runs run
      JOIN builder.implementation_executor_results result ON result.project_id=run.project_id AND result.implementation_run_id=run.id
      WHERE run.project_id=$1 AND run.id=$2 AND result.executor_job_id=$3`,[projectId,implementationRunId,jobId])).rows[0];
  }
  private async findReviewResultByJob(query:PlanningRepositorySession,projectId:string,implementationRunId:string,jobId:string):Promise<ImplementationReviewRow|undefined>{
    return(await query.query<ImplementationReviewRow>(`SELECT ${implementationReviewColumns} FROM builder.implementation_review_results result
      WHERE result.project_id=$1 AND result.implementation_run_id=$2 AND result.review_job_id=$3`,[projectId,implementationRunId,jobId])).rows[0];
  }
  private async loadImplementationReviewRows(query:PlanningRepositorySession,projectId:string,implementationRunId:string,lock:boolean):Promise<ImplementationReviewRow[]>{
    return(await query.query<ImplementationReviewRow>(`SELECT ${implementationReviewColumns} FROM builder.implementation_review_results result
      WHERE result.project_id=$1 AND result.implementation_run_id=$2
      ORDER BY CASE result.role WHEN 'QA' THEN 1 WHEN 'REVIEWER' THEN 2 WHEN 'SECURITY' THEN 3 ELSE 4 END${lock?" FOR UPDATE":""}`,[projectId,implementationRunId])).rows;
  }
  private async loadImplementationRequirements(query:PlanningRepositorySession,projectId:string,implementationRunId:string,reviewResultId:string):Promise<ImplementationRequirementRow[]>{
    return(await query.query<ImplementationRequirementRow>(`SELECT review_result_id,requirement_code,requirement_ref FROM builder.implementation_review_requirements
      WHERE project_id=$1 AND implementation_run_id=$2 AND review_result_id=$3 ORDER BY requirement_code,requirement_ref`,[projectId,implementationRunId,reviewResultId])).rows;
  }
  private async loadAllImplementationRequirements(query:PlanningRepositorySession,projectId:string,implementationRunId:string):Promise<ImplementationRequirementRow[]>{
    return(await query.query<ImplementationRequirementRow>(`SELECT review_result_id,requirement_code,requirement_ref FROM builder.implementation_review_requirements
      WHERE project_id=$1 AND implementation_run_id=$2 ORDER BY review_result_id,requirement_code,requirement_ref`,[projectId,implementationRunId])).rows;
  }

  private async tryCreateAuthorizedJobs(client:PlanningRepositorySession,run:RunRow,specs:readonly {role:PlanningJobRole;prerequisiteJobId?:string;architectureJobId?:string}[]):Promise<boolean>{
    await client.query("SAVEPOINT planning_authorized_jobs");
    try{
      for(const spec of specs)await this.createPlanningJob(client,run,spec);
      await client.query("RELEASE SAVEPOINT planning_authorized_jobs");return true;
    }catch(error){
      await client.query("ROLLBACK TO SAVEPOINT planning_authorized_jobs");await client.query("RELEASE SAVEPOINT planning_authorized_jobs");
      if(error instanceof PlanningAgentUnavailableError){await this.blockRun(client,run,error.blockCode,error.role);return false;}
      throw error;
    }
  }

  private async createPlanningJob(client:PlanningRepositorySession,run:RunRow,spec:{role:PlanningJobRole;prerequisiteJobId?:string;architectureJobId?:string}):Promise<void>{
    const prior=(await client.query("SELECT 1 FROM builder.planning_jobs WHERE planning_run_id=$1 AND role=$2",[run.id,spec.role])).rowCount;
    if(prior)return;
    const planningJobId=stableUuid(`planning-job\0${run.id}\0${spec.role}`);
    const runtimeRunId=stableUuid(`planning-runtime-run\0${run.id}\0${spec.role}`);
    const task:AgentTask={schemaVersion:1,projectId:run.project_id,taskId:stableUuid(`planning-task\0${run.id}\0${spec.role}`),attemptId:stableUuid(`planning-attempt\0${run.id}\0${spec.role}`),runId:runtimeRunId,role:spec.role==="LEGAL_DE_EU"?"LEGAL":spec.role,scenario:"SUCCESS",inputRef:`planning/${run.id}/${spec.role.toLowerCase()}/${run.project_revision}`,repairOrdinal:0};
    const enqueue=await enqueueAgentJobInSession(client,{task,messageId:stableUuid(`planning-message\0${run.id}\0${spec.role}`),consumerIdentity:"planning-orchestrator",idempotencyKey:`planning:${run.id}:${spec.role}`,requestDigest:canonicalAgentOperationDigest("enqueue",task),traceId:stableUuid(`planning-trace\0${run.id}\0${spec.role}`),maxRetries:0});
    let assignment:AgentAssignment;
    try{
      assignment=await assignActiveAgentInSession({projectId:run.project_id,query:(sql,values=[])=>client.query(sql,[...values])},{assignmentId:stableUuid(`planning-assignment\0${run.id}\0${spec.role}`),projectId:run.project_id,jobId:enqueue.jobId,requiredRole:spec.role,createdBy:"planning-orchestrator"});
    }catch(error){
      const message=String(error);
      if(message.includes("AGENT_ASSIGNMENT_NO_ACTIVE_AGENT"))throw new PlanningAgentUnavailableError(spec.role,"NO_ACTIVE_AGENT_VERSION",error);
      if(message.includes("AGENT_ASSIGNMENT_AMBIGUOUS_ACTIVE_AGENT"))throw new PlanningAgentUnavailableError(spec.role,"AMBIGUOUS_ACTIVE_AGENT_VERSION",error);
      throw error;
    }
    await client.query(`INSERT INTO builder.planning_jobs(id,project_id,planning_run_id,project_revision,role,prerequisite_job_id,architecture_job_id,background_job_id,runtime_run_id,assignment_id,input_ref)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[planningJobId,run.project_id,run.id,run.project_revision,spec.role,spec.prerequisiteJobId??null,spec.architectureJobId??null,enqueue.jobId,runtimeRunId,assignment.assignmentId,task.inputRef]);
  }

  private async verifySuccessfulRuntimeResult(client:PlanningRepositorySession,job:JobRow,result:PlanningJobResult):Promise<void>{
    const runtime=(await client.query<RuntimeResultRow>(`SELECT background.status job_status,runtime.status runtime_status,runtime.run_id runtime_run_id,runtime.result_payload
      FROM builder.background_jobs background JOIN builder.agent_runtime_results runtime
        ON runtime.project_id=background.project_id AND runtime.id=background.agent_result_id
      WHERE background.project_id=$1 AND background.id=$2 AND runtime.id=$3 FOR UPDATE OF background`,[job.project_id,job.background_job_id,result.runtimeResultId])).rows[0];
    if(!runtime||runtime.job_status!=="SUCCEEDED"||runtime.runtime_status!=="SUCCESS"||runtime.runtime_run_id!==job.runtime_run_id)throw new Error("PLANNING_RUNTIME_RESULT_NOT_SUCCESSFUL");
    const payload=parseAgentResult(runtime.result_payload);
    if(payload.projectId!==job.project_id||payload.runId!==job.runtime_run_id||!payload.artifacts.some(artifact=>artifact.objectRef===result.objectRef&&artifact.digest===result.digest))throw new Error("PLANNING_RUNTIME_RESULT_BINDING_MISMATCH");
  }

  private assertRoleState(role:PlanningJobRole,state:PlanningState):void {
    const expected=role==="PLANNER"?"PLANNING":role==="ARCHITECT"?"ARCHITECTURE_REVIEW":"SECURITY_LEGAL_REVIEW";
    if(state!==expected)throw new Error("PLANNING_STALE_RESULT");
  }

  private async isIdenticalResult(client:PlanningRepositorySession,job:JobRow,result:PlanningJobResult):Promise<boolean>{
    if(job.runtime_result_id!==result.runtimeResultId||job.outcome!==result.outcome||job.result_object_ref!==result.objectRef||job.result_digest!==result.digest||job.project_revision!==result.projectRevision)return false;
    const persisted=(await client.query<RequirementRow>("SELECT planning_job_id,requirement_code,requirement_ref FROM builder.planning_review_requirements WHERE project_id=$1 AND planning_run_id=$2 AND planning_job_id=$3 ORDER BY requirement_code,requirement_ref",[job.project_id,job.planning_run_id,job.id])).rows.map(row=>({code:row.requirement_code,ref:row.requirement_ref}));
    return sameRequirements(persisted,result.requirements);
  }

  private async transition(client:PlanningRepositorySession,run:RunRow,status:PlanningState):Promise<void>{
    const updated=await client.query("UPDATE builder.planning_runs SET status=$3,updated_at=clock_timestamp() WHERE project_id=$1 AND id=$2 AND status=$4",[run.project_id,run.id,status,run.status]);
    if(!updated.rowCount)throw new Error("PLANNING_STATE_CONFLICT");
  }
  private async blockRun(client:PlanningRepositorySession,run:RunRow,code:string,role:PlanningJobRole):Promise<void>{
    const updated=await client.query("UPDATE builder.planning_runs SET status='BLOCKED',blocked_at=clock_timestamp(),block_code=$3,block_role=$4,updated_at=clock_timestamp() WHERE project_id=$1 AND id=$2 AND status=$5",[run.project_id,run.id,code,role,run.status]);
    if(!updated.rowCount)throw new Error("PLANNING_STATE_CONFLICT");
  }

  private async loadStatusWith(query:PlanningRepositorySession,projectId:string,planningRunId:string):Promise<PlanningStatusView>{
    const run=await this.findRun(query,projectId,planningRunId,false);if(!run)throw new Error("PLANNING_RUN_NOT_FOUND");return mapRun(run);
  }
  private async lockRun(client:PlanningRepositorySession,projectId:string,planningRunId:string):Promise<RunRow>{
    const run=await this.findRun(client,projectId,planningRunId,"UPDATE");if(!run)throw new Error("PLANNING_RUN_NOT_FOUND");return run;
  }
  private async findRun(query:PlanningRepositorySession,projectId:string,planningRunId:string,lock:"UPDATE"|"SHARE"|false):Promise<RunRow|undefined>{
    return(await query.query<RunRow>(`SELECT ${runColumns} FROM builder.planning_runs run LEFT JOIN builder.planning_owner_decisions decision
      ON decision.project_id=run.project_id AND decision.planning_run_id=run.id WHERE run.project_id=$1 AND run.id=$2${lock?` FOR ${lock} OF run`:""}`,[projectId,planningRunId])).rows[0];
  }
  private async findRunByRevision(query:PlanningRepositorySession,projectId:string,revision:string,lock:boolean):Promise<RunRow|undefined>{
    return(await query.query<RunRow>(`SELECT ${runColumns} FROM builder.planning_runs run LEFT JOIN builder.planning_owner_decisions decision
      ON decision.project_id=run.project_id AND decision.planning_run_id=run.id WHERE run.project_id=$1 AND run.project_revision=$2${lock?" FOR UPDATE OF run":""}`,[projectId,revision])).rows[0];
  }
  private async lockJob(client:PlanningRepositorySession,projectId:string,planningRunId:string,jobId:string):Promise<JobRow>{
    const job=(await client.query<JobRow>(`SELECT ${jobColumns} FROM builder.planning_jobs job JOIN builder.agent_assignments assignment
      ON assignment.project_id=job.project_id AND assignment.assignment_id=job.assignment_id
      WHERE job.project_id=$1 AND job.planning_run_id=$2 AND job.id=$3 FOR UPDATE OF job`,[projectId,planningRunId,jobId])).rows[0];
    if(!job)throw new Error("PLANNING_JOB_NOT_FOUND");return job;
  }
  private async loadJobs(query:PlanningRepositorySession,projectId:string,planningRunId:string):Promise<JobRow[]>{
    return(await query.query<JobRow>(`SELECT ${jobColumns} FROM builder.planning_jobs job JOIN builder.agent_assignments assignment
      ON assignment.project_id=job.project_id AND assignment.assignment_id=job.assignment_id WHERE job.project_id=$1 AND job.planning_run_id=$2`,[projectId,planningRunId])).rows.sort((left,right)=>roleOrder[left.role]-roleOrder[right.role]);
  }
  private inProject<T>(request:PlanningTransactionRequest,action:(session:PlanningRepositorySession)=>Promise<T>):Promise<T>{return this.transaction(request,session=>{
    if(session.projectId.toLowerCase()!==request.projectId.toLowerCase())throw new Error("PLANNING_CAPABILITY_PROJECT_MISMATCH");
    if(request.actor!==undefined&&session.subject!==request.actor)throw new Error("PLANNING_CAPABILITY_ACTOR_MISMATCH");
    return action(session);
  });
  }
}

function mapRun(row:RunRow):PlanningStatusView {
  return{planningRunId:row.id,projectId:row.project_id,projectRevision:row.project_revision,status:row.status,requestedBy:row.requested_by,createdAt:row.created_at,updatedAt:row.updated_at,
    ...(row.blocked_at?{blockedAt:row.blocked_at}:{}),...(row.block_code?{blockCode:row.block_code}:{}),...(row.block_role?{blockRole:row.block_role}:{}),
    ...(row.decision&&row.decided_by&&row.reason_ref&&row.decided_at?{ownerDecision:{decision:row.decision,decidedBy:row.decided_by,reason:row.reason_ref,decidedAt:row.decided_at,...(row.approved_project_revision?{approvedProjectRevision:row.approved_project_revision}:{})}}:{})};
}
function mapJob(row:JobRow,requirements:readonly RequirementRow[]):PlanningJobView {
  return{id:row.id,planningRunId:row.planning_run_id,projectId:row.project_id,projectRevision:row.project_revision,role:row.role,backgroundJobId:row.background_job_id,runtimeRunId:row.runtime_run_id,
    ...(row.prerequisite_job_id?{prerequisiteJobId:row.prerequisite_job_id}:{}),...(row.architecture_job_id?{architectureJobId:row.architecture_job_id}:{}),
    assignment:{assignmentId:row.assignment_id,agentId:row.agent_id,agentKey:row.agent_key,agentVersion:row.agent_version},
    ...(row.outcome?{outcome:row.outcome}:{}),...(row.runtime_result_id?{runtimeResultId:row.runtime_result_id}:{}),...(row.result_object_ref?{resultObjectRef:row.result_object_ref}:{}),...(row.result_digest?{resultDigest:row.result_digest}:{}),
    requirements:requirements.map(requirement=>({code:requirement.requirement_code,ref:requirement.requirement_ref})),createdAt:row.created_at,...(row.completed_at?{completedAt:row.completed_at}:{})};
}
function mapImplementationRun(row:ImplementationRunRow):ImplementationStatusView {
  return{implementationRunId:row.id,planningRunId:row.planning_run_id,projectId:row.project_id,projectRevision:row.project_revision,
    status:row.status,requestedBy:row.requested_by,createdAt:row.created_at,updatedAt:row.updated_at,
    ...(row.blocked_at?{blockedAt:row.blocked_at}:{}),...(row.block_code?{blockCode:row.block_code}:{}),...(row.block_role?{blockRole:row.block_role}:{}),
    ...(row.implementation_result_id&&row.executor_job_id&&row.agent_id&&row.agent_key&&row.agent_version!==null&&row.summary&&row.executor_created_at&&row.executor_status&&row.accepted_at?{
      executorResult:{implementationResultId:row.implementation_result_id,...(row.runtime_result_id?{runtimeResultId:row.runtime_result_id}:{}),
        implementationRunId:row.id,projectId:row.project_id,projectRevision:row.project_revision,executorJobId:row.executor_job_id,
        agentId:row.agent_id,agentKey:row.agent_key,agentVersion:row.agent_version,artifacts:storedArtifacts(row.artifacts),summary:row.summary,
        createdAt:row.executor_created_at,status:row.executor_status,acceptedAt:row.accepted_at,
      },
    }:{}),
  };
}
function mapImplementationJob(row:ImplementationJobRow):ImplementationJobView {
  return{id:row.id,implementationRunId:row.implementation_run_id,projectId:row.project_id,projectRevision:row.project_revision,
    role:row.role,backgroundJobId:row.background_job_id,runtimeRunId:row.runtime_run_id,
    ...(row.executor_result_id?{executorResultId:row.executor_result_id}:{}),
    assignment:{assignmentId:row.assignment_id,agentId:row.agent_id,agentKey:row.agent_key,agentVersion:row.agent_version},createdAt:row.created_at};
}
function mapImplementationReview(row:ImplementationReviewRow,requirements:readonly ImplementationRequirementRow[]):ImplementationReviewView {
  return{reviewResultId:row.review_result_id,runtimeResultId:row.runtime_result_id,implementationRunId:row.implementation_run_id,
    projectId:row.project_id,projectRevision:row.project_revision,reviewJobId:row.review_job_id,
    implementationResultId:row.implementation_result_id,role:row.role,outcome:row.outcome,objectRef:row.result_object_ref,
    digest:row.result_digest,requirements:requirements.map(item=>({code:item.requirement_code,ref:item.requirement_ref})),
    createdAt:row.created_at,acceptedAt:row.accepted_at};
}
function sameExecutorResult(row:ImplementationRunRow,result:ImplementationExecutorResult):boolean {
  if(!sameUuid(row.implementation_result_id,result.implementationResultId)||!sameUuid(row.runtime_result_id,result.runtimeResultId??null)
     ||row.project_id.toLowerCase()!==result.projectId.toLowerCase()||row.project_revision!==result.projectRevision
     ||!sameUuid(row.executor_job_id,result.executorJobId)||!sameUuid(row.agent_id,result.agentId)
     ||row.agent_key!==result.agentKey||row.agent_version!==result.agentVersion||row.summary!==result.summary
     ||row.executor_status!==result.status||row.executor_created_at?.getTime()!==result.createdAt.getTime())return false;
  return sameArtifacts(storedArtifacts(row.artifacts),result.artifacts);
}
function sameReviewResult(row:ImplementationReviewRow,requirements:readonly ImplementationRequirementRow[],result:ImplementationReviewResult):boolean {
  return sameUuid(row.review_result_id,result.reviewResultId)&&sameUuid(row.runtime_result_id,result.runtimeResultId)
    &&row.project_id.toLowerCase()===result.projectId.toLowerCase()&&row.project_revision===result.projectRevision
    &&sameUuid(row.review_job_id,result.reviewJobId)&&sameUuid(row.implementation_result_id,result.implementationResultId)
    &&row.role===result.role&&row.outcome===result.outcome&&row.result_object_ref===result.objectRef&&row.result_digest===result.digest
    &&row.created_at.getTime()===result.createdAt.getTime()
    &&sameRequirements(requirements.map(item=>({code:item.requirement_code,ref:item.requirement_ref})),result.requirements);
}
function storedArtifacts(value:unknown):readonly SyntheticImplementationArtifact[] {
  if(!Array.isArray(value))throw new Error("IMPLEMENTATION_PERSISTENCE_INTEGRITY_ERROR");
  return value.map(item=>{
    if(!item||typeof item!=="object"||typeof (item as {objectRef?:unknown}).objectRef!=="string"||typeof (item as {digest?:unknown}).digest!=="string")throw new Error("IMPLEMENTATION_PERSISTENCE_INTEGRITY_ERROR");
    return{objectRef:(item as {objectRef:string}).objectRef,digest:(item as {digest:string}).digest};
  });
}
function sameArtifacts(left:readonly SyntheticImplementationArtifact[],right:readonly SyntheticImplementationArtifact[]):boolean {
  const normalize=(items:readonly SyntheticImplementationArtifact[])=>items.map(item=>`${item.objectRef}\0${item.digest}`).sort();
  const a=normalize(left),b=normalize(right);return a.length===b.length&&a.every((item,index)=>item===b[index]);
}
function sameUuid(left:string|null|undefined,right:string|null|undefined):boolean {
  return left===null||left===undefined||right===null||right===undefined?left===right:left.toLowerCase()===right.toLowerCase();
}
function sameRequirements(left:readonly PlanningRequirementInput[],right:readonly PlanningRequirementInput[]):boolean {
  const normalize=(items:readonly PlanningRequirementInput[])=>items.map(item=>`${item.code}\0${item.ref}`).sort();const a=normalize(left),b=normalize(right);return a.length===b.length&&a.every((item,index)=>item===b[index]);
}
function stableUuid(value:string):string {
  const hex=createHash("sha256").update(value).digest("hex").slice(0,32).split("");hex[12]="4";hex[16]=(["8","9","a","b"] as const)[Number.parseInt(hex[16]!,16)%4]!;
  return`${hex.slice(0,8).join("")}-${hex.slice(8,12).join("")}-${hex.slice(12,16).join("")}-${hex.slice(16,20).join("")}-${hex.slice(20).join("")}`;
}
