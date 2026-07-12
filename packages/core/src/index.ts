declare const identifierBrand: unique symbol;

type Identifier<Name extends string> = string & { readonly [identifierBrand]: Name };

export type ProjectId = Identifier<"ProjectId">;
export type TaskId = Identifier<"TaskId">;
export type WorkflowId = Identifier<"WorkflowId">;
export type AttemptId = Identifier<"AttemptId">;
export type AgentRunId = Identifier<"AgentRunId">;
export type WorkspaceId = Identifier<"WorkspaceId">;
export type ApprovalId = Identifier<"ApprovalId">;
export type TransactionId = Identifier<"TransactionId">;
export type ExternalOperationId = Identifier<"ExternalOperationId">;
export type IdempotencyKey = Identifier<"IdempotencyKey">;
export type GitHubRepositoryId = Identifier<"GitHubRepositoryId">;
export type SecurityFindingId = Identifier<"SecurityFindingId">;
export type LegalRequirementId = Identifier<"LegalRequirementId">;
export type AgentResultReference = Identifier<"AgentResultReference">;
export type ProviderReceiptReference = Identifier<"ProviderReceiptReference">;
export type ContentDigest = Identifier<"ContentDigest">;
export type RevisionDigest = Identifier<"RevisionDigest">;
export type PolicyVersion = Identifier<"PolicyVersion">;
export type AggregateVersion = number;

export type CapabilityName =
  | "architecture"
  | "implementation"
  | "github"
  | "automatic_execution"
  | "production_deployment";

export type CapabilityStateFor<Name extends CapabilityName> = Name extends "production_deployment"
  ? "disabled"
  : "enabled" | "disabled";

export type Capability = {
  readonly [Name in CapabilityName]: {
    readonly name: Name;
    readonly state: CapabilityStateFor<Name>;
  };
}[CapabilityName];

/** Authoritative file-backed states for the current FOUNDATION milestone. */
export const FOUNDATION_CAPABILITY_DEFAULTS = {
  architecture: "enabled",
  implementation: "enabled",
  github: "disabled",
  automatic_execution: "disabled",
  production_deployment: "disabled",
} as const satisfies { readonly [Name in CapabilityName]: CapabilityStateFor<Name> };

export interface HealthStatus {
  readonly service: string;
  readonly status: "ok" | "unavailable";
}

export interface ProjectReference {
  readonly projectId: ProjectId;
}
