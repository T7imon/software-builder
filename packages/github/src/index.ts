export interface GitHubRepositoryReference {
  readonly repositoryId: string;
  readonly fullName: string;
}

export interface GitHubPort {
  getRepository(projectId: string): Promise<GitHubRepositoryReference | null>;
}
