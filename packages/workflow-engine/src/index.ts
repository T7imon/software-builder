import { createHash, randomUUID } from "node:crypto";

export * from "./planning-orchestrator.js";

export const PROJECT_PHASES = deepFreeze([
  "DRAFT", "DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW",
  "AWAITING_PLAN_APPROVAL", "IMPLEMENTATION", "VERIFICATION", "BLOCKED",
  "RELEASE_CANDIDATE", "STAGING", "PRODUCTION", "COMPLETED", "FAILED", "CANCELLED",
] as const);
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export const GATE_NAMES = deepFreeze([
  "ARCHITECTURE_APPROVED", "PLAN_APPROVED", "TESTS_PASSED", "TYPECHECK_PASSED",
  "LINT_PASSED", "BUILD_PASSED", "QA_REVIEW_PASSED", "REVIEWER_REVIEW_PASSED",
  "SECURITY_REVIEW_PASSED", "LEGAL_REVIEW_PASSED", "CUSTOMER_DATA_CLASSIFIED", "RELEASE_APPROVED",
] as const);
export type GateName = (typeof GATE_NAMES)[number];
export type GateStatus = "PASS" | "FAIL" | "BLOCK" | "STALE" | "NOT_EVALUATED";
export const LEGAL_STATUSES = deepFreeze(["PASS", "PASS_WITH_REQUIREMENTS", "BLOCK", "COUNSEL_REQUIRED"] as const);
export type LegalStatus = (typeof LEGAL_STATUSES)[number];
export type LegalRequirementStatus = "OPEN" | "EVIDENCE_SUBMITTED" | "VERIFIED" | "REJECTED" | "SUPERSEDED";
export type CustomerDataClassification = "SYNTHETIC_ONLY" | "SUSPECTED_REAL" | "CONFIRMED_REAL" | "UNKNOWN";
export interface ComplianceScope { readonly scopeType: string; readonly scopeId: string; }
export interface ImmutableEvidenceReference extends ComplianceScope {
  readonly id: string; readonly projectId: string; readonly revisionDigest: string;
  readonly contentDigest: string; readonly evidenceType: string; readonly classification: string;
  readonly finalizedAt: Date; readonly verifiedAt: Date; readonly trustedIdentity: string;
}
export interface LegalRequirementEvidence {
  readonly id: string;
  readonly status: LegalRequirementStatus;
  readonly subjectRevisionDigest: string;
  readonly evidenceDigest: string;
}
export type AttesterRole = "ARCHITECT" | "OWNER" | "AUTOMATION" | "QA" | "REVIEWER" | "SECURITY" | "LEGAL" | "RELEASE_MANAGER";

export interface GateEvidence {
  readonly id: string;
  readonly projectId: string;
  readonly name: GateName;
  readonly status: GateStatus;
  readonly policyVersion: string;
  readonly subjectRevisionDigest: string;
  readonly evidenceDigest: string;
  readonly evaluatedAt: Date;
  readonly validUntil: Date;
  readonly legalStatus?: LegalStatus;
  readonly legalRequirements?: readonly LegalRequirementEvidence[];
  readonly customerDataClassification?: CustomerDataClassification;
  readonly scopeType?: string;
  readonly scopeId?: string;
}
export interface GateAttestation extends GateEvidence { readonly attesterId: string; readonly proof: string; }
export interface VerifiedAttester { readonly id: string; readonly role: AttesterRole; }
export interface EvidenceVerifier { verify(attestation: GateAttestation): Promise<VerifiedAttester | null>; }
export interface GateResult extends GateEvidence {
  readonly trustedAttester: string;
  readonly attesterRole: AttesterRole;
  readonly ingestedAt: Date;
}

export type ActorRole = "OWNER" | "PLANNER" | "ARCHITECT" | "EXECUTOR" | "QA" | "REVIEWER" | "SECURITY" | "LEGAL" | "RELEASE_MANAGER" | "SYSTEM";
export interface AuthorizedActor { readonly id: string; readonly roles: readonly ActorRole[]; }
export interface ActorAuthorizationVerifier {
  verify(actorId: string, projectId: string): Promise<AuthorizedActor | null>;
}

export type WorkerOperation = "CLAIM" | "AUTHORIZE" | "HEARTBEAT" | "COMPLETE" | "TERMINATE";
export interface VerifiedWorkerIdentity { readonly id: string; }
export interface WorkerIdentityVerifier {
  verify(workerId: string, projectId: string, operation: WorkerOperation): Promise<VerifiedWorkerIdentity | null>;
}
export interface TerminationEvidence {
  readonly id: string;
  readonly evidenceDigest: string;
  readonly processEndedAt: Date;
  readonly mountRevokedAt: Date;
  readonly credentialsRevokedAt: Date;
  readonly proof: string;
}
export interface VerifiedTerminationEvidence extends Omit<TerminationEvidence, "proof"> {
  readonly workerId: string;
  readonly jobId: string;
}
export interface TerminationProofVerifier {
  verify(evidence: TerminationEvidence, context: { readonly projectId: string; readonly jobId: string; readonly workerId: string }): Promise<VerifiedTerminationEvidence | null>;
}

export type HoldType = "GENERAL" | "SECURITY" | "LEGAL";
export type ComplianceHoldType = "LEGAL_UNRESOLVED_HOLD" | "LEGAL_BLOCK_HOLD" | "LEGAL_REQUIREMENT_HOLD" | "COUNSEL_REQUIRED_HOLD" | "SECURITY_ADVERSE_HOLD" | "PROHIBITED_DATA_HOLD";
export type HoldClearingAuthority = "SECURITY" | "LEGAL";
export interface LegalAssessment extends ComplianceScope {
  readonly id: string; readonly projectId: string; readonly revisionDigest: string; readonly status: LegalStatus;
  readonly factsDigest: string; readonly assumptionsRef: string; readonly jurisdictions: readonly string[];
  readonly legalDate: Date; readonly sourceSetId: string; readonly reviewerType: string;
  readonly evidence: ImmutableEvidenceReference; readonly supersedesId?: string; readonly predecessorCounselCaseId?: string;
  readonly finalizedAt: Date; readonly ingestedAt: Date; readonly verifiedLegalIdentity: string;
}
export interface LegalRequirement extends ComplianceScope {
  readonly id: string; readonly projectId: string; readonly assessmentId: string; readonly requirementRef: string;
  readonly createdAt: Date;
  readonly state: LegalRequirementStatus; readonly submittedEvidence?: ImmutableEvidenceReference;
  readonly submittedAt?: Date; readonly submittedBy?: string; readonly submissionIngestedAt?: Date;
  readonly verificationEvidence?: ImmutableEvidenceReference; readonly verifiedBy?: string; readonly verifiedAt?: Date; readonly decisionIngestedAt?: Date;
  readonly supersededByAssessmentId?: string;
}
export interface CounselCase extends ComplianceScope {
  readonly id: string; readonly projectId: string; readonly assessmentId: string; readonly state: "OPEN" | "CLOSED";
  readonly openedAt: Date; readonly closedAt?: Date; readonly decisionId?: string;
  readonly qualifiedCounselIdentityRef?: string; readonly encryptedDecisionEvidenceId?: string;
}
export interface CounselDecision extends ComplianceScope {
  readonly id: string; readonly projectId: string; readonly counselCaseId: string; readonly predecessorAssessmentId: string;
  readonly qualifiedCounselIdentityRef: string; readonly evidence: ImmutableEvidenceReference;
  readonly decidedAt: Date; readonly ingestedAt: Date;
}
export interface ProjectHold extends ComplianceScope {
  readonly id: string; readonly projectId: string; readonly holdType: ComplianceHoldType; readonly state: "OPEN" | "CLEARED";
  readonly sourceRecordType: "GATE_RESULT" | "LEGAL_ASSESSMENT" | "LEGAL_REQUIREMENT" | "SYSTEM";
  readonly sourceRecordId: string; readonly sourceEvidence: ImmutableEvidenceReference; readonly clearingAuthority: HoldClearingAuthority;
  readonly createdAt: Date; readonly clearingEvidence?: VerifiedHoldClearance; readonly clearedAt?: Date;
}
export interface BlockReason {
  readonly code: string;
  readonly message: string;
  readonly evidenceRef?: string;
  readonly holdType?: HoldType;
  readonly clearingAuthority?: HoldClearingAuthority;
}
export interface HoldClearanceEvidence {
  readonly id: string;
  readonly projectId: string;
  readonly holdCode: string;
  readonly scopeType?: string;
  readonly scopeId?: string;
  readonly sourceRecordType?: ProjectHold["sourceRecordType"];
  readonly sourceRecordId?: string;
  readonly clearingAuthority: HoldClearingAuthority;
  readonly authorityId: string;
  readonly subjectRevisionDigest: string;
  readonly evidenceDigest: string;
  readonly evidenceRef?: ImmutableEvidenceReference;
  readonly verifiedAt: Date;
  readonly proof: string;
}
export interface VerifiedHoldClearance extends Omit<HoldClearanceEvidence, "proof"> { readonly ingestedAt: Date; }
export interface HoldClearanceVerifier { verify(evidence: HoldClearanceEvidence): Promise<{ readonly id: string; readonly role: HoldClearingAuthority } | null>; }
export interface ProjectWorkflow {
  readonly projectId: string;
  readonly phase: ProjectPhase;
  readonly version: number;
  readonly policyVersion: string;
  readonly revisionDigest: string;
  readonly blockedFrom?: ProjectPhase;
  readonly frozenRevisionDigest?: string;
  readonly blockReasons: readonly BlockReason[];
}
export interface AuditEvent {
  readonly id: string;
  readonly projectId: string;
  readonly sequence: number;
  readonly actorId: string;
  readonly previousPhase: ProjectPhase;
  readonly newPhase: ProjectPhase;
  readonly reason: string;
  readonly policyVersion: string;
  readonly previousRevisionDigest: string;
  readonly newRevisionDigest: string;
  readonly idempotencyKey: string;
  readonly operationScope: ComplianceScope;
  readonly gateBindings: readonly {
    readonly gateResultId: string;
    readonly evidenceDigest: string;
    readonly subjectRevisionDigest: string;
    readonly trustedAttester: string;
    readonly attesterRole: AttesterRole;
  }[];
  readonly holdClearanceBindings?: readonly VerifiedHoldClearance[];
  readonly blockReasons: readonly BlockReason[];
  readonly occurredAt: Date;
  readonly previousHash: string | null;
  readonly eventHash: string;
  readonly jobBinding?: {
    readonly id: string;
    readonly type: JobType;
    readonly status: JobStatus;
    readonly revisionDigest: string;
    readonly aggregateVersion: number;
    readonly operationScope: ComplianceScope;
  };
}

export const JOB_TYPES = deepFreeze([
  "DISCOVERY_CONTROL", "SPECIFICATION_CONTROL", "ARCHITECTURE_CONTROL",
  "PRE_BUILD_REVIEW_CONTROL", "IMPLEMENTATION_CONTROL", "VERIFICATION_CONTROL",
] as const);
export type JobType = (typeof JOB_TYPES)[number];
export type JobStatus = "PENDING" | "CLAIMED" | "CANCELLING" | "COMPLETED" | "CANCELLED";
export interface WorkflowJob {
  readonly id: string;
  readonly projectId: string;
  readonly type: JobType;
  readonly phase: ProjectPhase;
  readonly aggregateVersion: number;
  readonly revisionDigest: string;
  readonly status: JobStatus;
  readonly idempotencyKey: string;
  readonly operationScope: ComplianceScope;
  readonly createdAt: Date;
  readonly claimedAt?: Date;
  readonly leaseOwner?: string;
  readonly claimIdempotencyKey?: string;
  readonly leaseExpiresAt?: Date;
  readonly fencingToken?: number;
  readonly completedAt?: Date;
  readonly cancelledAt?: Date;
}
export type JobEventType = "CLAIMED" | "AUTHORIZED" | "HEARTBEAT" | "COMPLETED" | "CANCELLING" | "CANCELLED";
export interface JobAuditEvent {
  readonly id: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly type: JobEventType;
  readonly workerId?: string;
  readonly occurredAt: Date;
  readonly jobStatus: JobStatus;
  readonly jobType: JobType;
  readonly revisionDigest: string;
  readonly aggregateVersion: number;
  readonly idempotencyKey?: string;
  readonly terminationEvidenceId?: string;
  readonly terminationEvidenceDigest?: string;
  readonly complianceFailureBindings?: readonly {
    readonly holdId: string;
    readonly reason: string;
    readonly sourceRecordType: ProjectHold["sourceRecordType"];
    readonly sourceRecordId: string;
    readonly evidence: ImmutableEvidenceReference;
  }[];
  readonly previousHash: string | null;
  readonly eventHash: string;
}
export interface TransitionRequest {
  readonly projectId: string;
  readonly targetPhase: ProjectPhase;
  readonly expectedVersion: number;
  readonly expectedRevisionDigest: string;
  readonly policyVersion: string;
  readonly actorId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly gateResultIds?: readonly string[];
  readonly blockReasons?: readonly BlockReason[];
  readonly holdClearanceIds?: readonly string[];
  readonly newRevisionDigest?: string;
  readonly startJob?: { readonly type: JobType };
  readonly operationScope?: ComplianceScope;
}
export interface TransitionResult { readonly project: ProjectWorkflow; readonly auditEvent: AuditEvent; readonly job?: WorkflowJob; readonly duplicate: boolean; }
export interface ClaimJobRequest {
  readonly jobId: string;
  readonly projectId: string;
  readonly expectedAggregateVersion: number;
  readonly expectedRevisionDigest: string;
  readonly workerId: string;
  readonly idempotencyKey: string;
  readonly leaseDurationMs: number;
}
export interface OwnedJobRequest {
  readonly jobId: string;
  readonly projectId: string;
  readonly expectedAggregateVersion: number;
  readonly expectedRevisionDigest: string;
  readonly workerId: string;
  readonly claimIdempotencyKey: string;
  readonly idempotencyKey: string;
  readonly fencingToken?: number;
}
export interface HeartbeatJobRequest extends OwnedJobRequest { readonly extendLeaseByMs: number; }
export interface ConfirmJobTerminationRequest extends OwnedJobRequest { readonly terminationEvidence: TerminationEvidence; }
export type LegalAssessmentInput = Omit<LegalAssessment, "ingestedAt" | "verifiedLegalIdentity"> & {
  readonly requirements?: readonly { readonly id: string; readonly requirementRef: string }[];
};
export interface LegalRequirementSubmission {
  readonly projectId: string; readonly requirementId: string; readonly assessmentId: string;
  readonly evidence: ImmutableEvidenceReference; readonly submittedAt: Date;
}
export interface LegalRequirementDecision {
  readonly projectId: string; readonly requirementId: string; readonly assessmentId: string;
  readonly decision: "VERIFIED" | "REJECTED"; readonly evidence: ImmutableEvidenceReference; readonly decidedAt: Date;
}
export type CounselDecisionInput = Omit<CounselDecision, "ingestedAt">;
export interface LegalAssessmentAttestation { readonly assessment: LegalAssessmentInput; readonly legalIdentity: string; readonly proof: string; }
export interface LegalRequirementSubmissionAttestation { readonly submission: LegalRequirementSubmission; readonly submitterIdentity: string; readonly proof: string; }
export interface LegalRequirementDecisionAttestation { readonly decision: LegalRequirementDecision; readonly legalIdentity: string; readonly proof: string; }
export interface CounselDecisionAttestation { readonly decision: CounselDecisionInput; readonly proof: string; }

export type WorkflowErrorCode =
  | "PROJECT_NOT_FOUND" | "PROJECT_ALREADY_EXISTS" | "INVALID_TRANSITION"
  | "VERSION_CONFLICT" | "REVISION_CONFLICT" | "IDEMPOTENCY_CONFLICT"
  | "GATE_REQUIRED" | "GATE_INVALID" | "GATE_ALREADY_EXISTS"
  | "BLOCK_REASONS_REQUIRED" | "INVALID_REQUEST" | "UNAUTHORIZED" | "JOB_NOT_ALLOWED" | "JOB_NOT_FOUND";
export class WorkflowError extends Error {
  constructor(readonly code: WorkflowErrorCode, message: string) { super(message); this.name = "WorkflowError"; }
}

const TRANSITION_RULES = deepFreeze({
  DRAFT: ["DISCOVERY", "FAILED", "CANCELLED"],
  DISCOVERY: ["SPECIFICATION", "BLOCKED", "FAILED", "CANCELLED"],
  SPECIFICATION: ["ARCHITECTURE", "BLOCKED", "FAILED", "CANCELLED"],
  ARCHITECTURE: ["PRE_BUILD_REVIEW", "BLOCKED", "FAILED", "CANCELLED"],
  PRE_BUILD_REVIEW: ["AWAITING_PLAN_APPROVAL", "BLOCKED", "FAILED", "CANCELLED"],
  AWAITING_PLAN_APPROVAL: ["IMPLEMENTATION", "BLOCKED", "FAILED", "CANCELLED"],
  IMPLEMENTATION: ["VERIFICATION", "BLOCKED", "FAILED", "CANCELLED"],
  VERIFICATION: ["IMPLEMENTATION", "RELEASE_CANDIDATE", "BLOCKED", "FAILED", "CANCELLED"],
  BLOCKED: ["DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW", "AWAITING_PLAN_APPROVAL", "IMPLEMENTATION", "VERIFICATION", "RELEASE_CANDIDATE", "STAGING", "FAILED", "CANCELLED"],
  RELEASE_CANDIDATE: ["STAGING", "BLOCKED", "FAILED", "CANCELLED"],
  STAGING: ["COMPLETED", "BLOCKED", "FAILED", "CANCELLED"],
  PRODUCTION: [], COMPLETED: [], FAILED: [], CANCELLED: [],
} as const satisfies Record<ProjectPhase, readonly ProjectPhase[]>);
const transitionSets: Readonly<Record<ProjectPhase, ReadonlySet<ProjectPhase>>> = Object.fromEntries(
  PROJECT_PHASES.map((phase) => [phase, new Set<ProjectPhase>(TRANSITION_RULES[phase])]),
) as unknown as Record<ProjectPhase, ReadonlySet<ProjectPhase>>;
export const ALLOWED_TRANSITIONS: Readonly<Record<ProjectPhase, readonly ProjectPhase[]>> = deepFreeze(
  Object.fromEntries(PROJECT_PHASES.map((phase) => [phase, [...TRANSITION_RULES[phase]]])),
) as unknown as Readonly<Record<ProjectPhase, readonly ProjectPhase[]>>;
export function isTransitionAllowed(source: ProjectPhase, target: ProjectPhase): boolean { return transitionSets[source]?.has(target) ?? false; }

const QUALITY_GATES = deepFreeze(["TESTS_PASSED", "TYPECHECK_PASSED", "LINT_PASSED", "BUILD_PASSED", "QA_REVIEW_PASSED", "REVIEWER_REVIEW_PASSED", "SECURITY_REVIEW_PASSED", "LEGAL_REVIEW_PASSED"] as const satisfies readonly GateName[]);
const GATE_RULES = deepFreeze({
  "AWAITING_PLAN_APPROVAL->IMPLEMENTATION": ["ARCHITECTURE_APPROVED", "PLAN_APPROVED", "CUSTOMER_DATA_CLASSIFIED"],
  "VERIFICATION->IMPLEMENTATION": ["ARCHITECTURE_APPROVED", "PLAN_APPROVED", "CUSTOMER_DATA_CLASSIFIED"],
  "VERIFICATION->RELEASE_CANDIDATE": [...QUALITY_GATES, "CUSTOMER_DATA_CLASSIFIED"],
  "RELEASE_CANDIDATE->STAGING": ["RELEASE_APPROVED", "CUSTOMER_DATA_CLASSIFIED"],
  "BLOCKED->IMPLEMENTATION": ["ARCHITECTURE_APPROVED", "PLAN_APPROVED", "CUSTOMER_DATA_CLASSIFIED"],
  "BLOCKED->RELEASE_CANDIDATE": [...QUALITY_GATES, "CUSTOMER_DATA_CLASSIFIED"],
  "BLOCKED->STAGING": ["RELEASE_APPROVED", "CUSTOMER_DATA_CLASSIFIED"],
} satisfies Record<string, readonly GateName[]>);
const requiredGateSets = new Map(Object.entries(GATE_RULES).map(([key, names]) => [key, new Set(names)]));
export const REQUIRED_GATES: Readonly<Record<string, readonly GateName[]>> = deepFreeze(
  Object.fromEntries(Object.entries(GATE_RULES).map(([key, names]) => [key, [...names]])),
);

