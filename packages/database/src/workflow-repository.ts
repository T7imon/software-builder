import {
  InMemoryWorkflowRepository, WorkflowError,
  type ClaimJobRequest, type ConfirmJobTerminationRequest, type CounselDecisionAttestation,
  type GateAttestation, type HeartbeatJobRequest, type HoldClearanceEvidence,
  type InMemoryWorkflowRepositoryOptions, type LegalAssessmentAttestation,
  type LegalRequirementDecisionAttestation, type LegalRequirementSubmissionAttestation,
  type OwnedJobRequest, type ProjectWorkflow, type TransitionRequest, type TransitionResult,
  type WorkflowJob, type WorkflowRepository,
} from "@software-builder/workflow-engine";
import type { PostgresDatabase, WorkflowLeaseGuard } from "./index.js";
import type { BootstrapCapability, ProjectCapability } from "./types.js";

export interface PersistentWorkflowRepositoryOptions extends InMemoryWorkflowRepositoryOptions {
  readonly database: PostgresDatabase;
  readonly bootstrapCapability: (projectId: string) => Promise<{ readonly capability: BootstrapCapability; readonly subject: string; readonly actorScope: string }> | { readonly capability: BootstrapCapability; readonly subject: string; readonly actorScope: string };
  readonly projectCapability: (projectId: string, operation: "workflow_state:read" | "workflow_state:append") => Promise<ProjectCapability> | ProjectCapability;
  readonly maxCasRetries?: number;
  readonly requireFencingTokens?: boolean;
}

/** PostgreSQL adapter over the same deterministic aggregate rules as the fast in-memory repository. */
export class PersistentWorkflowRepository implements WorkflowRepository {
  private readonly memoryOptions: InMemoryWorkflowRepositoryOptions;
  private readonly maxCasRetries: number;
  private readonly requireFencingTokens: boolean;
  constructor(private readonly options: PersistentWorkflowRepositoryOptions) {
    this.memoryOptions={evidenceVerifier:options.evidenceVerifier,actorAuthorizationVerifier:options.actorAuthorizationVerifier,workerIdentityVerifier:options.workerIdentityVerifier,terminationProofVerifier:options.terminationProofVerifier,holdClearanceVerifier:options.holdClearanceVerifier,...(options.now?{now:options.now}:{}),...(options.complianceAttestationVerifier?{complianceAttestationVerifier:options.complianceAttestationVerifier}:{})};
    this.maxCasRetries=options.maxCasRetries??8;
    this.requireFencingTokens=options.requireFencingTokens??true;
    if(!Number.isSafeInteger(this.maxCasRetries)||this.maxCasRetries<1||this.maxCasRetries>32)throw new Error("maxCasRetries muss 1..32 sein.");
  }

  async create(project:ProjectWorkflow):Promise<void>{
    const memory=new InMemoryWorkflowRepository(this.memoryOptions); await memory.create(project);
    const bootstrap=await this.options.bootstrapCapability(project.projectId);
    try{await this.options.database.createWorkflowState(bootstrap.capability,bootstrap.subject,bootstrap.actorScope,project,memory.exportPersistentState(project.projectId),memory.exportPersistenceProjection(project.projectId));}
    catch(error){if(error instanceof Error&&error.message.includes("WORKFLOW_PROJECT_ALREADY_EXISTS"))throw new WorkflowError("PROJECT_ALREADY_EXISTS",`Projekt ${project.projectId} existiert bereits.`);throw error;}
  }
  transition(request:TransitionRequest):Promise<TransitionResult>{return this.mutate(request.projectId,memory=>memory.transition(request));}
  claimJob(request:ClaimJobRequest):Promise<WorkflowJob>{return this.mutate(request.projectId,memory=>memory.claimJob(request));}
  authorizeJobWork(request:OwnedJobRequest):Promise<WorkflowJob>{return this.mutateOwned(request,["CLAIMED"],memory=>memory.authorizeJobWork(request),true);}
  heartbeatJob(request:HeartbeatJobRequest):Promise<WorkflowJob>{return this.mutateOwned(request,["CLAIMED"],memory=>memory.heartbeatJob(request),true);}
  completeJob(request:OwnedJobRequest):Promise<WorkflowJob>{return this.mutateOwned(request,["CLAIMED","COMPLETED"],memory=>memory.completeJob(request));}
  confirmJobTermination(request:ConfirmJobTerminationRequest):Promise<WorkflowJob>{return this.mutateOwned(request,["CANCELLING","CANCELLED"],memory=>memory.confirmJobTermination(request));}
  ingestGateAttestation(attestation:GateAttestation):Promise<void>{return this.mutate(attestation.projectId,memory=>memory.ingestGateAttestation(attestation));}
  ingestHoldClearanceAttestation(evidence:HoldClearanceEvidence):Promise<void>{return this.mutate(evidence.projectId,memory=>memory.ingestHoldClearanceAttestation(evidence));}
  ingestLegalAssessment(attestation:LegalAssessmentAttestation):Promise<void>{return this.mutate(attestation.assessment.projectId,memory=>memory.ingestLegalAssessment(attestation));}
  submitLegalRequirement(attestation:LegalRequirementSubmissionAttestation):Promise<void>{return this.mutate(attestation.submission.projectId,memory=>memory.submitLegalRequirement(attestation));}
  decideLegalRequirement(attestation:LegalRequirementDecisionAttestation):Promise<void>{return this.mutate(attestation.decision.projectId,memory=>memory.decideLegalRequirement(attestation));}
  ingestCounselDecision(attestation:CounselDecisionAttestation):Promise<void>{return this.mutate(attestation.decision.projectId,memory=>memory.ingestCounselDecision(attestation));}

