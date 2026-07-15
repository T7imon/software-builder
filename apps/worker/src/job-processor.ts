import { FakeAgentRuntime, SchemaValidationError, type AgentResult, type AgentRuntime, type RuntimeStatus, type RuntimeStore } from "@software-builder/agent-runtime";
import { AgentJobCancellationRequestedError, AgentJobLeaseLostError, type AgentJobClaim, type AgentJobRepository } from "@software-builder/database";
import { PostgresRuntimeStore } from "./postgres-runtime-store.js";

export interface JobProcessorOptions {
  readonly retryDelayMs?:number;
  readonly cancellationRetryDelayMs?:number;
  readonly cancellationTimeoutMs?:number;
  readonly runtimeFactory?:(store:RuntimeStore)=>AgentRuntime;
  readonly afterRuntimePersisted?:()=>void|Promise<void>;
  readonly beforeCompletionCommit?:(claim:AgentJobClaim,status:RuntimeStatus)=>void|Promise<void>;
}

export class JobExecutionControl {
  private cancellation=false;
  private lost=false;
  private handler:(()=>Promise<void>)|undefined;
  private pending:Promise<void>|undefined;
  get cancellationRequested(){return this.cancellation;}
  get leaseLost(){return this.lost;}
  registerCancellationHandler(handler:()=>Promise<void>){this.handler=handler;this.invoke();}
  requestCancellation(){this.cancellation=true;this.invoke();}
  loseLease(){this.lost=true;this.invoke();}
  async settleCancellation(){await this.pending;}
  private invoke(){if(this.handler&&(this.cancellation||this.lost)&&!this.pending)this.pending=this.handler();}
}

class RuntimeCancellationTimeoutError extends Error {
  constructor(){super("RUNTIME_CANCEL_TIMEOUT");this.name="RuntimeCancellationTimeoutError";}
}

export class AgentJobProcessor {
  private readonly retryDelayMs:number;
  private readonly cancellationRetryDelayMs:number;
  private readonly cancellationTimeoutMs:number;
  private readonly runtimeFactory:(store:RuntimeStore)=>AgentRuntime;
  constructor(private readonly repository:AgentJobRepository,private readonly options:JobProcessorOptions={}){
    this.retryDelayMs=options.retryDelayMs??0;
    this.cancellationRetryDelayMs=options.cancellationRetryDelayMs??0;
    this.cancellationTimeoutMs=options.cancellationTimeoutMs??5_000;
    this.runtimeFactory=options.runtimeFactory??(store=>new FakeAgentRuntime({store}));
    if(!Number.isSafeInteger(this.cancellationTimeoutMs)||this.cancellationTimeoutMs<1)throw new Error("cancellationTimeoutMs must be positive");
  }

  async process(claim:AgentJobClaim,control=new JobExecutionControl()):Promise<void>{
    const store=new PostgresRuntimeStore(this.repository,claim);const runtime=this.runtimeFactory(store);
    control.registerCancellationHandler(async()=>{if(control.leaseLost)return;const refreshed=await this.repository.loadClaim(store.guard());const cancellationStore=new PostgresRuntimeStore(this.repository,refreshed);await this.cancel(cancellationStore,this.runtimeFactory(cancellationStore));});
    if(claim.cancelRequested)control.requestCancellation();
    try{
      if(control.cancellationRequested){await control.settleCancellation();return;}
      let status:RuntimeStatus;const persisted=await store.load(claim.task.runId);
      if(persisted)status=await runtime.getRunStatus(store.command("getRunStatus"));else{await this.repository.authorizeRuntimeStart({...store.guard(),jobVersion:claim.jobVersion,leaseGeneration:claim.leaseGeneration});if(control.cancellationRequested){await control.settleCancellation();return;}if(control.leaseLost)return;status=await runtime.startRun(store.command("startRun"));}
      if(claim.retryCount>0&&status.state==="RETRY_PENDING")status=await runtime.continueRun(store.command("continueRun"));
      await this.options.afterRuntimePersisted?.();
      if(control.cancellationRequested){await control.settleCancellation();return;}
      if(control.leaseLost)return;
      await store.persistProgress(status);
      if(control.cancellationRequested){await control.settleCancellation();return;}
      if(status.state==="RETRY_PENDING"){await this.repository.scheduleRetry(store.guard(),"FAKE_INFRA_RETRY",this.retryDelayMs);return;}
      if(!status.terminal||!status.result)throw new Error("RUNTIME_NON_TERMINAL_RESULT");
      await this.options.beforeCompletionCommit?.(claim,status);
      if(control.cancellationRequested){await control.settleCancellation();return;}
      if(status.result.status==="CANCELLED")throw new Error("CANCEL_RESULT_WITHOUT_REQUEST");
      await this.repository.complete(store.guard(),status.result,this.messageId(claim,"completed"));
    }catch(error){
      if(control.leaseLost||error instanceof AgentJobLeaseLostError){control.loseLease();await control.settleCancellation();return;}
      if(error instanceof AgentJobCancellationRequestedError){control.requestCancellation();await control.settleCancellation();return;}
      if(error instanceof SchemaValidationError){await this.repository.fail(store.guard(),error.code);return;}
      throw error;
    }
  }

