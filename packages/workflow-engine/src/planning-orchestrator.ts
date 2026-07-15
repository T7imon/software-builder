export const PLANNING_STATES = [
  "PLANNING",
  "ARCHITECTURE_REVIEW",
  "SECURITY_LEGAL_REVIEW",
  "WAITING_FOR_OWNER_APPROVAL",
  "READY_FOR_IMPLEMENTATION",
  "BLOCKED",
  "REJECTED",
] as const;
export type PlanningState = (typeof PLANNING_STATES)[number];

export const PLANNING_JOB_ROLES = ["PLANNER", "ARCHITECT", "SECURITY", "LEGAL_DE_EU"] as const;
export type PlanningJobRole = (typeof PLANNING_JOB_ROLES)[number];
export type PlanningResultOutcome = "PASS" | "PASS_WITH_REQUIREMENTS" | "BLOCK";
export type PlanningOwnerDecision = "APPROVE" | "REJECT";

export interface PlanningRequirementInput {
  readonly code: string;
  readonly ref: string;
}

export interface PlanningJobResult {
  readonly jobId: string;
  readonly runtimeResultId: string;
  readonly projectRevision: string;
  readonly outcome: PlanningResultOutcome;
  readonly objectRef: string;
  readonly digest: string;
  readonly requirements: readonly PlanningRequirementInput[];
}

export interface PlanningAgentBinding {
  readonly assignmentId: string;
  readonly agentId: string;
  readonly agentKey: string;
  readonly agentVersion: number;
}

export interface PlanningJobView {
  readonly id: string;
  readonly planningRunId: string;
  readonly projectId: string;
  readonly projectRevision: string;
  readonly role: PlanningJobRole;
  readonly backgroundJobId: string;
  readonly runtimeRunId: string;
  readonly prerequisiteJobId?: string;
  readonly architectureJobId?: string;
  readonly assignment: PlanningAgentBinding;
  readonly outcome?: PlanningResultOutcome;
  readonly runtimeResultId?: string;
  readonly resultObjectRef?: string;
  readonly resultDigest?: string;
  readonly requirements: readonly PlanningRequirementInput[];
  readonly createdAt: Date;
  readonly completedAt?: Date;
}

export interface PlanningStatusView {
  readonly planningRunId: string;
  readonly projectId: string;
  readonly projectRevision: string;
  readonly status: PlanningState;
  readonly requestedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly blockedAt?: Date;
  readonly blockCode?: string;
  readonly blockRole?: PlanningJobRole;
  readonly ownerDecision?: {
    readonly decision: PlanningOwnerDecision;
    readonly decidedBy: string;
    readonly reason: string;
    readonly decidedAt: Date;
    readonly approvedProjectRevision?: string;
  };
}

export interface PlanningOrchestrator {
  startPlanning(projectId: string, projectRevision: string, requestedBy: string): Promise<PlanningStatusView>;
  handleJobResult(projectId: string, planningRunId: string, result: PlanningJobResult): Promise<PlanningStatusView>;
  recordOwnerDecision(projectId: string, planningRunId: string, decision: PlanningOwnerDecision, decidedBy: string, reason: string): Promise<PlanningStatusView>;
  getPlanningStatus(projectId: string, planningRunId: string): Promise<PlanningStatusView>;
  listPlanningJobs(projectId: string, planningRunId: string): Promise<readonly PlanningJobView[]>;
  resumePlanning(projectId: string, planningRunId: string): Promise<PlanningStatusView>;
  startImplementation(projectId: string, planningRunId: string, projectRevision: string, requestedBy: string): Promise<ImplementationStatusView>;
  handleExecutorResult(projectId: string, implementationRunId: string, result: ImplementationExecutorResult): Promise<ImplementationStatusView>;
  handleImplementationReviewResult(projectId: string, implementationRunId: string, result: ImplementationReviewResult): Promise<ImplementationStatusView>;
  getImplementationStatus(projectId: string, implementationRunId: string): Promise<ImplementationStatusView>;
  listImplementationJobs(projectId: string, implementationRunId: string): Promise<readonly ImplementationJobView[]>;
  listImplementationReviews(projectId: string, implementationRunId: string): Promise<readonly ImplementationReviewView[]>;
  resumeImplementation(projectId: string, implementationRunId: string): Promise<ImplementationStatusView>;
}

export const IMPLEMENTATION_STATES = [
  "IMPLEMENTING",
  "IMPLEMENTATION_REVIEW",
  "READY_FOR_DELIVERY",
  "CHANGES_REQUESTED",
  "BLOCKED",
  "IMPLEMENTATION_FAILED",
  "IMPLEMENTATION_CANCELLED",
] as const;
export type ImplementationState = (typeof IMPLEMENTATION_STATES)[number];

