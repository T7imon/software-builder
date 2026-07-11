export interface WorkspaceReference {
  readonly workspaceId: string;
  readonly projectId: string;
}

export interface ProjectWorkspacePort {
  get(projectId: string): Promise<WorkspaceReference | null>;
}