  private async cancel(store:PostgresRuntimeStore,runtime:AgentRuntime):Promise<void>{
    let observed:RuntimeStatus|undefined;const persisted=await store.load(store.claim.task.runId);
    if(persisted)observed=await runtime.getRunStatus(store.command("getRunStatus"));
    else if(store.claim.cancelAttemptCount>0)throw new Error("CANCELLATION_STATUS_QUERY_REQUIRED");
    if(observed?.terminal&&observed.result&&observed.result.status!=="CANCELLED")await this.repository.complete(store.guard(),observed.result,this.messageId(store.claim,`late-result:${this.watermark(observed)}`));
    if(observed?.terminationEvidence&&await this.confirmEvidence(store,observed))return;
    if(persisted)await this.repository.recordCancellationReconciliation(store.guard(),this.watermark(observed),observed?.terminationEvidence?1:0,this.messageId(store.claim,`status-query:${store.claim.cancelAttemptCount}:${this.watermark(observed)}`));
    const started=await this.repository.beginCancellationAttempt(store.guard());if(!started.started){await this.repository.markCancellationStuck(store.guard(),this.watermark(observed));return;}
    let status:RuntimeStatus;try{
      status=await this.withCancellationTimeout(runtime.cancelRun(store.command("cancelRun")));
    }catch(error){
      if(error instanceof AgentJobLeaseLostError)throw error;
      const timeout=error instanceof RuntimeCancellationTimeoutError;
      await this.repository.recordCancellationFailure(store.guard(),timeout?"TIMED_OUT":"FAILED",timeout?"RUNTIME_CANCEL_TIMEOUT":"RUNTIME_CANCEL_FAILED",this.cancellationRetryDelayMs,this.watermark(observed));
      return;
    }
    if(status.terminationEvidence&&await this.confirmEvidence(store,status))return;
    await this.repository.recordCancellationFailure(store.guard(),"REJECTED",status.terminal?"TERMINATION_EVIDENCE_MISSING":"RUNTIME_CANCEL_REJECTED",this.cancellationRetryDelayMs,this.watermark(status));
  }

  private async confirmEvidence(store:PostgresRuntimeStore,status:RuntimeStatus):Promise<boolean>{const candidate=status.terminationEvidence;if(!candidate)return false;const decision=await this.repository.verifyTerminationEvidence(store.guard(),candidate);if(decision.validity!=="VALID")return false;await this.repository.confirmCancelled(store.guard(),this.cancelledResult(store.claim),this.messageId(store.claim,`cancelled:${candidate.evidenceId}`),candidate.evidenceId);return true;}
  private watermark(status:RuntimeStatus|undefined):number{return status?.progress.at(-1)?.sequence??0;}

  private withCancellationTimeout(operation:Promise<RuntimeStatus>):Promise<RuntimeStatus>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new RuntimeCancellationTimeoutError()),this.cancellationTimeoutMs);});
    return Promise.race([operation,timeout]).finally(()=>{if(timer)clearTimeout(timer);});
  }
  private cancelledResult(claim:AgentJobClaim):AgentResult{return{schemaVersion:1,projectId:claim.projectId,taskId:claim.task.taskId,attemptId:claim.task.attemptId,runId:claim.task.runId,status:"CANCELLED",findings:[],artifacts:[],decisions:[],errorCode:null};}
  private messageId(claim:AgentJobClaim,kind:string){const hex=stableHash(`${claim.jobId}:${kind}`);return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;}
}
function stableHash(value:string):string{let hash=2166136261;for(const char of value){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return(Math.abs(hash).toString(16).padStart(8,"0")).repeat(4).slice(0,32);}
