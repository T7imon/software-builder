import type {
  AggregateVersion,
  ExternalOperationId,
  GitHubRepositoryId,
  IdempotencyKey,
  ProjectId,
  ProviderReceiptReference,
  RevisionDigest,
} from "@software-builder/core";

export interface GitHubRepositoryReference {
  readonly repositoryId: GitHubRepositoryId;
  readonly fullName: string;
  readonly visibility: "private";
}

export type GitHubExternalOperationState =
  | "PREPARED"
  | "EXECUTING"
  | "SUCCEEDED"
  | "FAILED"
  | "UNKNOWN"
  | "RECONCILING"
  | "MANUAL_HOLD";

export interface GitHubMutationCommand {
  readonly operationId: ExternalOperationId;
  readonly projectId: ProjectId;
  readonly idempotencyKey: IdempotencyKey;
  readonly expectedProjectVersion: AggregateVersion;
  readonly expectedDigest: RevisionDigest;
}

export type GitHubExternalOperation =
  | {
      readonly operationId: ExternalOperationId;
      readonly projectId: ProjectId;
      readonly desiredDigest: RevisionDigest;
      readonly terminal: false;
      readonly state: "PREPARED" | "EXECUTING" | "UNKNOWN" | "RECONCILING";
    }
  | {
      readonly operationId: ExternalOperationId;
      readonly projectId: ProjectId;
      readonly desiredDigest: RevisionDigest;
      readonly terminal: true;
      readonly state: "SUCCEEDED" | "FAILED" | "MANUAL_HOLD";
      readonly providerReceiptReference: ProviderReceiptReference | null;
    };

export interface GitHubPort {
  observeRepository(projectId: ProjectId): Promise<GitHubRepositoryReference | null>;
  observeOperation(operationId: ExternalOperationId): Promise<GitHubExternalOperation | null>;
  ensurePrivateRepository(command: GitHubMutationCommand): Promise<GitHubExternalOperation>;
  pushAcceptedDigest(command: GitHubMutationCommand): Promise<GitHubExternalOperation>;
}
