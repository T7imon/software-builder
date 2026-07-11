export interface AgentRunRequest {
  readonly projectId: string;
  readonly taskId: string;
  readonly role: string;
}

export interface AgentRunResult {
  readonly runId: string;
  readonly status: "completed" | "failed" | "cancelled";
}

export interface AgentRuntimePort {
  run(request: AgentRunRequest): Promise<AgentRunResult>;
  cancel(runId: string): Promise<void>;
}
