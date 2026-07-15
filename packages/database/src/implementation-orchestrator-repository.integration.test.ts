import { createHash,randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { canonicalAgentOperationDigest,FakeAgentRuntime,type AgentResult,type AgentTask } from "@software-builder/agent-runtime";
import type {
  ImplementationExecutorResult,ImplementationJobRole,ImplementationReviewOutcome,ImplementationReviewResult,
  ImplementationReviewRole,ImplementationStatusView,PlanningJobResult,PlanningJobRole,PlanningStatusView,
} from "@software-builder/workflow-engine";
import { AgentJobRepository,HmacCapabilityAuthority,PostgresDatabase,PostgresPlanningOrchestratorRepository,PostgresProjectContextIssuer } from "./index.js";
import { migrate,resetDatabase } from "./migrations.js";

const adminUrl=process.env.TEST_DATABASE_URL;
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const fixedCreatedAt=new Date("2026-07-15T12:00:00.000Z");
const upperUuid=(value:string)=>value.toUpperCase();
const waitForDatabaseQuiescence=async(pool:Pool,timeoutMs=5_000)=>{const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){const active=await pool.query<{count:string}>("SELECT count(*) count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()");if(Number(active.rows[0]!.count)===0)return;await new Promise(resolve=>setTimeout(resolve,5));}throw new Error("Timed out waiting for test database quiescence");};
type Role=PlanningJobRole|ImplementationJobRole;

