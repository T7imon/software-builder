import { FakeAgentRuntime, SchemaValidationError, type AbortableAgentRuntime, type AgentResult, type AgentRuntime, type ExternallyPersistedAgentRuntime, type RuntimeStatus, type RuntimeStore } from "@software-builder/agent-runtime";
import { AgentJobCancellationRequestedError, AgentJobLateResultAlreadyCommittedError, AgentJobLeaseLostError, createAgentJobCancellationCompletionContext, createAgentJobCompletionContext, type AgentJobClaim, type AgentJobRepository } from "@software-builder/database";
import { PostgresRuntimeStore } from "./postgres-runtime-store.js";

export interface JobProcessorOptions {
  readonly retryDelayMs?:number;
  readonly cancellationRetryDelayMs?:number;
  readonly cancellationTimeoutMs?:number;
  readonly runtimeFactory?:(store:RuntimeStore,claim:AgentJobClaim)=>AgentRuntime|Promise<AgentRuntime>;
  readonly afterRuntimePersisted?:()=>void|Promise<void>;
  readonly beforeCompletionCommit?:(claim:AgentJobClaim,status:RuntimeStatus)=>void|Promise<void>;
  readonly afterLateCompletionCommit?:(claim:AgentJobClaim,status:RuntimeStatus)=>void|Promise<void>;
}

export class JobExecutionControl {
  private cancellation=false;
  private lost=false;
  private handler:(()=>Promise<void>)|undefined;
  private leaseLossHandler:(()=>void)|undefined;
  private pending:Promise<void>|undefined;
  get cancellationRequested(){return this.cancellation;}
  get leaseLost(){return this.lost;}
  registerCancellationHandler(handler:()=>Promise<void>){this.handler=handler;this.invoke();}
  registerLeaseLossHandler(handler:()=>void){this.leaseLossHandler=handler;if(this.lost)handler();}
  requestCancellation(){this.cancellation=true;this.invoke();}
  loseLease(){if(this.lost)return;this.lost=true;this.leaseLossHandler?.();}
  async settleCancellation(){await this.pending;}
  private invoke(){if(this.handler&&this.cancellation&&!this.pending)this.pending=this.handler();}
}

class RuntimeCancellationTimeoutError extends Error {
  constructor(){super("RUNTIME_CANCEL_TIMEOUT");this.name="RuntimeCancellationTimeoutError";}
}

export class AgentJobProcessor {
  private readonly retryDelayMs:number;
  private readonly cancellationRetryDelayMs:number;
  private readonly cancellationTimeoutMs:number;
  private readonly runtimeFactory:(store:RuntimeStore,claim:AgentJobClaim)=>AgentRuntime|Promise<AgentRuntime>;
  constructor(private readonly repository:AgentJobRepository,private readonly options:JobProcessorOptions={}){
    this.retryDelayMs=options.retryDelayMs??0;
    this.cancellationRetryDelayMs=options.cancellationRetryDelayMs??0;
    this.cancellationTimeoutMs=options.cancellationTimeoutMs??5_000;
    this.runtimeFactory=options.runtimeFactory??(store=>new FakeAgentRuntime({store}));
    if(!Number.isSafeInteger(this.cancellationTimeoutMs)||this.cancellationTimeoutMs<1)throw new Error("cancellationTimeoutMs must be positive");
  }

  async process(claim:AgentJobClaim,control=new JobExecutionControl()):Promise<void>{
    const store=new PostgresRuntimeStore(this.repository,claim);const runtime=await this.runtimeFactory(store,claim);
    control.registerLeaseLossHandler(()=>{if(isAbortable(runtime))runtime.abortActiveRun("LEASE_LOST");});
    control.registerCancellationHandler(async()=>{if(control.leaseLost)return;const refreshed=await this.repository.loadClaim(store.guard());const cancellationStore=new PostgresRuntimeStore(this.repository,refreshed);await this.cancel(cancellationStore,runtime);});
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
      await this.complete(store,status.result);
    }catch(error){
      if(control.leaseLost||error instanceof AgentJobLeaseLostError){control.loseLease();await control.settleCancellation();return;}
      if(error instanceof AgentJobCancellationRequestedError){control.requestCancellation();await control.settleCancellation();return;}
      if(error instanceof SchemaValidationError){await this.repository.fail(store.guard(),error.code);return;}
      throw error;
    }
  }

  private async cancel(store:PostgresRuntimeStore,runtime:AgentRuntime):Promise<void>{
    let observed:RuntimeStatus|undefined;const persisted=await store.load(store.claim.task.runId);const externallyPersisted=isExternallyPersisted(runtime);
    if(externallyPersisted&&isAbortable(runtime))runtime.abortActiveRun("CANCELLED");
    if(persisted||externallyPersisted)observed=await runtime.getRunStatus(store.command("getRunStatus"));
    else if(store.claim.cancelAttemptCount>0)throw new Error("CANCELLATION_STATUS_QUERY_REQUIRED");
    if(observed?.terminal&&observed.result&&observed.result.status!=="CANCELLED"){
      let committed=false;try{await this.complete(store,observed.result);committed=true;}catch(error){if(!(error instanceof AgentJobLateResultAlreadyCommittedError))throw error;}
      if(committed)await this.options.afterLateCompletionCommit?.(store.claim,observed);
    }
    if(observed?.terminationEvidence&&await this.confirmEvidence(store,observed))return;
    if(persisted||externallyPersisted)await this.repository.recordCancellationReconciliation(store.guard(),this.watermark(observed),observed?.terminationEvidence?1:0);
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

  private async complete(store:PostgresRuntimeStore,result:AgentResult):Promise<void>{const current=await this.repository.loadClaim(store.guard());await this.repository.complete(createAgentJobCompletionContext(current),result,store.guard());}
  private async confirmEvidence(store:PostgresRuntimeStore,status:RuntimeStatus):Promise<boolean>{const candidate=status.terminationEvidence;if(!candidate)return false;const decision=await this.repository.verifyTerminationEvidence(store.guard(),candidate);if(decision.validity!=="VALID")return false;const current=await this.repository.loadClaim(store.guard());await this.repository.confirmCancelled(createAgentJobCancellationCompletionContext(current,candidate.evidenceId),this.cancelledResult(current),store.guard());return true;}
  private watermark(status:RuntimeStatus|undefined):number{return status?.progress.at(-1)?.sequence??0;}

  private withCancellationTimeout(operation:Promise<RuntimeStatus>):Promise<RuntimeStatus>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new RuntimeCancellationTimeoutError()),this.cancellationTimeoutMs);});
    return Promise.race([operation,timeout]).finally(()=>{if(timer)clearTimeout(timer);});
  }
  private cancelledResult(claim:AgentJobClaim):AgentResult{return{schemaVersion:1,projectId:claim.projectId,taskId:claim.task.taskId,attemptId:claim.task.attemptId,runId:claim.task.runId,status:"CANCELLED",findings:[],artifacts:[],decisions:[],errorCode:null};}
}
function isAbortable(runtime:AgentRuntime):runtime is AgentRuntime&AbortableAgentRuntime{return"abortActiveRun"in runtime&&typeof(runtime as Partial<AbortableAgentRuntime>).abortActiveRun==="function";}
function isExternallyPersisted(runtime:AgentRuntime):runtime is AgentRuntime&ExternallyPersistedAgentRuntime{return"externalPersistentStatus"in runtime&&(runtime as Partial<ExternallyPersistedAgentRuntime>).externalPersistentStatus===true;}
