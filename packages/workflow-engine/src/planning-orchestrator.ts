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
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digestPattern = /^[0-9a-f]{64}$/;
const actorPattern = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/;
const opaqueRefPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/;
const requirementCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/;
const secretPattern = /(?:sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|npm_[a-z0-9]{20,}|pypi-[a-z0-9_-]{20,}|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|bearer\s+[a-z0-9._~+/-]{12,}|(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\s*[:=]|[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@|-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----)/i;

function assertMatch(value: string, pattern: RegExp, code: string): void {
  if (!pattern.test(value) || secretPattern.test(value)) throw new Error(code);
}

export function assertPlanningIdentity(projectId: string, planningRunId?: string): void {
  assertMatch(projectId, uuidPattern, "PLANNING_INVALID_PROJECT_ID");
  if (planningRunId !== undefined) assertMatch(planningRunId, uuidPattern, "PLANNING_INVALID_RUN_ID");
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
