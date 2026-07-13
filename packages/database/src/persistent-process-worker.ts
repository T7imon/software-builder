import type { GateAttestation, LegalAssessmentInput, TerminationEvidence } from "@software-builder/workflow-engine";
import { createHash } from "node:crypto";

const sourceMode=import.meta.url.endsWith(".ts");
const {HmacCapabilityAuthority,PersistentWorkflowRepository,PostgresDatabase,PostgresProjectContextIssuer}=await import(sourceMode?"./index.ts":"./index.js");
const {WorkflowEngine}=await import(sourceMode?"../../workflow-engine/src/index.ts":"@software-builder/workflow-engine");

const [mode,projectId,...args]=process.argv.slice(2);
const runtimeUrl=process.env.PROCESS_DATABASE_URL;const contextUrl=process.env.PROCESS_CONTEXT_DATABASE_URL;
if(!mode||!projectId||!runtimeUrl||!contextUrl)throw new Error("Process worker configuration missing.");
const policy="workflow-persistence-1";const revision="a".repeat(64);const authority=new HmacCapabilityAuthority();
const issuer=await PostgresProjectContextIssuer.connect(contextUrl);
const database=await PostgresDatabase.connectRuntime(runtimeUrl,issuer,authority,authority);
const repository=new PersistentWorkflowRepository({
  database,
  evidenceVerifier:{verify:async(attestation:GateAttestation)=>({id:attestation.attesterId,role:"SECURITY" as const})},
  actorAuthorizationVerifier:{verify:async(actorId:string)=>({id:actorId,roles:["SYSTEM"]})},
  workerIdentityVerifier:{verify:async(workerId:string)=>({id:workerId})},
  terminationProofVerifier:{verify:async(evidence:TerminationEvidence,context:{jobId:string;workerId:string})=>({id:evidence.id,evidenceDigest:evidence.evidenceDigest,processEndedAt:evidence.processEndedAt,mountRevokedAt:evidence.mountRevokedAt,credentialsRevokedAt:evidence.credentialsRevokedAt,jobId:context.jobId,workerId:context.workerId})},
  holdClearanceVerifier:{verify:async()=>null},
  complianceAttestationVerifier:async()=>true,
  bootstrapCapability:()=>({capability:authority.issueBootstrap("process-test","PROCESS_TEST"),subject:"process-test",actorScope:"PROCESS_TEST"}),
  projectCapability:(id:string,operation:"workflow_state:read"|"workflow_state:append")=>authority.issueProject(id as never,{subject:"process-test",actorScope:"PROCESS_TEST",allowedRoles:["PROCESS_TEST"],allowedOperations:[operation]}),
});
const engine=new WorkflowEngine(repository);
const owned=(jobId:string,workerId:string,claimIdempotencyKey:string,fencingToken:string,idempotencyKey:string)=>({jobId,projectId,expectedAggregateVersion:1,expectedRevisionDigest:revision,workerId,claimIdempotencyKey,fencingToken:Number(fencingToken),idempotencyKey});
try{
  if(mode==="create"||mode==="create-job"){
    await engine.createProject(projectId,policy,revision);const now=new Date();
    await repository.ingestGateAttestation({id:`${projectId}-customer-data`,projectId,name:"CUSTOMER_DATA_CLASSIFIED",status:"PASS",policyVersion:policy,subjectRevisionDigest:revision,evidenceDigest:"b".repeat(64),evaluatedAt:new Date(now.getTime()-1_000),validUntil:new Date(now.getTime()+60_000),customerDataClassification:"SYNTHETIC_ONLY",attesterId:"process-security",proof:"process-proof"});
    if(mode==="create-job"){
      const finalizedAt=new Date(now.getTime()-1_000);const assessment:LegalAssessmentInput={id:`${projectId}-legal`,projectId,scopeType:"PROJECT",scopeId:projectId,revisionDigest:revision,status:"PASS",factsDigest:"7".repeat(64),assumptionsRef:"process-assumptions",jurisdictions:["DE","EU"],legalDate:finalizedAt,sourceSetId:"process-sources",reviewerType:"LEGAL_DE_EU",finalizedAt,evidence:{id:`${projectId}-legal-evidence`,projectId,scopeType:"PROJECT",scopeId:projectId,revisionDigest:revision,contentDigest:"6".repeat(64),evidenceType:"LEGAL_ASSESSMENT",classification:"VERIFIED_LEGAL_ASSESSMENT",finalizedAt,verifiedAt:finalizedAt,trustedIdentity:"process-legal"}};
      await repository.ingestLegalAssessment({assessment,legalIdentity:"process-legal",proof:"process-proof"});
      const result=await engine.transition({projectId,targetPhase:"DISCOVERY",expectedVersion:0,expectedRevisionDigest:revision,policyVersion:policy,actorId:"process-actor",reason:"create leased process job",idempotencyKey:"process-start-job",startJob:{type:"DISCOVERY_CONTROL"}});
      process.stdout.write(JSON.stringify({ok:true,version:1,job:result.job}));
    }else process.stdout.write(JSON.stringify({ok:true,version:0}));
  }else if(mode==="transition"){
    const result=await engine.transition({projectId,targetPhase:"DISCOVERY",expectedVersion:0,expectedRevisionDigest:revision,policyVersion:policy,actorId:"process-actor",reason:"multi-process-cas",idempotencyKey:args[0]??"process-command"});
    process.stdout.write(JSON.stringify({ok:true,duplicate:result.duplicate,version:result.project.version}));
  }else if(mode==="read"){
    const project=await engine.getProject(projectId);const audits=await engine.getAuditEvents(projectId);const jobs=await engine.getJobs(projectId);
    process.stdout.write(JSON.stringify({ok:true,phase:project?.phase,version:project?.version,audits:audits.length,jobs}));
  }else if(mode==="claim"){
    const [jobId,workerId,claimKey,leaseMs="1000"]=args;const job=await engine.claimJob({jobId:jobId!,projectId,expectedAggregateVersion:1,expectedRevisionDigest:revision,workerId:workerId!,idempotencyKey:claimKey!,leaseDurationMs:Number(leaseMs)});process.stdout.write(JSON.stringify({ok:true,job}));
  }else if(mode==="authorize"){
    const [jobId,workerId,claimKey,fence,key]=args;const job=await engine.authorizeJobWork(owned(jobId!,workerId!,claimKey!,fence!,key!));process.stdout.write(JSON.stringify({ok:true,job}));
  }else if(mode==="heartbeat"){
    const [jobId,workerId,claimKey,fence,key,extend="1000"]=args;const job=await engine.heartbeatJob({...owned(jobId!,workerId!,claimKey!,fence!,key!),extendLeaseByMs:Number(extend)});process.stdout.write(JSON.stringify({ok:true,job}));
  }else if(mode==="complete"){
    const [jobId,workerId,claimKey,fence,key]=args;const job=await engine.completeJob(owned(jobId!,workerId!,claimKey!,fence!,key!));process.stdout.write(JSON.stringify({ok:true,job}));
  }else if(mode==="transition-next"){
    const result=await engine.transition({projectId,targetPhase:"SPECIFICATION",expectedVersion:1,expectedRevisionDigest:revision,policyVersion:policy,actorId:"process-actor",reason:"force claimed job cancellation",idempotencyKey:args[0]??"process-next"});process.stdout.write(JSON.stringify({ok:true,version:result.project.version}));
  }else if(mode==="terminate"){
    const [jobId,workerId,claimKey,fence,key]=args;const now=new Date();const id=`termination-${key}`;const evidenceDigest=createHash("sha256").update(JSON.stringify({id,workerId,jobId,processEndedAt:now.toISOString(),mountRevokedAt:now.toISOString(),credentialsRevokedAt:now.toISOString()})).digest("hex");const terminationEvidence={id,evidenceDigest,processEndedAt:now,mountRevokedAt:now,credentialsRevokedAt:now,proof:"process-proof"};const job=await engine.confirmJobTermination({...owned(jobId!,workerId!,claimKey!,fence!,key!),terminationEvidence});process.stdout.write(JSON.stringify({ok:true,job}));
  }else throw new Error("Unknown process worker mode.");
}catch(error){process.stdout.write(JSON.stringify({ok:false,code:(error as {code?:string}).code??"ERROR",message:error instanceof Error?error.message:"unknown"}));process.exitCode=2;}
finally{await database.close();}
