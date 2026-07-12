import type { ProjectId } from "@software-builder/core";

declare const projectCapabilityBrand: unique symbol;
declare const bootstrapCapabilityBrand: unique symbol;
export type ProjectCapability = string & { readonly [projectCapabilityBrand]: true };
export type BootstrapCapability = string & { readonly [bootstrapCapabilityBrand]: true };

export interface CapabilityRequirement { readonly audience: "persistence"; readonly operation: string; }
export interface VerifiedProjectCapability { readonly kind: "project"; readonly projectId: ProjectId; readonly expiresAt: Date; readonly capabilityId: string; readonly subject: string; readonly actorScope: string; readonly audience: "persistence"; readonly operation: string; readonly allowedOperations: readonly string[]; readonly allowedRoles:readonly string[]; }
export interface ProjectCapabilityVerifier { verifyProject(capability: ProjectCapability, requirement: CapabilityRequirement): Promise<VerifiedProjectCapability>; }
export interface BootstrapCapabilityVerifier { verifyBootstrap(capability: BootstrapCapability, subject: string, actorScope: string): Promise<void>; }
export interface ProjectContextIssuer { issueContext(claim: VerifiedProjectCapability): Promise<string>; close(): Promise<void>; }

export const projectStatuses = ["IDEA_VALIDATION","REJECTED","PLANNING","PLANNING_REVIEW","ON_HOLD","AWAITING_INITIAL_APPROVAL","APPROVED_UNPROVISIONED","WORKSPACE_PROVISIONING","WORKSPACE_READY","PROVISIONING_FAILED","REPOSITORY_PROVISIONING","REPOSITORY_READY","ACTIVE","PAUSED","STOPPED","ARCHIVED"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];
export const taskStatuses = ["DRAFT","READY","INITIAL_RUNNING","EVALUATING","REPAIR_READY","REPAIR_RUNNING","ACCEPTED","STOPPED_REPAIR_LIMIT","STOPPED_LEGAL","STOPPED_SECURITY","CANCELLED"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export interface BuilderProject { id: string; projectType: "FULL_STACK_WEB"; status: ProjectStatus; version: number; createdAt: Date; updatedAt: Date; }
export interface TaskRecord { id: string; projectId: string; milestoneId: string; taskType: string; statementRef: string; acceptanceCriteriaRef: string; status: TaskStatus; repairCount: number; version: number; createdAt: Date; updatedAt: Date; }
export interface CreateProjectInput { id?: string; projectType?: "FULL_STACK_WEB"; status?: ProjectStatus; }

export interface CommandEnvelope {
  readonly actorScope: string;
  readonly actorIdentityId: string;
  readonly idempotencyKey: string;
  readonly requestDigest: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly transition: string;
  readonly priorState?: string;
  readonly newState: string;
  readonly reasonCode: string;
  readonly policyVersion: string;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly enqueueJob?: { readonly jobType: string; readonly expectedAggregateVersion: number; readonly traceId: string; readonly maxRetries?: number };
}

export interface CommandResult { readonly resultRef: string; readonly duplicate: boolean; }

export type EntityMutation =
  | { kind: "project_brief"; id?: string; schemaVersion: number; classification: "SYNTHETIC_ONLY"|"REJECTED"|"QUARANTINED"; contentObjectRef?: string; status: "DRAFT"|"SCREENED"|"ACCEPTED"|"REJECTED"|"QUARANTINED" }
  | { kind: "product_specification"; id?: string; schemaVersion: number; revision: number; contentDigest: string; objectRef: string; status: "DRAFT"|"FROZEN"|"APPROVED"|"SUPERSEDED"; supersedesId?: string }
  | { kind: "workflow_definition"; id?: string; name: string; schemaVersion: number; revision: number; definitionDigest: string; status: "DRAFT"|"ACTIVE"|"SUPERSEDED"|"DISABLED" }
  | { kind: "milestone"; id?: string; plannerMilestoneId: string; ordinal: number; status: "PENDING"|"READY"|"ACTIVE"|"VERIFYING"|"COMPLETE"|"BLOCKED"|"CANCELLED"; acceptancePolicyId: string }
  | { kind: "workflow_stage"; id?: string; workflowDefinitionId?: string; milestoneId: string; name: string; ordinal: number; status: "PENDING"|"READY"|"ACTIVE"|"VERIFYING"|"COMPLETE"|"BLOCKED"|"CANCELLED" }
  | { kind: "task"; id?: string; milestoneId: string; taskType: string; statementRef: string; acceptanceCriteriaRef: string; status: TaskStatus }
  | { kind: "task_dependency"; id?: string; predecessorTaskId: string; successorTaskId: string }
  | { kind: "workflow_run"; id?: string; workflowDefinitionId: string; taskId: string; policySnapshotId: string; requestedBy: string; status: "REQUESTED"|"DENIED"|"AUTHORIZED"|"QUEUED"|"CLAIMED"|"RUNNING"|"INFRA_RETRY"|"INFRA_FAILED"|"CANCELLING"|"CANCELLED"|"CANCEL_STUCK"|"AWAITING_OBLIGATIONS"|"REPAIR_SCHEDULED"|"COMPLETED"|"STOPPED" }
  | { kind: "attempt"; id?: string; taskId: string; workflowRunId: string; attemptKind: "INITIAL"|"REPAIR"; ordinal: number; baseRevisionDigest?: string; outputRevisionDigest?: string; status: "CREATED"|"WAITING_FOR_LEASE"|"RUNNING"|"OUTPUT_PENDING"|"SEALED"|"EVALUATING"|"SUCCEEDED"|"FAILED_REPAIRABLE"|"FAILED_TERMINAL"|"CANCELLED"|"INFRA_FAILED" }
  | { kind: "agent_definition"; id?: string; role: "PLANNER"|"ARCHITECT"|"SECURITY"|"LEGAL"|"EXECUTOR"|"QA"|"REVIEWER"; adapterVersion: string; policyVersion: string; status: "DRAFT"|"ACTIVE"|"DISABLED"|"SUPERSEDED" }
  | { kind: "agent_thread"; id?: string; providerThreadRef?: string; status: "CREATED"|"ACTIVE"|"SUSPENDED"|"CLOSED"|"FAILED" }
  | { kind: "agent_run"; id?: string; attemptId: string; agentDefinitionId: string; agentThreadId?: string; role: "PLANNER"|"ARCHITECT"|"SECURITY"|"LEGAL"|"EXECUTOR"|"QA"|"REVIEWER"; providerProfileId?: string; adapterVersion: string; sdkRuntimeVersion: string; modelPolicyId: string; providerThreadRef?: string; status: "CREATED"|"QUEUED"|"RUNNING"|"SUCCEEDED"|"FAILED"|"CANCELLED"|"INFRA_RETRY"|"INFRA_FAILED" }
  | { kind: "artifact"; id?: string; artifactType: "PROJECT_BRIEF"|"SPECIFICATION"|"ARCHITECTURE"|"ROADMAP"|"TASK_SET"|"REVISION"|"EVIDENCE"; schemaVersion: number; revision: number; contentDigest: string; objectRef?: string; createdByRole: string; status: "DRAFT"|"FINALIZED"|"SUPERSEDED"; supersedesId?: string }
  | { kind: "decision"; id?: string; subjectType: string; subjectId: string; decision: "PASS"|"PASS_WITH_REQUIREMENTS"|"BLOCK"|"COUNSEL_REQUIRED"|"APPROVED"|"REJECTED"|"STOP"; rationaleRef?: string; evidenceRef?: string; supersedesId?: string }
  | { kind: "finding"; id?: string; subjectType: string; subjectId: string; fingerprint: string; severity: "UNCLASSIFIED"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL"; status: "UNCLASSIFIED"|"OPEN"|"REMEDIATION_SUBMITTED"|"VERIFIED_CLOSED"|"FALSE_POSITIVE"|"RECLASSIFIED"; evidenceRef?: string; supersedesId?: string }
  | { kind: "gate_result"; id?: string; gateName: string; subjectType: string; subjectId: string; result: "PASS"|"FAIL"|"BLOCK"|"NOT_EVALUATED"|"STALE"; policyVersion: string; evidenceRef?: string; supersedesId?: string }
  | { kind: "repository_connection"; id?: string; providerProfileId?: string; externalOwnerId?: string; externalRepositoryId?: string; status: "UNBOUND"|"PROVISIONING"|"BASELINE_VERIFYING"|"READY"|"DRIFTED"|"HELD"|"ARCHIVED"; visibility: "PRIVATE"; configurationDigest?: string; gateResultId?: string }
  | { kind: "deployment"; id?: string; artifactId: string; actionClass: "INTERNAL_CONTROLLED"; targetClass: "LOCAL"; status: "PREPARED"|"EXECUTING"|"SUCCEEDED"|"FAILED"|"UNKNOWN"|"RECONCILING"|"MANUAL_HOLD" }
  | { kind: "inbox_event"; id?: string; consumerIdentity: string; messageId: string; status: "RECEIVED"|"PROCESSING"|"PROCESSED"|"FAILED" };
