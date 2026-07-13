import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname,join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectId } from "@software-builder/core";
import { HmacCapabilityAuthority, PostgresDatabase, PostgresProjectContextIssuer } from "./index.js";
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
  const runProcess=(mode:string,projectId:string,args:string[]=[] )=>new Promise<{code:number|null;result:{ok:boolean;duplicate?:boolean;phase?:string;version?:number;audits?:number;code?:string;job?:Record<string,unknown>;jobs?:Record<string,unknown>[]}}>((resolve,reject)=>{
    const child=spawn(process.execPath,[processWorker,mode,projectId,...args],{env:{...process.env,PROCESS_DATABASE_URL:processRuntimeUrl,PROCESS_CONTEXT_DATABASE_URL:processContextUrl},stdio:["ignore","pipe","pipe"]});let stdout="";let stderr="";
    child.stdout.on("data",chunk=>{stdout+=String(chunk);});child.stderr.on("data",chunk=>{stderr+=String(chunk);});child.on("error",reject);child.on("close",code=>{try{resolve({code,result:JSON.parse(stdout) as never});}catch{reject(new Error(`Process worker output invalid: ${stderr}`));}});
  });

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
    const leaseExpiresAt=String((await runProcess("read",projectId)).result.jobs?.[0]?.leaseExpiresAt);await new Promise(resolve=>setTimeout(resolve,Math.max(0,new Date(leaseExpiresAt).getTime()-Date.now()+150)));
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
});

function stableInboxMessageId(value:string):string{const hex=createHash("sha256").update(`inbox:${value}`).digest("hex").slice(0,32).split("");hex[12]="4";hex[16]=(["8","9","a","b"] as const)[Number.parseInt(hex[16]!,16)%4]!;return `${hex.slice(0,8).join("")}-${hex.slice(8,12).join("")}-${hex.slice(12,16).join("")}-${hex.slice(16,20).join("")}-${hex.slice(20).join("")}`;}