const GATE_ATTESTER_ROLE_RULES: Readonly<Record<GateName, AttesterRole>> = deepFreeze({
  ARCHITECTURE_APPROVED: "ARCHITECT", PLAN_APPROVED: "OWNER",
  TESTS_PASSED: "AUTOMATION", TYPECHECK_PASSED: "AUTOMATION", LINT_PASSED: "AUTOMATION", BUILD_PASSED: "AUTOMATION",
  QA_REVIEW_PASSED: "QA", REVIEWER_REVIEW_PASSED: "REVIEWER", SECURITY_REVIEW_PASSED: "SECURITY",
  LEGAL_REVIEW_PASSED: "LEGAL", CUSTOMER_DATA_CLASSIFIED: "SECURITY", RELEASE_APPROVED: "RELEASE_MANAGER",
});
export const GATE_ATTESTER_ROLES: Readonly<Record<GateName, AttesterRole>> = deepFreeze({ ...GATE_ATTESTER_ROLE_RULES });

const DEFAULT_TRANSITION_ROLES = ["OWNER", "SYSTEM"] as const satisfies readonly ActorRole[];
const TRANSITION_ACTOR_ROLE_RULES: Readonly<Record<ProjectPhase, readonly ActorRole[]>> = deepFreeze({
  DRAFT: DEFAULT_TRANSITION_ROLES,
  DISCOVERY: ["OWNER", "PLANNER", "SYSTEM"],
  SPECIFICATION: ["OWNER", "PLANNER", "SYSTEM"],
  ARCHITECTURE: ["OWNER", "ARCHITECT", "SYSTEM"],
  PRE_BUILD_REVIEW: ["OWNER", "ARCHITECT", "SYSTEM"],
  AWAITING_PLAN_APPROVAL: DEFAULT_TRANSITION_ROLES,
  IMPLEMENTATION: ["OWNER", "EXECUTOR", "SYSTEM"],
  VERIFICATION: ["OWNER", "EXECUTOR", "QA", "SYSTEM"],
  BLOCKED: ["OWNER", "EXECUTOR", "QA", "SECURITY", "LEGAL", "SYSTEM"],
  RELEASE_CANDIDATE: ["OWNER", "RELEASE_MANAGER", "SYSTEM"],
  STAGING: ["OWNER", "RELEASE_MANAGER", "SYSTEM"],
  PRODUCTION: [],
  COMPLETED: ["OWNER", "RELEASE_MANAGER", "SYSTEM"],
  FAILED: DEFAULT_TRANSITION_ROLES,
  CANCELLED: DEFAULT_TRANSITION_ROLES,
});
export const TRANSITION_ACTOR_ROLES = deepFreeze({ ...TRANSITION_ACTOR_ROLE_RULES });

const PHASE_JOB_RULES: Readonly<Record<ProjectPhase, readonly JobType[]>> = deepFreeze({
  DRAFT: [], DISCOVERY: ["DISCOVERY_CONTROL"], SPECIFICATION: ["SPECIFICATION_CONTROL"],
  ARCHITECTURE: ["ARCHITECTURE_CONTROL"], PRE_BUILD_REVIEW: ["PRE_BUILD_REVIEW_CONTROL"],
  AWAITING_PLAN_APPROVAL: [], IMPLEMENTATION: ["IMPLEMENTATION_CONTROL"], VERIFICATION: ["VERIFICATION_CONTROL"],
  BLOCKED: [], RELEASE_CANDIDATE: [], STAGING: [], PRODUCTION: [], COMPLETED: [], FAILED: [], CANCELLED: [],
});
const phaseJobSets: Readonly<Record<ProjectPhase, ReadonlySet<JobType>>> = Object.fromEntries(
  PROJECT_PHASES.map((phase) => [phase, new Set(PHASE_JOB_RULES[phase])]),
) as unknown as Record<ProjectPhase, ReadonlySet<JobType>>;
export const PHASE_JOB_TYPES: Readonly<Record<ProjectPhase, readonly JobType[]>> = deepFreeze(
  Object.fromEntries(PROJECT_PHASES.map((phase) => [phase, [...PHASE_JOB_RULES[phase]]])),
) as unknown as Readonly<Record<ProjectPhase, readonly JobType[]>>;

interface IdempotencyRecord { readonly requestHash: string; readonly result: Omit<TransitionResult, "duplicate">; }
interface JobIdempotencyRecord { readonly requestHash: string; readonly result: WorkflowJob; }
interface WorkflowRecord {
  project: ProjectWorkflow;
  readonly gates: Map<string, GateResult>;
  readonly auditEvents: AuditEvent[];
  readonly jobs: WorkflowJob[];
  readonly jobEvents: JobAuditEvent[];
  readonly idempotency: Map<string, IdempotencyRecord>;
  readonly jobIdempotency: Map<string, JobIdempotencyRecord>;
  readonly holdClearances: Map<string, VerifiedHoldClearance>;
  readonly terminationEvidence: Map<string, VerifiedTerminationEvidence>;
  readonly legalAssessments: Map<string, LegalAssessment>;
  readonly legalRequirements: Map<string, LegalRequirement>;
  readonly counselCases: Map<string, CounselCase>;
  readonly counselDecisions: Map<string, CounselDecision>;
  readonly holds: Map<string, ProjectHold>;
  readonly consumedClearances: Set<string>;
  readonly consumedClearanceSemantics: Set<string>;
  readonly evidenceUsageById: Map<string, string>;
  readonly evidenceUsageByDigest: Map<string, string>;
  readonly evidenceSemanticUsage: Set<string>;
  readonly gateSemanticUsage: Set<string>;
}

export interface WorkflowPersistenceProjection {
  readonly project: ProjectWorkflow;
  readonly gates: readonly GateResult[];
  readonly auditEvents: readonly AuditEvent[];
  readonly jobs: readonly WorkflowJob[];
  readonly jobEvents: readonly JobAuditEvent[];
  readonly holdClearances: readonly VerifiedHoldClearance[];
  readonly terminationEvidence: readonly VerifiedTerminationEvidence[];
  readonly legalAssessments: readonly LegalAssessment[];
  readonly legalRequirements: readonly LegalRequirement[];
  readonly counselCases: readonly CounselCase[];
  readonly counselDecisions: readonly CounselDecision[];
  readonly holds: readonly ProjectHold[];
  readonly idempotencyRecords: readonly { readonly kind: "TRANSITION" | "JOB"; readonly scopeKey: string; readonly requestHash: string; readonly resultRef: string }[];
}

export interface WorkflowRepository {
  create(project: ProjectWorkflow): Promise<void>;
  transition(request: TransitionRequest): Promise<TransitionResult>;
  claimJob(request: ClaimJobRequest): Promise<WorkflowJob>;
  authorizeJobWork(request: OwnedJobRequest): Promise<WorkflowJob>;
  heartbeatJob(request: HeartbeatJobRequest): Promise<WorkflowJob>;
  completeJob(request: OwnedJobRequest): Promise<WorkflowJob>;
  confirmJobTermination(request: ConfirmJobTerminationRequest): Promise<WorkflowJob>;
  read(projectId: string): Promise<ProjectWorkflow | null>;
  readGateResult(projectId: string, gateResultId: string): Promise<GateResult | null>;
  readAuditEvents(projectId: string): Promise<readonly AuditEvent[]>;
  readJobs(projectId: string): Promise<readonly WorkflowJob[]>;
  readJobEvents(projectId: string): Promise<readonly JobAuditEvent[]>;
  ingestLegalAssessment(attestation: LegalAssessmentAttestation): Promise<void>;
  submitLegalRequirement(attestation: LegalRequirementSubmissionAttestation): Promise<void>;
  decideLegalRequirement(attestation: LegalRequirementDecisionAttestation): Promise<void>;
  ingestCounselDecision(attestation: CounselDecisionAttestation): Promise<void>;
  readLegalAssessments(projectId: string): Promise<readonly LegalAssessment[]>;
  readLegalRequirements(projectId: string): Promise<readonly LegalRequirement[]>;
  readCounselCases(projectId: string): Promise<readonly CounselCase[]>;
  readProjectHolds(projectId: string): Promise<readonly ProjectHold[]>;
}
export interface InMemoryWorkflowRepositoryOptions {
  readonly now?: () => Date;
  readonly evidenceVerifier: EvidenceVerifier;
  readonly actorAuthorizationVerifier: ActorAuthorizationVerifier;
  readonly workerIdentityVerifier: WorkerIdentityVerifier;
  readonly terminationProofVerifier: TerminationProofVerifier;
  readonly holdClearanceVerifier: HoldClearanceVerifier;
  readonly complianceAttestationVerifier?: (kind: "LEGAL_ASSESSMENT" | "REQUIREMENT_SUBMISSION" | "REQUIREMENT_DECISION" | "COUNSEL_DECISION", payload: unknown, identity: string, proof: string) => Promise<boolean>;
}

