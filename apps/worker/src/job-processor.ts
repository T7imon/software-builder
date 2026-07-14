import { FakeAgentRuntime, SchemaValidationError, type AgentResult, type AgentRuntime, type RuntimeStatus, type RuntimeStore } from "@software-builder/agent-runtime";
import { AgentJobLeaseLostError, type AgentJobClaim, type AgentJobRepository } from "@software-builder/database";
import { PostgresRuntimeStore } from "./postgres-runtime-store.js";

export interface JobProcessorOptions { readonly retryDelayMs?:number;readonly runtimeFactory?:(store:RuntimeStore)=>AgentRuntime;readonly afterRuntimePersisted?:()=>void|Promise<void>;readonly beforeCompletionCommit?:(claim:AgentJobClaim,status:RuntimeStatus)=>void|Promise<void>; }
export class JobExecutionControl {
  private cancellation=false;private lost=false;private handler:(()=>Promise<void>)|undefined;private pending:Promise<void>=Promise.resolve();
  get cancellationRequested(){return this.cancellation;}get leaseLost(){return this.lost;}
  registerCancellationHandler(handler:()=>Promise<void>){this.handler=handler;if(this.cancellation||this.lost)this.invoke();}
  requestCancellation(){this.cancellation=true;this.invoke();}
  loseLease(){this.lost=true;this.invoke();}
  async settleCancellation(){await this.pending;}
  private invoke(){if(this.handler)this.pending=this.pending.then(this.handler).catch(()=>undefined);}
}

export class AgentJobProcessor {
  private readonly retryDelayMs:number;private readonly runtimeFactory:(store:RuntimeStore)=>AgentRuntime;
  constructor(private readonly repository:AgentJobRepository,private readonly options:JobProcessorOptions={}){this.retryDelayMs=options.retryDelayMs??0;this.runtimeFactory=options.runtimeFactory??(store=>new FakeAgentRuntime({store}));}
  async process(claim:AgentJobClaim,control=new JobExecutionControl()):Promise<void>{const store=new PostgresRuntimeStore(this.repository,claim);const runtime=this.runtimeFactory(store);let cancellationStatus:RuntimeStatus|undefined;control.registerCancellationHandler(async()=>{cancellationStatus=await runtime.cancelRun(store.command("cancelRun"));});if(claim.cancelRequested)control.requestCancellation();try{
    if(control.cancellationRequested){await control.settleCancellation();if(control.leaseLost)return;await this.commitCancellation(store,cancellationStatus);return;}
    let status:RuntimeStatus;const persisted=await store.load(claim.task.runId);if(persisted)status=await runtime.getRunStatus(store.command("getRunStatus"));else status=await runtime.startRun(store.command("startRun"));
    if(claim.retryCount>0&&status.state==="RETRY_PENDING")status=await runtime.continueRun(store.command("continueRun"));
    await this.options.afterRuntimePersisted?.();
    if(control.cancellationRequested){await control.settleCancellation();if(control.leaseLost)return;await this.commitCancellation(store,cancellationStatus);return;}
    if(control.leaseLost){await control.settleCancellation();return;}
    await store.persistProgress(status);
    if(status.state==="RETRY_PENDING"){await this.repository.scheduleRetry(store.guard(),"FAKE_INFRA_RETRY",this.retryDelayMs);return;}
    if(!status.terminal||!status.result)throw new Error("RUNTIME_NON_TERMINAL_RESULT");await this.options.beforeCompletionCommit?.(claim,status);
    if(status.result.status==="CANCELLED")await this.repository.confirmCancelled(store.guard(),status.result,this.messageId(claim,"cancelled"));else await this.repository.complete(store.guard(),status.result,this.messageId(claim,"completed"));
  }catch(error){if(control.leaseLost||error instanceof AgentJobLeaseLostError){control.loseLease();await control.settleCancellation();return;}if(error instanceof SchemaValidationError){await this.repository.fail(store.guard(),error.code);return;}throw error;}}
  private async commitCancellation(store:PostgresRuntimeStore,status:RuntimeStatus|undefined){if(status?.result?.status==="CANCELLED"){await store.persistProgress(status);await this.repository.confirmCancelled(store.guard(),status.result,this.messageId(store.claim,"cancelled"));return;}await this.repository.confirmCancelled(store.guard(),this.cancelledResult(store.claim),this.messageId(store.claim,"cancelled"));}
  private cancelledResult(claim:AgentJobClaim):AgentResult{return{schemaVersion:1,projectId:claim.projectId,taskId:claim.task.taskId,attemptId:claim.task.attemptId,runId:claim.task.runId,status:"CANCELLED",findings:[],artifacts:[],decisions:[],errorCode:null};}
  private messageId(claim:AgentJobClaim,kind:string){const hex=stableHash(`${claim.jobId}:${kind}`);return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;}
}
function stableHash(value:string):string{let hash=2166136261;for(const char of value){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return(Math.abs(hash).toString(16).padStart(8,"0")).repeat(4).slice(0,32);}
