import { createHash, randomUUID } from "node:crypto";

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
export type LegalStatus = "PASS" | "PASS_WITH_REQUIREMENTS" | "BLOCK" | "COUNSEL_REQUIRED" | "LEGAL_UNRESOLVED";
export type LegalRequirementStatus = "VERIFIED" | "UNVERIFIED";
export type CustomerDataClassification = "SYNTHETIC_ONLY" | "SUSPECTED_REAL" | "CONFIRMED_REAL" | "UNKNOWN";
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
export type HoldClearingAuthority = "SECURITY" | "LEGAL";
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
  readonly clearingAuthority: HoldClearingAuthority;
  readonly authorityId: string;
  readonly subjectRevisionDigest: string;
  readonly evidenceDigest: string;
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
  readonly gateBindings: readonly {
    readonly gateResultId: string;
    readonly evidenceDigest: string;
    readonly subjectRevisionDigest: string;
    readonly trustedAttester: string;
    readonly attesterRole: AttesterRole;
  }[];
  readonly holdClearanceBindings?: readonly string[];
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
  readonly createdAt: Date;
  readonly claimedAt?: Date;
  readonly leaseOwner?: string;
  readonly claimIdempotencyKey?: string;
  readonly leaseExpiresAt?: Date;
  readonly completedAt?: Date;
  readonly cancelledAt?: Date;
}
export type JobEventType = "CLAIMED" | "HEARTBEAT" | "COMPLETED" | "CANCELLING" | "CANCELLED";
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
}
export interface HeartbeatJobRequest extends OwnedJobRequest { readonly extendLeaseByMs: number; }
export interface ConfirmJobTerminationRequest extends OwnedJobRequest { readonly terminationEvidence: TerminationEvidence; }

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
}
export interface InMemoryWorkflowRepositoryOptions {
  readonly now?: () => Date;
  readonly evidenceVerifier: EvidenceVerifier;
  readonly actorAuthorizationVerifier: ActorAuthorizationVerifier;
  readonly workerIdentityVerifier: WorkerIdentityVerifier;
  readonly terminationProofVerifier: TerminationProofVerifier;
  readonly holdClearanceVerifier: HoldClearanceVerifier;
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

  constructor(options: InMemoryWorkflowRepositoryOptions) {
    this.now = options.now ?? (() => new Date());
    this.evidenceVerifier = options.evidenceVerifier;
    this.actorAuthorizationVerifier = options.actorAuthorizationVerifier;
    this.workerIdentityVerifier = options.workerIdentityVerifier;
    this.terminationProofVerifier = options.terminationProofVerifier;
    this.holdClearanceVerifier = options.holdClearanceVerifier;
  }

  create(project: ProjectWorkflow): Promise<void> {
    const input = cloneProject(project);
    validateInitialProject(input);
    return this.withLock(input.projectId, () => {
      if (this.records.has(input.projectId)) throw new WorkflowError("PROJECT_ALREADY_EXISTS", `Projekt ${input.projectId} existiert bereits.`);
      this.records.set(input.projectId, { project: input, gates: new Map(), auditEvents: [], jobs: [], jobEvents: [], idempotency: new Map(), jobIdempotency: new Map(), holdClearances: new Map(), terminationEvidence: new Map() });
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
      record.gates.set(gate.id, cloneGate(gate));
    });
  }