export const IMPLEMENTATION_JOB_ROLES = ["EXECUTOR", "QA", "REVIEWER", "SECURITY", "LEGAL_DE_EU"] as const;
export type ImplementationJobRole = (typeof IMPLEMENTATION_JOB_ROLES)[number];
export type ImplementationReviewRole = Exclude<ImplementationJobRole, "EXECUTOR">;
export type ImplementationExecutorResultStatus = "SUCCEEDED" | "FAILED" | "CANCELLED";
export type ExecutorResultStatus = ImplementationExecutorResultStatus;
export type ImplementationReviewOutcome = "PASS" | "CHANGES_REQUESTED" | "PASS_WITH_REQUIREMENTS" | "BLOCK";

export interface SyntheticImplementationArtifact {
  readonly objectRef: string;
  readonly digest: string;
}

export interface ImplementationExecutorResult {
  readonly implementationResultId: string;
  readonly runtimeResultId?: string;
  readonly projectId: string;
  readonly projectRevision: string;
  readonly executorJobId: string;
  readonly agentId: string;
  readonly agentKey: string;
  readonly agentVersion: number;
  readonly artifacts: readonly SyntheticImplementationArtifact[];
  readonly summary: string;
  readonly createdAt: Date;
  readonly status: ImplementationExecutorResultStatus;
}

export interface ImplementationReviewResult {
  readonly reviewResultId: string;
  readonly runtimeResultId: string;
  readonly projectId: string;
  readonly projectRevision: string;
  readonly reviewJobId: string;
  readonly implementationResultId: string;
  readonly role: ImplementationReviewRole;
  readonly outcome: ImplementationReviewOutcome;
  readonly objectRef: string;
  readonly digest: string;
  readonly requirements: readonly PlanningRequirementInput[];
  readonly createdAt: Date;
}

export interface ImplementationJobView {
  readonly id: string;
  readonly implementationRunId: string;
  readonly projectId: string;
  readonly projectRevision: string;
  readonly role: ImplementationJobRole;
  readonly backgroundJobId: string;
  readonly runtimeRunId: string;
  readonly executorResultId?: string;
  readonly assignment: PlanningAgentBinding;
  readonly createdAt: Date;
}

export interface ImplementationExecutorResultView extends ImplementationExecutorResult {
  readonly implementationRunId: string;
  readonly acceptedAt: Date;
}

export interface ImplementationReviewView extends ImplementationReviewResult {
  readonly implementationRunId: string;
  readonly acceptedAt: Date;
}