/** Process-local adapter. Its configured EvidenceVerifier is the only trusted gate-ingest boundary. */
export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly records = new Map<string, WorkflowRecord>();
  private readonly locks = new Map<string, Promise<void>>();
  private readonly now: () => Date;
  private readonly evidenceVerifier: EvidenceVerifier;
  private readonly actorAuthorizationVerifier: ActorAuthorizationVerifier;
  private readonly workerIdentityVerifier: WorkerIdentityVerifier;
  private readonly terminationProofVerifier: TerminationProofVerifier;
  private readonly holdClearanceVerifier: HoldClearanceVerifier;
  private readonly complianceAttestationVerifier: NonNullable<InMemoryWorkflowRepositoryOptions["complianceAttestationVerifier"]>;

  constructor(options: InMemoryWorkflowRepositoryOptions) {
    this.now = options.now ?? (() => new Date());
    this.evidenceVerifier = options.evidenceVerifier;
    this.actorAuthorizationVerifier = options.actorAuthorizationVerifier;
    this.workerIdentityVerifier = options.workerIdentityVerifier;
    this.terminationProofVerifier = options.terminationProofVerifier;
    this.holdClearanceVerifier = options.holdClearanceVerifier;
    this.complianceAttestationVerifier = options.complianceAttestationVerifier ?? (async () => false);
  }

  create(project: ProjectWorkflow): Promise<void> {
    const input = cloneProject(project);
    validateInitialProject(input);
    return this.withLock(input.projectId, () => {
      if (this.records.has(input.projectId)) throw new WorkflowError("PROJECT_ALREADY_EXISTS", `Projekt ${input.projectId} existiert bereits.`);
      this.records.set(input.projectId, { project: input, gates: new Map(), auditEvents: [], jobs: [], jobEvents: [], idempotency: new Map(), jobIdempotency: new Map(), holdClearances: new Map(), terminationEvidence: new Map(), legalAssessments: new Map(), legalRequirements: new Map(), counselCases: new Map(), counselDecisions: new Map(), holds: new Map(), consumedClearances: new Set(), consumedClearanceSemantics: new Set(), evidenceUsageById: new Map(), evidenceUsageByDigest: new Map(), evidenceSemanticUsage: new Set(), gateSemanticUsage: new Set() });
    });
  }

  ingestGateAttestation(attestation: GateAttestation): Promise<void> {
    const input = cloneAttestation(attestation);
    validateGateEvidence(input);
    return this.ingestGateSnapshot(input);
  }

  ingestHoldClearanceAttestation(evidence: HoldClearanceEvidence): Promise<void> {
    const input = cloneHoldClearanceEvidence(evidence);
    return this.ingestHoldClearanceSnapshot(input);
  }

  private async ingestHoldClearanceSnapshot(input: HoldClearanceEvidence): Promise<void> {
    validateHoldClearanceEvidence(input);
    const identity = await this.holdClearanceVerifier.verify(cloneHoldClearanceEvidence(input));
    if (!identity || identity.id !== input.authorityId || identity.role !== input.clearingAuthority) {
      throw new WorkflowError("GATE_INVALID", "Hold-Clearing ist nicht durch die erforderliche Authority verifiziert.");
    }
    await this.withRecord(input.projectId, (record) => {
      const ingestedAt = this.currentTime();
      if (input.verifiedAt > ingestedAt) throw new WorkflowError("GATE_INVALID", "Hold-Clearing darf nicht in der Zukunft liegen.");
      if (record.holdClearances.has(input.id)) throw new WorkflowError("GATE_ALREADY_EXISTS", `Hold-Clearing ${input.id} ist unveraenderlich und existiert bereits.`);
      record.holdClearances.set(input.id, cloneVerifiedHoldClearance({ ...input, ingestedAt }));
    });
  }

  private async ingestGateSnapshot(input: GateAttestation): Promise<void> {
    const verifiedRaw = await this.evidenceVerifier.verify(cloneAttestation(input));
    const verified = verifiedRaw ? { id: strictString(verifiedRaw.id, "verifiedAttester.id"), role: verifiedRaw.role } : null;
    if (!verified || verified.id !== input.attesterId || GATE_ATTESTER_ROLE_RULES[input.name] !== verified.role) {
      throw new WorkflowError("GATE_INVALID", "Attestation ist nicht verifiziert oder fuer dieses Gate nicht autorisiert.");
    }
    await this.withRecord(input.projectId, (record) => {
      const ingestedAt = this.currentTime();
      if (input.evaluatedAt > ingestedAt) throw new WorkflowError("GATE_INVALID", "Gate-Auswertung darf nicht in der Zukunft liegen.");
      const gate: GateResult = { ...cloneGateEvidence(input), trustedAttester: verified.id, attesterRole: verified.role, ingestedAt };
      if (record.gates.has(gate.id)) throw new WorkflowError("GATE_ALREADY_EXISTS", `GateResult ${gate.id} ist unveraenderlich und existiert bereits.`);
      const replayKey = gateReplayKey(gate);
      if (record.gateSemanticUsage.has(replayKey) || record.evidenceUsageById.has(gate.id) || record.evidenceUsageByDigest.has(gate.evidenceDigest)) throw new WorkflowError("GATE_ALREADY_EXISTS", "Gate Evidence wurde unter anderer ID oder fuer einen anderen Zweck wiederholt.");
      const scope = gateScope(gate);
      const conflicts = [...record.gates.values()].filter((item) => item.name === gate.name && item.projectId === gate.projectId && item.policyVersion === gate.policyVersion && item.subjectRevisionDigest === gate.subjectRevisionDigest && sameScope(gateScope(item), scope) && compareGateAuthority(item, gate) === 0 && gateOutcomeKey(item) !== gateOutcomeKey(gate));
      record.gates.set(gate.id, cloneGate(gate));
      record.gateSemanticUsage.add(replayKey); record.evidenceUsageById.set(gate.id, `GATE:${gate.name}`); record.evidenceUsageByDigest.set(gate.evidenceDigest, `GATE:${gate.name}`);
      const evidence = gateEvidenceReference(gate, scope);
      const complianceFailures: ComplianceFailureBinding[] = [];
      let mustCancelActiveJobs = false;
      if (gate.name === "CUSTOMER_DATA_CLASSIFIED" && (gate.status !== "PASS" || gate.customerDataClassification !== "SYNTHETIC_ONLY")) {
        openPersistentHold(record, "PROHIBITED_DATA_HOLD", "GATE_RESULT", gate.id, evidence, scope, "SECURITY", ingestedAt);
        complianceFailures.push(complianceFailureBinding("PROHIBITED_DATA_HOLD", "GATE_RESULT", gate.id, evidence, "Autoritative SYNTHETIC_ONLY-Evidence wurde waehrend des laufenden Jobs advers invalidiert."));
        mustCancelActiveJobs = true;
      }
      if (gate.name === "SECURITY_REVIEW_PASSED" && gate.status !== "PASS") {
        openPersistentHold(record, "SECURITY_ADVERSE_HOLD", "GATE_RESULT", gate.id, evidence, scope, "SECURITY", ingestedAt);
        complianceFailures.push(complianceFailureBinding("SECURITY_ADVERSE_HOLD", "GATE_RESULT", gate.id, evidence, "Autoritative Security-Evidence wurde waehrend des laufenden Jobs advers invalidiert."));
        mustCancelActiveJobs = true;
      }
      if (gate.name === "LEGAL_REVIEW_PASSED" && (gate.status !== "PASS" || gate.validUntil <= ingestedAt)) {
        openPersistentHold(record, "LEGAL_UNRESOLVED_HOLD", "GATE_RESULT", gate.id, evidence, scope, "LEGAL", ingestedAt);
        mustCancelActiveJobs = true;
      }
      if (conflicts.length) {
        const conflictItems = [...conflicts, gate]; const conflictSource = gateConflictSource(conflictItems, scope, ingestedAt);
        const type: ComplianceHoldType = gate.name === "LEGAL_REVIEW_PASSED" ? "LEGAL_UNRESOLVED_HOLD" : gate.name === "CUSTOMER_DATA_CLASSIFIED" ? "PROHIBITED_DATA_HOLD" : "SECURITY_ADVERSE_HOLD";
        openPersistentHold(record, type, "SYSTEM", conflictSource.sourceId, conflictSource.evidence, scope, type === "LEGAL_UNRESOLVED_HOLD" ? "LEGAL" : "SECURITY", ingestedAt);
        if (type !== "LEGAL_UNRESOLVED_HOLD") complianceFailures.push(complianceFailureBinding(type, "SYSTEM", conflictSource.sourceId, conflictSource.evidence, "Gleichrangig konfliktbehaftete autoritative Evidence hat die laufende Autorisierung fail-closed invalidiert."));
        mustCancelActiveJobs = true;
      }
      if (mustCancelActiveJobs) cancelActiveJobs(record, ingestedAt, complianceFailures);
    });
  }

  transition(request: TransitionRequest): Promise<TransitionResult> {
    const input = cloneTransitionRequest(request);
    validateTransitionRequest(input);
    const requestHash = hashCanonical(canonicalRequest(input));
    const scopeKey = canonical([input.actorId, input.idempotencyKey]);
    return this.withRecord(input.projectId, async (record) => {
      const operationScope = transitionScope(input);
      const verifiedActor = await this.actorAuthorizationVerifier.verify(input.actorId, input.projectId);
      if (!isAuthorizedActor(verifiedActor, input.actorId)) throw new WorkflowError("UNAUTHORIZED", `${input.actorId} ist nicht als autorisierter Actor verifiziert.`);
      const prior = record.idempotency.get(scopeKey);
      if (prior) {
        if (prior.requestHash !== requestHash) throw new WorkflowError("IDEMPOTENCY_CONFLICT", "Actor-scoped Idempotenzschluessel wurde fuer einen anderen Befehl verwendet.");
        if (!verifiedActor.roles.some((role) => TRANSITION_ACTOR_ROLE_RULES[input.targetPhase].includes(role))) throw new WorkflowError("UNAUTHORIZED", `${input.actorId} ist fuer den Uebergang nach ${input.targetPhase} nicht autorisiert.`);
        if (!["BLOCKED", "FAILED", "CANCELLED"].includes(input.targetPhase)) {
          const replayNow = this.currentTime();
          enforceRuntimeEvidenceForActiveJobInScope(record, prior.result.project.revisionDigest, operationScope, replayNow);
          assertNoOpenComplianceHolds(record, operationScope);
          assertOperationalEvidence(record, prior.result.project.revisionDigest, replayNow, [], operationScope, Boolean(prior.result.job) || isLegalRequiredPhase(input.targetPhase));
        }
        return replayResult(prior.result, record.jobs);
      }
      const current = record.project;
      if (current.version !== input.expectedVersion) throw new WorkflowError("VERSION_CONFLICT", `Erwartete Version ${input.expectedVersion}, aktuell ${current.version}.`);
      if (current.revisionDigest !== input.expectedRevisionDigest) throw new WorkflowError("REVISION_CONFLICT", "Der erwartete Revisions-Digest ist nicht aktuell.");
      if (current.policyVersion !== input.policyVersion) throw new WorkflowError("GATE_INVALID", "Die Policy-Version ist nicht aktuell.");
      assertAllowed(current, input.targetPhase);
      if (!verifiedActor.roles.some((role) => TRANSITION_ACTOR_ROLE_RULES[input.targetPhase].includes(role))) {
        throw new WorkflowError("UNAUTHORIZED", `${input.actorId} ist fuer den Uebergang nach ${input.targetPhase} nicht autorisiert.`);
      }
      assertBlockReasons(input.targetPhase, input.blockReasons);
      const occurredAt = this.currentTime();
      const nextRevision = input.newRevisionDigest ?? current.revisionDigest;
      if (input.targetPhase === "RELEASE_CANDIDATE" && nextRevision !== current.revisionDigest) {
        throw new WorkflowError("REVISION_CONFLICT", "Beim Eintritt in RELEASE_CANDIDATE darf die verifizierte Revision nicht wechseln.");
      }
      if (current.frozenRevisionDigest && nextRevision !== current.frozenRevisionDigest) {
        throw new WorkflowError("REVISION_CONFLICT", "Die erfolgreich verifizierte Release-Revision ist eingefroren.");
      }
      if ((current.phase === "RELEASE_CANDIDATE" || current.phase === "STAGING" || current.phase === "BLOCKED" && current.frozenRevisionDigest) && input.newRevisionDigest !== undefined) {
        throw new WorkflowError("REVISION_CONFLICT", "In oder nach RELEASE_CANDIDATE ist kein Revisionswechsel erlaubt.");
      }
      const gates = resolveAndValidateGates(record, current, input, nextRevision, occurredAt);
      const holdClearances = resolveHoldClearances(record, current, input, nextRevision, occurredAt);
      if (!["BLOCKED", "FAILED", "CANCELLED"].includes(input.targetPhase)) {
        enforceRuntimeEvidenceForActiveJobInScope(record, nextRevision, operationScope, occurredAt);
        assertNoOpenComplianceHolds(record, operationScope, holdClearances.map((item) => item.holdCode));
        assertNoAdverseSecurityOrLegal(record, nextRevision, occurredAt, operationScope);
        assertOperationalEvidence(record, nextRevision, occurredAt, holdClearances.map((item) => item.holdCode), operationScope, Boolean(input.startJob) || isLegalRequiredPhase(input.targetPhase));
      }
      if (input.startJob && !phaseJobSets[input.targetPhase].has(input.startJob.type)) {
        throw new WorkflowError("JOB_NOT_ALLOWED", `Job ${input.startJob.type} ist in Phase ${input.targetPhase} nicht erlaubt.`);
      }
      if (input.startJob && record.jobs.some((job) => job.status === "CLAIMED" || job.status === "CANCELLING")) {
        throw new WorkflowError("JOB_NOT_ALLOWED", "Solange ein schreibender Job aktiv oder in Abbruch ist, darf kein Folgejob starten.");
      }
      cancelActiveJobs(record, occurredAt);
      const version = current.version + 1;
      const reasons = input.targetPhase === "BLOCKED" ? cloneReasons(input.blockReasons ?? []) : [];
      const frozenRevisionDigest = current.frozenRevisionDigest ?? (current.phase === "VERIFICATION" && input.targetPhase === "RELEASE_CANDIDATE" ? nextRevision : undefined);
      const project: ProjectWorkflow = {
        projectId: current.projectId, phase: input.targetPhase, version, policyVersion: current.policyVersion,
        revisionDigest: nextRevision, ...(input.targetPhase === "BLOCKED" ? { blockedFrom: current.phase } : {}),
        ...(frozenRevisionDigest ? { frozenRevisionDigest } : {}), blockReasons: reasons,
      };
      const job: WorkflowJob | undefined = input.startJob ? {
        id: randomUUID(), projectId: current.projectId, type: input.startJob.type,
        phase: input.targetPhase, aggregateVersion: version, revisionDigest: nextRevision, status: "PENDING",
        idempotencyKey: input.idempotencyKey, operationScope, createdAt: occurredAt,
      } : undefined;
      const previousHash = record.auditEvents.at(-1)?.eventHash ?? null;
      const gateBindings = gates.map((gate) => ({
        gateResultId: gate.id, evidenceDigest: gate.evidenceDigest, subjectRevisionDigest: gate.subjectRevisionDigest,
        trustedAttester: gate.trustedAttester, attesterRole: gate.attesterRole,
      })).sort((a, b) => a.gateResultId.localeCompare(b.gateResultId));
      const auditPayload = {
        id: `${current.projectId}:transition:${version}`, projectId: current.projectId, sequence: version,
        actorId: input.actorId, previousPhase: current.phase, newPhase: input.targetPhase, reason: input.reason,
        policyVersion: input.policyVersion, previousRevisionDigest: current.revisionDigest, newRevisionDigest: nextRevision,
        idempotencyKey: input.idempotencyKey, operationScope, gateBindings, blockReasons: reasons,
        ...(holdClearances.length ? { holdClearanceBindings: holdClearances.map(cloneVerifiedHoldClearance).sort((a, b) => a.id.localeCompare(b.id)) } : {}),
        occurredAt: occurredAt.toISOString(), previousHash,
        ...(job ? { jobBinding: jobBinding(job) } : {}),
      };
      const auditEvent: AuditEvent = { ...auditPayload, occurredAt, eventHash: hashCanonical(auditPayload) };
      record.project = project;
      for (const clearance of holdClearances) {
        const hold = record.holds.get(clearance.holdCode);
        if (hold) record.holds.set(hold.id, { ...hold, state: "CLEARED", clearingEvidence: cloneVerifiedHoldClearance(clearance), clearedAt: occurredAt });
        record.consumedClearances.add(clearance.id);
        record.consumedClearanceSemantics.add(clearanceSemanticKey(clearance));
        registerEvidenceUsage(record, clearance.evidenceRef!, "HOLD_CLEARANCE");
      }
      record.auditEvents.push(auditEvent);
      if (job) record.jobs.push(job);
      const result: Omit<TransitionResult, "duplicate"> = job ? { project, auditEvent, job } : { project, auditEvent };
      record.idempotency.set(scopeKey, { requestHash, result });
      return cloneResult(result, false);
    });
  }

  claimJob(request: ClaimJobRequest): Promise<WorkflowJob> {
    const input = cloneClaimRequest(request);
    validateClaimRequest(input);
    return this.withRecord(input.projectId, async (record) => {
      await this.assertTrustedWorker(input.workerId, input.projectId, "CLAIM");
      const replay = beginJobCommand(record, "claim", input.workerId, input.idempotencyKey, input);
      if (replay) { const current=assertCurrentReplayFence(record, replay, input, ["CLAIMED","CANCELLING","CANCELLED"]); const replayNow = this.currentTime(); if(current.status==="CLAIMED")enforceRuntimeEvidenceForClaimedJob(record, current, replayNow); assertOperationalEvidence(record, current.revisionDigest, replayNow, [], current.operationScope); return current; }
      if (record.jobs.some((candidate) => candidate.status === "CANCELLING")) throw new WorkflowError("JOB_NOT_ALLOWED", "Claims sind bis zur bestaetigten Job-Beendigung gesperrt.");
      const { index, job } = findJob(record, input.jobId);
      assertRunnableSnapshot(record, job, input);
      assertOperationalEvidence(record, job.revisionDigest, this.currentTime(), [], job.operationScope);
      const expiredClaim = job.status === "CLAIMED" && Boolean(job.leaseExpiresAt && job.leaseExpiresAt <= this.currentTime());
      if (job.status !== "PENDING" && !expiredClaim) throw new WorkflowError("JOB_NOT_ALLOWED", "Job ist bereits vergeben oder nicht mehr autorisiert.");
      const claimedAt = this.currentTime();
      const claimed: WorkflowJob = {
        ...job, status: "CLAIMED", claimedAt, leaseOwner: input.workerId, claimIdempotencyKey: input.idempotencyKey,
        leaseExpiresAt: new Date(claimedAt.getTime() + input.leaseDurationMs),
        fencingToken: Math.max(0, ...record.jobs.map((candidate) => candidate.fencingToken ?? 0)) + 1,
      };
      record.jobs[index] = claimed;
      appendJobEvent(record, claimed, "CLAIMED", claimedAt, input.workerId, input.idempotencyKey);
      return finishJobCommand(record, "claim", input.workerId, input.idempotencyKey, input, claimed);
    });
  }

  authorizeJobWork(request: OwnedJobRequest): Promise<WorkflowJob> {
    const input = cloneOwnedJobRequest(request);
    validateOwnedJobRequest(input);
    return this.withRecord(input.projectId, async (record) => {
      await this.assertTrustedWorker(input.workerId, input.projectId, "AUTHORIZE");
      const replay = beginJobCommand(record, "authorize", input.workerId, input.idempotencyKey, input);
      if (replay) { const current=assertCurrentReplayFence(record, replay, input, ["CLAIMED"]); const replayNow = this.currentTime(); assertActiveOwnedJob(record, current, input, replayNow); enforceRuntimeEvidenceForClaimedJob(record, current, replayNow); assertOperationalEvidence(record, current.revisionDigest, replayNow, [], current.operationScope); return replay; }
      const { job } = findJob(record, input.jobId);
      const now = this.currentTime();
      assertClaimedJobOwnership(record, job, input);
      enforceRuntimeEvidenceForClaimedJob(record, job, now);
      assertActiveOwnedJob(record, job, input, now);
      assertOperationalEvidence(record, job.revisionDigest, now, [], job.operationScope);
      appendJobEvent(record, job, "AUTHORIZED", now, input.workerId, input.idempotencyKey);
      return finishJobCommand(record, "authorize", input.workerId, input.idempotencyKey, input, job);
    });
  }

  heartbeatJob(request: HeartbeatJobRequest): Promise<WorkflowJob> {
    const input = cloneHeartbeatRequest(request);
    validateOwnedJobRequest(input);
    validateDuration(input.extendLeaseByMs, "extendLeaseByMs");
    return this.withRecord(input.projectId, async (record) => {
      await this.assertTrustedWorker(input.workerId, input.projectId, "HEARTBEAT");
      const replay = beginJobCommand(record, "heartbeat", input.workerId, input.idempotencyKey, input);
      if (replay) { const current=assertCurrentReplayFence(record, replay, input, ["CLAIMED"]); const replayNow = this.currentTime(); assertActiveOwnedJob(record, current, input, replayNow); enforceRuntimeEvidenceForClaimedJob(record, current, replayNow); assertOperationalEvidence(record, current.revisionDigest, replayNow, [], current.operationScope); return replay; }
      const { index, job } = findJob(record, input.jobId);
      const now = this.currentTime();
      assertClaimedJobOwnership(record, job, input);
      enforceRuntimeEvidenceForClaimedJob(record, job, now);
      assertActiveOwnedJob(record, job, input, now);
      assertOperationalEvidence(record, job.revisionDigest, now, [], job.operationScope);
      const updated: WorkflowJob = { ...job, leaseExpiresAt: new Date(now.getTime() + input.extendLeaseByMs) };
      record.jobs[index] = updated;
      appendJobEvent(record, updated, "HEARTBEAT", now, input.workerId, input.idempotencyKey);
      return finishJobCommand(record, "heartbeat", input.workerId, input.idempotencyKey, input, updated);
    });
  }

  completeJob(request: OwnedJobRequest): Promise<WorkflowJob> {
    const input = cloneOwnedJobRequest(request);
    validateOwnedJobRequest(input);
    return this.withRecord(input.projectId, async (record) => {
      await this.assertTrustedWorker(input.workerId, input.projectId, "COMPLETE");
      const replay = beginJobCommand(record, "complete", input.workerId, input.idempotencyKey, input);
      if (replay) { assertCurrentReplayFence(record, replay, input, ["COMPLETED"]); const replayNow = this.currentTime(); assertOperationalEvidence(record, replay.revisionDigest, replayNow, [], replay.operationScope); return replay; }
      const { index, job } = findJob(record, input.jobId);
      const now = this.currentTime();
      assertClaimedJobOwnership(record, job, input);
      enforceRuntimeEvidenceForClaimedJob(record, job, now);
      assertActiveOwnedJob(record, job, input, now);
      assertOperationalEvidence(record, job.revisionDigest, now, [], job.operationScope);
      const completed: WorkflowJob = { ...job, status: "COMPLETED", completedAt: now };
      record.jobs[index] = completed;
      appendJobEvent(record, completed, "COMPLETED", now, input.workerId, input.idempotencyKey);
      return finishJobCommand(record, "complete", input.workerId, input.idempotencyKey, input, completed);
    });
  }

  confirmJobTermination(request: ConfirmJobTerminationRequest): Promise<WorkflowJob> {
    const input = cloneConfirmJobTerminationRequest(request);
    validateOwnedJobRequest(input);
    validateTerminationEvidence(input.terminationEvidence);
    return this.withRecord(input.projectId, async (record) => {
      await this.assertTrustedWorker(input.workerId, input.projectId, "TERMINATE");
      const replay = beginJobCommand(record, "confirm-cancel", input.workerId, input.idempotencyKey, input);
      if (replay) { assertCurrentReplayFence(record, replay, input, ["CANCELLED"]); return replay; }
      const { index, job } = findJob(record, input.jobId);
      if (job.status !== "CANCELLING" || job.leaseOwner !== input.workerId || job.claimIdempotencyKey !== input.claimIdempotencyKey || input.fencingToken !== undefined && job.fencingToken !== input.fencingToken) {
        throw new WorkflowError("JOB_NOT_ALLOWED", "Nur der Lease-Inhaber darf die Beendigung eines abbrechenden Jobs bestaetigen.");
      }
      const now = this.currentTime();
      const verified = await this.terminationProofVerifier.verify(cloneTerminationEvidence(input.terminationEvidence), {
        projectId: input.projectId, jobId: input.jobId, workerId: input.workerId,
      });
      if (!isValidTerminationVerification(verified, input, now)) throw new WorkflowError("JOB_NOT_ALLOWED", "Prozessende sowie Mount- und Credential-Widerruf sind nicht vertrauenswuerdig belegt.");
      const existing = record.terminationEvidence.get(verified.id);
      if (existing && hashCanonical(existing) !== hashCanonical(verified)) throw new WorkflowError("IDEMPOTENCY_CONFLICT", "Termination-Evidence-ID wurde mit anderem Inhalt wiederverwendet.");
      if (existing) throw new WorkflowError("GATE_ALREADY_EXISTS", "Termination-Evidence ist bereits an einen anderen Befehl gebunden.");
      record.terminationEvidence.set(verified.id, cloneVerifiedTerminationEvidence(verified));
      const cancelled: WorkflowJob = { ...job, status: "CANCELLED", cancelledAt: now };
      record.jobs[index] = cancelled;
      appendJobEvent(record, cancelled, "CANCELLED", now, input.workerId, input.idempotencyKey, verified);
      return finishJobCommand(record, "confirm-cancel", input.workerId, input.idempotencyKey, input, cancelled);
    });
  }

  async ingestLegalAssessment(attestation: LegalAssessmentAttestation): Promise<void> {
    const input = cloneLegalAssessmentInput(attestation.assessment);
    const identity = strictString(attestation.legalIdentity, "legalIdentity");
    const proof = strictString(attestation.proof, "proof");
    validateLegalAssessmentInput(input);
    if (!await this.complianceAttestationVerifier("LEGAL_ASSESSMENT", input, identity, proof)) throw new WorkflowError("UNAUTHORIZED", "Legal Assessment ist nicht durch Legal verifiziert.");
    await this.withRecord(input.projectId, (record) => {
      const now = this.currentTime();
      if (input.legalDate > now || input.finalizedAt > now || input.evidence.verifiedAt > now || input.evidence.finalizedAt > now) throw new WorkflowError("GATE_INVALID", "Legal Evidence darf nicht aus der Zukunft stammen.");
      validatePurposeEvidence(input.evidence, { projectId: input.projectId, scope: input, revisionDigest: input.revisionDigest, evidenceType: "LEGAL_ASSESSMENT", classification: "VERIFIED_LEGAL_ASSESSMENT", trustedIdentity: identity, eventAt: input.finalizedAt, now });
      assertEvidenceUnused(record, input.evidence, "LEGAL_ASSESSMENT");
      if (record.legalAssessments.has(input.id)) throw new WorkflowError("GATE_ALREADY_EXISTS", "Legal Assessment ist unveraenderlich und existiert bereits.");
      const predecessor = input.supersedesId ? record.legalAssessments.get(input.supersedesId) : undefined;
      if (input.supersedesId && (!predecessor || !sameScope(input, predecessor))) throw new WorkflowError("GATE_INVALID", "Successor Assessment referenziert keinen gueltigen scope-identischen Vorgaenger.");
      if (input.supersedesId && [...record.legalAssessments.values()].some((item) => item.supersedesId === input.supersedesId)) throw new WorkflowError("GATE_ALREADY_EXISTS", "Ein unmittelbarer Predecessor darf genau einen Successor besitzen.");
      if (input.predecessorCounselCaseId) {
        const counselCase = record.counselCases.get(input.predecessorCounselCaseId);
        const decision = counselCase?.decisionId ? record.counselDecisions.get(counselCase.decisionId) : undefined;
        if (!predecessor || !counselCase || !decision) throw new WorkflowError("GATE_INVALID", "Counsel-Successor-Kette ist unvollstaendig.");
        assertCounselSuccessorChronology(input, predecessor, counselCase, decision, now);
      } else if (predecessor?.status === "COUNSEL_REQUIRED") throw new WorkflowError("GATE_INVALID", "Counsel-Successor benoetigt die geschlossene CounselCase-Referenz.");
      const requirements = input.requirements ?? [];
      if (input.status === "PASS_WITH_REQUIREMENTS" && requirements.length === 0) throw new WorkflowError("GATE_INVALID", "PASS_WITH_REQUIREMENTS benoetigt Anforderungen.");
      if (input.status !== "PASS_WITH_REQUIREMENTS" && requirements.length) throw new WorkflowError("GATE_INVALID", "Nur PASS_WITH_REQUIREMENTS darf Anforderungen anlegen.");
      if (requirements.some((item) => record.legalRequirements.has(item.id))) throw new WorkflowError("GATE_ALREADY_EXISTS", "Legal Requirement ID existiert bereits.");
      const superseded = predecessor ? [...record.legalRequirements.values()].filter((item) => item.assessmentId === predecessor.id && item.state !== "SUPERSEDED") : [];
      const stored: LegalAssessment = { ...withoutRequirements(input), ingestedAt: now, verifiedLegalIdentity: identity };
      // Commit starts only after the complete assessment/requirement/counsel plan validated.
      record.legalAssessments.set(stored.id, cloneLegalAssessment(stored));
      registerEvidenceUsage(record, stored.evidence, "LEGAL_ASSESSMENT");
      for (const requirement of superseded) record.legalRequirements.set(requirement.id, { ...requirement, state: "SUPERSEDED", supersededByAssessmentId: stored.id });
      for (const requirement of requirements) {
        const item: LegalRequirement = { id: requirement.id, projectId: stored.projectId, assessmentId: stored.id, requirementRef: requirement.requirementRef, state: "OPEN", scopeType: stored.scopeType, scopeId: stored.scopeId, createdAt: now };
        record.legalRequirements.set(item.id, item);
        openPersistentHold(record, "LEGAL_REQUIREMENT_HOLD", "LEGAL_REQUIREMENT", item.id, stored.evidence, stored, "LEGAL", now);
      }
      if (stored.status === "BLOCK") openPersistentHold(record, "LEGAL_BLOCK_HOLD", "LEGAL_ASSESSMENT", stored.id, stored.evidence, stored, "LEGAL", now);
      if (stored.status === "COUNSEL_REQUIRED") {
        openPersistentHold(record, "COUNSEL_REQUIRED_HOLD", "LEGAL_ASSESSMENT", stored.id, stored.evidence, stored, "LEGAL", now);
        const counselCase: CounselCase = { id: `${stored.id}:counsel`, projectId: stored.projectId, assessmentId: stored.id, state: "OPEN", scopeType: stored.scopeType, scopeId: stored.scopeId, openedAt: now };
        record.counselCases.set(counselCase.id, counselCase);
      }
      if (stored.status !== "PASS") cancelActiveJobs(record, now);
    });
  }

  async submitLegalRequirement(attestation: LegalRequirementSubmissionAttestation): Promise<void> {
    const input = cloneRequirementSubmission(attestation.submission);
    const identity = strictString(attestation.submitterIdentity, "submitterIdentity");
    if (!await this.complianceAttestationVerifier("REQUIREMENT_SUBMISSION", input, identity, strictString(attestation.proof, "proof"))) throw new WorkflowError("UNAUTHORIZED", "Requirement-Evidence ist nicht verifiziert ingestiert.");
    await this.withRecord(input.projectId, (record) => {
      const requirement = record.legalRequirements.get(input.requirementId);
      if (!requirement || requirement.assessmentId !== input.assessmentId || requirement.state !== "OPEN") throw new WorkflowError("GATE_INVALID", "Nur OPEN darf nach EVIDENCE_SUBMITTED wechseln.");
      const assessment = record.legalAssessments.get(requirement.assessmentId);
      if (!assessment) throw new WorkflowError("GATE_INVALID", "Requirement Assessment fehlt.");
      const now = this.currentTime();
      if (input.submittedAt < assessment.ingestedAt || input.submittedAt < requirement.createdAt || input.submittedAt > now) throw new WorkflowError("GATE_INVALID", "Requirement Submission ist backdated oder liegt in der Zukunft.");
      const submissionNotBefore = new Date(Math.max(assessment.ingestedAt.getTime(), requirement.createdAt.getTime()));
      validatePurposeEvidence(input.evidence, { projectId: input.projectId, scope: requirement, revisionDigest: assessment.revisionDigest, evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", classification: "MINIMIZED_IMMUTABLE", trustedIdentity: identity, notBefore: submissionNotBefore, eventAt: input.submittedAt, now });
      assertEvidenceUnused(record, input.evidence, "LEGAL_REQUIREMENT_SUBMISSION");
      record.legalRequirements.set(requirement.id, { ...requirement, state: "EVIDENCE_SUBMITTED", submittedEvidence: cloneEvidenceReference(input.evidence), submittedAt: new Date(input.submittedAt), submittedBy: identity, submissionIngestedAt: now });
      registerEvidenceUsage(record, input.evidence, "LEGAL_REQUIREMENT_SUBMISSION");
    });
  }

  async decideLegalRequirement(attestation: LegalRequirementDecisionAttestation): Promise<void> {
    const input = cloneRequirementDecision(attestation.decision);
    const identity = strictString(attestation.legalIdentity, "legalIdentity");
    if (!await this.complianceAttestationVerifier("REQUIREMENT_DECISION", input, identity, strictString(attestation.proof, "proof"))) throw new WorkflowError("UNAUTHORIZED", "Requirement-Entscheidung ist nicht durch Legal verifiziert.");
    await this.withRecord(input.projectId, (record) => {
      const requirement = record.legalRequirements.get(input.requirementId);
      if (!requirement || requirement.assessmentId !== input.assessmentId || requirement.state !== "EVIDENCE_SUBMITTED") throw new WorkflowError("GATE_INVALID", "Nur EVIDENCE_SUBMITTED darf verifiziert oder abgelehnt werden.");
      const assessment = record.legalAssessments.get(requirement.assessmentId);
      if (!assessment) throw new WorkflowError("GATE_INVALID", "Requirement Assessment fehlt.");
      const now = this.currentTime();
      if (!requirement.submittedAt || !requirement.submissionIngestedAt || input.decidedAt <= requirement.submittedAt || input.decidedAt <= requirement.submissionIngestedAt || input.decidedAt > now) throw new WorkflowError("GATE_INVALID", "Requirement Decision verletzt die strikte Submission-Chronologie.");
      const decisionNotBefore = new Date(Math.max(requirement.submittedAt.getTime(), requirement.submissionIngestedAt.getTime()));
      validatePurposeEvidence(input.evidence, { projectId: input.projectId, scope: requirement, revisionDigest: assessment.revisionDigest, evidenceType: "LEGAL_REQUIREMENT_DECISION", classification: "VERIFIED_LEGAL_DECISION", trustedIdentity: identity, notBefore: decisionNotBefore, eventAt: input.decidedAt, now });
      assertEvidenceUnused(record, input.evidence, "LEGAL_REQUIREMENT_DECISION");
      record.legalRequirements.set(requirement.id, { ...requirement, state: input.decision, verificationEvidence: cloneEvidenceReference(input.evidence), verifiedBy: identity, verifiedAt: new Date(input.decidedAt), decisionIngestedAt: now });
      registerEvidenceUsage(record, input.evidence, "LEGAL_REQUIREMENT_DECISION");
      if (input.decision === "REJECTED") {
        openPersistentHold(record, "LEGAL_REQUIREMENT_HOLD", "LEGAL_REQUIREMENT", `${requirement.id}:rejected:${input.evidence.id}`, input.evidence, requirement, "LEGAL", now);
        cancelActiveJobs(record, now);
      }
    });
  }

  async ingestCounselDecision(attestation: CounselDecisionAttestation): Promise<void> {
    const input = cloneCounselDecisionInput(attestation.decision);
    if (!await this.complianceAttestationVerifier("COUNSEL_DECISION", input, input.qualifiedCounselIdentityRef, strictString(attestation.proof, "proof"))) throw new WorkflowError("UNAUTHORIZED", "Counsel Decision ist nicht durch qualifizierten Counsel verifiziert.");
    await this.withRecord(input.projectId, (record) => {
      const now = this.currentTime();
      const counselCase = record.counselCases.get(input.counselCaseId);
      if (!counselCase || counselCase.state !== "OPEN" || counselCase.assessmentId !== input.predecessorAssessmentId || !sameScope(counselCase, input)) throw new WorkflowError("GATE_INVALID", "Counsel Decision passt nicht zur offenen CounselCase.");
      const assessment = record.legalAssessments.get(counselCase.assessmentId);
      if (!assessment) throw new WorkflowError("GATE_INVALID", "Counsel Assessment fehlt.");
      if (input.decidedAt <= counselCase.openedAt || input.decidedAt <= assessment.ingestedAt || input.decidedAt >= now) throw new WorkflowError("GATE_INVALID", "Counsel Decision verletzt die strikte Case-/Assessment-Chronologie.");
      const counselNotBefore = new Date(Math.max(counselCase.openedAt.getTime(), assessment.ingestedAt.getTime()));
      validatePurposeEvidence(input.evidence, { projectId: input.projectId, scope: counselCase, revisionDigest: assessment.revisionDigest, evidenceType: "COUNSEL_DECISION", classification: "ENCRYPTED_COUNSEL_DECISION", trustedIdentity: input.qualifiedCounselIdentityRef, notBefore: counselNotBefore, eventAt: input.decidedAt, now });
      assertEvidenceUnused(record, input.evidence, "COUNSEL_DECISION");
      if (record.counselDecisions.has(input.id) || [...record.counselDecisions.values()].some((item) => item.evidence.id === input.evidence.id)) throw new WorkflowError("GATE_ALREADY_EXISTS", "Counsel Decision oder Evidence wurde bereits verwendet.");
      const stored: CounselDecision = { ...input, ingestedAt: now };
      record.counselDecisions.set(stored.id, stored);
      registerEvidenceUsage(record, stored.evidence, "COUNSEL_DECISION");
      record.counselCases.set(counselCase.id, { ...counselCase, state: "CLOSED", closedAt: now, decisionId: stored.id, qualifiedCounselIdentityRef: stored.qualifiedCounselIdentityRef, encryptedDecisionEvidenceId: stored.evidence.id });
    });
  }

  read(projectId: string): Promise<ProjectWorkflow | null> { return Promise.resolve(this.records.get(strictString(projectId, "projectId"))).then((record) => record ? cloneProject(record.project) : null); }
  readGateResult(projectId: string, id: string): Promise<GateResult | null> { const gate = this.records.get(strictString(projectId, "projectId"))?.gates.get(strictString(id, "gateResultId")); return Promise.resolve(gate ? cloneGate(gate) : null); }
  readAuditEvents(projectId: string): Promise<readonly AuditEvent[]> { return Promise.resolve((this.records.get(strictString(projectId, "projectId"))?.auditEvents ?? []).map(cloneAudit)); }
  readJobs(projectId: string): Promise<readonly WorkflowJob[]> { return Promise.resolve((this.records.get(strictString(projectId, "projectId"))?.jobs ?? []).map(cloneJob)); }
  readJobEvents(projectId: string): Promise<readonly JobAuditEvent[]> { return Promise.resolve((this.records.get(strictString(projectId, "projectId"))?.jobEvents ?? []).map(cloneJobEvent)); }
  readLegalAssessments(projectId: string): Promise<readonly LegalAssessment[]> { return Promise.resolve([...(this.records.get(strictString(projectId, "projectId"))?.legalAssessments.values() ?? [])].map(cloneLegalAssessment)); }
  readLegalRequirements(projectId: string): Promise<readonly LegalRequirement[]> { return Promise.resolve([...(this.records.get(strictString(projectId, "projectId"))?.legalRequirements.values() ?? [])].map(cloneLegalRequirement)); }
  readCounselCases(projectId: string): Promise<readonly CounselCase[]> { return Promise.resolve([...(this.records.get(strictString(projectId, "projectId"))?.counselCases.values() ?? [])].map(cloneCounselCase)); }
  readProjectHolds(projectId: string): Promise<readonly ProjectHold[]> { return Promise.resolve([...(this.records.get(strictString(projectId, "projectId"))?.holds.values() ?? [])].map(cloneProjectHold)); }

  exportPersistentState(projectId: string): string {
    const record = this.records.get(strictString(projectId, "projectId"));
    if (!record) throw new WorkflowError("PROJECT_NOT_FOUND", `Projekt ${projectId} fehlt.`);
    return JSON.stringify(encodePersistentValue(record));
  }

  importPersistentState(snapshot: string): void {
    const decoded = decodePersistentValue(JSON.parse(strictString(snapshot, "snapshot"))) as WorkflowRecord;
    validateInitialOrStoredRecord(decoded);
    this.records.set(decoded.project.projectId, decoded);
  }

  exportPersistenceProjection(projectId: string): WorkflowPersistenceProjection {
    const record = this.records.get(strictString(projectId, "projectId"));
    if (!record) throw new WorkflowError("PROJECT_NOT_FOUND", `Projekt ${projectId} fehlt.`);
    return {
      project: cloneProject(record.project), gates: [...record.gates.values()].map(cloneGate),
      auditEvents: record.auditEvents.map(cloneAudit), jobs: record.jobs.map(cloneJob), jobEvents: record.jobEvents.map(cloneJobEvent),
      holdClearances: [...record.holdClearances.values()].map(cloneVerifiedHoldClearance),
      terminationEvidence: [...record.terminationEvidence.values()].map(cloneVerifiedTerminationEvidence),
      legalAssessments: [...record.legalAssessments.values()].map(cloneLegalAssessment),
      legalRequirements: [...record.legalRequirements.values()].map(cloneLegalRequirement),
      counselCases: [...record.counselCases.values()].map(cloneCounselCase),
      counselDecisions: [...record.counselDecisions.values()].map(cloneCounselDecision),
      holds: [...record.holds.values()].map(cloneProjectHold),
      idempotencyRecords: [
        ...[...record.idempotency.entries()].map(([scopeKey,value])=>({kind:"TRANSITION" as const,scopeKey,requestHash:value.requestHash,resultRef:value.result.auditEvent.id})),
        ...[...record.jobIdempotency.entries()].map(([scopeKey,value])=>({kind:"JOB" as const,scopeKey,requestHash:value.requestHash,resultRef:value.result.id})),
      ],
    };
  }

  private currentTime(): Date { const value = new Date(this.now()); if (!Number.isFinite(value.getTime())) throw new WorkflowError("INVALID_REQUEST", "Zeitquelle ist ungueltig."); return value; }
  private async assertTrustedWorker(workerId: string, projectId: string, operation: WorkerOperation): Promise<void> {
    const identity = await this.workerIdentityVerifier.verify(workerId, projectId, operation);
    if (!identity || identity.id !== workerId) throw new WorkflowError("UNAUTHORIZED", `${workerId} ist fuer ${operation} nicht als vertrauenswuerdiger Worker verifiziert.`);
  }
  private withRecord<T>(projectId: string, operation: (record: WorkflowRecord) => T | Promise<T>): Promise<T> {
    return this.withLock(projectId, () => { const record = this.records.get(projectId); if (!record) throw new WorkflowError("PROJECT_NOT_FOUND", `Projekt ${projectId} fehlt.`); return operation(record); });
  }
  private async withLock<T>(key: string, operation: () => T | Promise<T>): Promise<T> {
    const predecessor = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(key, current);
    await predecessor;
    try { return await operation(); } finally { release(); if (this.locks.get(key) === current) this.locks.delete(key); }
  }
}

export interface TrustedGateIngestor { ingest(evidence: GateEvidence, attesterId: string): Promise<void>; }
export interface TrustedHoldClearanceIngestor { ingest(evidence: Omit<HoldClearanceEvidence, "proof">): Promise<void>; }
export interface TrustedLegalAssessmentIngestor { ingest(assessment: LegalAssessmentInput, legalIdentity?: string): Promise<void>; }
export interface TrustedLegalRequirementIngestor {
  submit(submission: LegalRequirementSubmission, submitterIdentity?: string): Promise<void>;
  decide(decision: LegalRequirementDecision, legalIdentity?: string): Promise<void>;
}
export interface TrustedCounselDecisionIngestor { ingest(decision: CounselDecisionInput): Promise<void>; }
export interface TrustedTerminationProofIssuer {
  issue(input: Omit<VerifiedTerminationEvidence, "evidenceDigest"> & { readonly projectId: string }): TerminationEvidence;
}
export interface InMemoryWorkflowFixture {
  readonly repository: InMemoryWorkflowRepository;
  readonly trustedGateIngestor: TrustedGateIngestor;
  readonly trustedHoldClearanceIngestor: TrustedHoldClearanceIngestor;
  readonly trustedTerminationProofIssuer: TrustedTerminationProofIssuer;
  readonly trustedLegalAssessmentIngestor: TrustedLegalAssessmentIngestor;
  readonly trustedLegalRequirementIngestor: TrustedLegalRequirementIngestor;
  readonly trustedCounselDecisionIngestor: TrustedCounselDecisionIngestor;
}

/** Test-only fixture: the random proof stays inside this closure and is never accepted from callers. */
export function createInMemoryWorkflowFixture(options: {
  readonly now?: () => Date;
  readonly attesters: Readonly<Record<string, AttesterRole>>;
  readonly actors?: Readonly<Record<string, readonly ActorRole[]>>;
  readonly workers?: readonly string[];
  readonly clearingAuthorities?: Readonly<Record<string, HoldClearingAuthority>>;
  readonly workerIdentityVerifier?: WorkerIdentityVerifier;
  readonly terminationProofVerifier?: TerminationProofVerifier;
  readonly holdClearanceVerifier?: HoldClearanceVerifier;
  readonly qualifiedCounselIdentities?: readonly string[];
}): InMemoryWorkflowFixture {
  const proof = randomUUID();
  const terminationSecret = randomUUID();
  const clearanceSecret = randomUUID();
  const complianceSecret = randomUUID();
  const identities = new Map(Object.entries(options.attesters));
  const verifier: EvidenceVerifier = {
    async verify(attestation) {
      const role = identities.get(attestation.attesterId);
      return attestation.proof === proof && role ? { id: attestation.attesterId, role } : null;
    },
  };
  const actors = new Map(Object.entries(options.actors ?? { owner: ["OWNER"], "owner-1": ["OWNER"], other: ["OWNER"] }));
  const actorAuthorizationVerifier: ActorAuthorizationVerifier = {
    async verify(actorId) {
      const roles = actors.get(actorId);
      return roles ? { id: actorId, roles: [...roles] } : null;
    },
  };
  const workers = new Set(options.workers ?? ["worker-1", "worker-2", "worker-3"]);
  const workerIdentityVerifier: WorkerIdentityVerifier = {
    async verify(workerId) { return workers.has(workerId) ? { id: workerId } : null; },
  };
  const clearingAuthorities = new Map<string, HoldClearingAuthority>(Object.entries(options.clearingAuthorities ?? { security: "SECURITY" as const, legal: "LEGAL" as const }));
  const holdClearanceVerifier: HoldClearanceVerifier = {
    async verify(evidence) {
      const role = clearingAuthorities.get(evidence.authorityId);
      const expected = hashCanonical({ ...clearanceProofPayload(evidence), secret: clearanceSecret });
      return role && evidence.proof === expected ? { id: evidence.authorityId, role } : null;
    },
  };
  const terminationProofVerifier: TerminationProofVerifier = {
    async verify(evidence, context) {
      const expected = hashCanonical({ ...terminationProofPayload(evidence, context), secret: terminationSecret });
      return evidence.proof === expected ? {
        id: evidence.id, evidenceDigest: evidence.evidenceDigest, processEndedAt: new Date(evidence.processEndedAt),
        mountRevokedAt: new Date(evidence.mountRevokedAt), credentialsRevokedAt: new Date(evidence.credentialsRevokedAt),
        workerId: context.workerId, jobId: context.jobId,
      } : null;
    },
  };
  const repository = new InMemoryWorkflowRepository({
    evidenceVerifier: verifier,
    actorAuthorizationVerifier,
    workerIdentityVerifier: options.workerIdentityVerifier ?? workerIdentityVerifier,
    terminationProofVerifier: options.terminationProofVerifier ?? terminationProofVerifier,
    holdClearanceVerifier: options.holdClearanceVerifier ?? holdClearanceVerifier,
    complianceAttestationVerifier: async (kind, payload, identity, suppliedProof) => {
      const role = identities.get(identity);
      const authorized = kind === "COUNSEL_DECISION" ? new Set(options.qualifiedCounselIdentities ?? ["qualified-counsel"]).has(identity) : kind === "REQUIREMENT_SUBMISSION" || role === "LEGAL";
      return authorized && suppliedProof === hashCanonical({ kind, payload, identity, secret: complianceSecret });
    },
    ...(options.now ? { now: options.now } : {}),
  });
  return {
    repository,
    trustedGateIngestor: {
      ingest(evidence, attesterId) {
        const snapshot = cloneGateEvidence(evidence);
        const identity = strictString(attesterId, "attesterId");
        return repository.ingestGateAttestation({ ...snapshot, attesterId: identity, proof });
      },
    },
    trustedHoldClearanceIngestor: {
      ingest(evidence) {
        const snapshot = cloneUnsignedHoldClearanceEvidence(evidence);
        const signed: HoldClearanceEvidence = { ...snapshot, proof: hashCanonical({ ...clearanceProofPayload(snapshot), secret: clearanceSecret }) };
        return repository.ingestHoldClearanceAttestation(signed);
      },
    },
    trustedTerminationProofIssuer: {
      issue(input) {
        const snapshot = cloneVerifiedTerminationEvidence({ ...input, evidenceDigest: terminationEvidenceDigest(input) });
        const unsigned: Omit<TerminationEvidence, "proof"> = {
          id: snapshot.id, evidenceDigest: snapshot.evidenceDigest, processEndedAt: snapshot.processEndedAt,
          mountRevokedAt: snapshot.mountRevokedAt, credentialsRevokedAt: snapshot.credentialsRevokedAt,
        };
        return { ...unsigned, proof: hashCanonical({ ...terminationProofPayload(unsigned, { projectId: input.projectId, jobId: input.jobId, workerId: input.workerId }), secret: terminationSecret }) };
      },
    },
    trustedLegalAssessmentIngestor: {
      ingest(assessment, legalIdentity = "legal") {
        const snapshot = cloneLegalAssessmentInput(assessment);
        return repository.ingestLegalAssessment({ assessment: snapshot, legalIdentity, proof: hashCanonical({ kind: "LEGAL_ASSESSMENT", payload: snapshot, identity: legalIdentity, secret: complianceSecret }) });
      },
    },
    trustedLegalRequirementIngestor: {
      submit(submission, submitterIdentity = "owner") {
        const snapshot = cloneRequirementSubmission(submission);
        return repository.submitLegalRequirement({ submission: snapshot, submitterIdentity, proof: hashCanonical({ kind: "REQUIREMENT_SUBMISSION", payload: snapshot, identity: submitterIdentity, secret: complianceSecret }) });
      },
      decide(decision, legalIdentity = "legal") {
        const snapshot = cloneRequirementDecision(decision);
        return repository.decideLegalRequirement({ decision: snapshot, legalIdentity, proof: hashCanonical({ kind: "REQUIREMENT_DECISION", payload: snapshot, identity: legalIdentity, secret: complianceSecret }) });
      },
    },
    trustedCounselDecisionIngestor: {
      ingest(decision) {
        const snapshot = cloneCounselDecisionInput(decision);
        return repository.ingestCounselDecision({ decision: snapshot, proof: hashCanonical({ kind: "COUNSEL_DECISION", payload: snapshot, identity: snapshot.qualifiedCounselIdentityRef, secret: complianceSecret }) });
      },
    },
  };
}

export class WorkflowEngine {
  constructor(private readonly repository: WorkflowRepository) {}
  createProject(projectId: string, policyVersion: string, revisionDigest: string): Promise<ProjectWorkflow> {
    const project: ProjectWorkflow = { projectId: strictString(projectId, "projectId"), phase: "DRAFT", version: 0, policyVersion: strictString(policyVersion, "policyVersion"), revisionDigest: strictString(revisionDigest, "revisionDigest"), blockReasons: [] };
    const result = cloneProject(project);
    return this.repository.create(cloneProject(project)).then(() => result);
  }
  transition(request: TransitionRequest): Promise<TransitionResult> { return this.repository.transition(cloneTransitionRequest(request)); }
  claimJob(request: ClaimJobRequest): Promise<WorkflowJob> { return this.repository.claimJob(cloneClaimRequest(request)); }
  authorizeJobWork(request: OwnedJobRequest): Promise<WorkflowJob> { return this.repository.authorizeJobWork(cloneOwnedJobRequest(request)); }
  heartbeatJob(request: HeartbeatJobRequest): Promise<WorkflowJob> { return this.repository.heartbeatJob(cloneHeartbeatRequest(request)); }
  completeJob(request: OwnedJobRequest): Promise<WorkflowJob> { return this.repository.completeJob(cloneOwnedJobRequest(request)); }
  confirmJobTermination(request: ConfirmJobTerminationRequest): Promise<WorkflowJob> { return this.repository.confirmJobTermination(cloneConfirmJobTerminationRequest(request)); }
  getProject(id: string) { return this.repository.read(strictString(id, "projectId")); }
  getGateResult(projectId: string, id: string) { return this.repository.readGateResult(strictString(projectId, "projectId"), strictString(id, "gateResultId")); }
  getAuditEvents(id: string) { return this.repository.readAuditEvents(strictString(id, "projectId")); }
  getJobs(id: string) { return this.repository.readJobs(strictString(id, "projectId")); }
  getJobEvents(id: string) { return this.repository.readJobEvents(strictString(id, "projectId")); }
  getLegalAssessments(id: string) { return this.repository.readLegalAssessments(strictString(id, "projectId")); }
  getLegalRequirements(id: string) { return this.repository.readLegalRequirements(strictString(id, "projectId")); }
  getCounselCases(id: string) { return this.repository.readCounselCases(strictString(id, "projectId")); }
  getProjectHolds(id: string) { return this.repository.readProjectHolds(strictString(id, "projectId")); }
}

function validateInitialProject(project: ProjectWorkflow) {
  requireText(project.projectId, "projectId"); requireText(project.policyVersion, "policyVersion"); validateDigest(project.revisionDigest, "revisionDigest");
  if (project.phase !== "DRAFT" || project.version !== 0 || project.blockReasons.length || project.blockedFrom !== undefined || project.frozenRevisionDigest !== undefined) throw new WorkflowError("INVALID_REQUEST", "Repository akzeptiert nur neue DRAFT-Aggregate in Version 0.");
}
function validateTransitionRequest(request: TransitionRequest) {
  requireText(request.projectId, "projectId"); requireText(request.policyVersion, "policyVersion"); requireText(request.actorId, "actorId"); requireText(request.reason, "reason"); requireText(request.idempotencyKey, "idempotencyKey");
  if (!isProjectPhase(request.targetPhase)) throw new WorkflowError("INVALID_REQUEST", "targetPhase ist ungueltig.");
  validateDigest(request.expectedRevisionDigest, "expectedRevisionDigest"); if (request.newRevisionDigest !== undefined) validateDigest(request.newRevisionDigest, "newRevisionDigest");
  if (!Number.isSafeInteger(request.expectedVersion) || request.expectedVersion < 0) throw new WorkflowError("INVALID_REQUEST", "expectedVersion ist ungueltig.");
  if (request.startJob && !isJobType(request.startJob.type)) throw new WorkflowError("JOB_NOT_ALLOWED", "Job-Typ ist ungueltig.");
  const scope = transitionScope(request);
  requireText(scope.scopeType, "operationScope.scopeType"); requireText(scope.scopeId, "operationScope.scopeId");
  if (scope.scopeType === "PROJECT" && scope.scopeId !== request.projectId) throw new WorkflowError("INVALID_REQUEST", "PROJECT-Operationsscope muss an das Projekt gebunden sein.");
  const ids = request.gateResultIds ?? [];
  if (new Set(ids).size !== ids.length || ids.some((id) => !id.trim())) throw new WorkflowError("GATE_INVALID", "Gate-IDs muessen eindeutig und nicht leer sein.");
  const clearanceIds = request.holdClearanceIds ?? [];
  if (new Set(clearanceIds).size !== clearanceIds.length || clearanceIds.some((id) => !id.trim())) throw new WorkflowError("GATE_INVALID", "Hold-Clearing-IDs muessen eindeutig und nicht leer sein.");
}
function validateGateEvidence(gate: GateEvidence) {
  requireText(gate.id, "gate.id"); requireText(gate.projectId, "gate.projectId"); requireText(gate.policyVersion, "gate.policyVersion");
  if (!GATE_NAMES.includes(gate.name) || !["PASS", "FAIL", "BLOCK", "STALE", "NOT_EVALUATED"].includes(gate.status)) throw new WorkflowError("GATE_INVALID", "Gate-Name oder Status ist ungueltig.");
  validateDigest(gate.subjectRevisionDigest, "gate.subjectRevisionDigest"); validateDigest(gate.evidenceDigest, "gate.evidenceDigest");
  if (!Number.isFinite(gate.evaluatedAt.getTime()) || !Number.isFinite(gate.validUntil.getTime()) || gate.validUntil <= gate.evaluatedAt) throw new WorkflowError("GATE_INVALID", "Gate-Zeitbindung ist ungueltig.");
  if ((gate.scopeType === undefined) !== (gate.scopeId === undefined)) throw new WorkflowError("GATE_INVALID", "Gate Scope muss vollstaendig gebunden sein.");
  if (gate.scopeType !== undefined) { requireText(gate.scopeType, "gate.scopeType"); requireText(gate.scopeId!, "gate.scopeId"); }
  if (gate.scopeType === "PROJECT" && gate.scopeId !== gate.projectId) throw new WorkflowError("GATE_INVALID", "PROJECT-Gate-Scope ist falsch gebunden.");
  if (gate.legalStatus !== undefined || gate.legalRequirements !== undefined) throw new WorkflowError("GATE_INVALID", "Autoritative Legal-Semantik ist ausschliesslich in LegalAssessment/LegalRequirement zulaessig.");
  if (gate.name === "CUSTOMER_DATA_CLASSIFIED") {
    if (!gate.customerDataClassification || (gate.customerDataClassification === "SYNTHETIC_ONLY") !== (gate.status === "PASS")) throw new WorkflowError("GATE_INVALID", "Kundendatenklassifikation und Gate-Status widersprechen sich.");
  } else if (gate.customerDataClassification !== undefined) throw new WorkflowError("GATE_INVALID", "Kundendatenklassifikation ist nur am Kundendaten-Gate zulaessig.");
}
function validateClaimRequest(request: ClaimJobRequest) { validateOwnedJobRequest({ ...request, claimIdempotencyKey: request.idempotencyKey }); requireText(request.idempotencyKey, "idempotencyKey"); validateDuration(request.leaseDurationMs, "leaseDurationMs"); }
function validateOwnedJobRequest(request: OwnedJobRequest) {
  requireText(request.jobId, "jobId"); requireText(request.projectId, "projectId"); requireText(request.workerId, "workerId"); requireText(request.claimIdempotencyKey, "claimIdempotencyKey"); requireText(request.idempotencyKey, "idempotencyKey");
  validateDigest(request.expectedRevisionDigest, "expectedRevisionDigest");
  if (!Number.isSafeInteger(request.expectedAggregateVersion) || request.expectedAggregateVersion < 1) throw new WorkflowError("INVALID_REQUEST", "expectedAggregateVersion ist ungueltig.");
  if (request.fencingToken !== undefined && (!Number.isSafeInteger(request.fencingToken) || request.fencingToken < 1)) throw new WorkflowError("INVALID_REQUEST", "fencingToken ist ungueltig.");
}
function validateDuration(value: number, field: string) { if (!Number.isSafeInteger(value) || value < 1 || value > 86_400_000) throw new WorkflowError("INVALID_REQUEST", `${field} ist ungueltig.`); }
function resolveAndValidateGates(record: WorkflowRecord, current: ProjectWorkflow, request: TransitionRequest, targetRevision: string, now: Date): GateResult[] {
  const operationScope = transitionScope(request);
  const transitionKey = `${current.phase}->${request.targetPhase}`;
  const required = request.targetPhase === "IMPLEMENTATION"
    ? new Set<GateName>(["ARCHITECTURE_APPROVED", "PLAN_APPROVED", "CUSTOMER_DATA_CLASSIFIED"])
    : requiredGateSets.get(transitionKey) ?? new Set<GateName>();
  const ids = request.gateResultIds ?? [];
  if (ids.length !== required.size) throw new WorkflowError("GATE_REQUIRED", `Exakt ${required.size} GateResults werden benoetigt.`);
  const gates = ids.map((id) => record.gates.get(id));
  if (gates.some((gate) => !gate)) throw new WorkflowError("GATE_INVALID", "GateResult ist nicht persistent registriert.");
  const typed = gates as GateResult[];
  if (typed.some((gate) => !required.has(gate.name)) || new Set(typed.map((gate) => gate.name)).size !== required.size) throw new WorkflowError("GATE_REQUIRED", "GateResult-Menge entspricht nicht exakt den Anforderungen.");
  const holdAt = current.phase === "BLOCKED" ? record.auditEvents.at(-1)?.occurredAt : undefined;
  for (const gate of typed) {
    validateGateEvidence(gate);
    const latest = latestGate(record, gate.name, targetRevision, operationScope);
    if (!latest || latest.id !== gate.id || gate.projectId !== request.projectId || gate.policyVersion !== request.policyVersion || gate.subjectRevisionDigest !== targetRevision || !sameScope(gateScope(gate), operationScope) || !isGateEffective(gate) || gate.evaluatedAt > now || gate.ingestedAt > now || gate.validUntil <= now || (holdAt && (gate.evaluatedAt <= holdAt || gate.ingestedAt <= holdAt))) {
      throw new WorkflowError("GATE_INVALID", `Gate ${gate.name} ist ungueltig, veraltet oder falsch gebunden.`);
    }
  }
  return typed;
}
function compareGateAuthority(left: GateResult, right: GateResult): number {
  return left.evaluatedAt.getTime() - right.evaluatedAt.getTime()
    || left.ingestedAt.getTime() - right.ingestedAt.getTime();
}
function latestGate(record: WorkflowRecord, name: GateName, revisionDigest: string, scope: ComplianceScope): GateResult | undefined {
  const candidates = [...record.gates.values()].filter((gate) => gate.name === name && gate.subjectRevisionDigest === revisionDigest && gate.policyVersion === record.project.policyVersion && sameScope(gateScope(gate), scope)).sort(compareGateAuthority);
  const latest = candidates.at(-1); if (!latest) return undefined;
  const tied = candidates.filter((item) => compareGateAuthority(item, latest) === 0);
  if (new Set(tied.map(gateOutcomeKey)).size !== 1) return undefined;
  return [...tied].sort((a, b) => a.id.localeCompare(b.id)).at(-1);
}
function gateOutcomeKey(gate: GateEvidence) { return hashCanonical({ name: gate.name, status: gate.status, customerDataClassification: gate.customerDataClassification ?? null }); }
function gateReplayKey(gate: GateEvidence) { return hashCanonical({ projectId: gate.projectId, name: gate.name, status: gate.status, policyVersion: gate.policyVersion, subjectRevisionDigest: gate.subjectRevisionDigest, evidenceDigest: gate.evidenceDigest, evaluatedAt: gate.evaluatedAt.toISOString(), validUntil: gate.validUntil.toISOString(), customerDataClassification: gate.customerDataClassification ?? null, scope: gateScope(gate) }); }
function gateConflictSource(gates: readonly GateResult[], scope: ComplianceScope, now: Date) {
  const payload = { projectId: gates[0]!.projectId, name: gates[0]!.name, policyVersion: gates[0]!.policyVersion, revisionDigest: gates[0]!.subjectRevisionDigest, scope, gateIds: gates.map((item) => item.id).sort(), outcomes: gates.map(gateOutcomeKey).sort() };
  const digest = hashCanonical(payload); return { sourceId: `gate-conflict:${digest}`, evidence: { id: `gate-conflict-evidence:${digest}`, projectId: gates[0]!.projectId, ...scope, revisionDigest: gates[0]!.subjectRevisionDigest, contentDigest: digest, evidenceType: "GATE_CONFLICT", classification: "SYSTEM_FAIL_CLOSED", finalizedAt: new Date(now), verifiedAt: new Date(now), trustedIdentity: "SYSTEM" } satisfies ImmutableEvidenceReference };
}
function isGateEffective(gate: GateResult): boolean {
  if (gate.status !== "PASS") return false;
  if (gate.name === "CUSTOMER_DATA_CLASSIFIED") return gate.customerDataClassification === "SYNTHETIC_ONLY";
  return true;
}
function assertNoAdverseSecurityOrLegal(record: WorkflowRecord, revisionDigest: string, now: Date, scope: ComplianceScope) {
  for (const name of ["SECURITY_REVIEW_PASSED", "LEGAL_REVIEW_PASSED"] as const) {
    const gate = latestGate(record, name, revisionDigest, scope);
    if (gate && (!isGateEffective(gate) || gate.evaluatedAt > now || gate.ingestedAt > now || gate.validUntil <= now)) {
      if (name === "LEGAL_REVIEW_PASSED") {
        openPersistentHold(record, "LEGAL_UNRESOLVED_HOLD", "GATE_RESULT", gate.id, gateEvidenceReference(gate, scope), scope, "LEGAL", now);
        cancelActiveJobs(record, now);
      }
      throw new WorkflowError("GATE_INVALID", `Neueste autoritative ${name}-Evidence blockiert den Vorgang.`);
    }
  }
}
function assertOperationalEvidence(record: WorkflowRecord, revisionDigest: string, now: Date, exceptHoldIds: readonly string[] = [], scope: ComplianceScope = { scopeType: "PROJECT", scopeId: record.project.projectId }, requireLegal = true) {
  try { assertNoOpenComplianceHolds(record, scope, exceptHoldIds); } catch { throw new WorkflowError("JOB_NOT_ALLOWED", "Persistente Compliance-Holds blockieren Jobs."); }
  const customerData = latestGate(record, "CUSTOMER_DATA_CLASSIFIED", revisionDigest, scope);
  if (!customerData || !isGateEffective(customerData) || customerData.evaluatedAt > now || customerData.ingestedAt > now || customerData.validUntil <= now) {
    throw new WorkflowError("JOB_NOT_ALLOWED", "Jobs sind ohne aktuelle autoritative SYNTHETIC_ONLY-Klassifikation verboten.");
  }
  try { assertNoAdverseSecurityOrLegal(record, revisionDigest, now, scope); } catch { throw new WorkflowError("JOB_NOT_ALLOWED", "Negative oder ungeklaerte Security-/Legal-Evidence blockiert Jobs."); }
  if (requireLegal) assertEffectiveLegalAssessment(record, revisionDigest, scope, now);
}
function legalAssessmentAuthority(left: LegalAssessment, right: LegalAssessment): number { return left.finalizedAt.getTime() - right.finalizedAt.getTime() || left.evidence.verifiedAt.getTime() - right.evidence.verifiedAt.getTime(); }
function legalAssessmentSemanticKey(value: LegalAssessment): string { return hashCanonical({ status: value.status, factsDigest: value.factsDigest, assumptionsRef: value.assumptionsRef, jurisdictions: [...value.jurisdictions].sort(), legalDate: value.legalDate.toISOString(), sourceSetId: value.sourceSetId, reviewerType: value.reviewerType, supersedesId: value.supersedesId ?? null, predecessorCounselCaseId: value.predecessorCounselCaseId ?? null }); }
function currentLegalAssessment(record: WorkflowRecord, revisionDigest: string, scope: ComplianceScope, now: Date): LegalAssessment | undefined {
  const candidates = [...record.legalAssessments.values()].filter((item) => item.revisionDigest === revisionDigest && sameScope(item, scope) && item.finalizedAt <= now && item.ingestedAt <= now && item.evidence.finalizedAt <= now && item.evidence.verifiedAt <= now).sort(legalAssessmentAuthority);
  const latest = candidates.at(-1); if (!latest) return undefined;
  const tied = candidates.filter((item) => legalAssessmentAuthority(item, latest) === 0);
  if (new Set(tied.map(legalAssessmentSemanticKey)).size !== 1) return undefined;
  return [...tied].sort((a, b) => a.id.localeCompare(b.id)).at(-1);
}
function isLegalAssessmentEffective(record: WorkflowRecord, assessment: LegalAssessment): boolean {
  if (assessment.status === "PASS") return true;
  if (assessment.status !== "PASS_WITH_REQUIREMENTS") return false;
  const requirements = [...record.legalRequirements.values()].filter((item) => item.assessmentId === assessment.id);
  return requirements.length > 0 && requirements.every((item) => item.state === "VERIFIED");
}
function unresolvedEvidence(record: WorkflowRecord, revisionDigest: string, scope: ComplianceScope, now: Date): ImmutableEvidenceReference {
  const source = { projectId: record.project.projectId, revisionDigest, scopeType: scope.scopeType, scopeId: scope.scopeId, kind: "LEGAL_UNRESOLVED" };
  return { id: `legal-unresolved-evidence:${hashCanonical(source)}`, projectId: record.project.projectId, ...scope, revisionDigest, contentDigest: hashCanonical(source), evidenceType: "LEGAL_UNRESOLVED", classification: "SYSTEM_FAIL_CLOSED", finalizedAt: new Date(now), verifiedAt: new Date(now), trustedIdentity: "SYSTEM" };
}
function assertEffectiveLegalAssessment(record: WorkflowRecord, revisionDigest: string, scope: ComplianceScope, now: Date) {
  const assessment = currentLegalAssessment(record, revisionDigest, scope, now);
  if (!assessment) {
    const sourceId = `legal-unresolved:${scope.scopeType}:${scope.scopeId}:${revisionDigest}`;
    openPersistentHold(record, "LEGAL_UNRESOLVED_HOLD", "SYSTEM", sourceId, unresolvedEvidence(record, revisionDigest, scope, now), scope, "LEGAL", now);
    cancelActiveJobs(record, now);
    throw new WorkflowError("JOB_NOT_ALLOWED", "Aktuelle eindeutige Domain-LegalAssessment fehlt oder ist konfliktbehaftet.");
  }
  if (!isLegalAssessmentEffective(record, assessment)) throw new WorkflowError("JOB_NOT_ALLOWED", `Legal Assessment ${assessment.id} ist nicht wirksam.`);
}
function resolveHoldClearances(record: WorkflowRecord, current: ProjectWorkflow, request: TransitionRequest, targetRevision: string, now: Date): VerifiedHoldClearance[] {
  if (request.targetPhase === "FAILED" || request.targetPhase === "CANCELLED") {
    if (request.holdClearanceIds?.length) throw new WorkflowError("GATE_INVALID", "FAILED/CANCELLED bindet keine Hold-Clearings.");
    return [];
  }
  const legacyHolds = current.phase === "BLOCKED" ? current.blockReasons.filter((reason) => reason.holdType === "SECURITY" || reason.holdType === "LEGAL") : [];
  const operationScope = transitionScope(request);
  const persistentHolds = [...record.holds.values()].filter((hold) => hold.state === "OPEN" && scopeApplies(hold, operationScope));
  const ids = request.holdClearanceIds ?? [];
  const expectedCount = legacyHolds.length + persistentHolds.length;
  if (ids.length !== expectedCount) {
    if (ids.length || expectedCount) throw new WorkflowError("GATE_REQUIRED", "Jeder Security-/Legal-/Compliance-Hold benoetigt genau eine verifizierte Clearing-Evidence.");
    return [];
  }
  const blockAt = record.auditEvents.at(-1)?.occurredAt;
  const results = ids.map((id) => record.holdClearances.get(id));
  if (results.some((item) => !item)) throw new WorkflowError("GATE_INVALID", "Hold-Clearing-Evidence ist nicht persistent registriert.");
  const typed = results as VerifiedHoldClearance[];
  const refs = typed.map((item) => item.evidenceRef).filter((item): item is ImmutableEvidenceReference => Boolean(item));
  if (refs.length !== typed.length || new Set(refs.map((item) => item.id)).size !== refs.length || new Set(refs.map((item) => item.contentDigest)).size !== refs.length || new Set(refs.map(evidenceSemanticKey)).size !== refs.length) throw new WorkflowError("GATE_INVALID", "Jedes Hold benoetigt eine eigene vollstaendige Clearing-Evidence.");
  for (const hold of legacyHolds) {
    const expectedAuthority: HoldClearingAuthority = hold.holdType === "SECURITY" ? "SECURITY" : "LEGAL";
    const matches = typed.filter((item) => item.holdCode === hold.code && item.clearingAuthority === expectedAuthority && item.projectId === current.projectId && item.scopeType === operationScope.scopeType && item.scopeId === operationScope.scopeId && item.sourceRecordType === "SYSTEM" && item.sourceRecordId === hold.evidenceRef && item.subjectRevisionDigest === targetRevision && item.verifiedAt <= now && item.ingestedAt <= now && (!blockAt || item.verifiedAt > blockAt && item.ingestedAt > blockAt) && item.evidenceRef && validClearanceEvidence(item, operationScope, targetRevision, now));
    if (matches.length !== 1) throw new WorkflowError("GATE_INVALID", `Hold ${hold.code} ist nicht durch ${expectedAuthority} revisionsgebunden freigegeben.`);
    const clearance = matches[0]!; assertEvidenceUnused(record, clearance.evidenceRef!, "HOLD_CLEARANCE");
  }
  for (const hold of persistentHolds) {
    const matches = typed.filter((item) => item.holdCode === hold.id && item.clearingAuthority === hold.clearingAuthority && item.projectId === hold.projectId && item.scopeType === hold.scopeType && item.scopeId === hold.scopeId && item.sourceRecordType === hold.sourceRecordType && item.sourceRecordId === hold.sourceRecordId && item.subjectRevisionDigest === hold.sourceEvidence.revisionDigest && item.verifiedAt <= now && item.ingestedAt <= now && item.verifiedAt > hold.createdAt && item.ingestedAt > hold.createdAt && item.evidenceRef && validClearanceEvidence(item, hold, hold.sourceEvidence.revisionDigest, now));
    if (matches.length !== 1) throw new WorkflowError("GATE_INVALID", `Hold ${hold.id} ist nicht durch ${hold.clearingAuthority} mit vollstaendiger Evidence freigegeben.`);
    const clearance = matches[0]!;
    if (record.consumedClearances.has(clearance.id) || record.consumedClearanceSemantics.has(clearanceSemanticKey(clearance))) throw new WorkflowError("GATE_INVALID", "Hold-Clearing-Evidence wurde bereits verwendet oder semantisch wiederholt.");
    assertEvidenceUnused(record, clearance.evidenceRef!, "HOLD_CLEARANCE");
    assertHoldClearable(record, hold, now);
  }
  return typed;
}
function assertAllowed(current: ProjectWorkflow, target: ProjectPhase) {
  if (!isTransitionAllowed(current.phase, target)) throw new WorkflowError("INVALID_TRANSITION", `${current.phase} -> ${target} ist unzulaessig.`);
  if (current.phase === "BLOCKED" && target !== "FAILED" && target !== "CANCELLED" && target !== current.blockedFrom) throw new WorkflowError("INVALID_TRANSITION", `BLOCKED darf nur nach ${current.blockedFrom ?? "dem Ausgangszustand"} zurueck.`);
}
function assertBlockReasons(target: ProjectPhase, reasons: readonly BlockReason[] | undefined) {
  if (target !== "BLOCKED") return;
  if (!reasons?.length) throw new WorkflowError("BLOCK_REASONS_REQUIRED", "BLOCKED benoetigt konkrete Gruende.");
  for (const reason of reasons) {
    requireText(reason.code, "blockReason.code"); requireText(reason.message, "blockReason.message"); if (reason.evidenceRef !== undefined) requireText(reason.evidenceRef, "blockReason.evidenceRef");
    const type = reason.holdType ?? "GENERAL";
    if (!["GENERAL", "SECURITY", "LEGAL"].includes(type)) throw new WorkflowError("INVALID_REQUEST", "Hold-Typ ist ungueltig.");
    if (type === "SECURITY" && reason.clearingAuthority !== "SECURITY" || type === "LEGAL" && reason.clearingAuthority !== "LEGAL" || type === "GENERAL" && reason.clearingAuthority !== undefined) throw new WorkflowError("INVALID_REQUEST", "Security-/Legal-Holds benoetigen die exakt passende Clearing Authority.");
  }
}
function findJob(record: WorkflowRecord, id: string): { index: number; job: WorkflowJob } { const index = record.jobs.findIndex((job) => job.id === id); const job = record.jobs[index]; if (!job) throw new WorkflowError("JOB_NOT_FOUND", `Job ${id} fehlt.`); return { index, job }; }
function assertRunnableSnapshot(record: WorkflowRecord, job: WorkflowJob, request: { expectedAggregateVersion: number; expectedRevisionDigest: string }) {
  if (record.project.phase === "CANCELLED" || record.project.version !== request.expectedAggregateVersion || job.aggregateVersion !== request.expectedAggregateVersion || record.project.revisionDigest !== request.expectedRevisionDigest || job.revisionDigest !== request.expectedRevisionDigest || record.project.phase !== job.phase) throw new WorkflowError("JOB_NOT_ALLOWED", "Job ist storniert, veraltet oder nicht mehr autorisiert.");
}
function assertActiveOwnedJob(record: WorkflowRecord, job: WorkflowJob, request: OwnedJobRequest, now: Date) {
  assertRunnableSnapshot(record, job, request);
  if (job.status !== "CLAIMED" || job.leaseOwner !== request.workerId || job.claimIdempotencyKey !== request.claimIdempotencyKey || request.fencingToken !== undefined && job.fencingToken !== request.fencingToken || !job.leaseExpiresAt || job.leaseExpiresAt <= now) throw new WorkflowError("JOB_NOT_ALLOWED", "Job-Lease oder Fencing-Token ist ungueltig, abgelaufen oder widerrufen.");
}
function assertClaimedJobOwnership(record: WorkflowRecord, job: WorkflowJob, request: OwnedJobRequest) {
  assertRunnableSnapshot(record, job, request);
  if (job.status !== "CLAIMED" || job.leaseOwner !== request.workerId || job.claimIdempotencyKey !== request.claimIdempotencyKey || request.fencingToken !== undefined && job.fencingToken !== request.fencingToken) throw new WorkflowError("JOB_NOT_ALLOWED", "Nur der aktuelle Lease-Inhaber mit aktuellem Fencing-Token darf den laufenden Job rechecken.");
}
interface ComplianceFailureBinding {
  readonly holdId: string;
  readonly reason: string;
  readonly sourceRecordType: ProjectHold["sourceRecordType"];
  readonly sourceRecordId: string;
  readonly evidence: ImmutableEvidenceReference;
}
function complianceFailureBinding(holdType: ComplianceHoldType, sourceRecordType: ProjectHold["sourceRecordType"], sourceRecordId: string, evidence: ImmutableEvidenceReference, reason: string): ComplianceFailureBinding {
  return { holdId: `${holdType}:${sourceRecordType}:${sourceRecordId}`, reason, sourceRecordType, sourceRecordId, evidence: cloneEvidenceReference(evidence) };
}
function runtimeEvidenceFailures(record: WorkflowRecord, revisionDigest: string, scope: ComplianceScope, now: Date): ComplianceFailureBinding[] {
  const failures: ComplianceFailureBinding[] = [];
  const checks = [
    { gate: latestGate(record, "CUSTOMER_DATA_CLASSIFIED", revisionDigest, scope), holdType: "PROHIBITED_DATA_HOLD", reason: "Autoritative SYNTHETIC_ONLY-Evidence ist waehrend des laufenden Jobs abgelaufen oder zeitlich ungueltig." },
    { gate: latestGate(record, "SECURITY_REVIEW_PASSED", revisionDigest, scope), holdType: "SECURITY_ADVERSE_HOLD", reason: "Positive Security-Evidence ist waehrend des laufenden Jobs abgelaufen oder zeitlich ungueltig." },
  ] as const;
  for (const check of checks) {
    const gate = check.gate;
    if (!gate || !isGateEffective(gate) || gate.evaluatedAt <= now && gate.ingestedAt <= now && gate.validUntil > now) continue;
    const evidence = cloneEvidenceReference(gateEvidenceReference(gate, scope));
    failures.push(complianceFailureBinding(check.holdType, "GATE_RESULT", gate.id, evidence, check.reason));
  }
  return failures;
}
function enforceRuntimeEvidenceForClaimedJob(record: WorkflowRecord, job: WorkflowJob, now: Date) {
  const failures = runtimeEvidenceFailures(record, job.revisionDigest, job.operationScope, now);
  if (!failures.length) return;
  // All evidence bindings are cloned and validated before the first mutation.
  const prepared = failures.map((failure) => ({ ...failure, evidence: cloneEvidenceReference(failure.evidence) }));
  for (const failure of prepared) {
    const holdType = failure.holdId.startsWith("PROHIBITED_DATA_HOLD:") ? "PROHIBITED_DATA_HOLD" : "SECURITY_ADVERSE_HOLD";
    openPersistentHold(record, holdType, failure.sourceRecordType, failure.sourceRecordId, failure.evidence, job.operationScope, "SECURITY", now);
  }
  cancelActiveJobs(record, now, prepared);
  throw new WorkflowError("JOB_NOT_ALLOWED", "Laufzeit-Evidence ist abgelaufen oder ungueltig; Hold und CANCELLING wurden atomar persistiert.");
}
function enforceRuntimeEvidenceForActiveJobInScope(record: WorkflowRecord, revisionDigest: string, scope: ComplianceScope, now: Date) {
  const active = record.jobs.find((job) => job.status === "CLAIMED" && job.revisionDigest === revisionDigest && sameScope(job.operationScope, scope));
  if (active) enforceRuntimeEvidenceForClaimedJob(record, active, now);
}
function cancelActiveJobs(record: WorkflowRecord, now: Date, complianceFailures: readonly ComplianceFailureBinding[] = []) {
  for (let index = 0; index < record.jobs.length; index++) {
    const job = record.jobs[index];
    if (!job) continue;
    if (job.status === "PENDING") {
      const cancelled: WorkflowJob = { ...job, status: "CANCELLED", cancelledAt: now };
      record.jobs[index] = cancelled;
      appendJobEvent(record, cancelled, "CANCELLED", now);
    } else if (job.status === "CLAIMED") {
      const cancelling: WorkflowJob = { ...job, status: "CANCELLING" };
      record.jobs[index] = cancelling;
      appendJobEvent(record, cancelling, "CANCELLING", now, job.leaseOwner, undefined, undefined, complianceFailures);
    }
  }
}
function jobBinding(job: WorkflowJob) {
  return { id: job.id, type: job.type, status: job.status, revisionDigest: job.revisionDigest, aggregateVersion: job.aggregateVersion, operationScope: cloneScope(job.operationScope, "job.operationScope") };
}
function appendJobEvent(record: WorkflowRecord, job: WorkflowJob, type: JobEventType, occurredAt: Date, workerId?: string, idempotencyKey?: string, termination?: VerifiedTerminationEvidence, complianceFailures: readonly ComplianceFailureBinding[] = []) {
  const previousHash = record.jobEvents.at(-1)?.eventHash ?? null;
  const payload = {
    id: `${job.id}:event:${record.jobEvents.length + 1}`, projectId: job.projectId, jobId: job.id, type,
    ...(workerId ? { workerId } : {}), occurredAt: occurredAt.toISOString(), jobStatus: job.status,
    jobType: job.type, revisionDigest: job.revisionDigest, aggregateVersion: job.aggregateVersion,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(termination ? { terminationEvidenceId: termination.id, terminationEvidenceDigest: termination.evidenceDigest } : {}), previousHash,
    ...(complianceFailures.length ? { complianceFailureBindings: complianceFailures.map((failure) => ({ ...failure, evidence: evidenceReferencePayload(failure.evidence) })) } : {}),
  };
  const { complianceFailureBindings: serializedFailures, ...eventPayload } = payload;
  void serializedFailures;
  record.jobEvents.push({ ...eventPayload, occurredAt, ...(complianceFailures.length ? { complianceFailureBindings: complianceFailures.map((failure) => ({ ...failure, evidence: cloneEvidenceReference(failure.evidence) })) } : {}), eventHash: hashCanonical(payload) });
}
function jobCommandKey(operation: string, workerId: string, idempotencyKey: string) { return canonical([operation, workerId, idempotencyKey]); }
function beginJobCommand(record: WorkflowRecord, operation: string, workerId: string, idempotencyKey: string, request: unknown): WorkflowJob | null {
  const prior = record.jobIdempotency.get(jobCommandKey(operation, workerId, idempotencyKey));
  if (!prior) return null;
  if (prior.requestHash !== hashCanonical(request)) throw new WorkflowError("IDEMPOTENCY_CONFLICT", "Worker-scoped Idempotenzschluessel wurde fuer einen anderen Job-Befehl verwendet.");
  return cloneJob(prior.result);
}
function finishJobCommand(record: WorkflowRecord, operation: string, workerId: string, idempotencyKey: string, request: unknown, result: WorkflowJob): WorkflowJob {
  record.jobIdempotency.set(jobCommandKey(operation, workerId, idempotencyKey), { requestHash: hashCanonical(request), result: cloneJob(result) });
  return cloneJob(result);
}
function assertCurrentReplayFence(record: WorkflowRecord, cached: WorkflowJob, request: { workerId:string; claimIdempotencyKey?:string; fencingToken?:number }, allowedStatuses: readonly JobStatus[]): WorkflowJob {
  const current = record.jobs.find((job) => job.id === cached.id);
  if (!current) throw new WorkflowError("JOB_NOT_ALLOWED", "Idempotenter Replay kann den aktuellen Jobzustand nicht verifizieren.");
  if (!allowedStatuses.includes(current.status) || current.leaseOwner !== cached.leaseOwner || current.claimIdempotencyKey !== cached.claimIdempotencyKey || current.fencingToken !== cached.fencingToken || current.leaseOwner !== request.workerId || request.claimIdempotencyKey !== undefined && current.claimIdempotencyKey !== request.claimIdempotencyKey || request.fencingToken !== undefined && current.fencingToken !== request.fencingToken) {
    throw new WorkflowError("JOB_NOT_ALLOWED", "Idempotenter Replay wurde durch eine neuere Lease oder ein neueres Fencing-Token ungueltig.");
  }
  return cloneJob(current);
}
function replayResult(result: Omit<TransitionResult, "duplicate">, jobs: readonly WorkflowJob[]): TransitionResult { if (!result.job) return cloneResult(result, true); const current = jobs.find((job) => job.id === result.job?.id); return cloneResult({ ...result, ...(current ? { job: current } : {}) }, true); }
function canonicalRequest(request: TransitionRequest) { return { projectId: request.projectId, targetPhase: request.targetPhase, expectedVersion: request.expectedVersion, expectedRevisionDigest: request.expectedRevisionDigest, policyVersion: request.policyVersion, actorId: request.actorId, reason: request.reason, idempotencyKey: request.idempotencyKey, gateResultIds: [...(request.gateResultIds ?? [])].sort(), holdClearanceIds: [...(request.holdClearanceIds ?? [])].sort(), blockReasons: [...(request.blockReasons ?? [])].map((reason) => ({ code: reason.code, message: reason.message, evidenceRef: reason.evidenceRef ?? null, holdType: reason.holdType ?? "GENERAL", clearingAuthority: reason.clearingAuthority ?? null })).sort((a, b) => canonical(a).localeCompare(canonical(b))), newRevisionDigest: request.newRevisionDigest ?? null, startJobType: request.startJob?.type ?? null, operationScope: request.operationScope ?? { scopeType: "PROJECT", scopeId: request.projectId } }; }
function canonical(value: unknown) { return JSON.stringify(value); }
function hashCanonical(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function validateDigest(value: string, field: string) { if (!/^[0-9a-f]{64}$/.test(value)) throw new WorkflowError("INVALID_REQUEST", `${field} muss SHA-256 hex sein.`); }
function requireText(value: string, field: string) { if (typeof value !== "string" || !value.trim()) throw new WorkflowError("INVALID_REQUEST", `${field} darf nicht leer sein.`); }
function isProjectPhase(value: string): value is ProjectPhase { return (PROJECT_PHASES as readonly string[]).includes(value); }
function isJobType(value: string): value is JobType { return (JOB_TYPES as readonly string[]).includes(value); }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }

function validateHoldClearanceEvidence(value: HoldClearanceEvidence) {
  requireText(value.id, "holdClearance.id"); requireText(value.projectId, "holdClearance.projectId"); requireText(value.holdCode, "holdClearance.holdCode"); requireText(value.authorityId, "holdClearance.authorityId"); requireText(value.proof, "holdClearance.proof");
  if (!["SECURITY", "LEGAL"].includes(value.clearingAuthority)) throw new WorkflowError("GATE_INVALID", "Clearing Authority ist ungueltig.");
  validateDigest(value.subjectRevisionDigest, "holdClearance.subjectRevisionDigest"); validateDigest(value.evidenceDigest, "holdClearance.evidenceDigest"); strictDate(value.verifiedAt, "holdClearance.verifiedAt");
  if ((value.scopeType === undefined) !== (value.scopeId === undefined) || (value.sourceRecordType === undefined) !== (value.sourceRecordId === undefined)) throw new WorkflowError("GATE_INVALID", "Clearing Scope/Source muss vollstaendig gebunden sein.");
  if (value.evidenceRef) validateEvidenceReferenceShape(value.evidenceRef);
}
function validateTerminationEvidence(value: TerminationEvidence) {
  requireText(value.id, "terminationEvidence.id"); requireText(value.proof, "terminationEvidence.proof"); validateDigest(value.evidenceDigest, "terminationEvidence.evidenceDigest");
  strictDate(value.processEndedAt, "terminationEvidence.processEndedAt"); strictDate(value.mountRevokedAt, "terminationEvidence.mountRevokedAt"); strictDate(value.credentialsRevokedAt, "terminationEvidence.credentialsRevokedAt");
}
function isValidTerminationVerification(value: VerifiedTerminationEvidence | null, request: ConfirmJobTerminationRequest, now: Date): value is VerifiedTerminationEvidence {
  if (!value) return false;
  const source = request.terminationEvidence;
  return value.id === source.id && value.evidenceDigest === source.evidenceDigest && value.workerId === request.workerId && value.jobId === request.jobId
    && value.processEndedAt.getTime() === source.processEndedAt.getTime() && value.mountRevokedAt.getTime() === source.mountRevokedAt.getTime() && value.credentialsRevokedAt.getTime() === source.credentialsRevokedAt.getTime()
    && value.evidenceDigest === terminationEvidenceDigest(value) && value.processEndedAt <= now && value.mountRevokedAt <= now && value.credentialsRevokedAt <= now;
}
function terminationEvidenceDigest(value: Pick<VerifiedTerminationEvidence, "id" | "workerId" | "jobId" | "processEndedAt" | "mountRevokedAt" | "credentialsRevokedAt">) {
  return hashCanonical({ id: value.id, workerId: value.workerId, jobId: value.jobId, processEndedAt: value.processEndedAt.toISOString(), mountRevokedAt: value.mountRevokedAt.toISOString(), credentialsRevokedAt: value.credentialsRevokedAt.toISOString() });
}
function terminationProofPayload(evidence: Omit<TerminationEvidence, "proof"> | TerminationEvidence, context: { projectId: string; jobId: string; workerId: string }) {
  return { id: evidence.id, evidenceDigest: evidence.evidenceDigest, processEndedAt: evidence.processEndedAt.toISOString(), mountRevokedAt: evidence.mountRevokedAt.toISOString(), credentialsRevokedAt: evidence.credentialsRevokedAt.toISOString(), ...context };
}
function clearanceProofPayload(evidence: Omit<HoldClearanceEvidence, "proof"> | HoldClearanceEvidence) {
  return { id: evidence.id, projectId: evidence.projectId, holdCode: evidence.holdCode, clearingAuthority: evidence.clearingAuthority, authorityId: evidence.authorityId, subjectRevisionDigest: evidence.subjectRevisionDigest, evidenceDigest: evidence.evidenceDigest, verifiedAt: evidence.verifiedAt.toISOString(), scopeType: evidence.scopeType ?? null, scopeId: evidence.scopeId ?? null, sourceRecordType: evidence.sourceRecordType ?? null, sourceRecordId: evidence.sourceRecordId ?? null, evidenceRef: evidence.evidenceRef ? evidenceReferencePayload(evidence.evidenceRef) : null };
}

function scopeApplies(hold: ComplianceScope, target: ComplianceScope): boolean { return hold.scopeType === "PROJECT" || hold.scopeType === target.scopeType && hold.scopeId === target.scopeId; }
function sameScope(left: ComplianceScope, right: ComplianceScope): boolean { return left.scopeType === right.scopeType && left.scopeId === right.scopeId; }
function cloneScope(value: ComplianceScope, field: string): ComplianceScope { return { scopeType: strictString(value.scopeType, `${field}.scopeType`), scopeId: strictString(value.scopeId, `${field}.scopeId`) }; }
function transitionScope(request: TransitionRequest): ComplianceScope { return request.operationScope ? cloneScope(request.operationScope, "operationScope") : { scopeType: "PROJECT", scopeId: request.projectId }; }
function isLegalRequiredPhase(phase: ProjectPhase): boolean { return ["RELEASE_CANDIDATE", "STAGING", "COMPLETED"].includes(phase); }
function gateScope(gate: GateEvidence): ComplianceScope { return { scopeType: gate.scopeType ?? "PROJECT", scopeId: gate.scopeId ?? gate.projectId }; }
function evidenceReferencePayload(value: ImmutableEvidenceReference) { return { id: value.id, projectId: value.projectId, scopeType: value.scopeType, scopeId: value.scopeId, revisionDigest: value.revisionDigest, contentDigest: value.contentDigest, evidenceType: value.evidenceType, classification: value.classification, finalizedAt: value.finalizedAt.toISOString(), verifiedAt: value.verifiedAt.toISOString(), trustedIdentity: value.trustedIdentity }; }
function cloneEvidenceReference(value: ImmutableEvidenceReference): ImmutableEvidenceReference { return { ...evidenceReferencePayload(value), finalizedAt: strictDate(value.finalizedAt, "evidence.finalizedAt"), verifiedAt: strictDate(value.verifiedAt, "evidence.verifiedAt") }; }
function validateEvidenceReferenceShape(value: ImmutableEvidenceReference) {
  requireText(value.id, "evidence.id"); requireText(value.projectId, "evidence.projectId"); requireText(value.scopeType, "evidence.scopeType"); requireText(value.scopeId, "evidence.scopeId"); requireText(value.evidenceType, "evidence.evidenceType"); requireText(value.classification, "evidence.classification"); requireText(value.trustedIdentity, "evidence.trustedIdentity");
  validateDigest(value.revisionDigest, "evidence.revisionDigest"); validateDigest(value.contentDigest, "evidence.contentDigest"); strictDate(value.finalizedAt, "evidence.finalizedAt"); strictDate(value.verifiedAt, "evidence.verifiedAt");
}
function evidenceSemanticKey(value: ImmutableEvidenceReference): string { return hashCanonical({ projectId: value.projectId, scopeType: value.scopeType, scopeId: value.scopeId, revisionDigest: value.revisionDigest, contentDigest: value.contentDigest, evidenceType: value.evidenceType, classification: value.classification, finalizedAt: value.finalizedAt.toISOString(), verifiedAt: value.verifiedAt.toISOString(), trustedIdentity: value.trustedIdentity }); }
function validatePurposeEvidence(value: ImmutableEvidenceReference, expected: { projectId: string; scope: ComplianceScope; revisionDigest: string; evidenceType: string; classification: string; trustedIdentity: string; notBefore?: Date; eventAt: Date; now: Date }) {
  validateEvidenceReferenceShape(value);
  if (value.projectId !== expected.projectId || !sameScope(value, expected.scope) || value.revisionDigest !== expected.revisionDigest || value.evidenceType !== expected.evidenceType || value.classification !== expected.classification || value.trustedIdentity !== expected.trustedIdentity || value.finalizedAt > value.verifiedAt || Boolean(expected.notBefore && value.verifiedAt < expected.notBefore) || value.finalizedAt > expected.eventAt || value.verifiedAt > expected.eventAt || expected.eventAt > expected.now) throw new WorkflowError("GATE_INVALID", "Evidence-Referenz verletzt Project/Scope/Revision/Purpose/Identity/Zeitbindung.");
}
function assertEvidenceUnused(record: WorkflowRecord, value: ImmutableEvidenceReference, purpose: string) {
  const priorIdPurpose = record.evidenceUsageById.get(value.id); const priorDigestPurpose = record.evidenceUsageByDigest.get(value.contentDigest);
  if (priorIdPurpose || priorDigestPurpose || record.evidenceSemanticUsage.has(evidenceSemanticKey(value))) throw new WorkflowError("GATE_ALREADY_EXISTS", `Evidence ist bereits fuer ${priorIdPurpose ?? priorDigestPurpose ?? purpose} gebunden.`);
}
function registerEvidenceUsage(record: WorkflowRecord, value: ImmutableEvidenceReference, purpose: string) { record.evidenceUsageById.set(value.id, purpose); record.evidenceUsageByDigest.set(value.contentDigest, purpose); record.evidenceSemanticUsage.add(evidenceSemanticKey(value)); }
function evidenceRefEquals(value: ImmutableEvidenceReference, expected: { projectId: string; scope: ComplianceScope; revisionDigest: string; digest: string; evidenceType: string; classification: string; trustedIdentity: string; verifiedAt: Date }, now: Date): boolean {
  try { validateEvidenceReferenceShape(value); } catch { return false; }
  return value.projectId === expected.projectId && sameScope(value, expected.scope) && value.revisionDigest === expected.revisionDigest && value.contentDigest === expected.digest && value.evidenceType === expected.evidenceType && value.classification === expected.classification && value.trustedIdentity === expected.trustedIdentity && value.finalizedAt <= value.verifiedAt && value.verifiedAt.getTime() === expected.verifiedAt.getTime() && value.verifiedAt <= now;
}
function validClearanceEvidence(clearance: VerifiedHoldClearance, scope: ComplianceScope, revisionDigest: string, now: Date): boolean { return Boolean(clearance.evidenceRef && evidenceRefEquals(clearance.evidenceRef, { projectId: clearance.projectId, scope, revisionDigest, digest: clearance.evidenceDigest, evidenceType: "HOLD_CLEARANCE", classification: "VERIFIED_CLEARANCE", trustedIdentity: clearance.authorityId, verifiedAt: clearance.verifiedAt }, now)); }
function effectiveImmediateSuccessor(record: WorkflowRecord, predecessorId: string, scope: ComplianceScope, after: Date, now: Date): LegalAssessment | undefined {
  const candidates = [...record.legalAssessments.values()].filter((item) => item.supersedesId === predecessorId && sameScope(item, scope) && item.ingestedAt > after && item.ingestedAt <= now && isLegalAssessmentEffective(record, item));
  return candidates.length === 1 ? candidates[0] : undefined;
}
function assertCounselSuccessorChronology(successor: LegalAssessmentInput | LegalAssessment, predecessor: LegalAssessment, counselCase: CounselCase, decision: CounselDecision, now: Date) {
  const closedAt = counselCase.closedAt;
  if (counselCase.assessmentId !== predecessor.id || counselCase.state !== "CLOSED" || !closedAt
    || !sameScope(counselCase, predecessor) || !sameScope(decision, predecessor) || !sameScope(successor, predecessor)
    || decision.counselCaseId !== counselCase.id || decision.predecessorAssessmentId !== predecessor.id
    || decision.qualifiedCounselIdentityRef !== counselCase.qualifiedCounselIdentityRef || decision.evidence.id !== counselCase.encryptedDecisionEvidenceId
    || decision.decidedAt <= counselCase.openedAt || decision.ingestedAt <= decision.decidedAt || closedAt.getTime() !== decision.ingestedAt.getTime()
    || decision.evidence.verifiedAt <= counselCase.openedAt || decision.evidence.verifiedAt > decision.decidedAt
    || successor.supersedesId !== predecessor.id || successor.predecessorCounselCaseId !== counselCase.id
    || successor.finalizedAt <= closedAt || successor.evidence.finalizedAt <= closedAt || successor.evidence.verifiedAt <= closedAt
    || successor.evidence.finalizedAt > successor.evidence.verifiedAt || successor.evidence.verifiedAt > successor.finalizedAt
    || ("ingestedAt" in successor ? successor.ingestedAt <= successor.finalizedAt || successor.ingestedAt > now : successor.finalizedAt >= now)) {
    throw new WorkflowError("GATE_INVALID", "Counsel-Successor verletzt Case -> Decision -> Close -> Finalization -> Ingest-Chronologie oder Scope-/Identitaetsbindung.");
  }
}
function assertHoldClearable(record: WorkflowRecord, hold: ProjectHold, now: Date) {
  if (hold.holdType === "LEGAL_BLOCK_HOLD") {
    const successor = hold.sourceRecordType === "LEGAL_ASSESSMENT" ? effectiveImmediateSuccessor(record, hold.sourceRecordId, hold, hold.createdAt, now) : currentLegalAssessment(record, hold.sourceEvidence.revisionDigest, hold, now);
    if (!successor || successor.ingestedAt <= hold.createdAt || !isLegalAssessmentEffective(record, successor)) throw new WorkflowError("GATE_INVALID", "Legal BLOCK benoetigt einen eindeutigen wirksamen unmittelbaren Successor.");
  } else if (hold.holdType === "LEGAL_UNRESOLVED_HOLD") {
    const current = currentLegalAssessment(record, hold.sourceEvidence.revisionDigest, hold, now);
    if (!current || current.ingestedAt <= hold.createdAt || !isLegalAssessmentEffective(record, current)) throw new WorkflowError("GATE_INVALID", "Legal unresolved benoetigt eine spaetere eindeutige wirksame Assessment.");
  } else if (hold.holdType === "LEGAL_REQUIREMENT_HOLD") {
    const requirement = record.legalRequirements.get(hold.sourceRecordId.split(":rejected:")[0]!);
    const superseding = requirement?.state === "SUPERSEDED" && requirement.supersededByAssessmentId ? record.legalAssessments.get(requirement.supersededByAssessmentId) : undefined;
    if (!requirement || requirement.state !== "VERIFIED" && !(superseding && isLegalAssessmentEffective(record, superseding))) throw new WorkflowError("GATE_INVALID", "Requirement-Hold ist weder VERIFIED noch wirksam superseded.");
  } else if (hold.holdType === "COUNSEL_REQUIRED_HOLD") {
    if (hold.sourceRecordType !== "LEGAL_ASSESSMENT") {
      const successor = currentLegalAssessment(record, hold.sourceEvidence.revisionDigest, hold, now);
      if (!successor || successor.ingestedAt <= hold.createdAt || !isLegalAssessmentEffective(record, successor)) throw new WorkflowError("GATE_INVALID", "Gate-basierter Counsel-Hold benoetigt eine spaetere wirksame Domain-LegalAssessment.");
      return;
    }
    const assessment = record.legalAssessments.get(hold.sourceRecordId);
    const counselCase = [...record.counselCases.values()].find((item) => item.assessmentId === assessment?.id);
    const decision = counselCase?.decisionId ? record.counselDecisions.get(counselCase.decisionId) : undefined;
    const successor = assessment && counselCase ? effectiveImmediateSuccessor(record, assessment.id, hold, hold.createdAt, now) : undefined;
    if (!assessment || !counselCase || !decision || !successor) throw new WorkflowError("GATE_INVALID", "Counsel-Hold benoetigt Case -> qualified Decision -> wirksamen Successor.");
    assertCounselSuccessorChronology(successor, assessment, counselCase, decision, now);
  }
}
function gateEvidenceReference(gate: GateResult, scope: ComplianceScope): ImmutableEvidenceReference { return { id: `${gate.id}:evidence`, projectId: gate.projectId, ...scope, revisionDigest: gate.subjectRevisionDigest, contentDigest: gate.evidenceDigest, evidenceType: gate.name, classification: "GATE_ATTESTATION", finalizedAt: new Date(gate.evaluatedAt), verifiedAt: new Date(gate.ingestedAt), trustedIdentity: gate.trustedAttester }; }
function openPersistentHold(record: WorkflowRecord, type: ComplianceHoldType, sourceRecordType: ProjectHold["sourceRecordType"], sourceRecordId: string, evidence: ImmutableEvidenceReference, scope: ComplianceScope, authority: HoldClearingAuthority, now: Date) {
  const id = `${type}:${sourceRecordType}:${sourceRecordId}`;
  if (record.holds.has(id)) return;
  record.holds.set(id, { id, projectId: record.project.projectId, holdType: type, state: "OPEN", scopeType: scope.scopeType, scopeId: scope.scopeId, sourceRecordType, sourceRecordId, sourceEvidence: cloneEvidenceReference(evidence), clearingAuthority: authority, createdAt: new Date(now) });
}
function assertNoOpenComplianceHolds(record: WorkflowRecord, scope: ComplianceScope, exceptHoldIds: readonly string[] = []) {
  const except = new Set(exceptHoldIds);
  if ([...record.holds.values()].some((hold) => hold.state === "OPEN" && scopeApplies(hold, scope) && !except.has(hold.id))) throw new WorkflowError("GATE_INVALID", "Ein persistenter Compliance-Hold blockiert den Vorgang.");
}
function clearanceSemanticKey(value: VerifiedHoldClearance) { return hashCanonical({ holdCode: value.holdCode, projectId: value.projectId, scopeType: value.scopeType, scopeId: value.scopeId, sourceRecordType: value.sourceRecordType, sourceRecordId: value.sourceRecordId, clearingAuthority: value.clearingAuthority, authorityId: value.authorityId, subjectRevisionDigest: value.subjectRevisionDigest, evidenceDigest: value.evidenceDigest, evidenceSemantic: value.evidenceRef ? evidenceSemanticKey(value.evidenceRef) : null }); }

type PersistentEncoding = null | boolean | number | string | PersistentEncoding[] | { readonly [key: string]: PersistentEncoding };
function encodePersistentValue(value: unknown): PersistentEncoding {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return { $date: value.toISOString() };
  if (value instanceof Map) return { $map: [...value.entries()].map(([key, item]) => [encodePersistentValue(key), encodePersistentValue(item)]) };
  if (value instanceof Set) return { $set: [...value.values()].map(encodePersistentValue) };
  if (Array.isArray(value)) return value.map(encodePersistentValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encodePersistentValue(item)]));
  throw new WorkflowError("INVALID_REQUEST", "Workflow-Zustand enthaelt einen nicht persistierbaren Wert.");
}
function decodePersistentValue(value: PersistentEncoding): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decodePersistentValue);
  if ("$date" in value && typeof value.$date === "string") return new Date(value.$date);
  if ("$map" in value && Array.isArray(value.$map)) return new Map(value.$map.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) throw new WorkflowError("INVALID_REQUEST", "Persistierte Map ist ungueltig.");
    return [decodePersistentValue(entry[0]!), decodePersistentValue(entry[1]!)] as const;
  }));
  if ("$set" in value && Array.isArray(value.$set)) return new Set(value.$set.map(decodePersistentValue));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodePersistentValue(item)]));
}
function validateInitialOrStoredRecord(value: WorkflowRecord): void {
  if (!value || typeof value !== "object" || !(value.gates instanceof Map) || !(value.idempotency instanceof Map) || !(value.jobIdempotency instanceof Map) || !(value.holds instanceof Map) || !Array.isArray(value.jobs) || !Array.isArray(value.auditEvents)) throw new WorkflowError("INVALID_REQUEST", "Persistierter Workflow-Zustand ist strukturell ungueltig.");
  requireText(value.project.projectId, "projectId"); validateDigest(value.project.revisionDigest, "revisionDigest");
}

