import { WorkerProcessBootIdentity, parseProcessLaunchId } from "@software-builder/agent-runtime";
import { AgentJobRepository, type AgentJobClaim } from "@software-builder/database";
import { Pool } from "pg";
import { BackgroundWorker } from "./worker-loop.js";

interface PublicClaim {
  readonly jobId:string;
  readonly workerId:string;
  readonly claimId:string;
  readonly fencingToken:number;
  readonly leaseGeneration:number;
  readonly jobVersion:number;
  readonly processLaunchId:string|null;
  readonly workerProcessInstanceId:string;
}
type Command=
  |{readonly requestId:string;readonly action:"claim"}
  |{readonly requestId:string;readonly action:"heartbeat";readonly claim:PublicClaim;readonly leaseMs:number}
  |{readonly requestId:string;readonly action:"load";readonly claim:PublicClaim}
  |{readonly requestId:string;readonly action:"fail";readonly claim:PublicClaim}
  |{readonly requestId:string;readonly action:"crash"}
  |{readonly requestId:string;readonly action:"stop"};

if(process.env.WORKER_IDENTITY_MULTIPROCESS_TEST!=="1")throw new Error("WORKER_IDENTITY_TEST_MODE_REQUIRED");
const connectionString=process.env.PROCESS_DATABASE_URL;
const workerId=process.argv[2]??"";
if(!connectionString||!workerId)throw new Error("WORKER_IDENTITY_TEST_INPUT_REQUIRED");
const target=new URL(connectionString);
if(!["127.0.0.1","localhost","::1"].includes(target.hostname)||!target.pathname.toLowerCase().endsWith("_test"))throw new Error("WORKER_IDENTITY_TEST_DATABASE_UNSAFE");

const boot=WorkerProcessBootIdentity.create();
const identity=boot.get();
const pool=new Pool({connectionString,application_name:"software-builder-worker-identity-test"});
const repository=new AgentJobRepository(pool);
await repository.registerWorkerProcess(workerId,identity);
let capturedClaim:AgentJobClaim|null=null;
const worker=new BackgroundWorker(repository,{process:async(claim:AgentJobClaim)=>{capturedClaim=claim;}} as never,{workerId,workerProcessIdentity:identity,leaseMs:120_000});

function publicClaim(claim:NonNullable<Awaited<ReturnType<AgentJobRepository["claimNext"]>>>):PublicClaim{return{jobId:claim.jobId,workerId:claim.workerId,claimId:claim.claimId,fencingToken:claim.fencingToken,leaseGeneration:claim.leaseGeneration,jobVersion:claim.jobVersion,processLaunchId:claim.processLaunchId,workerProcessInstanceId:claim.workerProcessIdentity.instanceId};}
function guard(claim:PublicClaim){return{jobId:claim.jobId,workerId:claim.workerId,workerProcessIdentity:identity,processLaunchId:claim.processLaunchId===null?null:parseProcessLaunchId(claim.processLaunchId),claimId:claim.claimId,fencingToken:claim.fencingToken};}
function send(value:unknown):void{if(!process.send)throw new Error("WORKER_IDENTITY_TEST_IPC_REQUIRED");process.send(value);}

send({type:"ready",workerId,workerProcessInstanceId:identity.instanceId,workerOwnershipDigest:identity.ownershipDigest});
process.on("message",(value:unknown)=>{void handle(value as Command);});

async function handle(command:Command):Promise<void>{
  try{
    if(command.action==="claim"){capturedClaim=null;const processed=await worker.runOnce();const claim=capturedClaim;if(processed&&!claim)throw new Error("WORKER_IDENTITY_TEST_CLAIM_MISSING");send({requestId:command.requestId,ok:true,claim:claim?publicClaim(claim):null});return;}
    if(command.action==="heartbeat"){const claim=await repository.heartbeat(guard(command.claim),command.leaseMs);send({requestId:command.requestId,ok:true,claim:publicClaim(claim)});return;}
    if(command.action==="load"){const claim=await repository.loadClaim(guard(command.claim));send({requestId:command.requestId,ok:true,claim:publicClaim(claim)});return;}
    if(command.action==="fail"){await repository.fail(guard(command.claim),"IDENTITY_MULTIPROCESS_TEST_COMPLETE");send({requestId:command.requestId,ok:true});return;}
    if(command.action==="crash"){send({requestId:command.requestId,ok:true});process.exit(86);}
    await pool.end();send({requestId:command.requestId,ok:true});process.exit(0);
  }catch(error){const code=error instanceof Error?error.name:"UNKNOWN_ERROR";send({requestId:command.requestId,ok:false,code});}
}