export interface ImplementationStatusView {
  readonly implementationRunId: string;
  readonly planningRunId: string;
  readonly projectId: string;
  readonly projectRevision: string;
  readonly status: ImplementationState;
  readonly requestedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly blockedAt?: Date;
  readonly blockCode?: string;
  readonly blockRole?: ImplementationJobRole;
  readonly executorResult?: ImplementationExecutorResultView;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digestPattern = /^[0-9a-f]{64}$/;
const actorPattern = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/;
const opaqueRefPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/;
const requirementCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/;
const agentKeyPattern = /^[a-z][a-z0-9-]{0,63}$/;
const summaryPattern = /^[A-Za-z0-9][A-Za-z0-9 .,:;()_/-]{0,511}$/;
const secretPattern = /(?:sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|npm_[a-z0-9]{20,}|pypi-[a-z0-9_-]{20,}|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|bearer\s+[a-z0-9._~+/-]{12,}|(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\s*[:=]|[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@|-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----)/i;

function assertMatch(value: string, pattern: RegExp, code: string): void {
  if (!pattern.test(value) || secretPattern.test(value)) throw new Error(code);
}

export function assertPlanningIdentity(projectId: string, planningRunId?: string): void {
  assertMatch(projectId, uuidPattern, "PLANNING_INVALID_PROJECT_ID");
  if (planningRunId !== undefined) assertMatch(planningRunId, uuidPattern, "PLANNING_INVALID_RUN_ID");
}

export function assertImplementationIdentity(projectId: string, implementationRunId?: string): void {
  assertMatch(projectId, uuidPattern, "IMPLEMENTATION_INVALID_PROJECT_ID");
  if (implementationRunId !== undefined) assertMatch(implementationRunId, uuidPattern, "IMPLEMENTATION_INVALID_RUN_ID");
}

export function assertImplementationStart(projectId: string, planningRunId: string, projectRevision: string, requestedBy: string): void {
  assertImplementationIdentity(projectId);
  assertMatch(planningRunId, uuidPattern, "IMPLEMENTATION_INVALID_PLANNING_RUN_ID");
  assertMatch(projectRevision, digestPattern, "IMPLEMENTATION_INVALID_PROJECT_REVISION");
  assertMatch(requestedBy, actorPattern, "IMPLEMENTATION_INVALID_REQUESTED_BY");
}

export function assertImplementationExecutorResult(result: ImplementationExecutorResult): void {
  assertMatch(result.implementationResultId, uuidPattern, "IMPLEMENTATION_INVALID_RESULT_ID");
  if (result.runtimeResultId !== undefined) assertMatch(result.runtimeResultId, uuidPattern, "IMPLEMENTATION_INVALID_RUNTIME_RESULT_ID");
  assertMatch(result.projectId, uuidPattern, "IMPLEMENTATION_INVALID_PROJECT_ID");
  assertMatch(result.projectRevision, digestPattern, "IMPLEMENTATION_INVALID_PROJECT_REVISION");
  assertMatch(result.executorJobId, uuidPattern, "IMPLEMENTATION_INVALID_EXECUTOR_JOB_ID");
  assertMatch(result.agentId, uuidPattern, "IMPLEMENTATION_INVALID_AGENT_ID");
  assertMatch(result.agentKey, agentKeyPattern, "IMPLEMENTATION_INVALID_AGENT_KEY");
  if (!Number.isSafeInteger(result.agentVersion) || result.agentVersion < 1) throw new Error("IMPLEMENTATION_INVALID_AGENT_VERSION");
  if (!["SUCCEEDED", "FAILED", "CANCELLED"].includes(result.status)) throw new Error("IMPLEMENTATION_INVALID_EXECUTOR_STATUS");
  if (!(result.createdAt instanceof Date) || !Number.isFinite(result.createdAt.getTime())) throw new Error("IMPLEMENTATION_INVALID_RESULT_CREATED_AT");
  assertMatch(result.summary, summaryPattern, "IMPLEMENTATION_INVALID_SUMMARY");
  if (!Array.isArray(result.artifacts) || result.artifacts.length > 32) throw new Error("IMPLEMENTATION_INVALID_ARTIFACTS");
  const seen = new Set<string>();
  for (const artifact of result.artifacts) {
    assertMatch(artifact.objectRef, opaqueRefPattern, "IMPLEMENTATION_INVALID_ARTIFACT_REF");
    assertMatch(artifact.digest, digestPattern, "IMPLEMENTATION_INVALID_ARTIFACT_DIGEST");
    const key = `${artifact.objectRef}\0${artifact.digest}`;
    if (seen.has(key)) throw new Error("IMPLEMENTATION_DUPLICATE_ARTIFACT");
    seen.add(key);
  }
  if (result.status === "SUCCEEDED" && (result.runtimeResultId === undefined || result.artifacts.length === 0)) throw new Error("IMPLEMENTATION_SUCCESS_RESULT_INCOMPLETE");
  if (result.status === "FAILED" && result.runtimeResultId === undefined) throw new Error("IMPLEMENTATION_FAILED_RESULT_INCOMPLETE");
  if (result.status !== "SUCCEEDED" && result.artifacts.length !== 0) throw new Error("IMPLEMENTATION_NON_SUCCESS_ARTIFACTS");
}

export function assertImplementationReviewResult(result: ImplementationReviewResult): void {
  assertMatch(result.reviewResultId, uuidPattern, "IMPLEMENTATION_INVALID_REVIEW_RESULT_ID");
  assertMatch(result.runtimeResultId, uuidPattern, "IMPLEMENTATION_INVALID_RUNTIME_RESULT_ID");
  assertMatch(result.projectId, uuidPattern, "IMPLEMENTATION_INVALID_PROJECT_ID");
  assertMatch(result.projectRevision, digestPattern, "IMPLEMENTATION_INVALID_PROJECT_REVISION");
  assertMatch(result.reviewJobId, uuidPattern, "IMPLEMENTATION_INVALID_REVIEW_JOB_ID");
  assertMatch(result.implementationResultId, uuidPattern, "IMPLEMENTATION_INVALID_RESULT_ID");
  if (!["QA", "REVIEWER", "SECURITY", "LEGAL_DE_EU"].includes(result.role)) throw new Error("IMPLEMENTATION_INVALID_REVIEW_ROLE");
  if (!(result.createdAt instanceof Date) || !Number.isFinite(result.createdAt.getTime())) throw new Error("IMPLEMENTATION_INVALID_REVIEW_CREATED_AT");
  assertMatch(result.objectRef, opaqueRefPattern, "IMPLEMENTATION_INVALID_REVIEW_OBJECT_REF");
  assertMatch(result.digest, digestPattern, "IMPLEMENTATION_INVALID_REVIEW_DIGEST");
  if (!Array.isArray(result.requirements) || result.requirements.length > 64) throw new Error("IMPLEMENTATION_INVALID_REQUIREMENTS");
  const seen = new Set<string>();
  for (const requirement of result.requirements) {
    assertMatch(requirement.code, requirementCodePattern, "IMPLEMENTATION_INVALID_REQUIREMENT_CODE");
    assertMatch(requirement.ref, opaqueRefPattern, "IMPLEMENTATION_INVALID_REQUIREMENT_REF");
    const key = `${requirement.code}\0${requirement.ref}`;
    if (seen.has(key)) throw new Error("IMPLEMENTATION_DUPLICATE_REQUIREMENT");
    seen.add(key);
  }
  const qualityRole = result.role === "QA" || result.role === "REVIEWER";
  if (qualityRole && !["PASS", "CHANGES_REQUESTED"].includes(result.outcome)) throw new Error("IMPLEMENTATION_REVIEW_ROLE_OUTCOME_MISMATCH");
  if (!qualityRole && !["PASS", "PASS_WITH_REQUIREMENTS", "BLOCK"].includes(result.outcome)) throw new Error("IMPLEMENTATION_REVIEW_ROLE_OUTCOME_MISMATCH");
  if ((result.outcome === "PASS_WITH_REQUIREMENTS") !== (result.requirements.length > 0)) throw new Error("IMPLEMENTATION_REQUIREMENTS_OUTCOME_MISMATCH");
}

export function assertPlanningStart(projectId: string, projectRevision: string, requestedBy: string): void {
  assertPlanningIdentity(projectId);
  assertMatch(projectRevision, digestPattern, "PLANNING_INVALID_PROJECT_REVISION");
  assertMatch(requestedBy, actorPattern, "PLANNING_INVALID_REQUESTED_BY");
}

export function assertPlanningJobResult(result: PlanningJobResult): void {
  assertMatch(result.jobId, uuidPattern, "PLANNING_INVALID_JOB_ID");
  assertMatch(result.runtimeResultId, uuidPattern, "PLANNING_INVALID_RUNTIME_RESULT_ID");
  assertMatch(result.projectRevision, digestPattern, "PLANNING_INVALID_PROJECT_REVISION");
  if (!["PASS", "PASS_WITH_REQUIREMENTS", "BLOCK"].includes(result.outcome)) throw new Error("PLANNING_INVALID_RESULT_OUTCOME");
  assertMatch(result.objectRef, opaqueRefPattern, "PLANNING_INVALID_RESULT_OBJECT_REF");
  assertMatch(result.digest, digestPattern, "PLANNING_INVALID_RESULT_DIGEST");
  if (!Array.isArray(result.requirements) || result.requirements.length > 64) throw new Error("PLANNING_INVALID_REQUIREMENTS");
  const seen = new Set<string>();
  for (const requirement of result.requirements) {
    assertMatch(requirement.code, requirementCodePattern, "PLANNING_INVALID_REQUIREMENT_CODE");
    assertMatch(requirement.ref, opaqueRefPattern, "PLANNING_INVALID_REQUIREMENT_REF");
    const key = `${requirement.code}\0${requirement.ref}`;
    if (seen.has(key)) throw new Error("PLANNING_DUPLICATE_REQUIREMENT");
    seen.add(key);
  }
  if ((result.outcome === "PASS_WITH_REQUIREMENTS") !== (result.requirements.length > 0)) throw new Error("PLANNING_REQUIREMENTS_OUTCOME_MISMATCH");
}

export function assertOwnerDecisionInput(decision: PlanningOwnerDecision, decidedBy: string, reason: string): void {
  if (decision !== "APPROVE" && decision !== "REJECT") throw new Error("PLANNING_INVALID_OWNER_DECISION");
  assertMatch(decidedBy, actorPattern, "PLANNING_INVALID_DECIDED_BY");
  assertMatch(reason, opaqueRefPattern, "PLANNING_INVALID_DECISION_REASON");
}

export function assertOutcomeAllowedForRole(role: PlanningJobRole, result: PlanningJobResult): void {
  if ((role === "PLANNER" || role === "ARCHITECT") && (result.outcome !== "PASS" || result.requirements.length !== 0)) {
    throw new Error("PLANNING_ROLE_RESULT_MISMATCH");
  }
}

export function isTerminalPlanningState(state: PlanningState): boolean {
  return state === "READY_FOR_IMPLEMENTATION" || state === "BLOCKED" || state === "REJECTED";
}

export function isTerminalImplementationState(state: ImplementationState): boolean {
  return state === "READY_FOR_DELIVERY" || state === "CHANGES_REQUESTED" || state === "BLOCKED" || state === "IMPLEMENTATION_FAILED" || state === "IMPLEMENTATION_CANCELLED";
}