describe("Implementation Orchestrator PostgreSQL integration",()=>{
  let admin:Pool;let orchestrator:PostgresPlanningOrchestratorRepository;let runtimeJobs:AgentJobRepository;let database:PostgresDatabase;let authority:HmacCapabilityAuthority;let runtimeUrl:string;
  const versions=new Map<Role,number>();
  const registryIdentity=new Map<Role,{agentId:string;agentKey:string}>();

  beforeAll(async()=>{
    if(!adminUrl)throw new Error("TEST_DATABASE_URL ist fuer Implementation-Orchestrator-Integration verpflichtend; Skips sind nicht zulaessig.");
    const parsed=new URL(adminUrl);if(!parsed.pathname.toLowerCase().endsWith("_test"))throw new Error("TEST_DATABASE_URL muss auf _test enden.");
    admin=new Pool({connectionString:adminUrl});await waitForDatabaseQuiescence(admin);await resetDatabase(admin,{connectionString:adminUrl,environment:"test"});expect(await migrate(admin)).toEqual([]);
    await admin.query("SELECT builder.provision_runtime_password('implementation-runtime-integration-only-123')");await admin.query("SELECT builder.provision_context_password('implementation-context-integration-only-123')");
    parsed.username="builder_app_login";parsed.password="implementation-runtime-integration-only-123";runtimeUrl=parsed.toString();const contextUrl=new URL(parsed);contextUrl.username="builder_context_login";contextUrl.password="implementation-context-integration-only-123";authority=new HmacCapabilityAuthority();database=await PostgresDatabase.connectRuntime(runtimeUrl,await PostgresProjectContextIssuer.connect(contextUrl.toString()),authority,authority);
    orchestrator=PostgresPlanningOrchestratorRepository.forTestHarness(admin);runtimeJobs=new AgentJobRepository(admin);
    for(const role of ["PLANNER","ARCHITECT","EXECUTOR","QA","REVIEWER","SECURITY","LEGAL_DE_EU"] as const)await activateRole(role);
  },30_000);

  afterAll(async()=>{await database?.close();if(admin){await admin.end();const cleanup=new Pool({connectionString:adminUrl!});try{await waitForDatabaseQuiescence(cleanup);await resetDatabase(cleanup,{connectionString:adminUrl!,environment:"test"});}finally{await cleanup.end();}}},30_000);

  async function activateRole(role:Role):Promise<void>{
    let identity=registryIdentity.get(role);if(!identity){identity={agentId:randomUUID(),agentKey:`implementation-${role.toLowerCase().replaceAll("_","-")}`};registryIdentity.set(role,identity);await admin.query("INSERT INTO builder.agent_registry_identities(agent_key,agent_id,created_by) VALUES($1,$2,'implementation-integration')",[identity.agentKey,identity.agentId]);}
    const version=(versions.get(role)??0)+1;versions.set(role,version);
    await admin.query(`INSERT INTO builder.agent_registry_versions(agent_id,agent_key,display_name,role,description,version,revision,status,instructions,allowed_capabilities,forbidden_capabilities,created_by)
      VALUES($1,$2,$3,$4,'Synthetic implementation integration agent.',$5,$5,'ACTIVE','Process only synthetic Development data.',ARRAY['implementation.synthetic'],ARRAY['production.deploy','github.write'],'implementation-integration')`,[identity.agentId,identity.agentKey,`Synthetic ${role}`,role,version]);
  }
  async function retireRole(role:Role):Promise<void>{const identity=registryIdentity.get(role)!;await admin.query("UPDATE builder.agent_registry_versions SET status='RETIRED' WHERE agent_key=$1 AND status='ACTIVE'",[identity.agentKey]);}
  async function newProject(label:string):Promise<{projectId:string;revision:string}>{const projectId=randomUUID();const revision=digest(`implementation-revision:${label}`);await admin.query("INSERT INTO builder.projects(id,project_type,status) VALUES($1,'FULL_STACK_WEB','PLANNING')",[projectId]);return{projectId,revision};}

  async function completeTechnicalJob(backgroundJobId:string,scenario:AgentTask["scenario"]="SUCCESS"):Promise<{runtime:AgentResult;runtimeResultId:string}>{
    const claim=await runtimeJobs.claimNext(`implementation-worker-${randomUUID()}`,`claim-${randomUUID()}`,120_000);if(!claim||claim.jobId!==backgroundJobId)throw new Error(`Unexpected runtime claim; wanted ${backgroundJobId}, received ${claim?.jobId}`);
    const task={...claim.task,scenario};
    const command={runId:task.runId,projectId:task.projectId,taskId:task.taskId,attemptId:task.attemptId,idempotencyKey:`start-${claim.jobId}-${claim.fencingToken}`,requestDigest:canonicalAgentOperationDigest("startRun",task),fencingToken:claim.fencingToken,task};
    const runtime=(await new FakeAgentRuntime({now:()=>fixedCreatedAt}).startRun(command)).result;if(!runtime)throw new Error("Fake runtime did not produce a terminal result");
    await runtimeJobs.complete({jobId:claim.jobId,workerId:claim.workerId,claimId:claim.claimId,fencingToken:claim.fencingToken},runtime,randomUUID());
    const runtimeResultId=(await admin.query<{agent_result_id:string}>("SELECT agent_result_id FROM builder.background_jobs WHERE id=$1",[claim.jobId])).rows[0]!.agent_result_id;
    return{runtime,runtimeResultId};
  }

  async function completePlanningRole(status:PlanningStatusView,role:PlanningJobRole):Promise<PlanningJobResult>{
    const job=(await orchestrator.listPlanningJobs(status.projectId,status.planningRunId)).find(item=>item.role===role);if(!job)throw new Error(`Missing planning ${role}`);
    const completed=await completeTechnicalJob(job.backgroundJobId);const artifact=completed.runtime.artifacts[0]!;
    return{jobId:job.id,runtimeResultId:completed.runtimeResultId,projectRevision:status.projectRevision,outcome:"PASS",objectRef:artifact.objectRef,digest:artifact.digest,requirements:[]};
  }
  async function planningAwaitingOwner(label:string):Promise<PlanningStatusView>{
    const input=await newProject(label);let status=await orchestrator.startPlanning(input.projectId,input.revision,"synthetic-owner");
    status=await orchestrator.handleJobResult(input.projectId,status.planningRunId,await completePlanningRole(status,"PLANNER"));
    status=await orchestrator.handleJobResult(input.projectId,status.planningRunId,await completePlanningRole(status,"ARCHITECT"));
    const security=await completePlanningRole(status,"SECURITY");const legal=await completePlanningRole(status,"LEGAL_DE_EU");
    status=await orchestrator.handleJobResult(input.projectId,status.planningRunId,security);
    status=await orchestrator.handleJobResult(input.projectId,status.planningRunId,legal);expect(status.status).toBe("WAITING_FOR_OWNER_APPROVAL");return status;
  }
  async function ownerApprovedPlanning(label:string):Promise<PlanningStatusView>{const waiting=await planningAwaitingOwner(label);return orchestrator.recordOwnerDecision(waiting.projectId,waiting.planningRunId,"APPROVE","synthetic-owner","synthetic-development-approval");}
  async function startReadyImplementation(label:string):Promise<ImplementationStatusView>{const planning=await ownerApprovedPlanning(label);return orchestrator.startImplementation(planning.projectId,planning.planningRunId,planning.projectRevision,"synthetic-owner");}

  async function executorProjection(status:ImplementationStatusView,terminal:"SUCCEEDED"|"FAILED"|"CANCELLED"="SUCCEEDED"):Promise<ImplementationExecutorResult>{
    const job=(await orchestrator.listImplementationJobs(status.projectId,status.implementationRunId)).find(item=>item.role==="EXECUTOR");if(!job)throw new Error("Missing executor job");
    if(terminal==="CANCELLED"){
      await runtimeJobs.requestCancel(job.backgroundJobId);
      return{implementationResultId:randomUUID(),projectId:status.projectId,projectRevision:status.projectRevision,executorJobId:job.id,
        agentId:job.assignment.agentId,agentKey:job.assignment.agentKey,agentVersion:job.assignment.agentVersion,artifacts:[],summary:"Synthetic implementation cancelled.",createdAt:fixedCreatedAt,status:"CANCELLED"};
    }
    const completed=await completeTechnicalJob(job.backgroundJobId,terminal==="FAILED"?"ERROR":"SUCCESS");
    return{implementationResultId:randomUUID(),runtimeResultId:completed.runtimeResultId,projectId:status.projectId,projectRevision:status.projectRevision,executorJobId:job.id,
      agentId:job.assignment.agentId,agentKey:job.assignment.agentKey,agentVersion:job.assignment.agentVersion,
      artifacts:terminal==="SUCCEEDED"?completed.runtime.artifacts.map(artifact=>({objectRef:artifact.objectRef,digest:artifact.digest})):[],
      summary:terminal==="SUCCEEDED"?"Synthetic implementation completed.":"Synthetic implementation failed.",createdAt:fixedCreatedAt,status:terminal};
  }
  async function throughExecutor(label:string):Promise<{status:ImplementationStatusView;executor:ImplementationExecutorResult}>{let status=await startReadyImplementation(label);const executor=await executorProjection(status);status=await orchestrator.handleExecutorResult(status.projectId,status.implementationRunId,executor);expect(status.status).toBe("IMPLEMENTATION_REVIEW");return{status,executor};}

  async function completeReviewRuntimes(status:ImplementationStatusView,implementationResultId:string):Promise<Map<ImplementationReviewRole,ImplementationReviewResult>>{
    const output=new Map<ImplementationReviewRole,ImplementationReviewResult>();
    for(const role of ["QA","REVIEWER","SECURITY","LEGAL_DE_EU"] as const){
      const job=(await orchestrator.listImplementationJobs(status.projectId,status.implementationRunId)).find(item=>item.role===role);if(!job)throw new Error(`Missing review ${role}`);
      const completed=await completeTechnicalJob(job.backgroundJobId);const artifact=completed.runtime.artifacts[0]!;
      output.set(role,{reviewResultId:randomUUID(),runtimeResultId:completed.runtimeResultId,projectId:status.projectId,projectRevision:status.projectRevision,
        reviewJobId:job.id,implementationResultId,role,outcome:"PASS",objectRef:artifact.objectRef,digest:artifact.digest,requirements:[],createdAt:fixedCreatedAt});
    }
    return output;
  }
  const withOutcome=(result:ImplementationReviewResult,outcome:ImplementationReviewOutcome,requirements:ImplementationReviewResult["requirements"]=result.requirements):ImplementationReviewResult=>({...result,outcome,requirements});
  async function submitFour(status:ImplementationStatusView,results:Map<ImplementationReviewRole,ImplementationReviewResult>,outcomes:Partial<Record<ImplementationReviewRole,ImplementationReviewOutcome>>={}):Promise<ImplementationStatusView>{
    await Promise.all((["QA","REVIEWER","SECURITY","LEGAL_DE_EU"] as const).map(role=>orchestrator.handleImplementationReviewResult(status.projectId,status.implementationRunId,withOutcome(results.get(role)!,outcomes[role]??results.get(role)!.outcome))));
    return orchestrator.getImplementationStatus(status.projectId,status.implementationRunId);
  }

  it("uses the existing capability transaction and forced project RLS for implementation state",async()=>{
    const planning=await ownerApprovedPlanning("capability-rls");const capability=authority.issueProject(planning.projectId as never,{subject:"synthetic-owner",actorScope:"PLANNING_OWNER",allowedRoles:["PLANNING_OWNER"],allowedOperations:["planning:read","planning:append"]},120_000);const scoped=await database.createPlanningOrchestrator(capability);
    const status=await scoped.startImplementation(planning.projectId,planning.planningRunId,planning.projectRevision,"synthetic-owner");expect((await scoped.listImplementationJobs(status.projectId,status.implementationRunId)).map(job=>job.role)).toEqual(["EXECUTOR"]);
    const naked=new Pool({connectionString:runtimeUrl});try{expect(Number((await naked.query<{count:string}>("SELECT count(*) count FROM builder.implementation_runs")).rows[0]!.count)).toBe(0);}finally{await naked.end();}
    await runtimeJobs.requestCancel((await scoped.listImplementationJobs(status.projectId,status.implementationRunId))[0]!.backgroundJobId);
  });

  it("runs concurrently and idempotently from READY_FOR_IMPLEMENTATION through exactly four reviews to READY_FOR_DELIVERY",async()=>{
    const planning=await ownerApprovedPlanning("happy-parallel");const starts=await Promise.all([
      orchestrator.startImplementation(planning.projectId,planning.planningRunId,planning.projectRevision,"synthetic-owner"),
      orchestrator.startImplementation(planning.projectId,planning.planningRunId,planning.projectRevision,"synthetic-owner"),
    ]);expect(starts[0]).toEqual(starts[1]);expect(await orchestrator.startImplementation(upperUuid(planning.projectId),upperUuid(planning.planningRunId),planning.projectRevision,"synthetic-owner")).toEqual(starts[0]);let status=starts[0]!;expect(status.status).toBe("IMPLEMENTING");expect((await orchestrator.listImplementationJobs(status.projectId,status.implementationRunId).then(items=>items.filter(item=>item.role==="EXECUTOR")))).toHaveLength(1);
    const executor=await executorProjection(status);const duplicateExecutor=await Promise.all([
      orchestrator.handleExecutorResult(status.projectId,status.implementationRunId,executor),orchestrator.handleExecutorResult(status.projectId,status.implementationRunId,executor),
    ]);status=duplicateExecutor[0]!;expect(status.status).toBe("IMPLEMENTATION_REVIEW");const uppercaseExecutor={...executor,implementationResultId:upperUuid(executor.implementationResultId),runtimeResultId:upperUuid(executor.runtimeResultId!),projectId:upperUuid(executor.projectId),executorJobId:upperUuid(executor.executorJobId),agentId:upperUuid(executor.agentId)};expect(await orchestrator.handleExecutorResult(upperUuid(status.projectId),upperUuid(status.implementationRunId),uppercaseExecutor)).toEqual(status);const jobs=await orchestrator.listImplementationJobs(status.projectId,status.implementationRunId);expect(jobs.map(job=>job.role)).toEqual(["EXECUTOR","QA","REVIEWER","SECURITY","LEGAL_DE_EU"]);expect(new Set(jobs.slice(1).map(job=>job.executorResultId))).toEqual(new Set([executor.implementationResultId]));
    const reviews=await completeReviewRuntimes(status,executor.implementationResultId);status=await submitFour(status,reviews);expect(status.status).toBe("READY_FOR_DELIVERY");expect(await orchestrator.listImplementationReviews(status.projectId,status.implementationRunId)).toHaveLength(4);
    const qa=reviews.get("QA")!;const uppercaseQa={...qa,reviewResultId:upperUuid(qa.reviewResultId),runtimeResultId:upperUuid(qa.runtimeResultId),projectId:upperUuid(qa.projectId),reviewJobId:upperUuid(qa.reviewJobId),implementationResultId:upperUuid(qa.implementationResultId)};expect(await orchestrator.handleImplementationReviewResult(upperUuid(status.projectId),upperUuid(status.implementationRunId),uppercaseQa)).toEqual(status);
    await expect(admin.query("UPDATE builder.implementation_executor_results SET summary='mutated' WHERE implementation_result_id=$1",[executor.implementationResultId])).rejects.toThrow();
    await expect(admin.query("UPDATE builder.implementation_runs SET status='IMPLEMENTING' WHERE id=$1",[status.implementationRunId])).rejects.toThrow("terminal implementation run is immutable");
  });

  it("rejects missing owner approval, a wrong revision, and contradictory starts fail-closed",async()=>{
    const waiting=await planningAwaitingOwner("owner-required");await expect(orchestrator.startImplementation(waiting.projectId,waiting.planningRunId,waiting.projectRevision,"synthetic-owner")).rejects.toThrow("IMPLEMENTATION_OWNER_APPROVAL_REQUIRED");
    const planning=await ownerApprovedPlanning("revision-required");await expect(orchestrator.startImplementation(planning.projectId,planning.planningRunId,"f".repeat(64),"synthetic-owner")).rejects.toThrow("IMPLEMENTATION_PROJECT_REVISION_MISMATCH");
    const first=await orchestrator.startImplementation(planning.projectId,planning.planningRunId,planning.projectRevision,"synthetic-owner");await expect(orchestrator.startImplementation(planning.projectId,planning.planningRunId,planning.projectRevision,"different-owner")).rejects.toThrow("IMPLEMENTATION_START_CONFLICT");await runtimeJobs.requestCancel((await orchestrator.listImplementationJobs(first.projectId,first.implementationRunId))[0]!.backgroundJobId);
  });

  it("stores a Development blocker without partial state when the active Executor is missing",async()=>{
    const planning=await ownerApprovedPlanning("missing-executor");await retireRole("EXECUTOR");try{const status=await orchestrator.startImplementation(planning.projectId,planning.planningRunId,planning.projectRevision,"synthetic-owner");expect(status).toMatchObject({status:"BLOCKED",blockCode:"NO_ACTIVE_AGENT_VERSION",blockRole:"EXECUTOR"});expect(await orchestrator.listImplementationJobs(status.projectId,status.implementationRunId)).toHaveLength(0);expect((await admin.query("SELECT 1 FROM builder.agent_runtime_tasks WHERE project_id=$1 AND role='EXECUTOR'",[status.projectId])).rowCount).toBe(0);}finally{await activateRole("EXECUTOR");}
  });

  it("persists Executor success but creates none of the four review jobs when one review agent is unavailable",async()=>{
    let status=await startReadyImplementation("missing-review-agent");const executor=await executorProjection(status);await retireRole("LEGAL_DE_EU");try{status=await orchestrator.handleExecutorResult(status.projectId,status.implementationRunId,executor);expect(status).toMatchObject({status:"BLOCKED",blockCode:"NO_ACTIVE_AGENT_VERSION",blockRole:"LEGAL_DE_EU",executorResult:{implementationResultId:executor.implementationResultId}});expect((await orchestrator.listImplementationJobs(status.projectId,status.implementationRunId)).map(job=>job.role)).toEqual(["EXECUTOR"]);expect((await admin.query("SELECT 1 FROM builder.agent_runtime_tasks WHERE project_id=$1 AND input_ref LIKE 'implementation/%/review/%'",[status.projectId])).rowCount).toBe(0);}finally{await activateRole("LEGAL_DE_EU");}
  });

  it.each(["FAILED","CANCELLED"] as const)("makes Executor %s terminal without review jobs",async terminal=>{let status=await startReadyImplementation(`executor-${terminal}`);const result=await executorProjection(status,terminal);status=await orchestrator.handleExecutorResult(status.projectId,status.implementationRunId,result);expect(status.status).toBe(terminal==="FAILED"?"IMPLEMENTATION_FAILED":"IMPLEMENTATION_CANCELLED");expect(await orchestrator.listImplementationJobs(status.projectId,status.implementationRunId)).toHaveLength(1);expect((await orchestrator.resumeImplementation(status.projectId,status.implementationRunId)).status).toBe(status.status);});

  it.each(["QA","REVIEWER"] as const)("makes %s CHANGES_REQUESTED terminal without a repair Executor",async role=>{const flow=await throughExecutor(`changes-${role}`);const reviews=await completeReviewRuntimes(flow.status,flow.executor.implementationResultId);const status=await submitFour(flow.status,reviews,{[role]:"CHANGES_REQUESTED"});expect(status.status).toBe("CHANGES_REQUESTED");expect((await orchestrator.listImplementationJobs(status.projectId,status.implementationRunId)).filter(job=>job.role==="EXECUTOR")).toHaveLength(1);});

  it.each(["SECURITY","LEGAL_DE_EU"] as const)("makes %s BLOCK terminal only after the four-result barrier",async role=>{const flow=await throughExecutor(`block-${role}`);const reviews=await completeReviewRuntimes(flow.status,flow.executor.implementationResultId);for(const pendingRole of ["QA","REVIEWER","SECURITY"] as const){if(pendingRole!==role)await orchestrator.handleImplementationReviewResult(flow.status.projectId,flow.status.implementationRunId,reviews.get(pendingRole)!);}let status=await orchestrator.getImplementationStatus(flow.status.projectId,flow.status.implementationRunId);expect(status.status).toBe("IMPLEMENTATION_REVIEW");const remaining=role==="SECURITY"?"LEGAL_DE_EU":role;const submitted=new Set((await orchestrator.listImplementationReviews(status.projectId,status.implementationRunId)).map(item=>item.role));for(const candidate of [role,remaining] as const)if(!submitted.has(candidate))status=await orchestrator.handleImplementationReviewResult(status.projectId,status.implementationRunId,withOutcome(reviews.get(candidate)!,candidate===role?"BLOCK":"PASS"));expect(status).toMatchObject({status:"BLOCKED",blockCode:"REVIEW_BLOCK",blockRole:role});});

  it("persists minimized PASS_WITH_REQUIREMENTS and seals it with the review result",async()=>{const flow=await throughExecutor("requirements");const reviews=await completeReviewRuntimes(flow.status,flow.executor.implementationResultId);const legal=withOutcome(reviews.get("LEGAL_DE_EU")!,"PASS_WITH_REQUIREMENTS",[{code:"NOTICE_REQUIRED",ref:"synthetic/legal/notice"},{code:"RETENTION_LIMIT",ref:"synthetic/privacy/retention"}]);reviews.set("LEGAL_DE_EU",legal);const status=await submitFour(flow.status,reviews);expect(status.status).toBe("READY_FOR_DELIVERY");const stored=(await orchestrator.listImplementationReviews(status.projectId,status.implementationRunId)).find(item=>item.role==="LEGAL_DE_EU")!;expect(stored.requirements).toEqual(legal.requirements);await expect(admin.query("INSERT INTO builder.implementation_review_requirements(project_id,implementation_run_id,review_result_id,review_job_id,requirement_code,requirement_ref) VALUES($1,$2,$3,$4,'LATE_APPEND','synthetic/legal/late')",[status.projectId,status.implementationRunId,stored.reviewResultId,stored.reviewJobId])).rejects.toThrow("implementation requirements can only be staged before");await expect(admin.query("DELETE FROM builder.implementation_review_requirements WHERE review_result_id=$1",[stored.reviewResultId])).rejects.toThrow();});

  it("never treats a missing review as PASS and rejects a review bound to another executor result",async()=>{const flow=await throughExecutor("missing-and-wrong-review");const reviews=await completeReviewRuntimes(flow.status,flow.executor.implementationResultId);await expect(orchestrator.handleImplementationReviewResult(flow.status.projectId,flow.status.implementationRunId,{...reviews.get("QA")!,implementationResultId:randomUUID()})).rejects.toThrow("IMPLEMENTATION_REVIEW_BINDING_MISMATCH");for(const role of ["QA","REVIEWER","SECURITY"] as const)await orchestrator.handleImplementationReviewResult(flow.status.projectId,flow.status.implementationRunId,reviews.get(role)!);const status=await orchestrator.getImplementationStatus(flow.status.projectId,flow.status.implementationRunId);expect(status.status).toBe("IMPLEMENTATION_REVIEW");expect(await orchestrator.listImplementationReviews(status.projectId,status.implementationRunId)).toHaveLength(3);});

  it("applies BLOCK over concurrent CHANGES_REQUESTED and cannot let PASS win the terminal state",async()=>{const flow=await throughExecutor("priority-race");const reviews=await completeReviewRuntimes(flow.status,flow.executor.implementationResultId);const outcomes={QA:"CHANGES_REQUESTED",SECURITY:"BLOCK"} as const;const status=await submitFour(flow.status,reviews,outcomes);expect(status).toMatchObject({status:"BLOCKED",blockRole:"SECURITY"});await expect(orchestrator.handleImplementationReviewResult(status.projectId,status.implementationRunId,{...reviews.get("SECURITY")!,outcome:"PASS"})).rejects.toThrow("IMPLEMENTATION_REVIEW_RESULT_CONFLICT");expect((await orchestrator.getImplementationStatus(status.projectId,status.implementationRunId)).status).toBe("BLOCKED");});

  it("restarts from persistent state, resumes an authorized missing Executor, and preserves assignment snapshots",async()=>{const planning=await ownerApprovedPlanning("resume-missing-executor");const implementationRunId=randomUUID();await admin.query("INSERT INTO builder.implementation_runs(id,project_id,planning_run_id,project_revision,status,requested_by) VALUES($1,$2,$3,$4,'IMPLEMENTING','synthetic-owner')",[implementationRunId,planning.projectId,planning.planningRunId,planning.projectRevision]);const restarted=PostgresPlanningOrchestratorRepository.forTestHarness(admin);let status=await restarted.resumeImplementation(planning.projectId,implementationRunId);let jobs=await restarted.listImplementationJobs(status.projectId,status.implementationRunId);expect(jobs.map(job=>job.role)).toEqual(["EXECUTOR"]);const binding=jobs[0]!.assignment;expect((await restarted.resumeImplementation(status.projectId,status.implementationRunId)).status).toBe("IMPLEMENTING");expect(await restarted.listImplementationJobs(status.projectId,status.implementationRunId)).toHaveLength(1);await retireRole("EXECUTOR");await activateRole("EXECUTOR");jobs=await restarted.listImplementationJobs(status.projectId,status.implementationRunId);expect(jobs[0]!.assignment).toEqual(binding);const executor=await executorProjection(status);status=await restarted.handleExecutorResult(status.projectId,status.implementationRunId,executor);expect(status.status).toBe("IMPLEMENTATION_REVIEW");expect(await PostgresPlanningOrchestratorRepository.forTestHarness(admin).resumeImplementation(status.projectId,status.implementationRunId)).toEqual(status);expect(await restarted.listImplementationJobs(status.projectId,status.implementationRunId)).toHaveLength(5);for(const job of (await restarted.listImplementationJobs(status.projectId,status.implementationRunId)).slice(1))await completeTechnicalJob(job.backgroundJobId);});

  it("rolls an unknown AFTER INSERT database error back without any run, runtime, assignment, or outbox partial state",async()=>{
    const planning=await ownerApprovedPlanning("transaction-rollback");
    const before=(await admin.query<{runtime_tasks:string;background_jobs:string;assignments:string;outbox:string}>(`SELECT
      (SELECT count(*) FROM builder.agent_runtime_tasks WHERE project_id=$1)::text runtime_tasks,
      (SELECT count(*) FROM builder.background_jobs WHERE project_id=$1)::text background_jobs,
      (SELECT count(*) FROM builder.agent_assignments WHERE project_id=$1)::text assignments,
      (SELECT count(*) FROM builder.outbox_events WHERE project_id=$1)::text outbox`,[planning.projectId])).rows[0]!;
    await admin.query("CREATE FUNCTION builder.test_fail_implementation_job_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_IMPLEMENTATION_POST_MUTATION_FAILURE'; END $$");
    try{
      await admin.query("CREATE TRIGGER test_fail_implementation_job_insert AFTER INSERT ON builder.implementation_jobs FOR EACH ROW WHEN (NEW.project_id=$$"+planning.projectId+"$$::uuid) EXECUTE FUNCTION builder.test_fail_implementation_job_insert()");
      await expect(orchestrator.startImplementation(planning.projectId,planning.planningRunId,planning.projectRevision,"synthetic-owner")).rejects.toThrow("SYNTHETIC_IMPLEMENTATION_POST_MUTATION_FAILURE");
      expect((await admin.query("SELECT 1 FROM builder.implementation_runs WHERE project_id=$1",[planning.projectId])).rowCount).toBe(0);
      expect((await admin.query("SELECT 1 FROM builder.implementation_jobs WHERE project_id=$1",[planning.projectId])).rowCount).toBe(0);
      const after=(await admin.query<{runtime_tasks:string;background_jobs:string;assignments:string;outbox:string}>(`SELECT
        (SELECT count(*) FROM builder.agent_runtime_tasks WHERE project_id=$1)::text runtime_tasks,
        (SELECT count(*) FROM builder.background_jobs WHERE project_id=$1)::text background_jobs,
        (SELECT count(*) FROM builder.agent_assignments WHERE project_id=$1)::text assignments,
        (SELECT count(*) FROM builder.outbox_events WHERE project_id=$1)::text outbox`,[planning.projectId])).rows[0]!;
      expect(after).toEqual(before);
    }finally{await admin.query("DROP TRIGGER IF EXISTS test_fail_implementation_job_insert ON builder.implementation_jobs");await admin.query("DROP FUNCTION IF EXISTS builder.test_fail_implementation_job_insert()");}
  });
});
