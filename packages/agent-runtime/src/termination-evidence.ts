import { createHash } from "node:crypto";

export const RUNTIME_TERMINATION_EVIDENCE_SCHEMA_VERSION=1 as const;
export type RuntimeTerminationEvidenceType="RUNTIME_TERMINATION_ATTESTATION"|"PROCESS_EXIT_ATTESTATION"|"RUNTIME_TERMINAL_STATUS_ATTESTATION"|"WORKLOAD_NOT_CREATED"|"FAKE_RUNTIME_TERMINATION";
export type RuntimeTerminationEnvironment="DEVELOPMENT"|"TEST"|"RELEASE_CANDIDATE"|"PRODUCTION";
export type RuntimeTerminationVerificationMethod="SIGNED_RUNTIME_ATTESTATION_V1"|"LOCAL_PROCESS_ATTESTATION_V1"|"FAKE_DETERMINISTIC_V1";
export type RuntimeTerminationTerminalState="TERMINATED"|"CANCELLED"|"EXITED"|"NOT_CREATED"|"SUCCEEDED"|"FAILED"|"TIMED_OUT"|"BLOCKED";
export interface RuntimeTerminationAttestationPayload {readonly format:"FAKE_DETERMINISTIC_V1";readonly terminalState:RuntimeTerminationTerminalState;readonly workloadId:string;readonly runtimeEventSequence:number;}
export type RuntimeTerminationRejectionReason="MALFORMED"|"DIGEST_MISMATCH"|"UNTRUSTED_ISSUER"|"UNSUPPORTED_METHOD"|"NOT_TERMINAL"|"STALE"|"PROJECT_SCOPE_MISMATCH"|"RUNTIME_SCOPE_MISMATCH"|"AGENT_RUN_SCOPE_MISMATCH"|"JOB_SCOPE_MISMATCH"|"WORKLOAD_SCOPE_MISMATCH"|"CANCELLATION_SCOPE_MISMATCH"|"LEASE_GENERATION_MISMATCH"|"FENCING_TOKEN_MISMATCH"|"REPLAYED"|"ENVIRONMENT_NOT_ALLOWED"|"VERIFIER_ERROR";

export interface RuntimeTerminationEvidenceCandidate {
  readonly schemaVersion:1;
  readonly evidenceId:string;
  readonly evidenceType:RuntimeTerminationEvidenceType;
  readonly projectId:string;
  readonly runtimeId:string;
  readonly agentRunId:string;
  readonly attemptId:string;
  readonly jobId:string;
  readonly cancellationRequestId:string;
  readonly workloadId:string|null;
  readonly processIdentity:string|null;
  readonly leaseGeneration:number;
  readonly fencingToken:number;
  readonly cancellationSequence:number;
  readonly runtimeEventSequence:number;
  readonly terminalState:RuntimeTerminationTerminalState;
  readonly issuedBy:string;
  readonly issuerEnvironment:RuntimeTerminationEnvironment;
  readonly observedAt:string;
  readonly verificationMethod:RuntimeTerminationVerificationMethod;
  readonly attestationPayload:RuntimeTerminationAttestationPayload;
  readonly attestationPayloadDigest:string;
  readonly evidenceDigest:string;
}

export interface PriorRuntimeTerminationEvidence {readonly evidenceId:string;readonly evidenceDigest:string;readonly scopeKey:string;readonly validity:"VALID"|"REJECTED";readonly consumed:boolean;}
export interface RuntimeTerminationExpectedContext {
  readonly projectId:string;readonly runtimeId:string;readonly agentRunId:string;readonly attemptId:string;readonly jobId:string;readonly cancellationRequestId:string;
  readonly workloadId:string|null;readonly processIdentity:string|null;readonly allowedLeaseGenerations:readonly number[];readonly allowedFencingTokens:readonly number[];
  readonly cancellationSequence:number;readonly minimumRuntimeEventSequence:number;readonly environment:RuntimeTerminationEnvironment;readonly policyVersion:string;
  readonly verifierIdentity:string;readonly now:string;readonly maximumAgeMs:number;readonly trustedIssuers:readonly string[];readonly supportedMethods:readonly RuntimeTerminationVerificationMethod[];
  readonly priorEvidence?:PriorRuntimeTerminationEvidence|undefined;
}
export interface RuntimeTerminationVerificationDecision {
  readonly evidenceId:string;readonly evidenceDigest:string;readonly verifiedAt:string;readonly verifierIdentity:string;readonly validity:"VALID"|"REJECTED";readonly rejectionReason:RuntimeTerminationRejectionReason|null;readonly idempotentReplay:boolean;
}
export interface RuntimeTerminationEvidenceVerifier {verify(candidate:RuntimeTerminationEvidenceCandidate,expectedContext:RuntimeTerminationExpectedContext):RuntimeTerminationVerificationDecision;}

