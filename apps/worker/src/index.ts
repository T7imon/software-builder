import { readWorkerConfiguration } from "./config.js";
import { createWorkerHealthServer, listenForHealth, workerHealth } from "./health.js";

if(["agent-once","agent-worker","agent-crash"].includes(process.argv[2]??"")){
  const [{Pool},{AgentJobRepository},{FakeAgentRuntime},{AgentJobProcessor},{BackgroundWorker}]=await Promise.all([import("pg"),import("@software-builder/database"),import("@software-builder/agent-runtime"),import("./job-processor.js"),import("./worker-loop.js")]);
  const connectionString=process.env.PROCESS_DATABASE_URL;if(!connectionString)throw new Error("PROCESS_DATABASE_URL is required for explicit agent-once test mode");
  const target=new URL(connectionString);if(process.env.AGENT_WORKER_TEST_MODE!=="1"||!["127.0.0.1","localhost","::1"].includes(target.hostname)||!target.pathname.toLowerCase().endsWith("_test"))throw new Error("agent-once is restricted to an explicit loopback test database");
  const pool=new Pool({connectionString,application_name:"software-builder-agent-worker"});try{const repository=new AgentJobRepository(pool);const delayMs=Number(process.env.FAKE_RUNTIME_DELAY_MS??0);const processor=new AgentJobProcessor(repository,{runtimeFactory:store=>{const base=new FakeAgentRuntime({store});if(delayMs<=0)return base;let cancellation:Awaited<ReturnType<typeof base.cancelRun>>|undefined;return{startRun:async command=>{await new Promise(resolve=>setTimeout(resolve,delayMs));return cancellation??base.startRun(command);},continueRun:command=>base.continueRun(command),cancelRun:async command=>(cancellation=await base.cancelRun(command)),getRunStatus:command=>base.getRunStatus(command)};},...(process.argv[2]==="agent-crash"?{afterRuntimePersisted:()=>process.exit(86)}:{})});const worker=new BackgroundWorker(repository,processor,{workerId:process.argv[3]??"process-worker",leaseMs:Number(process.env.AGENT_WORKER_LEASE_MS??10_000),heartbeatIntervalMs:Number(process.env.AGENT_WORKER_HEARTBEAT_MS??1000),pollIntervalMs:Number(process.env.AGENT_WORKER_POLL_MS??100)});if(process.argv[2]==="agent-once"||process.argv[2]==="agent-crash"){const processed=await worker.runOnce();process.stdout.write(JSON.stringify({ok:true,processed}));}else{if(process.env.AGENT_WORKER_ENABLED!=="1")throw new Error("agent-worker requires explicit AGENT_WORKER_ENABLED=1");const shutdown=()=>worker.stop();process.once("SIGINT",shutdown);process.once("SIGTERM",shutdown);process.stdout.write(JSON.stringify({ok:true,state:"polling"})+"\n");await worker.run();}}finally{await pool.end();}
}else{
const { host, port } = readWorkerConfiguration(process.env);

const server = createWorkerHealthServer();
await listenForHealth(server, { host, port });

console.log(
  `[worker] health=${workerHealth.status} service=${workerHealth.service} endpoint=http://${host}:${port}/health`,
);

function shutdown(signal: string) {
  console.log(`[worker] shutdown signal=${signal}`);
  server.close((error) => {
    if (error) {
      console.error("[worker] shutdown failed");
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
}
