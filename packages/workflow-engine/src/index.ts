export const WORKFLOW_STATUSES = [
  "REQUESTED",
  "DENIED",
  "AUTHORIZED",
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "INFRA_RETRY",
  "INFRA_FAILED",
  "CANCELLING",
  "CANCELLED",
  "CANCEL_STUCK",
  "AWAITING_OBLIGATIONS",
  "COMPLETED",
  "REPAIR_SCHEDULED",
  "STOPPED",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export interface WorkflowExecutionReference {
  readonly workflowId: WorkflowId;
  readonly projectId: ProjectId;
  readonly taskId: TaskId;
  readonly status: WorkflowStatus;
}

export interface WorkflowTransitionRequest {
  readonly workflowId: WorkflowId;
  readonly expectedStatus: WorkflowStatus;
  readonly targetStatus: WorkflowStatus;
  readonly expectedVersion: AggregateVersion;
  readonly expectedPolicyVersion: PolicyVersion;
  readonly idempotencyKey: IdempotencyKey;
}

/** Domain boundary only. FOUNDATION provides no workflow implementation. */
export interface WorkflowEnginePort {
  getExecution(workflowId: WorkflowId): Promise<WorkflowExecutionReference | null>;
  transition(request: WorkflowTransitionRequest): Promise<WorkflowExecutionReference>;
}
import type {
  AggregateVersion,
  IdempotencyKey,
  PolicyVersion,
  ProjectId,
  TaskId,
  WorkflowId,
} from "@software-builder/core";