  read(projectId:string){return this.inspect(projectId,memory=>memory.read(projectId));}
  readGateResult(projectId:string,id:string){return this.inspect(projectId,memory=>memory.readGateResult(projectId,id));}
  readAuditEvents(projectId:string){return this.inspect(projectId,memory=>memory.readAuditEvents(projectId));}
  readJobs(projectId:string){return this.inspect(projectId,memory=>memory.readJobs(projectId));}
  readJobEvents(projectId:string){return this.inspect(projectId,memory=>memory.readJobEvents(projectId));}
  readLegalAssessments(projectId:string){return this.inspect(projectId,memory=>memory.readLegalAssessments(projectId));}
  readLegalRequirements(projectId:string){return this.inspect(projectId,memory=>memory.readLegalRequirements(projectId));}
  readCounselCases(projectId:string){return this.inspect(projectId,memory=>memory.readCounselCases(projectId));}
  readProjectHolds(projectId:string){return this.inspect(projectId,memory=>memory.readProjectHolds(projectId));}

  private assertFence(request:OwnedJobRequest):void{if(this.requireFencingTokens&&request.fencingToken===undefined)throw new WorkflowError("JOB_NOT_ALLOWED","Persistente Worker-Operationen benoetigen den aktuellen Fencing-Token.");}
  private mutateOwned<T>(request:OwnedJobRequest,allowedStatuses:readonly WorkflowJob["status"][],operation:(memory:InMemoryWorkflowRepository)=>Promise<T>,requireActiveLease=false):Promise<T>{
    this.assertFence(request);
    return this.mutate(request.projectId,async memory=>{
      const current=(await memory.readJobs(request.projectId)).find(job=>job.id===request.jobId);
      if(!current||!allowedStatuses.includes(current.status)||current.leaseOwner!==request.workerId||current.claimIdempotencyKey!==request.claimIdempotencyKey||current.fencingToken!==request.fencingToken)throw new WorkflowError("JOB_NOT_ALLOWED","Persistente Worker-Operation wurde durch Lease-Recovery oder ein neueres Fencing-Token widerrufen.");
      return operation(memory);
    },requireActiveLease?{jobId:request.jobId,workerId:request.workerId,claimIdempotencyKey:request.claimIdempotencyKey,fencingToken:request.fencingToken!,allowedStatuses}:undefined);
  }
  private async load(projectId:string):Promise<{memory:InMemoryWorkflowRepository;snapshot:string;storageVersion:number}|null>{
    const capability=await this.options.projectCapability(projectId,"workflow_state:read");
    const stored=await this.options.database.readWorkflowState(capability); if(!stored)return null;
    const memory=new InMemoryWorkflowRepository({...this.memoryOptions,now:()=>new Date(stored.databaseNow)}); memory.importPersistentState(stored.snapshot);
    return {memory,snapshot:memory.exportPersistentState(projectId),storageVersion:stored.storageVersion};
  }
  private async inspect<T>(projectId:string,operation:(memory:InMemoryWorkflowRepository)=>Promise<T>):Promise<T>{
    const loaded=await this.load(projectId); if(!loaded) {
      const memory=new InMemoryWorkflowRepository(this.memoryOptions); return operation(memory);
    }
    return operation(loaded.memory);
  }
  private async mutate<T>(projectId:string,operation:(memory:InMemoryWorkflowRepository)=>Promise<T>,leaseGuard?:WorkflowLeaseGuard):Promise<T>{
    for(let attempt=0;attempt<this.maxCasRetries;attempt++){
      const loaded=await this.load(projectId);
      if(!loaded){const memory=new InMemoryWorkflowRepository(this.memoryOptions);return operation(memory);}
      let result!:T;let failure:unknown;
      try{result=await operation(loaded.memory);}catch(error){failure=error;}
      const snapshot=loaded.memory.exportPersistentState(projectId);
      if(snapshot===loaded.snapshot){
        if(leaseGuard){
          const capability=await this.options.projectCapability(projectId,"workflow_state:append");
          const validation=await this.options.database.validateWorkflowLease(capability,loaded.storageVersion,leaseGuard);
          if(validation==="VERSION_CONFLICT")continue;
          if(validation==="LEASE_INVALID")throw new WorkflowError("JOB_NOT_ALLOWED","Persistenter Replay wurde durch Lease-Ablauf, Recovery oder ein neueres Fencing-Token widerrufen.");
        }
        if(failure)throw failure;return result;
      }
      const capability=await this.options.projectCapability(projectId,"workflow_state:append");
      const mutation=await this.options.database.compareAndSwapWorkflowState(capability,loaded.storageVersion,snapshot,loaded.memory.exportPersistenceProjection(projectId),leaseGuard);
      if(mutation==="LEASE_INVALID")throw new WorkflowError("JOB_NOT_ALLOWED","Persistente Worker-Operation wurde an der autoritativen Datenbankzeit durch Lease-Ablauf oder Recovery widerrufen.");
      if(mutation==="VALID"){if(failure)throw failure;return result;}
    }
    throw new WorkflowError("VERSION_CONFLICT","Persistenter Workflow-CAS blieb nach Konkurrenzwiederholungen konfliktbehaftet.");
  }
}