function cloneReasons(reasons: readonly BlockReason[]): BlockReason[] {
  if (!Array.isArray(reasons)) throw new WorkflowError("INVALID_REQUEST", "blockReasons muss ein Array sein.");
  return reasons.map((reason) => {
    if (!reason || typeof reason !== "object") throw new WorkflowError("INVALID_REQUEST", "Blockierungsgrund ist ungueltig.");
    return { code: strictString(reason.code, "blockReason.code"), message: strictString(reason.message, "blockReason.message"), ...(reason.evidenceRef !== undefined ? { evidenceRef: strictString(reason.evidenceRef, "blockReason.evidenceRef") } : {}), ...(reason.holdType !== undefined ? { holdType: reason.holdType } : {}), ...(reason.clearingAuthority !== undefined ? { clearingAuthority: reason.clearingAuthority } : {}) };
  });
}
function cloneLegalAssessmentInput(value: LegalAssessmentInput): LegalAssessmentInput { return { id: strictString(value.id, "assessment.id"), projectId: strictString(value.projectId, "assessment.projectId"), scopeType: strictString(value.scopeType, "assessment.scopeType"), scopeId: strictString(value.scopeId, "assessment.scopeId"), revisionDigest: strictString(value.revisionDigest, "assessment.revisionDigest"), status: value.status, factsDigest: strictString(value.factsDigest, "assessment.factsDigest"), assumptionsRef: strictString(value.assumptionsRef, "assessment.assumptionsRef"), jurisdictions: strictStringArray(value.jurisdictions, "assessment.jurisdictions"), legalDate: strictDate(value.legalDate, "assessment.legalDate"), sourceSetId: strictString(value.sourceSetId, "assessment.sourceSetId"), reviewerType: strictString(value.reviewerType, "assessment.reviewerType"), evidence: cloneEvidenceReference(value.evidence), ...(value.supersedesId !== undefined ? { supersedesId: strictString(value.supersedesId, "assessment.supersedesId") } : {}), ...(value.predecessorCounselCaseId !== undefined ? { predecessorCounselCaseId: strictString(value.predecessorCounselCaseId, "assessment.predecessorCounselCaseId") } : {}), finalizedAt: strictDate(value.finalizedAt, "assessment.finalizedAt"), ...(value.requirements !== undefined ? { requirements: value.requirements.map((item) => ({ id: strictString(item.id, "requirement.id"), requirementRef: strictString(item.requirementRef, "requirement.requirementRef") })) } : {}) }; }
function withoutRequirements(value: LegalAssessmentInput): Omit<LegalAssessment, "ingestedAt" | "verifiedLegalIdentity"> { const { requirements, ...assessment } = value; void requirements; return assessment; }
function validateLegalAssessmentInput(value: LegalAssessmentInput) {
  requireText(value.scopeType, "assessment.scopeType"); requireText(value.scopeId, "assessment.scopeId");
  if (!(LEGAL_STATUSES as readonly string[]).includes(value.status)) throw new WorkflowError("GATE_INVALID", "Legal Assessment Status ist ungueltig.");
  if (value.legalDate > value.finalizedAt) throw new WorkflowError("GATE_INVALID", "legalDate darf nicht nach finalizedAt liegen.");
  validateDigest(value.revisionDigest, "assessment.revisionDigest"); validateDigest(value.factsDigest, "assessment.factsDigest"); validateEvidenceReferenceShape(value.evidence);
  if (value.evidence.projectId !== value.projectId || !sameScope(value.evidence, value) || value.evidence.revisionDigest !== value.revisionDigest) throw new WorkflowError("GATE_INVALID", "Legal Assessment Evidence ist falsch gebunden.");
  if (value.scopeType === "PROJECT" && value.scopeId !== value.projectId) throw new WorkflowError("GATE_INVALID", "PROJECT-Legal-Scope ist falsch gebunden.");
  if (!value.jurisdictions.length || new Set(value.jurisdictions).size !== value.jurisdictions.length) throw new WorkflowError("GATE_INVALID", "Legal Assessment benoetigt eindeutige Jurisdiktionen.");
  if (new Set((value.requirements ?? []).map((item) => item.id)).size !== (value.requirements ?? []).length) throw new WorkflowError("GATE_INVALID", "Legal Requirements muessen eindeutig sein.");
}
function cloneLegalAssessment(value: LegalAssessment): LegalAssessment { return { ...withoutRequirements(cloneLegalAssessmentInput(value)), ingestedAt: strictDate(value.ingestedAt, "assessment.ingestedAt"), verifiedLegalIdentity: strictString(value.verifiedLegalIdentity, "assessment.verifiedLegalIdentity") }; }
function cloneRequirementSubmission(value: LegalRequirementSubmission): LegalRequirementSubmission { return { projectId: strictString(value.projectId, "submission.projectId"), requirementId: strictString(value.requirementId, "submission.requirementId"), assessmentId: strictString(value.assessmentId, "submission.assessmentId"), evidence: cloneEvidenceReference(value.evidence), submittedAt: strictDate(value.submittedAt, "submission.submittedAt") }; }
function cloneRequirementDecision(value: LegalRequirementDecision): LegalRequirementDecision { return { projectId: strictString(value.projectId, "decision.projectId"), requirementId: strictString(value.requirementId, "decision.requirementId"), assessmentId: strictString(value.assessmentId, "decision.assessmentId"), decision: value.decision, evidence: cloneEvidenceReference(value.evidence), decidedAt: strictDate(value.decidedAt, "decision.decidedAt") }; }
function cloneCounselDecisionInput(value: CounselDecisionInput): CounselDecisionInput { return { id: strictString(value.id, "counselDecision.id"), projectId: strictString(value.projectId, "counselDecision.projectId"), counselCaseId: strictString(value.counselCaseId, "counselDecision.counselCaseId"), predecessorAssessmentId: strictString(value.predecessorAssessmentId, "counselDecision.predecessorAssessmentId"), qualifiedCounselIdentityRef: strictString(value.qualifiedCounselIdentityRef, "counselDecision.qualifiedCounselIdentityRef"), evidence: cloneEvidenceReference(value.evidence), scopeType: strictString(value.scopeType, "counselDecision.scopeType"), scopeId: strictString(value.scopeId, "counselDecision.scopeId"), decidedAt: strictDate(value.decidedAt, "counselDecision.decidedAt") }; }
function cloneLegalRequirement(value: LegalRequirement): LegalRequirement { return { ...value, createdAt: strictDate(value.createdAt, "requirement.createdAt"), ...(value.submittedEvidence ? { submittedEvidence: cloneEvidenceReference(value.submittedEvidence) } : {}), ...(value.submittedAt ? { submittedAt: strictDate(value.submittedAt, "requirement.submittedAt") } : {}), ...(value.submissionIngestedAt ? { submissionIngestedAt: strictDate(value.submissionIngestedAt, "requirement.submissionIngestedAt") } : {}), ...(value.verificationEvidence ? { verificationEvidence: cloneEvidenceReference(value.verificationEvidence) } : {}), ...(value.verifiedAt ? { verifiedAt: strictDate(value.verifiedAt, "requirement.verifiedAt") } : {}), ...(value.decisionIngestedAt ? { decisionIngestedAt: strictDate(value.decisionIngestedAt, "requirement.decisionIngestedAt") } : {}) }; }
function cloneCounselCase(value: CounselCase): CounselCase { return { ...value, openedAt: strictDate(value.openedAt, "counselCase.openedAt"), ...(value.closedAt ? { closedAt: strictDate(value.closedAt, "counselCase.closedAt") } : {}) }; }
function cloneCounselDecision(value: CounselDecision): CounselDecision { return { ...cloneCounselDecisionInput(value), ingestedAt: strictDate(value.ingestedAt, "counselDecision.ingestedAt") }; }
function cloneProjectHold(value: ProjectHold): ProjectHold { return { ...value, sourceEvidence: cloneEvidenceReference(value.sourceEvidence), createdAt: strictDate(value.createdAt, "hold.createdAt"), ...(value.clearingEvidence ? { clearingEvidence: cloneVerifiedHoldClearance(value.clearingEvidence) } : {}), ...(value.clearedAt ? { clearedAt: strictDate(value.clearedAt, "hold.clearedAt") } : {}) }; }
const cloneProject = (project: ProjectWorkflow): ProjectWorkflow => ({ projectId: strictString(project.projectId, "projectId"), phase: project.phase, version: project.version, policyVersion: strictString(project.policyVersion, "policyVersion"), revisionDigest: strictString(project.revisionDigest, "revisionDigest"), ...(project.blockedFrom !== undefined ? { blockedFrom: project.blockedFrom } : {}), ...(project.frozenRevisionDigest !== undefined ? { frozenRevisionDigest: strictString(project.frozenRevisionDigest, "frozenRevisionDigest") } : {}), blockReasons: cloneReasons(project.blockReasons) });
const cloneGateEvidence = (gate: GateEvidence): GateEvidence => ({ id: strictString(gate.id, "gate.id"), projectId: strictString(gate.projectId, "gate.projectId"), name: gate.name, status: gate.status, policyVersion: strictString(gate.policyVersion, "gate.policyVersion"), subjectRevisionDigest: strictString(gate.subjectRevisionDigest, "gate.subjectRevisionDigest"), evidenceDigest: strictString(gate.evidenceDigest, "gate.evidenceDigest"), evaluatedAt: strictDate(gate.evaluatedAt, "gate.evaluatedAt"), validUntil: strictDate(gate.validUntil, "gate.validUntil"), ...(gate.legalStatus !== undefined ? { legalStatus: gate.legalStatus } : {}), ...(gate.legalRequirements !== undefined ? { legalRequirements: gate.legalRequirements.map((item) => ({ id: strictString(item.id, "legalRequirement.id"), status: item.status, subjectRevisionDigest: strictString(item.subjectRevisionDigest, "legalRequirement.subjectRevisionDigest"), evidenceDigest: strictString(item.evidenceDigest, "legalRequirement.evidenceDigest") })) } : {}), ...(gate.customerDataClassification !== undefined ? { customerDataClassification: gate.customerDataClassification } : {}), ...(gate.scopeType !== undefined ? { scopeType: strictString(gate.scopeType, "gate.scopeType") } : {}), ...(gate.scopeId !== undefined ? { scopeId: strictString(gate.scopeId, "gate.scopeId") } : {}) });
const cloneAttestation = (gate: GateAttestation): GateAttestation => ({ ...cloneGateEvidence(gate), attesterId: strictString(gate.attesterId, "attesterId"), proof: strictString(gate.proof, "proof") });
const cloneGate = (gate: GateResult): GateResult => ({ ...cloneGateEvidence(gate), trustedAttester: strictString(gate.trustedAttester, "trustedAttester"), attesterRole: gate.attesterRole, ingestedAt: strictDate(gate.ingestedAt, "gate.ingestedAt") });
const cloneTransitionRequest = (request: TransitionRequest): TransitionRequest => ({ projectId: strictString(request.projectId, "projectId"), targetPhase: request.targetPhase, expectedVersion: request.expectedVersion, expectedRevisionDigest: strictString(request.expectedRevisionDigest, "expectedRevisionDigest"), policyVersion: strictString(request.policyVersion, "policyVersion"), actorId: strictString(request.actorId, "actorId"), reason: strictString(request.reason, "reason"), idempotencyKey: strictString(request.idempotencyKey, "idempotencyKey"), ...(request.gateResultIds !== undefined ? { gateResultIds: strictStringArray(request.gateResultIds, "gateResultIds") } : {}), ...(request.holdClearanceIds !== undefined ? { holdClearanceIds: strictStringArray(request.holdClearanceIds, "holdClearanceIds") } : {}), ...(request.blockReasons !== undefined ? { blockReasons: cloneReasons(request.blockReasons) } : {}), ...(request.newRevisionDigest !== undefined ? { newRevisionDigest: strictString(request.newRevisionDigest, "newRevisionDigest") } : {}), ...(request.startJob !== undefined ? { startJob: cloneStartJob(request.startJob) } : {}), ...(request.operationScope !== undefined ? { operationScope: cloneScope(request.operationScope, "operationScope") } : {}) });
const cloneClaimRequest = (request: ClaimJobRequest): ClaimJobRequest => ({ jobId: strictString(request.jobId, "jobId"), projectId: strictString(request.projectId, "projectId"), expectedAggregateVersion: request.expectedAggregateVersion, expectedRevisionDigest: strictString(request.expectedRevisionDigest, "expectedRevisionDigest"), workerId: strictString(request.workerId, "workerId"), idempotencyKey: strictString(request.idempotencyKey, "idempotencyKey"), leaseDurationMs: request.leaseDurationMs });
const cloneOwnedJobRequest = (request: OwnedJobRequest): OwnedJobRequest => ({ jobId: strictString(request.jobId, "jobId"), projectId: strictString(request.projectId, "projectId"), expectedAggregateVersion: request.expectedAggregateVersion, expectedRevisionDigest: strictString(request.expectedRevisionDigest, "expectedRevisionDigest"), workerId: strictString(request.workerId, "workerId"), claimIdempotencyKey: strictString(request.claimIdempotencyKey, "claimIdempotencyKey"), idempotencyKey: strictString(request.idempotencyKey, "idempotencyKey"), ...(request.fencingToken !== undefined ? { fencingToken: request.fencingToken } : {}) });
const cloneHeartbeatRequest = (request: HeartbeatJobRequest): HeartbeatJobRequest => ({ ...cloneOwnedJobRequest(request), extendLeaseByMs: request.extendLeaseByMs });
const cloneTerminationEvidence = (value: TerminationEvidence): TerminationEvidence => ({ id: strictString(value.id, "terminationEvidence.id"), evidenceDigest: strictString(value.evidenceDigest, "terminationEvidence.evidenceDigest"), processEndedAt: strictDate(value.processEndedAt, "terminationEvidence.processEndedAt"), mountRevokedAt: strictDate(value.mountRevokedAt, "terminationEvidence.mountRevokedAt"), credentialsRevokedAt: strictDate(value.credentialsRevokedAt, "terminationEvidence.credentialsRevokedAt"), proof: strictString(value.proof, "terminationEvidence.proof") });
const cloneConfirmJobTerminationRequest = (request: ConfirmJobTerminationRequest): ConfirmJobTerminationRequest => ({ ...cloneOwnedJobRequest(request), terminationEvidence: cloneTerminationEvidence(request.terminationEvidence) });
const cloneVerifiedTerminationEvidence = (value: VerifiedTerminationEvidence): VerifiedTerminationEvidence => ({ id: strictString(value.id, "terminationEvidence.id"), evidenceDigest: strictString(value.evidenceDigest, "terminationEvidence.evidenceDigest"), processEndedAt: strictDate(value.processEndedAt, "terminationEvidence.processEndedAt"), mountRevokedAt: strictDate(value.mountRevokedAt, "terminationEvidence.mountRevokedAt"), credentialsRevokedAt: strictDate(value.credentialsRevokedAt, "terminationEvidence.credentialsRevokedAt"), workerId: strictString(value.workerId, "terminationEvidence.workerId"), jobId: strictString(value.jobId, "terminationEvidence.jobId") });
const cloneUnsignedHoldClearanceEvidence = (value: Omit<HoldClearanceEvidence, "proof">): Omit<HoldClearanceEvidence, "proof"> => ({ id: strictString(value.id, "holdClearance.id"), projectId: strictString(value.projectId, "holdClearance.projectId"), holdCode: strictString(value.holdCode, "holdClearance.holdCode"), clearingAuthority: value.clearingAuthority, authorityId: strictString(value.authorityId, "holdClearance.authorityId"), subjectRevisionDigest: strictString(value.subjectRevisionDigest, "holdClearance.subjectRevisionDigest"), evidenceDigest: strictString(value.evidenceDigest, "holdClearance.evidenceDigest"), verifiedAt: strictDate(value.verifiedAt, "holdClearance.verifiedAt"), ...(value.scopeType !== undefined ? { scopeType: strictString(value.scopeType, "holdClearance.scopeType") } : {}), ...(value.scopeId !== undefined ? { scopeId: strictString(value.scopeId, "holdClearance.scopeId") } : {}), ...(value.sourceRecordType !== undefined ? { sourceRecordType: value.sourceRecordType } : {}), ...(value.sourceRecordId !== undefined ? { sourceRecordId: strictString(value.sourceRecordId, "holdClearance.sourceRecordId") } : {}), ...(value.evidenceRef !== undefined ? { evidenceRef: cloneEvidenceReference(value.evidenceRef) } : {}) });
const cloneHoldClearanceEvidence = (value: HoldClearanceEvidence): HoldClearanceEvidence => ({ ...cloneUnsignedHoldClearanceEvidence(value), proof: strictString(value.proof, "holdClearance.proof") });
const cloneVerifiedHoldClearance = (value: VerifiedHoldClearance): VerifiedHoldClearance => ({ ...cloneUnsignedHoldClearanceEvidence(value), ingestedAt: strictDate(value.ingestedAt, "holdClearance.ingestedAt") });
const cloneJob = (job: WorkflowJob): WorkflowJob => ({ ...job, operationScope: cloneScope(job.operationScope, "job.operationScope"), createdAt: strictDate(job.createdAt, "createdAt"), ...(job.claimedAt ? { claimedAt: strictDate(job.claimedAt, "claimedAt") } : {}), ...(job.leaseExpiresAt ? { leaseExpiresAt: strictDate(job.leaseExpiresAt, "leaseExpiresAt") } : {}), ...(job.completedAt ? { completedAt: strictDate(job.completedAt, "completedAt") } : {}), ...(job.cancelledAt ? { cancelledAt: strictDate(job.cancelledAt, "cancelledAt") } : {}) });
const cloneAudit = (event: AuditEvent): AuditEvent => ({ ...event, operationScope: cloneScope(event.operationScope, "audit.operationScope"), occurredAt: strictDate(event.occurredAt, "occurredAt"), gateBindings: event.gateBindings.map((gate) => ({ ...gate })), blockReasons: cloneReasons(event.blockReasons), ...(event.holdClearanceBindings ? { holdClearanceBindings: event.holdClearanceBindings.map(cloneVerifiedHoldClearance) } : {}), ...(event.jobBinding ? { jobBinding: { ...event.jobBinding, operationScope: cloneScope(event.jobBinding.operationScope, "audit.jobBinding.operationScope") } } : {}) });
const cloneJobEvent = (event: JobAuditEvent): JobAuditEvent => ({
  ...event,
  occurredAt: strictDate(event.occurredAt, "occurredAt"),
  ...(event.complianceFailureBindings ? { complianceFailureBindings: event.complianceFailureBindings.map((binding) => ({ ...binding, evidence: cloneEvidenceReference(binding.evidence) })) } : {}),
});
function cloneResult(result: Omit<TransitionResult, "duplicate">, duplicate: boolean): TransitionResult { return { project: cloneProject(result.project), auditEvent: cloneAudit(result.auditEvent), ...(result.job ? { job: cloneJob(result.job) } : {}), duplicate }; }
function strictString(value: unknown, field: string): string { if (typeof value !== "string") throw new WorkflowError("INVALID_REQUEST", `${field} muss ein String sein.`); return value; }
function strictDate(value: unknown, field: string): Date { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new WorkflowError("INVALID_REQUEST", `${field} muss ein gueltiges Date sein.`); return new Date(value.getTime()); }
function strictStringArray(value: unknown, field: string): string[] { if (!Array.isArray(value)) throw new WorkflowError("INVALID_REQUEST", `${field} muss ein Array sein.`); return value.map((item) => strictString(item, field)); }
function cloneStartJob(value: unknown): { type: JobType } { if (!value || typeof value !== "object" || !("type" in value)) throw new WorkflowError("INVALID_REQUEST", "startJob ist ungueltig."); return { type: (value as { type: JobType }).type }; }
function isAuthorizedActor(value: AuthorizedActor | null, expectedId: string): value is AuthorizedActor {
  return Boolean(value && typeof value.id === "string" && value.id === expectedId && Array.isArray(value.roles) && value.roles.every((role) => ["OWNER", "PLANNER", "ARCHITECT", "EXECUTOR", "QA", "REVIEWER", "SECURITY", "LEGAL", "RELEASE_MANAGER", "SYSTEM"].includes(role)));
}