const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).filter(([key])=>key!=="evidenceDigest").sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
export const runtimeTerminationEvidenceDigest=(candidate:Omit<RuntimeTerminationEvidenceCandidate,"evidenceDigest">|RuntimeTerminationEvidenceCandidate):string=>createHash("sha256").update(JSON.stringify(canonical(candidate))).digest("hex");
export const runtimeTerminationAttestationPayloadDigest=(payload:RuntimeTerminationAttestationPayload):string=>createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
export const runtimeTerminationEvidenceScopeKey=(candidate:Pick<RuntimeTerminationEvidenceCandidate,"projectId"|"runtimeId"|"agentRunId"|"attemptId"|"jobId"|"cancellationRequestId"|"workloadId"|"processIdentity">):string=>[candidate.projectId,candidate.runtimeId,candidate.agentRunId,candidate.attemptId,candidate.jobId,candidate.cancellationRequestId,candidate.workloadId??"",candidate.processIdentity??""].join("\0");

export class DefaultRuntimeTerminationEvidenceVerifier implements RuntimeTerminationEvidenceVerifier {
  verify(candidate:RuntimeTerminationEvidenceCandidate,context:RuntimeTerminationExpectedContext):RuntimeTerminationVerificationDecision {
    const reject=(reason:RuntimeTerminationRejectionReason):RuntimeTerminationVerificationDecision=>({evidenceId:String(candidate?.evidenceId??""),evidenceDigest:String(candidate?.evidenceDigest??""),verifiedAt:context.now,verifierIdentity:context.verifierIdentity,validity:"REJECTED",rejectionReason:reason,idempotentReplay:false});
    try {
      const evidenceTypes:readonly RuntimeTerminationEvidenceType[]=["RUNTIME_TERMINATION_ATTESTATION","PROCESS_EXIT_ATTESTATION","RUNTIME_TERMINAL_STATUS_ATTESTATION","WORKLOAD_NOT_CREATED","FAKE_RUNTIME_TERMINATION"];
      const environments:readonly RuntimeTerminationEnvironment[]=["DEVELOPMENT","TEST","RELEASE_CANDIDATE","PRODUCTION"];
      const methods:readonly RuntimeTerminationVerificationMethod[]=["SIGNED_RUNTIME_ATTESTATION_V1","LOCAL_PROCESS_ATTESTATION_V1","FAKE_DETERMINISTIC_V1"];
      const terminalStates:readonly RuntimeTerminationTerminalState[]=["TERMINATED","CANCELLED","EXITED","NOT_CREATED","SUCCEEDED","FAILED","TIMED_OUT","BLOCKED"];
      if(!candidate||candidate.schemaVersion!==1||!candidate.evidenceId||!evidenceTypes.includes(candidate.evidenceType)||!candidate.attemptId||!candidate.issuedBy||!environments.includes(candidate.issuerEnvironment)||!methods.includes(candidate.verificationMethod)||!terminalStates.includes(candidate.terminalState)||!candidate.observedAt||!Number.isSafeInteger(candidate.leaseGeneration)||!Number.isSafeInteger(candidate.fencingToken)||!Number.isSafeInteger(candidate.cancellationSequence)||!Number.isSafeInteger(candidate.runtimeEventSequence)||(candidate.workloadId===null)===(candidate.processIdentity===null)||!candidate.attestationPayload||candidate.attestationPayload.format!=="FAKE_DETERMINISTIC_V1"||!candidate.attestationPayloadDigest)return reject("MALFORMED");
      if(runtimeTerminationEvidenceDigest(candidate)!==candidate.evidenceDigest)return reject("DIGEST_MISMATCH");
      if(runtimeTerminationAttestationPayloadDigest(candidate.attestationPayload)!==candidate.attestationPayloadDigest||candidate.attestationPayload.terminalState!==candidate.terminalState||candidate.attestationPayload.workloadId!==candidate.workloadId||candidate.attestationPayload.runtimeEventSequence!==candidate.runtimeEventSequence)return reject("DIGEST_MISMATCH");
      if(!context.trustedIssuers.includes(candidate.issuedBy))return reject("UNTRUSTED_ISSUER");
      if(candidate.verificationMethod!=="FAKE_DETERMINISTIC_V1"||!context.supportedMethods.includes(candidate.verificationMethod))return reject("UNSUPPORTED_METHOD");
      if(candidate.evidenceType!=="FAKE_RUNTIME_TERMINATION")return reject("UNSUPPORTED_METHOD");
      if(context.priorEvidence&&(context.priorEvidence.evidenceDigest!==candidate.evidenceDigest||context.priorEvidence.scopeKey!==runtimeTerminationEvidenceScopeKey(candidate)))return reject("REPLAYED");
      if(candidate.projectId!==context.projectId)return reject("PROJECT_SCOPE_MISMATCH");
      if(candidate.runtimeId!==context.runtimeId)return reject("RUNTIME_SCOPE_MISMATCH");
      if(candidate.agentRunId!==context.agentRunId)return reject("AGENT_RUN_SCOPE_MISMATCH");
      if(candidate.attemptId!==context.attemptId)return reject("AGENT_RUN_SCOPE_MISMATCH");
      if(candidate.jobId!==context.jobId)return reject("JOB_SCOPE_MISMATCH");
      if(candidate.cancellationRequestId!==context.cancellationRequestId||candidate.cancellationSequence!==context.cancellationSequence)return reject("CANCELLATION_SCOPE_MISMATCH");
      if(candidate.workloadId!==context.workloadId||candidate.processIdentity!==context.processIdentity)return reject("WORKLOAD_SCOPE_MISMATCH");
      if(!context.allowedLeaseGenerations.includes(candidate.leaseGeneration))return reject("LEASE_GENERATION_MISMATCH");
      if(!context.allowedFencingTokens.includes(candidate.fencingToken))return reject("FENCING_TOKEN_MISMATCH");
      if(candidate.runtimeEventSequence<context.minimumRuntimeEventSequence)return reject("STALE");
      const observed=Date.parse(candidate.observedAt),now=Date.parse(context.now);if(!Number.isFinite(observed)||!Number.isFinite(now)||observed>now||now-observed>context.maximumAgeMs)return reject("STALE");
      if(!(["DEVELOPMENT","TEST"] as const).includes(candidate.issuerEnvironment as "DEVELOPMENT"|"TEST"))return reject("ENVIRONMENT_NOT_ALLOWED");
      if(!(["DEVELOPMENT","TEST"] as const).includes(context.environment as "DEVELOPMENT"|"TEST"))return reject("ENVIRONMENT_NOT_ALLOWED");
      if(context.priorEvidence){const prior=context.priorEvidence;if(prior.evidenceDigest!==candidate.evidenceDigest||prior.scopeKey!==runtimeTerminationEvidenceScopeKey(candidate))return reject("REPLAYED");if(prior.validity==="REJECTED")return reject("REPLAYED");return{evidenceId:candidate.evidenceId,evidenceDigest:candidate.evidenceDigest,verifiedAt:context.now,verifierIdentity:context.verifierIdentity,validity:"VALID",rejectionReason:null,idempotentReplay:true};}
      return{evidenceId:candidate.evidenceId,evidenceDigest:candidate.evidenceDigest,verifiedAt:context.now,verifierIdentity:context.verifierIdentity,validity:"VALID",rejectionReason:null,idempotentReplay:false};
    } catch {return reject("VERIFIER_ERROR");}
  }
}
