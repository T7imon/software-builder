export type ProjectId = string;
export type TaskId = string;
export type WorkflowId = string;

export interface HealthStatus {
  readonly service: string;
  readonly status: "ok" | "unavailable";
}

export interface ProjectReference {
  readonly projectId: ProjectId;
}
