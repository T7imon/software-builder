import type {
  AgentResultReference,
  AgentRunId,
  AttemptId,
  ProjectId,
  TaskId,
} from "@software-builder/core";

export interface AgentRunRequest {
  readonly projectId: ProjectId;
  readonly taskId: TaskId;
  readonly role: string;
  readonly attemptId: AttemptId;
}

export interface AgentRunHandle {
  readonly runId: AgentRunId;
  readonly projectId: ProjectId;
  readonly attemptId: AttemptId;
  readonly state: "STARTING" | "RUNNING";
}

export type AgentRunObservation =
  | {
      readonly runId: AgentRunId;
      readonly projectId: ProjectId;
      readonly attemptId: AttemptId;
      readonly terminal: false;
      readonly state: "STARTING" | "RUNNING" | "CANCELLATION_REQUESTED";
    }
  | {
      readonly runId: AgentRunId;
      readonly projectId: ProjectId;
      readonly attemptId: AttemptId;
      readonly terminal: true;
      readonly state: "COMPLETED" | "FAILED" | "CANCELLED";
      readonly resultReference: AgentResultReference | null;
    };

export type AgentCancellationRequest =
  | {
      readonly runId: AgentRunId;
      readonly accepted: true;
      readonly state: "CANCELLATION_REQUESTED";
    }
  | {
      readonly runId: AgentRunId;
      readonly accepted: false;
      readonly state: "NOT_REQUESTED";
      readonly reasonCode: string;
    };

export interface AgentRuntimePort {
  start(request: AgentRunRequest): Promise<AgentRunHandle>;
  observe(runId: AgentRunId): Promise<AgentRunObservation | null>;
  requestCancellation(runId: AgentRunId): Promise<AgentCancellationRequest>;
}