  transition(request: TransitionRequest): Promise<TransitionResult> {
    const input = cloneTransitionRequest(request);
    validateTransitionRequest(input);
    const requestHash = hashCanonical(canonicalRequest(input));
    const scopeKey = canonical([input.actorId, input.idempotencyKey]);
    return this.withRecord(input.projectId, async (record) => {
      const verifiedActor = await this.actorAuthorizationVerifier.verify(input.actorId, input.projectId);
      if (!isAuthorizedActor(verifiedActor, input.actorId)) throw new WorkflowError("UNAUTHORIZED", `${input.actorId} ist nicht als autorisierter Actor verifiziert.`);
      const prior = record.idempotency.get(scopeKey);
      if (prior) {
        if (prior.requestHash !== requestHash) throw new WorkflowError("IDEMPOTENCY_CONFLICT", "Actor-scoped Idempotenzschluessel wurde fuer einen anderen Befehl verwendet.");
        if (!verifiedActor.roles.some((role) => TRANSITION_ACTOR_ROLE_RULES[input.targetPhase].includes(role))) throw new WorkflowError("UNAUTHORIZED", `${input.actorId} ist fuer den Uebergang nach ${input.targetPhase} nicht autorisiert.`);
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
      if (!["BLOCKED", "FAILED", "CANCELLED"].includes(input.targetPhase)) assertNoAdverseSecurityOrLegal(record, nextRevision, occurredAt);
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
        id: `${current.projectId}:job:${record.jobs.length + 1}`, projectId: current.projectId, type: input.startJob.type,
        phase: input.targetPhase, aggregateVersion: version, revisionDigest: nextRevision, status: "PENDING",
        idempotencyKey: input.idempotencyKey, createdAt: occurredAt,
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
        idempotencyKey: input.idempotencyKey, gateBindings, blockReasons: reasons,
        ...(holdClearances.length ? { holdClearanceBindings: holdClearances.map((item) => item.id).sort() } : {}),
        occurredAt: occurredAt.toISOString(), previousHash,
        ...(job ? { jobBinding: jobBinding(job) } : {}),
      };
      const auditEvent: AuditEvent = { ...auditPayload, occurredAt, eventHash: hashCanonical(auditPayload) };
      record.project = project;
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
      if (replay) return currentReplayState(record, replay);
      if (record.jobs.some((candidate) => candidate.status === "CANCELLING")) throw new WorkflowError("JOB_NOT_ALLOWED", "Claims sind bis zur bestaetigten Job-Beendigung gesperrt.");
      const { index, job } = findJob(record, input.jobId);
      assertRunnableSnapshot(record, job, input);
      assertOperationalEvidence(record, job.revisionDigest, this.currentTime());
      if (job.status !== "PENDING") throw new WorkflowError("JOB_NOT_ALLOWED", "Job ist bereits vergeben oder nicht mehr autorisiert.");
      const claimedAt = this.currentTime();
      const claimed: WorkflowJob = {
        ...job, status: "CLAIMED", claimedAt, leaseOwner: input.workerId, claimIdempotencyKey: input.idempotencyKey,
        leaseExpiresAt: new Date(claimedAt.getTime() + input.leaseDurationMs),
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
      const { job } = findJob(record, input.jobId);
      const now = this.currentTime();
      assertActiveOwnedJob(record, job, input, now);
      assertOperationalEvidence(record, job.revisionDigest, now);
      return cloneJob(job);
    });
  }

  heartbeatJob(request: HeartbeatJobRequest): Promise<WorkflowJob> {
    const input = cloneHeartbeatRequest(request);
    validateOwnedJobRequest(input);
    validateDuration(input.extendLeaseByMs, "extendLeaseByMs");
    return this.withRecord(input.projectId, async (record) => {
      await this.assertTrustedWorker(input.workerId, input.projectId, "HEARTBEAT");
      const replay = beginJobCommand(record, "heartbeat", input.workerId, input.idempotencyKey, input);
      if (replay) return currentReplayState(record, replay);
      const { index, job } = findJob(record, input.jobId);
      const now = this.currentTime();
      assertActiveOwnedJob(record, job, input, now);
      assertOperationalEvidence(record, job.revisionDigest, now);
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
      if (replay) return currentReplayState(record, replay);
      const { index, job } = findJob(record, input.jobId);
      const now = this.currentTime();
      assertActiveOwnedJob(record, job, input, now);
      assertOperationalEvidence(record, job.revisionDigest, now);
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
      if (replay) return currentReplayState(record, replay);
      const { index, job } = findJob(record, input.jobId);
      if (job.status !== "CANCELLING" || job.leaseOwner !== input.workerId || job.claimIdempotencyKey !== input.claimIdempotencyKey) {
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

  read(projectId: string): Promise<ProjectWorkflow | null> { return Promise.resolve(this.records.get(strictString(projectId, "projectId"))).then((record) => record ? cloneProject(record.project) : null); }
  readGateResult(projectId: string, id: string): Promise<GateResult | null> { const gate = this.records.get(strictString(projectId, "projectId"))?.gates.get(strictString(id, "gateResultId")); return Promise.resolve(gate ? cloneGate(gate) : null); }
  readAuditEvents(projectId: string): Promise<readonly AuditEvent[]> { return Promise.resolve((this.records.get(strictString(projectId, "projectId"))?.auditEvents ?? []).map(cloneAudit)); }
  readJobs(projectId: string): Promise<readonly WorkflowJob[]> { return Promise.resolve((this.records.get(strictString(projectId, "projectId"))?.jobs ?? []).map(cloneJob)); }
  readJobEvents(projectId: string): Promise<readonly JobAuditEvent[]> { return Promise.resolve((this.records.get(strictString(projectId, "projectId"))?.jobEvents ?? []).map(cloneJobEvent)); }

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
export interface TrustedTerminationProofIssuer {
  issue(input: Omit<VerifiedTerminationEvidence, "evidenceDigest"> & { readonly projectId: string }): TerminationEvidence;
}
export interface InMemoryWorkflowFixture {
  readonly repository: InMemoryWorkflowRepository;
  readonly trustedGateIngestor: TrustedGateIngestor;
  readonly trustedHoldClearanceIngestor: TrustedHoldClearanceIngestor;
  readonly trustedTerminationProofIssuer: TrustedTerminationProofIssuer;
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
}): InMemoryWorkflowFixture {
  const proof = randomUUID();
  const terminationSecret = randomUUID();
  const clearanceSecret = randomUUID();
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
  if (gate.name === "LEGAL_REVIEW_PASSED") validateLegalSemantics(gate);
  else if (gate.legalStatus !== undefined || gate.legalRequirements !== undefined) throw new WorkflowError("GATE_INVALID", "Legal-Semantik ist nur am Legal-Gate zulaessig.");
  if (gate.name === "CUSTOMER_DATA_CLASSIFIED") {
    if (!gate.customerDataClassification || (gate.customerDataClassification === "SYNTHETIC_ONLY") !== (gate.status === "PASS")) throw new WorkflowError("GATE_INVALID", "Kundendatenklassifikation und Gate-Status widersprechen sich.");
  } else if (gate.customerDataClassification !== undefined) throw new WorkflowError("GATE_INVALID", "Kundendatenklassifikation ist nur am Kundendaten-Gate zulaessig.");
}
function validateClaimRequest(request: ClaimJobRequest) { validateOwnedJobRequest({ ...request, claimIdempotencyKey: request.idempotencyKey }); requireText(request.idempotencyKey, "idempotencyKey"); validateDuration(request.leaseDurationMs, "leaseDurationMs"); }
function validateOwnedJobRequest(request: OwnedJobRequest) {
  requireText(request.jobId, "jobId"); requireText(request.projectId, "projectId"); requireText(request.workerId, "workerId"); requireText(request.claimIdempotencyKey, "claimIdempotencyKey"); requireText(request.idempotencyKey, "idempotencyKey");
  validateDigest(request.expectedRevisionDigest, "expectedRevisionDigest");
  if (!Number.isSafeInteger(request.expectedAggregateVersion) || request.expectedAggregateVersion < 1) throw new WorkflowError("INVALID_REQUEST", "expectedAggregateVersion ist ungueltig.");
}
function validateDuration(value: number, field: string) { if (!Number.isSafeInteger(value) || value < 1 || value > 86_400_000) throw new WorkflowError("INVALID_REQUEST", `${field} ist ungueltig.`); }
function resolveAndValidateGates(record: WorkflowRecord, current: ProjectWorkflow, request: TransitionRequest, targetRevision: string, now: Date): GateResult[] {
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
    const latest = [...record.gates.values()]
      .filter((candidate) => candidate.projectId === request.projectId && candidate.name === gate.name && candidate.policyVersion === request.policyVersion && candidate.subjectRevisionDigest === targetRevision)
      .sort(compareGateAuthority).at(-1);
    if (!latest || latest.id !== gate.id || gate.projectId !== request.projectId || gate.policyVersion !== request.policyVersion || gate.subjectRevisionDigest !== targetRevision || !isGateEffective(gate) || gate.evaluatedAt > now || gate.ingestedAt > now || gate.validUntil <= now || (holdAt && (gate.evaluatedAt <= holdAt || gate.ingestedAt <= holdAt))) {
      throw new WorkflowError("GATE_INVALID", `Gate ${gate.name} ist ungueltig, veraltet oder falsch gebunden.`);
    }
  }
  return typed;
}
function compareGateAuthority(left: GateResult, right: GateResult): number {
  return left.evaluatedAt.getTime() - right.evaluatedAt.getTime()
    || left.ingestedAt.getTime() - right.ingestedAt.getTime();
}
function latestGate(record: WorkflowRecord, name: GateName, revisionDigest: string): GateResult | undefined {
  return [...record.gates.values()].filter((gate) => gate.name === name && gate.subjectRevisionDigest === revisionDigest && gate.policyVersion === record.project.policyVersion).sort(compareGateAuthority).at(-1);
}
function validateLegalSemantics(gate: GateEvidence) {
  const status = gate.legalStatus;
  if (!status || !["PASS", "PASS_WITH_REQUIREMENTS", "BLOCK", "COUNSEL_REQUIRED", "LEGAL_UNRESOLVED"].includes(status)) throw new WorkflowError("GATE_INVALID", "Legal-Status fehlt oder ist ungueltig.");
  const requirements = gate.legalRequirements ?? [];
  if (new Set(requirements.map((item) => item.id)).size !== requirements.length) throw new WorkflowError("GATE_INVALID", "Legal Requirements muessen eindeutig sein.");
  for (const item of requirements) {
    requireText(item.id, "legalRequirement.id"); validateDigest(item.subjectRevisionDigest, "legalRequirement.subjectRevisionDigest"); validateDigest(item.evidenceDigest, "legalRequirement.evidenceDigest");
    if (item.subjectRevisionDigest !== gate.subjectRevisionDigest || !["VERIFIED", "UNVERIFIED"].includes(item.status)) throw new WorkflowError("GATE_INVALID", "Legal Requirement ist nicht revisionsgebunden oder ungueltig.");
  }
  const effective = status === "PASS" && requirements.length === 0 || status === "PASS_WITH_REQUIREMENTS" && requirements.length > 0 && requirements.every((item) => item.status === "VERIFIED");
  if (effective !== (gate.status === "PASS")) throw new WorkflowError("GATE_INVALID", "Legal-Status, Requirements und Gate-Status widersprechen sich.");
}
function isGateEffective(gate: GateResult): boolean {
  if (gate.status !== "PASS") return false;
  if (gate.name === "CUSTOMER_DATA_CLASSIFIED") return gate.customerDataClassification === "SYNTHETIC_ONLY";
  if (gate.name === "LEGAL_REVIEW_PASSED") {
    return gate.legalStatus === "PASS" || gate.legalStatus === "PASS_WITH_REQUIREMENTS" && Boolean(gate.legalRequirements?.length) && gate.legalRequirements!.every((item) => item.status === "VERIFIED" && item.subjectRevisionDigest === gate.subjectRevisionDigest);
  }
  return true;
}
function assertNoAdverseSecurityOrLegal(record: WorkflowRecord, revisionDigest: string, now: Date) {
  for (const name of ["SECURITY_REVIEW_PASSED", "LEGAL_REVIEW_PASSED"] as const) {
    const gate = latestGate(record, name, revisionDigest);
    if (gate && (!isGateEffective(gate) || gate.evaluatedAt > now || gate.ingestedAt > now || gate.validUntil <= now)) throw new WorkflowError("GATE_INVALID", `Neueste autoritative ${name}-Evidence blockiert den Vorgang.`);
  }
}
function assertOperationalEvidence(record: WorkflowRecord, revisionDigest: string, now: Date) {
  const customerData = latestGate(record, "CUSTOMER_DATA_CLASSIFIED", revisionDigest);
  if (!customerData || !isGateEffective(customerData) || customerData.evaluatedAt > now || customerData.ingestedAt > now || customerData.validUntil <= now) {
    throw new WorkflowError("JOB_NOT_ALLOWED", "Jobs sind ohne aktuelle autoritative SYNTHETIC_ONLY-Klassifikation verboten.");
  }
  try { assertNoAdverseSecurityOrLegal(record, revisionDigest, now); } catch { throw new WorkflowError("JOB_NOT_ALLOWED", "Negative oder ungeklaerte Security-/Legal-Evidence blockiert Jobs."); }
}
function resolveHoldClearances(record: WorkflowRecord, current: ProjectWorkflow, request: TransitionRequest, targetRevision: string, now: Date): VerifiedHoldClearance[] {
  if (request.targetPhase === "FAILED" || request.targetPhase === "CANCELLED") {
    if (request.holdClearanceIds?.length) throw new WorkflowError("GATE_INVALID", "FAILED/CANCELLED bindet keine Hold-Clearings.");
    return [];
  }
  const protectedHolds = current.phase === "BLOCKED" ? current.blockReasons.filter((reason) => reason.holdType === "SECURITY" || reason.holdType === "LEGAL") : [];
  const ids = request.holdClearanceIds ?? [];
  if (ids.length !== protectedHolds.length) {
    if (ids.length || protectedHolds.length) throw new WorkflowError("GATE_REQUIRED", "Jeder Security-/Legal-Hold benoetigt genau eine verifizierte Clearing-Evidence.");
    return [];
  }
  const blockAt = record.auditEvents.at(-1)?.occurredAt;
  const results = ids.map((id) => record.holdClearances.get(id));
  if (results.some((item) => !item)) throw new WorkflowError("GATE_INVALID", "Hold-Clearing-Evidence ist nicht persistent registriert.");
  const typed = results as VerifiedHoldClearance[];
  for (const hold of protectedHolds) {
    const expectedAuthority: HoldClearingAuthority = hold.holdType === "SECURITY" ? "SECURITY" : "LEGAL";
    const matches = typed.filter((item) => item.holdCode === hold.code && item.clearingAuthority === expectedAuthority && item.projectId === current.projectId && item.subjectRevisionDigest === targetRevision && item.verifiedAt <= now && item.ingestedAt <= now && (!blockAt || item.verifiedAt > blockAt && item.ingestedAt > blockAt));
    if (matches.length !== 1) throw new WorkflowError("GATE_INVALID", `Hold ${hold.code} ist nicht durch ${expectedAuthority} revisionsgebunden freigegeben.`);
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
  if (job.status !== "CLAIMED" || job.leaseOwner !== request.workerId || job.claimIdempotencyKey !== request.claimIdempotencyKey || !job.leaseExpiresAt || job.leaseExpiresAt <= now) throw new WorkflowError("JOB_NOT_ALLOWED", "Job-Lease ist ungueltig, abgelaufen oder widerrufen.");
}
function cancelActiveJobs(record: WorkflowRecord, now: Date) {
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
      appendJobEvent(record, cancelling, "CANCELLING", now, job.leaseOwner);
    }
  }
}
function jobBinding(job: WorkflowJob) {
  return { id: job.id, type: job.type, status: job.status, revisionDigest: job.revisionDigest, aggregateVersion: job.aggregateVersion };
}
function appendJobEvent(record: WorkflowRecord, job: WorkflowJob, type: JobEventType, occurredAt: Date, workerId?: string, idempotencyKey?: string, termination?: VerifiedTerminationEvidence) {
  const previousHash = record.jobEvents.at(-1)?.eventHash ?? null;
  const payload = {
    id: `${job.id}:event:${record.jobEvents.length + 1}`, projectId: job.projectId, jobId: job.id, type,
    ...(workerId ? { workerId } : {}), occurredAt: occurredAt.toISOString(), jobStatus: job.status,
    jobType: job.type, revisionDigest: job.revisionDigest, aggregateVersion: job.aggregateVersion,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(termination ? { terminationEvidenceId: termination.id, terminationEvidenceDigest: termination.evidenceDigest } : {}), previousHash,
  };
  record.jobEvents.push({ ...payload, occurredAt, eventHash: hashCanonical(payload) });
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
function currentReplayState(record: WorkflowRecord, cached: WorkflowJob): WorkflowJob {
  const current = record.jobs.find((job) => job.id === cached.id);
  if (!current) throw new WorkflowError("JOB_NOT_ALLOWED", "Idempotenter Replay kann den aktuellen Jobzustand nicht verifizieren.");
  return cloneJob(current);
}
function replayResult(result: Omit<TransitionResult, "duplicate">, jobs: readonly WorkflowJob[]): TransitionResult { if (!result.job) return cloneResult(result, true); const current = jobs.find((job) => job.id === result.job?.id); return cloneResult({ ...result, ...(current ? { job: current } : {}) }, true); }
function canonicalRequest(request: TransitionRequest) { return { projectId: request.projectId, targetPhase: request.targetPhase, expectedVersion: request.expectedVersion, expectedRevisionDigest: request.expectedRevisionDigest, policyVersion: request.policyVersion, actorId: request.actorId, reason: request.reason, idempotencyKey: request.idempotencyKey, gateResultIds: [...(request.gateResultIds ?? [])].sort(), holdClearanceIds: [...(request.holdClearanceIds ?? [])].sort(), blockReasons: [...(request.blockReasons ?? [])].map((reason) => ({ code: reason.code, message: reason.message, evidenceRef: reason.evidenceRef ?? null, holdType: reason.holdType ?? "GENERAL", clearingAuthority: reason.clearingAuthority ?? null })).sort((a, b) => canonical(a).localeCompare(canonical(b))), newRevisionDigest: request.newRevisionDigest ?? null, startJobType: request.startJob?.type ?? null }; }
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
  return { id: evidence.id, projectId: evidence.projectId, holdCode: evidence.holdCode, clearingAuthority: evidence.clearingAuthority, authorityId: evidence.authorityId, subjectRevisionDigest: evidence.subjectRevisionDigest, evidenceDigest: evidence.evidenceDigest, verifiedAt: evidence.verifiedAt.toISOString() };
}

function cloneReasons(reasons: readonly BlockReason[]): BlockReason[] {
  if (!Array.isArray(reasons)) throw new WorkflowError("INVALID_REQUEST", "blockReasons muss ein Array sein.");
  return reasons.map((reason) => {
    if (!reason || typeof reason !== "object") throw new WorkflowError("INVALID_REQUEST", "Blockierungsgrund ist ungueltig.");
    return { code: strictString(reason.code, "blockReason.code"), message: strictString(reason.message, "blockReason.message"), ...(reason.evidenceRef !== undefined ? { evidenceRef: strictString(reason.evidenceRef, "blockReason.evidenceRef") } : {}), ...(reason.holdType !== undefined ? { holdType: reason.holdType } : {}), ...(reason.clearingAuthority !== undefined ? { clearingAuthority: reason.clearingAuthority } : {}) };
  });
}
const cloneProject = (project: ProjectWorkflow): ProjectWorkflow => ({ projectId: strictString(project.projectId, "projectId"), phase: project.phase, version: project.version, policyVersion: strictString(project.policyVersion, "policyVersion"), revisionDigest: strictString(project.revisionDigest, "revisionDigest"), ...(project.blockedFrom !== undefined ? { blockedFrom: project.blockedFrom } : {}), ...(project.frozenRevisionDigest !== undefined ? { frozenRevisionDigest: strictString(project.frozenRevisionDigest, "frozenRevisionDigest") } : {}), blockReasons: cloneReasons(project.blockReasons) });
const cloneGateEvidence = (gate: GateEvidence): GateEvidence => ({ id: strictString(gate.id, "gate.id"), projectId: strictString(gate.projectId, "gate.projectId"), name: gate.name, status: gate.status, policyVersion: strictString(gate.policyVersion, "gate.policyVersion"), subjectRevisionDigest: strictString(gate.subjectRevisionDigest, "gate.subjectRevisionDigest"), evidenceDigest: strictString(gate.evidenceDigest, "gate.evidenceDigest"), evaluatedAt: strictDate(gate.evaluatedAt, "gate.evaluatedAt"), validUntil: strictDate(gate.validUntil, "gate.validUntil"), ...(gate.legalStatus !== undefined ? { legalStatus: gate.legalStatus } : {}), ...(gate.legalRequirements !== undefined ? { legalRequirements: gate.legalRequirements.map((item) => ({ id: strictString(item.id, "legalRequirement.id"), status: item.status, subjectRevisionDigest: strictString(item.subjectRevisionDigest, "legalRequirement.subjectRevisionDigest"), evidenceDigest: strictString(item.evidenceDigest, "legalRequirement.evidenceDigest") })) } : {}), ...(gate.customerDataClassification !== undefined ? { customerDataClassification: gate.customerDataClassification } : {}) });
const cloneAttestation = (gate: GateAttestation): GateAttestation => ({ ...cloneGateEvidence(gate), attesterId: strictString(gate.attesterId, "attesterId"), proof: strictString(gate.proof, "proof") });
const cloneGate = (gate: GateResult): GateResult => ({ ...cloneGateEvidence(gate), trustedAttester: strictString(gate.trustedAttester, "trustedAttester"), attesterRole: gate.attesterRole, ingestedAt: strictDate(gate.ingestedAt, "gate.ingestedAt") });
const cloneTransitionRequest = (request: TransitionRequest): TransitionRequest => ({ projectId: strictString(request.projectId, "projectId"), targetPhase: request.targetPhase, expectedVersion: request.expectedVersion, expectedRevisionDigest: strictString(request.expectedRevisionDigest, "expectedRevisionDigest"), policyVersion: strictString(request.policyVersion, "policyVersion"), actorId: strictString(request.actorId, "actorId"), reason: strictString(request.reason, "reason"), idempotencyKey: strictString(request.idempotencyKey, "idempotencyKey"), ...(request.gateResultIds !== undefined ? { gateResultIds: strictStringArray(request.gateResultIds, "gateResultIds") } : {}), ...(request.holdClearanceIds !== undefined ? { holdClearanceIds: strictStringArray(request.holdClearanceIds, "holdClearanceIds") } : {}), ...(request.blockReasons !== undefined ? { blockReasons: cloneReasons(request.blockReasons) } : {}), ...(request.newRevisionDigest !== undefined ? { newRevisionDigest: strictString(request.newRevisionDigest, "newRevisionDigest") } : {}), ...(request.startJob !== undefined ? { startJob: cloneStartJob(request.startJob) } : {}) });
const cloneClaimRequest = (request: ClaimJobRequest): ClaimJobRequest => ({ jobId: strictString(request.jobId, "jobId"), projectId: strictString(request.projectId, "projectId"), expectedAggregateVersion: request.expectedAggregateVersion, expectedRevisionDigest: strictString(request.expectedRevisionDigest, "expectedRevisionDigest"), workerId: strictString(request.workerId, "workerId"), idempotencyKey: strictString(request.idempotencyKey, "idempotencyKey"), leaseDurationMs: request.leaseDurationMs });
const cloneOwnedJobRequest = (request: OwnedJobRequest): OwnedJobRequest => ({ jobId: strictString(request.jobId, "jobId"), projectId: strictString(request.projectId, "projectId"), expectedAggregateVersion: request.expectedAggregateVersion, expectedRevisionDigest: strictString(request.expectedRevisionDigest, "expectedRevisionDigest"), workerId: strictString(request.workerId, "workerId"), claimIdempotencyKey: strictString(request.claimIdempotencyKey, "claimIdempotencyKey"), idempotencyKey: strictString(request.idempotencyKey, "idempotencyKey") });
const cloneHeartbeatRequest = (request: HeartbeatJobRequest): HeartbeatJobRequest => ({ ...cloneOwnedJobRequest(request), extendLeaseByMs: request.extendLeaseByMs });
const cloneTerminationEvidence = (value: TerminationEvidence): TerminationEvidence => ({ id: strictString(value.id, "terminationEvidence.id"), evidenceDigest: strictString(value.evidenceDigest, "terminationEvidence.evidenceDigest"), processEndedAt: strictDate(value.processEndedAt, "terminationEvidence.processEndedAt"), mountRevokedAt: strictDate(value.mountRevokedAt, "terminationEvidence.mountRevokedAt"), credentialsRevokedAt: strictDate(value.credentialsRevokedAt, "terminationEvidence.credentialsRevokedAt"), proof: strictString(value.proof, "terminationEvidence.proof") });
const cloneConfirmJobTerminationRequest = (request: ConfirmJobTerminationRequest): ConfirmJobTerminationRequest => ({ ...cloneOwnedJobRequest(request), terminationEvidence: cloneTerminationEvidence(request.terminationEvidence) });
const cloneVerifiedTerminationEvidence = (value: VerifiedTerminationEvidence): VerifiedTerminationEvidence => ({ id: strictString(value.id, "terminationEvidence.id"), evidenceDigest: strictString(value.evidenceDigest, "terminationEvidence.evidenceDigest"), processEndedAt: strictDate(value.processEndedAt, "terminationEvidence.processEndedAt"), mountRevokedAt: strictDate(value.mountRevokedAt, "terminationEvidence.mountRevokedAt"), credentialsRevokedAt: strictDate(value.credentialsRevokedAt, "terminationEvidence.credentialsRevokedAt"), workerId: strictString(value.workerId, "terminationEvidence.workerId"), jobId: strictString(value.jobId, "terminationEvidence.jobId") });
const cloneUnsignedHoldClearanceEvidence = (value: Omit<HoldClearanceEvidence, "proof">): Omit<HoldClearanceEvidence, "proof"> => ({ id: strictString(value.id, "holdClearance.id"), projectId: strictString(value.projectId, "holdClearance.projectId"), holdCode: strictString(value.holdCode, "holdClearance.holdCode"), clearingAuthority: value.clearingAuthority, authorityId: strictString(value.authorityId, "holdClearance.authorityId"), subjectRevisionDigest: strictString(value.subjectRevisionDigest, "holdClearance.subjectRevisionDigest"), evidenceDigest: strictString(value.evidenceDigest, "holdClearance.evidenceDigest"), verifiedAt: strictDate(value.verifiedAt, "holdClearance.verifiedAt") });
const cloneHoldClearanceEvidence = (value: HoldClearanceEvidence): HoldClearanceEvidence => ({ ...cloneUnsignedHoldClearanceEvidence(value), proof: strictString(value.proof, "holdClearance.proof") });
const cloneVerifiedHoldClearance = (value: VerifiedHoldClearance): VerifiedHoldClearance => ({ ...cloneUnsignedHoldClearanceEvidence(value), ingestedAt: strictDate(value.ingestedAt, "holdClearance.ingestedAt") });
const cloneJob = (job: WorkflowJob): WorkflowJob => ({ ...job, createdAt: strictDate(job.createdAt, "createdAt"), ...(job.claimedAt ? { claimedAt: strictDate(job.claimedAt, "claimedAt") } : {}), ...(job.leaseExpiresAt ? { leaseExpiresAt: strictDate(job.leaseExpiresAt, "leaseExpiresAt") } : {}), ...(job.completedAt ? { completedAt: strictDate(job.completedAt, "completedAt") } : {}), ...(job.cancelledAt ? { cancelledAt: strictDate(job.cancelledAt, "cancelledAt") } : {}) });
const cloneAudit = (event: AuditEvent): AuditEvent => ({ ...event, occurredAt: strictDate(event.occurredAt, "occurredAt"), gateBindings: event.gateBindings.map((gate) => ({ ...gate })), blockReasons: cloneReasons(event.blockReasons), ...(event.holdClearanceBindings ? { holdClearanceBindings: [...event.holdClearanceBindings] } : {}), ...(event.jobBinding ? { jobBinding: { ...event.jobBinding } } : {}) });
const cloneJobEvent = (event: JobAuditEvent): JobAuditEvent => ({ ...event, occurredAt: strictDate(event.occurredAt, "occurredAt") });
function cloneResult(result: Omit<TransitionResult, "duplicate">, duplicate: boolean): TransitionResult { return { project: cloneProject(result.project), auditEvent: cloneAudit(result.auditEvent), ...(result.job ? { job: cloneJob(result.job) } : {}), duplicate }; }
function strictString(value: unknown, field: string): string { if (typeof value !== "string") throw new WorkflowError("INVALID_REQUEST", `${field} muss ein String sein.`); return value; }
function strictDate(value: unknown, field: string): Date { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new WorkflowError("INVALID_REQUEST", `${field} muss ein gueltiges Date sein.`); return new Date(value.getTime()); }
function strictStringArray(value: unknown, field: string): string[] { if (!Array.isArray(value)) throw new WorkflowError("INVALID_REQUEST", `${field} muss ein Array sein.`); return value.map((item) => strictString(item, field)); }
function cloneStartJob(value: unknown): { type: JobType } { if (!value || typeof value !== "object" || !("type" in value)) throw new WorkflowError("INVALID_REQUEST", "startJob ist ungueltig."); return { type: (value as { type: JobType }).type }; }
function isAuthorizedActor(value: AuthorizedActor | null, expectedId: string): value is AuthorizedActor {
  return Boolean(value && typeof value.id === "string" && value.id === expectedId && Array.isArray(value.roles) && value.roles.every((role) => ["OWNER", "PLANNER", "ARCHITECT", "EXECUTOR", "QA", "REVIEWER", "SECURITY", "LEGAL", "RELEASE_MANAGER", "SYSTEM"].includes(role)));
}
