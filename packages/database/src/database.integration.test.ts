import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname,join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectId } from "@software-builder/core";
import { canonicalAgentOperationDigest, FakeAgentRuntime, type AgentTask } from "@software-builder/agent-runtime";
import { AgentJobLeaseLostError, AgentJobRepository, HmacCapabilityAuthority, PostgresDatabase, PostgresProjectContextIssuer } from "./index.js";
import { migrate, resetDatabase } from "./migrations.js";

const adminUrl = process.env.TEST_DATABASE_URL;
const integration = describe;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const command = (key: string, aggregateId: string, state = "CREATED",aggregateType="PROJECT") => ({ actorScope: "INTEGRATION_TEST",actorIdentityId: "integration-test",idempotencyKey: key,requestDigest: digest(key),aggregateType,aggregateId,transition: "TEST_TRANSITION",newState: state,reasonCode: "INTEGRATION_TEST",policyVersion: "test-policy-1",eventType: "TEST_EVENT",schemaVersion: 1 });

integration("PostgreSQL-18-Integration", () => {
  let admin: Pool; let runtime:Pool; let db: PostgresDatabase; let authority: HmacCapabilityAuthority; let processRuntimeUrl:string;let processContextUrl:string;
  const projects: ProjectId[] = [];
  beforeAll(async () => {
    if(!adminUrl)throw new Error("TEST_DATABASE_URL ist fuer diesen Meilenstein verpflichtend; Skips sind nicht zulaessig.");
    const parsed = new URL(adminUrl!);
    if (!parsed.pathname.toLowerCase().endsWith("_test")) throw new Error("TEST_DATABASE_URL muss auf _test enden.");
    admin = new Pool({ connectionString: adminUrl });
    expect(Number((await admin.query<{ server_version_num: string }>("SHOW server_version_num")).rows[0]!.server_version_num)).toBeGreaterThanOrEqual(180000);
    await resetDatabase(admin,{ connectionString: adminUrl!,environment: "test" }); expect(await migrate(admin)).toEqual([]);
    await admin.query("SELECT builder.provision_runtime_password('integration-only-not-a-real-secret-123')");
    await admin.query("SELECT builder.provision_context_password('integration-context-only-not-real-123')");
    parsed.username="builder_app_login"; parsed.password="integration-only-not-a-real-secret-123";
    const contextUrl=new URL(parsed); contextUrl.username="builder_context_login";contextUrl.password="integration-context-only-not-real-123";
    processRuntimeUrl=parsed.toString();processContextUrl=contextUrl.toString();
    runtime=new Pool({connectionString:processRuntimeUrl}); authority = new HmacCapabilityAuthority(); const issuer=await PostgresProjectContextIssuer.connect(processContextUrl); db = await PostgresDatabase.connectRuntime(processRuntimeUrl,issuer,authority,authority);
  },30_000);
  afterAll(async () => { await db?.close(); await runtime?.end(); if(admin){await resetDatabase(admin,{connectionString:adminUrl!,environment:"test"});await admin.end();} });

  async function createProject(): Promise<{ id: ProjectId; capability: ReturnType<HmacCapabilityAuthority["issueProject"]> }> {
    const id=randomUUID() as ProjectId; projects.push(id);
    await db.projects.create(authority.issueBootstrap("integration-test","INTEGRATION_TEST"),{id,status:"PLANNING"},command(`create-${id}`,id,"PLANNING"));
    return {id,capability:authority.issueProject(id,{subject:"integration-test",actorScope:"INTEGRATION_TEST",allowedRoles:["INTEGRATION_TEST"],allowedOperations:["project:read","project_brief:read","project_brief:append","decision:append","attempt:append","audit_event:verify"]})};
  }

  it("verweigert Migrator-Pools und isoliert forged/swapped/missing Capabilities",async () => {
    await expect(PostgresDatabase.connectRuntime(adminUrl!,{issueContext:async()=>"x",close:async()=>undefined},authority,authority)).rejects.toThrow(/Runtime-Identitaet/);
    const first=await createProject(); const second=await createProject();
    await expect(db.projects.findById("forged" as never)).rejects.toThrow(/Capability/);
    await expect(db.projects.findById(undefined as never)).rejects.toThrow();
    expect((await db.projects.findById(first.capability))?.id).toBe(first.id);
    expect(await db.projectBriefs.findById(first.capability,second.id)).toBeUndefined();
    const raw=await runtime.connect(); await raw.query("BEGIN"); try { await raw.query("SELECT set_config('builder.context_token_hash',$1,true)",[digest("forged")]); expect((await raw.query("SELECT count(*)::int count FROM builder.projects")).rows[0].count).toBe(0); await expect(raw.query("SELECT builder.append_audit_event($1,'TEST',$2,'forger','FORGED',NULL,'X','FORGED','1','forged')",[first.id,randomUUID()])).rejects.toThrow(); await raw.query("ROLLBACK"); await raw.query("BEGIN"); await expect(raw.query("INSERT INTO builder.audit_events(id,project_id,aggregate_type,aggregate_id,aggregate_sequence,actor_pseudonym,transition,new_state,reason_code,policy_version,idempotency_key,event_hash) VALUES(gen_random_uuid(),$1,'TEST',gen_random_uuid(),1,$2,'FORGED','X','X','1','x',$2)",[first.id,digest("x")])).rejects.toThrow(); } finally {await raw.query("ROLLBACK");raw.release();}
  });

  it("committet Mutation, Idempotency, Audit, Outbox und optionalen Job atomar",async () => {
    const {id,capability}=await createProject(); const entityId=randomUUID(); const envelope={...command(`brief-${id}`,entityId,"ACCEPTED","PROJECT_BRIEF"),enqueueJob:{jobType:"CONTROL",expectedAggregateVersion:1,traceId:randomUUID()}};
    const mutation={id:entityId,schemaVersion:1,classification:"SYNTHETIC_ONLY" as const,contentObjectRef:"object/synthetic-brief",status:"ACCEPTED" as const};
    expect((await db.projectBriefs.append(capability,envelope,mutation)).duplicate).toBe(false);
    expect((await db.projectBriefs.append(capability,envelope,mutation)).duplicate).toBe(true);
    await expect(db.projectBriefs.append(capability,{...envelope,requestDigest:digest("different")},mutation)).rejects.toThrow(/abweichendem Request-Digest/);
    const eventKey=digest(`${envelope.actorScope}\0${envelope.idempotencyKey}`); const counts=await admin.query<{ idem:number;audit:number;outbox:number;jobs:number }>(`SELECT
      (SELECT count(*)::int FROM builder.idempotency_records WHERE project_id=$1 AND idempotency_key=$2) idem,
      (SELECT count(*)::int FROM builder.audit_events WHERE project_id=$1 AND idempotency_key=$3) audit,
      (SELECT count(*)::int FROM builder.outbox_events WHERE project_id=$1 AND idempotency_key=$3) outbox,
      (SELECT count(*)::int FROM builder.background_jobs WHERE project_id=$1 AND idempotency_key=$3) jobs`,[id,envelope.idempotencyKey,eventKey]);
    expect(counts.rows[0]).toEqual({idem:1,audit:1,outbox:1,jobs:1});
    expect(await db.auditEvents.verifyChain(capability)).toBe(true);
    await expect(db.projectBriefs.append(capability,{...envelope,aggregateId:randomUUID() as string},mutation)).rejects.toThrow(/Mutation-ID/);
    const decisionId=randomUUID(); await expect(db.decisions.append(capability,{...command(`actor-mismatch-${id}`,decisionId,"CREATED","DECISION"),actorIdentityId:"swapped-actor"},{id:decisionId,subjectType:"TEST",subjectId:decisionId,decision:"PASS"})).rejects.toThrow(/Command-Actor/);
  });

  it("erzwingt lueckenlose immutable Audit-Hashketten und Rollback",async () => {
    const {id,capability}=await createProject(); const aggregate=randomUUID();
    await db.decisions.append(capability,command(`decision-1-${id}`,aggregate,"PASS","DECISION"),{id:aggregate,subjectType:"TEST",subjectId:aggregate,decision:"PASS"});
    const events=await admin.query<{aggregate_sequence:string;previous_event_hash:string|null;event_hash:string}>("SELECT aggregate_sequence,previous_event_hash,event_hash FROM builder.audit_events WHERE project_id=$1 AND aggregate_id=$2 ORDER BY aggregate_sequence",[id,aggregate]);
    expect(events.rows.map(row=>Number(row.aggregate_sequence))).toEqual([1]); expect(events.rows[0]!.previous_event_hash).toBeNull(); expect(await db.auditEvents.verifyChain(capability)).toBe(true);
    await expect(admin.query("DELETE FROM builder.audit_events WHERE project_id=$1 AND aggregate_id=$2",[id,aggregate])).rejects.toThrow(/append-only/);
    const invalidId=randomUUID(); await expect(db.attempts.append(capability,command(`bad-attempt-${id}`,invalidId,"CREATED","ATTEMPT"),{id:invalidId,taskId:randomUUID(),workflowRunId:randomUUID(),attemptKind:"REPAIR",ordinal:4,status:"CREATED"})).rejects.toThrow();
    expect(Number((await admin.query<{count:string}>("SELECT count(*) FROM builder.idempotency_records WHERE project_id=$1 AND idempotency_key=$2",[id,`bad-attempt-${id}`])).rows[0]!.count)).toBe(0);
  });

  const processWorker=join(dirname(fileURLToPath(import.meta.url)),"..","dist","persistent-process-worker.js");
  const agentProcessWorker=join(dirname(fileURLToPath(import.meta.url)),"..","..","..","apps","worker","dist","index.js");
  const runProcess=(mode:string,projectId:string,args:string[]=[] )=>new Promise<{code:number|null;result:{ok:boolean;duplicate?:boolean;phase?:string;version?:number;audits?:number;code?:string;job?:Record<string,unknown>;jobs?:Record<string,unknown>[]}}>((resolve,reject)=>{
    const child=spawn(process.execPath,[processWorker,mode,projectId,...args],{env:{...process.env,PROCESS_DATABASE_URL:processRuntimeUrl,PROCESS_CONTEXT_DATABASE_URL:processContextUrl},stdio:["ignore","pipe","pipe"]});let stdout="";let stderr="";
    child.stdout.on("data",chunk=>{stdout+=String(chunk);});child.stderr.on("data",chunk=>{stderr+=String(chunk);});child.on("error",reject);child.on("close",code=>{try{resolve({code,result:JSON.parse(stdout) as never});}catch{reject(new Error(`Process worker output invalid: ${stderr}`));}});
  });
  const runAgentProcess=(workerId:string)=>new Promise<{code:number|null;result:{ok:boolean;processed:boolean}}>((resolve,reject)=>{const child=spawn(process.execPath,[agentProcessWorker,"agent-once",workerId],{env:{...process.env,PROCESS_DATABASE_URL:adminUrl,AGENT_WORKER_TEST_MODE:"1"},stdio:["ignore","pipe","pipe"]});let stdout="";let stderr="";child.stdout.on("data",chunk=>{stdout+=String(chunk);});child.stderr.on("data",chunk=>{stderr+=String(chunk);});child.on("error",reject);child.on("close",code=>{try{resolve({code,result:JSON.parse(stdout) as never});}catch{reject(new Error(`Agent process output invalid: ${stdout} ${stderr}`));}});});
  const runAgentExit=(mode:string,workerId:string,extra:Record<string,string>={})=>new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{const child=spawn(process.execPath,[agentProcessWorker,mode,workerId],{env:{...process.env,PROCESS_DATABASE_URL:adminUrl,AGENT_WORKER_TEST_MODE:"1",...extra},stdio:["ignore","pipe","pipe"]});let stdout="";let stderr="";child.stdout.on("data",chunk=>{stdout+=String(chunk);});child.stderr.on("data",chunk=>{stderr+=String(chunk);});child.on("error",reject);child.on("close",code=>resolve({code,stdout,stderr}));});
  const startPollingAgent=(workerId:string,extra:Record<string,string>={})=>{const child=spawn(process.execPath,[agentProcessWorker,"agent-worker",workerId],{env:{...process.env,PROCESS_DATABASE_URL:adminUrl,AGENT_WORKER_TEST_MODE:"1",AGENT_WORKER_ENABLED:"1",...extra},stdio:["ignore","pipe","pipe"]});const ready=new Promise<void>((resolve,reject)=>{let output="";child.stdout.on("data",chunk=>{output+=String(chunk);if(output.includes("polling"))resolve();});child.on("error",reject);child.on("close",code=>{if(!output.includes("polling"))reject(new Error(`Polling worker exited before ready: ${code}`));});});return{child,ready};};
  const waitFor=async(assertion:()=>Promise<boolean>,timeoutMs=5000)=>{const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){if(await assertion())return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error("Timed out waiting for agent worker state");};
  const agentTask=(projectId:string,scenario:AgentTask["scenario"],runId=randomUUID()):AgentTask=>({schemaVersion:1,projectId,taskId:randomUUID(),attemptId:randomUUID(),runId,role:scenario==="SECURITY_BLOCK"?"SECURITY":scenario==="LEGAL_COUNSEL_REQUIRED"?"LEGAL":"EXECUTOR",scenario,inputRef:"synthetic/input",repairOrdinal:0});
  const enqueueAgent=async(repository:AgentJobRepository,task:AgentTask,maxRetries=2,key=`agent-${task.runId}`)=>repository.enqueue({task,messageId:randomUUID(),consumerIdentity:"agent-integration",idempotencyKey:key,requestDigest:canonicalAgentOperationDigest("enqueue",task),traceId:randomUUID(),maxRetries});

  it("ueberlebt einen Prozessneustart mit atomarem Audit, Inbox und Outbox",async()=>{
    const projectId=randomUUID();
    expect((await runProcess("create",projectId)).code).toBe(0);
    expect((await runProcess("transition",projectId,["restart-transition"])).result).toMatchObject({ok:true,duplicate:false,version:1});
    expect((await runProcess("read",projectId)).result).toMatchObject({ok:true,phase:"DISCOVERY",version:1,audits:1});
    const counts=(await admin.query<{transitions:number;outbox:number;inbox:number}>(`SELECT
      (SELECT count(*)::int FROM builder.workflow_transition_details WHERE project_id=$1) transitions,
      (SELECT count(*)::int FROM builder.outbox_events WHERE project_id=$1 AND event_type='WORKFLOW_TRANSITION') outbox,
      (SELECT count(*)::int FROM builder.inbox_events i WHERE project_id=$1 AND EXISTS(SELECT 1 FROM builder.outbox_events o WHERE o.project_id=i.project_id AND o.event_type='WORKFLOW_TRANSITION' AND i.message_id=$2)) inbox`,[projectId,stableInboxMessageId(`${projectId}:transition:1`)])).rows[0];
    expect(counts).toEqual({transitions:1,outbox:1,inbox:1});
  });

  it("serialisiert CAS und Idempotenz ueber mindestens zwei Prozesse",async()=>{
    const casProject=randomUUID();expect((await runProcess("create",casProject)).code).toBe(0);
    const cas=await Promise.all([runProcess("transition",casProject,["cas-a"]),runProcess("transition",casProject,["cas-b"])]);
    expect(cas.filter(item=>item.result.ok)).toHaveLength(1);expect(cas.filter(item=>item.result.code==="VERSION_CONFLICT")).toHaveLength(1);
    expect(Number((await admin.query<{count:string}>("SELECT count(*) FROM builder.workflow_transition_details WHERE project_id=$1",[casProject])).rows[0]!.count)).toBe(1);
    const idemProject=randomUUID();expect((await runProcess("create",idemProject)).code).toBe(0);
    const idem=await Promise.all([runProcess("transition",idemProject,["same-key"]),runProcess("transition",idemProject,["same-key"])]);
    expect(idem.every(item=>item.result.ok)).toBe(true);expect(idem.map(item=>item.result.duplicate).sort()).toEqual([false,true]);
    expect(Number((await admin.query<{count:string}>("SELECT count(*) FROM builder.workflow_transition_details WHERE project_id=$1",[idemProject])).rows[0]!.count)).toBe(1);
  });

  it("recoveriert Leases und fenced stale Worker ueber getrennte Prozesse",async()=>{
    const projectId=randomUUID();const created=await runProcess("create-job",projectId);expect(created.result.ok).toBe(true);
    const jobId=String(created.result.job?.id);const first=await runProcess("claim",projectId,[jobId,"worker-1","claim-1","5000"]);expect(first.result.ok).toBe(true);
    const fence1=String(first.result.job?.fencingToken);const auth1=[jobId,"worker-1","claim-1",fence1,"authorize-1"];
    const heartbeat1=[jobId,"worker-1","claim-1",fence1,"heartbeat-1","5000"];
    expect((await runProcess("authorize",projectId,auth1)).result.ok).toBe(true);expect((await runProcess("heartbeat",projectId,heartbeat1)).result.ok).toBe(true);
    const leaseExpiresAt=String((await runProcess("read",projectId)).result.jobs?.[0]?.leaseExpiresAt);
    await admin.query("UPDATE builder.background_jobs SET lease_expires_at=clock_timestamp() WHERE project_id=$1 AND id=$2",[projectId,jobId]);
    const beforeRejectedReplay=(await admin.query<{storage_version:string;snapshot:string;events:number}>(`SELECT storage_version::text,state_snapshot::text snapshot,
      (SELECT count(*)::int FROM builder.job_audit_events WHERE project_id=$1) events FROM builder.workflow_aggregates WHERE project_id=$1`,[projectId])).rows[0]!;
    const boundaryReplays=await Promise.all([runProcess("authorize",projectId,auth1),runProcess("heartbeat",projectId,heartbeat1)]);
    expect(boundaryReplays.every(item=>!item.result.ok&&item.result.code==="JOB_NOT_ALLOWED")).toBe(true);
    const afterRejectedReplay=(await admin.query<{storage_version:string;snapshot:string;events:number}>(`SELECT storage_version::text,state_snapshot::text snapshot,
      (SELECT count(*)::int FROM builder.job_audit_events WHERE project_id=$1) events FROM builder.workflow_aggregates WHERE project_id=$1`,[projectId])).rows[0]!;
    expect(afterRejectedReplay).toEqual(beforeRejectedReplay);
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,new Date(leaseExpiresAt).getTime()-Date.now()+150)));
    const second=await runProcess("claim",projectId,[jobId,"worker-2","claim-2","10000"]);expect(second.result.ok).toBe(true);const fence2=String(second.result.job?.fencingToken);expect(Number(fence2)).toBeGreaterThan(Number(fence1));
    expect((await runProcess("authorize",projectId,auth1)).result).toMatchObject({ok:false,code:"JOB_NOT_ALLOWED"});
    expect((await runProcess("heartbeat",projectId,heartbeat1)).result).toMatchObject({ok:false,code:"JOB_NOT_ALLOWED"});
    expect((await runProcess("complete",projectId,[jobId,"worker-1","claim-1",fence1,"complete-stale"])).result).toMatchObject({ok:false,code:"JOB_NOT_ALLOWED"});
    expect((await runProcess("authorize",projectId,[jobId,"worker-2","claim-2",fence2,"authorize-2"])).result.ok).toBe(true);
    expect((await runProcess("heartbeat",projectId,[jobId,"worker-2","claim-2",fence2,"heartbeat-2","10000"])).result.ok).toBe(true);
    expect((await runProcess("transition-next",projectId,["cancel-running-job"])).result.ok).toBe(true);
    expect((await runProcess("terminate",projectId,[jobId,"worker-1","claim-1",fence1,"terminate-stale"])).result).toMatchObject({ok:false,code:"JOB_NOT_ALLOWED"});
    expect((await runProcess("terminate",projectId,[jobId,"worker-2","claim-2",fence2,"terminate-fresh"])).result).toMatchObject({ok:true,job:{status:"CANCELLED"}});
  },30_000);

  it("verarbeitet Erfolg, Fehler, Timeout, Security BLOCK, Legal COUNSEL_REQUIRED und Schemafehler",async()=>{
    const repository=new AgentJobRepository(admin);const scenarios=["SUCCESS","ERROR","TIMEOUT","SECURITY_BLOCK","LEGAL_COUNSEL_REQUIRED","INVALID_OUTPUT"] as const;
    for(const scenario of scenarios){const {id}=await createProject();const enqueued=await enqueueAgent(repository,agentTask(id,scenario));expect((await runAgentProcess(`scenario-${scenario}`)).result.processed).toBe(true);const status=await repository.getStatus(enqueued.jobId);
      if(scenario==="SUCCESS")expect(status).toMatchObject({status:"SUCCEEDED",result:{status:"SUCCESS"}});
      else if(scenario==="SECURITY_BLOCK")expect(status).toMatchObject({status:"SUCCEEDED",result:{status:"SECURITY_BLOCK",decisions:[{outcome:"BLOCK"}]}});
      else if(scenario==="LEGAL_COUNSEL_REQUIRED")expect(status).toMatchObject({status:"SUCCEEDED",result:{status:"LEGAL_COUNSEL_REQUIRED",decisions:[{outcome:"COUNSEL_REQUIRED"}]}});
      else if(scenario==="INVALID_OUTPUT")expect(status).toMatchObject({status:"FAILED",result:null});
      else expect(status).toMatchObject({status:"FAILED",result:{status:scenario}});
    }
    const schemaAudit=await admin.query<{event_type:string}>("SELECT event_type FROM builder.agent_job_audit_events WHERE event_type='SCHEMA_REJECTED'");expect(schemaAudit.rowCount).toBeGreaterThan(0);
    const contradictoryProject=(await createProject()).id;const contradictoryTask=agentTask(contradictoryProject,"SUCCESS");const contradictoryJob=await enqueueAgent(repository,contradictoryTask);const contradictoryClaim=await repository.claimNext("schema-worker","schema-claim",10_000);expect(contradictoryClaim?.jobId).toBe(contradictoryJob.jobId);const runtime=new FakeAgentRuntime();const success=(await runtime.startRun({runId:contradictoryTask.runId,projectId:contradictoryProject,taskId:contradictoryTask.taskId,attemptId:contradictoryTask.attemptId,idempotencyKey:"schema-start",requestDigest:canonicalAgentOperationDigest("startRun",contradictoryTask),fencingToken:contradictoryClaim!.fencingToken,task:contradictoryTask})).result!;const invalid={...success,findings:[{schemaVersion:1 as const,findingId:"finding/security",category:"SECURITY" as const,severity:"CRITICAL" as const,status:"BLOCK" as const,evidenceRef:"evidence/security"}],decisions:[{schemaVersion:1 as const,decisionId:"decision/security",kind:"SECURITY" as const,outcome:"BLOCK" as const,rationaleRef:"rationale/security"}]};await expect(repository.complete({jobId:contradictoryClaim!.jobId,workerId:contradictoryClaim!.workerId,claimId:contradictoryClaim!.claimId,fencingToken:contradictoryClaim!.fencingToken},invalid,randomUUID())).rejects.toThrow(/Stop finding/);expect(await repository.getStatus(contradictoryJob.jobId)).toMatchObject({status:"CLAIMED",result:null});
  },30_000);

  it("setzt Infrastruktur-Retry im selben Run fort, erzwingt Retry-Limit und recoveriert ueber Prozessneustart",async()=>{
    const repository=new AgentJobRepository(admin);const {id}=await createProject();const task=agentTask(id,"RETRY");const enqueued=await enqueueAgent(repository,task,2);
    expect((await runAgentProcess("retry-process-1")).result.processed).toBe(true);expect(await repository.getStatus(enqueued.jobId)).toMatchObject({status:"RETRY_SCHEDULED",retryCount:1,runId:task.runId});
    expect((await runAgentProcess("retry-process-2")).result.processed).toBe(true);expect(await repository.getStatus(enqueued.jobId)).toMatchObject({status:"SUCCEEDED",retryCount:1,runId:task.runId,result:{status:"SUCCESS"}});
    const progress=await admin.query<{sequence:number}>("SELECT sequence FROM builder.agent_runtime_progress WHERE project_id=$1 AND run_id=$2 ORDER BY sequence",[id,task.runId]);expect(progress.rows.map(row=>row.sequence)).toEqual([1,2,3,4,5]);
    const limitedProject=(await createProject()).id;const limited=await enqueueAgent(repository,agentTask(limitedProject,"RETRY"),0);expect((await runAgentProcess("retry-limit")).result.processed).toBe(true);expect(await repository.getStatus(limited.jobId)).toMatchObject({status:"DEAD_LETTER",retryCount:1,result:null});
  },30_000);

  it("verhindert Doppelverarbeitung durch zwei konkurrierende Worker und dedupliziert Inbox-Replay",async()=>{
    const repository=new AgentJobRepository(admin);const {id}=await createProject();const task=agentTask(id,"SUCCESS");const key=`concurrent-${task.runId}`;const input={task,messageId:randomUUID(),consumerIdentity:"agent-replay",idempotencyKey:key,requestDigest:canonicalAgentOperationDigest("enqueue",task),traceId:randomUUID(),maxRetries:2};const first=await repository.enqueue(input);expect((await repository.enqueue(input))).toEqual({jobId:first.jobId,duplicate:true});for(const mutation of [{role:"QA"},{scenario:"ERROR"},{inputRef:"synthetic/other"},{repairOrdinal:1}] as const){const changed={...task,...mutation} as AgentTask;await expect(repository.enqueue({...input,task:changed,requestDigest:canonicalAgentOperationDigest("enqueue",changed)})).rejects.toThrow(/REPLAY_DIVERGED/);}
    const workers=await Promise.all([runAgentProcess("concurrent-a"),runAgentProcess("concurrent-b")]);expect(workers.filter(item=>item.result.processed)).toHaveLength(1);expect(await repository.getStatus(first.jobId)).toMatchObject({status:"SUCCEEDED"});
    const counts=await admin.query<{results:number;inbox:number}>("SELECT (SELECT count(*)::int FROM builder.agent_runtime_results WHERE project_id=$1 AND run_id=$2) results,(SELECT count(*)::int FROM builder.inbox_events WHERE project_id=$1 AND consumer_identity='agent-replay') inbox",[id,task.runId]);expect(counts.rows[0]).toEqual({results:1,inbox:1});
  },30_000);

  it("fenced Lease-Verlust, reclaimt verlassene Jobs und rollt atomare Completion zurueck",async()=>{
    const repositoryA=new AgentJobRepository(admin);const repositoryB=new AgentJobRepository(admin);const {id}=await createProject();const task=agentTask(id,"SUCCESS");const enqueued=await enqueueAgent(repositoryA,task);const first=await repositoryA.claimNext("lease-worker-a","lease-claim-a",10_000);expect(first?.jobId).toBe(enqueued.jobId);
    await admin.query("UPDATE builder.background_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[enqueued.jobId]);const second=await repositoryB.claimNext("lease-worker-b","lease-claim-b",10_000);expect(second?.fencingToken).toBeGreaterThan(first!.fencingToken);await expect(repositoryA.heartbeat({jobId:first!.jobId,workerId:first!.workerId,claimId:first!.claimId,fencingToken:first!.fencingToken},10_000)).rejects.toBeInstanceOf(AgentJobLeaseLostError);
    const runtime=new FakeAgentRuntime({now:()=>new Date("2026-01-01T00:00:00.000Z")});const key="lease-complete";const result=(await runtime.startRun({runId:task.runId,projectId:id,taskId:task.taskId,attemptId:task.attemptId,idempotencyKey:key,requestDigest:canonicalAgentOperationDigest("startRun",task),fencingToken:second!.fencingToken,task})).result!;const guard={jobId:second!.jobId,workerId:second!.workerId,claimId:second!.claimId,fencingToken:second!.fencingToken};
    const messageId=randomUUID();const before=(await admin.query<{results:number;inbox:number;audit:number;outbox:number}>("SELECT (SELECT count(*)::int FROM builder.agent_runtime_results WHERE project_id=$1) results,(SELECT count(*)::int FROM builder.inbox_events WHERE project_id=$1 AND consumer_identity='agent-job-completion') inbox,(SELECT count(*)::int FROM builder.agent_job_audit_events WHERE project_id=$1) audit,(SELECT count(*)::int FROM builder.outbox_events WHERE project_id=$1) outbox",[id])).rows[0]!;
    await admin.query(`CREATE OR REPLACE FUNCTION builder.test_reject_agent_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic post-insert failure'; END $$`);await admin.query("CREATE TRIGGER test_reject_agent_result AFTER INSERT ON builder.agent_runtime_results FOR EACH ROW EXECUTE FUNCTION builder.test_reject_agent_result()");try{await expect(repositoryB.complete(guard,result,messageId)).rejects.toThrow(/post-insert failure/);}finally{await admin.query("DROP TRIGGER test_reject_agent_result ON builder.agent_runtime_results");await admin.query("DROP FUNCTION builder.test_reject_agent_result() ");}
    expect(await repositoryB.getStatus(enqueued.jobId)).toMatchObject({status:"CLAIMED",result:null});const after=(await admin.query<{results:number;inbox:number;audit:number;outbox:number}>("SELECT (SELECT count(*)::int FROM builder.agent_runtime_results WHERE project_id=$1) results,(SELECT count(*)::int FROM builder.inbox_events WHERE project_id=$1 AND consumer_identity='agent-job-completion') inbox,(SELECT count(*)::int FROM builder.agent_job_audit_events WHERE project_id=$1) audit,(SELECT count(*)::int FROM builder.outbox_events WHERE project_id=$1) outbox",[id])).rows[0]!;expect(after).toEqual(before);
    const completed=await repositoryB.complete(guard,result,messageId);expect(completed).toMatchObject({status:"SUCCEEDED",result:{status:"SUCCESS"}});expect(await repositoryB.complete(guard,result,messageId)).toEqual(completed);const divergent={...result,artifacts:[...result.artifacts,{schemaVersion:1 as const,artifactId:"artifact/divergent",kind:"REPORT" as const,objectRef:"object/divergent",digest:"b".repeat(64)}]};await expect(repositoryB.complete(guard,divergent,messageId)).rejects.toThrow(/REPLAY_DIVERGED/);
  },30_000);

  it("macht Abbruch erst nach Runtime-Bestaetigung terminal",async()=>{const repository=new AgentJobRepository(admin);const {id}=await createProject();const enqueued=await enqueueAgent(repository,agentTask(id,"CANCEL"));expect(await repository.requestCancel(enqueued.jobId)).toMatchObject({status:"PENDING",cancelRequested:true});expect((await runAgentProcess("cancel-worker")).result.processed).toBe(true);expect(await repository.getStatus(enqueued.jobId)).toMatchObject({status:"CANCELLED",result:{status:"CANCELLED"}});},30_000);

  it("pollt langlebig, heartbeated mehrfach und verarbeitet in-flight cancel ohne normale Ausfuehrung",async()=>{const repository=new AgentJobRepository(admin);const {id}=await createProject();const enqueued=await enqueueAgent(repository,agentTask(id,"SUCCESS"));const running=startPollingAgent("long-cancel",{FAKE_RUNTIME_DELAY_MS:"350",AGENT_WORKER_LEASE_MS:"200",AGENT_WORKER_HEARTBEAT_MS:"40",AGENT_WORKER_POLL_MS:"20"});await running.ready;try{await waitFor(async()=>{const status=await repository.getStatus(enqueued.jobId);return status.status==="CLAIMED";});await repository.requestCancel(enqueued.jobId);await waitFor(async()=>{const status=await repository.getStatus(enqueued.jobId);return status.status==="CANCELLED";});expect(await repository.getStatus(enqueued.jobId)).toMatchObject({status:"CANCELLED",result:{status:"CANCELLED"}});const heartbeats=await admin.query<{count:string}>("SELECT count(*) FROM builder.agent_job_audit_events WHERE project_id=$1 AND job_id=$2 AND event_type='HEARTBEAT'",[id,enqueued.jobId]);expect(Number(heartbeats.rows[0]!.count)).toBeGreaterThanOrEqual(2);}finally{running.child.kill("SIGTERM");await new Promise(resolve=>running.child.once("close",resolve));}},30_000);

  it("recoveriert Crash nach Runtime-Start vor Completion exakt einmal",async()=>{const repository=new AgentJobRepository(admin);const {id}=await createProject();const task=agentTask(id,"SUCCESS");const enqueued=await enqueueAgent(repository,task);const crashed=await runAgentExit("agent-crash","crash-before-complete",{AGENT_WORKER_LEASE_MS:"150",AGENT_WORKER_HEARTBEAT_MS:"50"});expect(crashed.code).toBe(86);expect(await repository.getStatus(enqueued.jobId)).toMatchObject({status:"CLAIMED",result:null});await new Promise(resolve=>setTimeout(resolve,175));expect((await runAgentProcess("restart-after-crash")).result.processed).toBe(true);expect(await repository.getStatus(enqueued.jobId)).toMatchObject({status:"SUCCEEDED",result:{status:"SUCCESS"}});const counts=(await admin.query<{results:number;progress:number;completed:number}>("SELECT (SELECT count(*)::int FROM builder.agent_runtime_results WHERE project_id=$1 AND run_id=$2) results,(SELECT count(*)::int FROM builder.agent_runtime_progress WHERE project_id=$1 AND run_id=$2) progress,(SELECT count(*)::int FROM builder.agent_job_audit_events WHERE project_id=$1 AND job_id=$3 AND event_type='COMPLETED') completed",[id,task.runId,enqueued.jobId])).rows[0]!;expect(counts).toEqual({results:1,progress:4,completed:1});},30_000);

  it("fenced einen langsamen Worker nach Lease-Verlust waehrend ein zweiter uebernimmt",async()=>{const repository=new AgentJobRepository(admin);const {id}=await createProject();const task=agentTask(id,"SUCCESS");const enqueued=await enqueueAgent(repository,task);const slow=startPollingAgent("slow-stale",{FAKE_RUNTIME_DELAY_MS:"5500",AGENT_WORKER_LEASE_MS:"5000",AGENT_WORKER_HEARTBEAT_MS:"4500",AGENT_WORKER_POLL_MS:"20"});await slow.ready;try{await waitFor(async()=>((await repository.getStatus(enqueued.jobId)).status==="CLAIMED"));await admin.query("UPDATE builder.background_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[enqueued.jobId]);expect((await runAgentProcess("reclaim-fast")).result.processed).toBe(true);await waitFor(async()=>((await repository.getStatus(enqueued.jobId)).status==="SUCCEEDED"));await new Promise(resolve=>setTimeout(resolve,5750));const counts=(await admin.query<{results:number;completed:number}>("SELECT (SELECT count(*)::int FROM builder.agent_runtime_results WHERE project_id=$1 AND run_id=$2) results,(SELECT count(*)::int FROM builder.agent_job_audit_events WHERE project_id=$1 AND job_id=$3 AND event_type='COMPLETED') completed",[id,task.runId,enqueued.jobId])).rows[0]!;expect(counts).toEqual({results:1,completed:1});}finally{slow.child.kill("SIGTERM");await new Promise(resolve=>slow.child.once("close",resolve));}},30_000);

  it("erzwingt den CANCELLING-Claim-Constraint auf dem Gesamtmigrationsstand",async()=>{const repository=new AgentJobRepository(admin);const {id}=await createProject();const enqueued=await enqueueAgent(repository,agentTask(id,"SUCCESS"));const claim=await repository.claimNext("constraint-worker","constraint-claim",10_000);expect(claim?.jobId).toBe(enqueued.jobId);expect(await repository.requestCancel(enqueued.jobId)).toMatchObject({status:"CANCELLING",cancelRequested:true});await expect(admin.query("UPDATE builder.background_jobs SET cancel_requested_at=NULL WHERE id=$1",[enqueued.jobId])).rejects.toThrow(/background_jobs_cancelling_claim_check/);},30_000);
});

function stableInboxMessageId(value:string):string{const hex=createHash("sha256").update(`inbox:${value}`).digest("hex").slice(0,32).split("");hex[12]="4";hex[16]=(["8","9","a","b"] as const)[Number.parseInt(hex[16]!,16)%4]!;return `${hex.slice(0,8).join("")}-${hex.slice(8,12).join("")}-${hex.slice(12,16).join("")}-${hex.slice(16,20).join("")}-${hex.slice(20).join("")}`;}
