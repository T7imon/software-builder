import type { ApprovalId, ProjectId, WorkspaceId } from "@software-builder/core";

export interface WorkspaceReference {
  readonly workspaceId: WorkspaceId;
  readonly projectId: ProjectId;
  readonly state: "absent" | "ready" | "leased" | "quarantined" | "archived";
}

export interface ProjectWorkspacePort {
  inspect(projectId: ProjectId): Promise<WorkspaceReference | null>;
  ensureApprovedWorkspace(projectId: ProjectId, approvalId: ApprovalId): Promise<WorkspaceReference>;
  quarantine(workspaceId: WorkspaceId, reasonCode: string): Promise<void>;
}
