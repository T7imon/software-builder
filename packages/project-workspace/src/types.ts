import type { ProjectId, RevisionDigest, WorkspaceId } from "@software-builder/core";

export const workspaceStatuses = ["CREATING", "READY", "ARCHIVED", "FAILED"] as const;
export type WorkspaceStatus = (typeof workspaceStatuses)[number];

export type ProjectRevision = RevisionDigest;

export interface WorkspaceRegistration {
  readonly workspaceId: WorkspaceId;
  readonly projectId: ProjectId;
  readonly projectRevision: ProjectRevision;
  readonly relativePath: string;
  readonly gitBranch: string;
  readonly status: WorkspaceStatus;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly readyAt: Date | null;
  readonly archivedAt: Date | null;
  readonly failureCode: WorkspaceFailureCode | null;
}

export type WorkspaceFailureCode = "PROVISIONING_FAILED" | "VERIFICATION_FAILED";

export interface WorkspaceIdentity {
  readonly projectId: ProjectId;
  readonly projectRevision: ProjectRevision;
}

export interface CreateWorkspaceInput extends WorkspaceIdentity {
  readonly createdBy: string;
}

export interface WorkspaceMetadata {
  readonly schemaVersion: 1;
  readonly workspaceId: WorkspaceId;
  readonly projectId: ProjectId;
  readonly projectRevision: ProjectRevision;
  readonly relativePath: string;
  readonly gitBranch: string;
}

export interface VerifiedWorkspace extends WorkspaceRegistration {
  readonly status: "READY";
  readonly absolutePath: string;
  readonly gitStatus: readonly string[];
}

export interface ReadyWorkspaceReader {
  getReadyWorkspace(identity: WorkspaceIdentity): Promise<VerifiedWorkspace>;
}

export interface CreatingWorkspaceRegistration {
  readonly workspaceId: WorkspaceId;
  readonly projectId: ProjectId;
  readonly projectRevision: ProjectRevision;
  readonly relativePath: string;
  readonly gitBranch: string;
  readonly createdBy: string;
}

export interface WorkspaceMutationSession {
  getWorkspace(identity: WorkspaceIdentity): Promise<WorkspaceRegistration | null>;
  insertCreating(input: CreatingWorkspaceRegistration): Promise<WorkspaceRegistration>;
  transitionStatus(
    workspaceId: WorkspaceId,
    expectedStatuses: readonly WorkspaceStatus[],
    status: WorkspaceStatus,
    failureCode?: WorkspaceFailureCode,
  ): Promise<WorkspaceRegistration>;
}

export interface WorkspaceRegistrationStore {
  getWorkspace(identity: WorkspaceIdentity): Promise<WorkspaceRegistration | null>;
  listProjectWorkspaces(projectId: ProjectId): Promise<readonly WorkspaceRegistration[]>;
  withWorkspaceLock<T>(
    identity: WorkspaceIdentity,
    action: (session: WorkspaceMutationSession) => Promise<T>,
  ): Promise<T>;
}

export class WorkspaceError extends Error {
  constructor(
    readonly code:
      | "WORKSPACE_INVALID_INPUT"
      | "WORKSPACE_CONFIGURATION_UNSAFE"
      | "WORKSPACE_NOT_FOUND"
      | "WORKSPACE_CONFLICT"
      | "WORKSPACE_ARCHIVED"
      | "WORKSPACE_NOT_READY"
      | "WORKSPACE_PATH_UNSAFE"
      | "WORKSPACE_FOREIGN_CONTENT"
      | "WORKSPACE_GIT_INVALID"
      | "WORKSPACE_STATE_CONFLICT",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WorkspaceError";
  }
}

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sha256 = /^[0-9a-f]{64}$/;
const actor = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/;

export function parseProjectId(value: string): ProjectId {
  if (typeof value !== "string") {
    throw new WorkspaceError("WORKSPACE_INVALID_INPUT", "projectId muss eine UUID-Zeichenkette sein.");
  }
  const normalized = value.toLowerCase();
  if (!canonicalUuid.test(normalized)) {
    throw new WorkspaceError("WORKSPACE_INVALID_INPUT", "projectId muss eine kanonische kleingeschriebene UUID sein.");
  }
  return normalized as ProjectId;
}

export function parseProjectRevision(value: string): ProjectRevision {
  if (typeof value !== "string" || !sha256.test(value)) {
    throw new WorkspaceError("WORKSPACE_INVALID_INPUT", "projectRevision muss ein kleingeschriebener SHA-256-Digest sein.");
  }
  return value as ProjectRevision;
}

export function parseCreatedBy(value: string): string {
  if (typeof value !== "string" || !actor.test(value)) {
    throw new WorkspaceError("WORKSPACE_INVALID_INPUT", "createdBy ist keine gueltige lokale Builder-Identitaet.");
  }
  return value;
}

export function canonicalIdentity(input: { readonly projectId: string; readonly projectRevision: string }): WorkspaceIdentity {
  return { projectId: parseProjectId(input.projectId), projectRevision: parseProjectRevision(input.projectRevision) };
}
