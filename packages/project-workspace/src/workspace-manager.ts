import { randomUUID } from "node:crypto";
import { lstat, open, readFile, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceId } from "@software-builder/core";
import type { WorkspaceConfig } from "./config.js";
import { LocalGitAdapter } from "./local-git.js";
import { deriveWorkspaceGitBranch, deriveWorkspaceRelativePath, isPathWithin, WorkspacePathGuard } from "./path-security.js";
import {
  canonicalIdentity,
  parseCreatedBy,
  parseProjectId,
  type CreateWorkspaceInput,
  type CreatingWorkspaceRegistration,
  type ReadyWorkspaceReader,
  type VerifiedWorkspace,
  type WorkspaceIdentity,
  type WorkspaceMetadata,
  type WorkspaceMutationSession,
  type WorkspaceRegistration,
  type WorkspaceRegistrationStore,
  WorkspaceError,
} from "./types.js";

const metadataFileName = ".builder-workspace.json";

function sameDate(left: Date | null, right: Date | null): boolean {
  return left === null || right === null ? left === right : left.getTime() === right.getTime();
}

function expectedBinding(registration: WorkspaceRegistration): { relativePath: string; gitBranch: string } {
  return {
    relativePath: deriveWorkspaceRelativePath(registration.projectId, registration.projectRevision),
    gitBranch: deriveWorkspaceGitBranch(registration.projectId, registration.projectRevision),
  };
}

function assertRegistrationBinding(registration: WorkspaceRegistration): void {
  const expected = expectedBinding(registration);
  if (registration.relativePath !== expected.relativePath || registration.gitBranch !== expected.gitBranch) {
    throw new WorkspaceError("WORKSPACE_STATE_CONFLICT", "Persistenter Workspace-Pfad oder Git-Branch weicht von der Builder-Ableitung ab.");
  }
  if (
    !(registration.createdAt instanceof Date) ||
    Number.isNaN(registration.createdAt.getTime()) ||
    (registration.readyAt !== null && (!(registration.readyAt instanceof Date) || Number.isNaN(registration.readyAt.getTime()))) ||
    (registration.archivedAt !== null && (!(registration.archivedAt instanceof Date) || Number.isNaN(registration.archivedAt.getTime())))
  ) {
    throw new WorkspaceError("WORKSPACE_STATE_CONFLICT", "Persistente Workspace-Zeitstempel sind ungueltig.");
  }
}

function metadataFor(registration: WorkspaceRegistration): WorkspaceMetadata {
  return {
    schemaVersion: 1,
    workspaceId: registration.workspaceId,
    projectId: registration.projectId,
    projectRevision: registration.projectRevision,
    relativePath: registration.relativePath,
    gitBranch: registration.gitBranch,
  };
}

function parseMetadata(contents: string): WorkspaceMetadata {
  if (Buffer.byteLength(contents, "utf8") > 16 * 1024 || contents.includes("\0")) {
    throw new WorkspaceError("WORKSPACE_FOREIGN_CONTENT", "Builder-Workspace-Metadaten sind ungueltig.");
  }
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new WorkspaceError("WORKSPACE_FOREIGN_CONTENT", "Builder-Workspace-Metadaten sind nicht parsebar.", { cause: error });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceError("WORKSPACE_FOREIGN_CONTENT", "Builder-Workspace-Metadaten haben ein ungueltiges Format.");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expectedKeys = ["gitBranch", "projectId", "projectRevision", "relativePath", "schemaVersion", "workspaceId"];
  if (keys.length !== expectedKeys.length || !keys.every((key, index) => key === expectedKeys[index])) {
    throw new WorkspaceError("WORKSPACE_FOREIGN_CONTENT", "Builder-Workspace-Metadaten enthalten unerwartete Felder.");
  }
  if (
    record.schemaVersion !== 1 ||
    typeof record.workspaceId !== "string" ||
    typeof record.projectId !== "string" ||
    typeof record.projectRevision !== "string" ||
    typeof record.relativePath !== "string" ||
    typeof record.gitBranch !== "string"
  ) {
    throw new WorkspaceError("WORKSPACE_FOREIGN_CONTENT", "Builder-Workspace-Metadaten sind unvollstaendig.");
  }
  return record as unknown as WorkspaceMetadata;
}

function sameMetadata(left: WorkspaceMetadata, right: WorkspaceMetadata): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.workspaceId === right.workspaceId &&
    left.projectId === right.projectId &&
    left.projectRevision === right.projectRevision &&
    left.relativePath === right.relativePath &&
    left.gitBranch === right.gitBranch
  );
}

function missingFilesystemEntry(error: unknown): boolean {
  if (error instanceof WorkspaceError && error.cause && typeof error.cause === "object") {
    return (error.cause as NodeJS.ErrnoException).code === "ENOENT";
  }
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}

export interface ProjectWorkspaceManagerOptions {
  readonly newWorkspaceId?: () => WorkspaceId;
}

export class ProjectWorkspaceManager implements ReadyWorkspaceReader {
  private readonly pathGuard: WorkspacePathGuard;
  private readonly newWorkspaceId: () => WorkspaceId;

  constructor(
    config: WorkspaceConfig,
    private readonly store: WorkspaceRegistrationStore,
    private readonly git: LocalGitAdapter = new LocalGitAdapter(),
    options: ProjectWorkspaceManagerOptions = {},
  ) {
    this.pathGuard = new WorkspacePathGuard(config);
    this.newWorkspaceId = options.newWorkspaceId ?? (() => randomUUID() as WorkspaceId);
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRegistration> {
    const identity = canonicalIdentity(input);
    const createdBy = parseCreatedBy(input.createdBy);
    return this.store.withWorkspaceLock(identity, async (session) => {
      let registration = await session.getWorkspace(identity);
      const existing = registration !== null;
      if (registration) {
        assertRegistrationBinding(registration);
        if (registration.createdBy !== createdBy) {
          throw new WorkspaceError("WORKSPACE_CONFLICT", "Workspace-Replay stammt von einer widerspruechlichen Writer-Identitaet.");
        }
        if (registration.status === "ARCHIVED") throw new WorkspaceError("WORKSPACE_ARCHIVED", "Der Workspace ist terminal archiviert.");
        if (registration.status === "READY") {
          await this.verifyReadyRegistration(session, registration);
          return registration;
        }
      } else {
        const creating: CreatingWorkspaceRegistration = {
          workspaceId: this.newWorkspaceId(),
          projectId: identity.projectId,
          projectRevision: identity.projectRevision,
          relativePath: deriveWorkspaceRelativePath(identity.projectId, identity.projectRevision),
          gitBranch: deriveWorkspaceGitBranch(identity.projectId, identity.projectRevision),
          createdBy,
        };
        registration = await session.insertCreating(creating);
        assertRegistrationBinding(registration);
      }
      try {
        await this.provision(registration, existing);
        await this.verifyFilesystem(registration);
        return await session.transitionStatus(registration.workspaceId, ["CREATING", "FAILED"], "READY");
      } catch (error) {
        try {
          await session.transitionStatus(registration.workspaceId, ["CREATING", "FAILED", "READY"], "FAILED", "PROVISIONING_FAILED");
        } catch {
          // The original provisioning failure is authoritative. A DB outage may leave CREATING, never READY.
        }
        throw error;
      }
    });
  }

  async getWorkspace(input: WorkspaceIdentity): Promise<WorkspaceRegistration | null> {
    const identity = canonicalIdentity(input);
    const registration = await this.store.getWorkspace(identity);
    if (registration) assertRegistrationBinding(registration);
    return registration;
  }

  async listProjectWorkspaces(projectId: string): Promise<readonly WorkspaceRegistration[]> {
    const canonicalProjectId = parseProjectId(projectId);
    const registrations = await this.store.listProjectWorkspaces(canonicalProjectId);
    registrations.forEach(assertRegistrationBinding);
    return registrations;
  }

  async verifyWorkspace(input: WorkspaceIdentity): Promise<VerifiedWorkspace> {
    const identity = canonicalIdentity(input);
    return this.store.withWorkspaceLock(identity, async (session) => {
      const registration = await session.getWorkspace(identity);
      if (!registration) throw new WorkspaceError("WORKSPACE_NOT_FOUND", "Workspace-Registrierung existiert nicht.");
      assertRegistrationBinding(registration);
      return this.verifyReadyRegistration(session, registration);
    });
  }

  async getReadyWorkspace(input: WorkspaceIdentity): Promise<VerifiedWorkspace> {
    return this.verifyWorkspace(input);
  }

  async archiveWorkspace(input: WorkspaceIdentity): Promise<WorkspaceRegistration> {
    const identity = canonicalIdentity(input);
    return this.store.withWorkspaceLock(identity, async (session) => {
      const registration = await session.getWorkspace(identity);
      if (!registration) throw new WorkspaceError("WORKSPACE_NOT_FOUND", "Workspace-Registrierung existiert nicht.");
      assertRegistrationBinding(registration);
      if (registration.status === "ARCHIVED") return registration;
      return session.transitionStatus(registration.workspaceId, [registration.status], "ARCHIVED");
    });
  }

  async reconcileWorkspace(input: WorkspaceIdentity): Promise<WorkspaceRegistration> {
    const identity = canonicalIdentity(input);
    return this.store.withWorkspaceLock(identity, async (session) => {
      let registration = await session.getWorkspace(identity);
      if (!registration) throw new WorkspaceError("WORKSPACE_NOT_FOUND", "Reconciliation erfordert eine persistente Registrierung.");
      assertRegistrationBinding(registration);
      if (registration.status === "ARCHIVED") throw new WorkspaceError("WORKSPACE_ARCHIVED", "Der Workspace ist terminal archiviert.");
      if (registration.status === "READY") {
        await this.verifyReadyRegistration(session, registration);
        return registration;
      }
      try {
        await this.provision(registration, true);
        await this.verifyFilesystem(registration);
        registration = await session.transitionStatus(registration.workspaceId, ["CREATING", "FAILED"], "READY");
        return registration;
      } catch (error) {
        try {
          await session.transitionStatus(registration.workspaceId, ["CREATING", "FAILED"], "FAILED", "PROVISIONING_FAILED");
        } catch {
          // Preserve the verification/provisioning error and never claim READY.
        }
        throw error;
      }
    });
  }

  private async verifyReadyRegistration(session: WorkspaceMutationSession, registration: WorkspaceRegistration): Promise<VerifiedWorkspace> {
    if (registration.status === "ARCHIVED") throw new WorkspaceError("WORKSPACE_ARCHIVED", "Der Workspace ist terminal archiviert.");
    if (registration.status !== "READY") throw new WorkspaceError("WORKSPACE_NOT_READY", "Nur READY-Workspaces duerfen verwendet werden.");
    try {
      const verified = await this.verifyFilesystem(registration);
      return { ...registration, status: "READY", ...verified };
    } catch (error) {
      try {
        await session.transitionStatus(registration.workspaceId, ["READY"], "FAILED", "VERIFICATION_FAILED");
      } catch {
        // Verification remains fail-closed even if recording FAILED is temporarily unavailable.
      }
      throw error;
    }
  }

  private async provision(registration: WorkspaceRegistration, recovery: boolean): Promise<void> {
    let workspacePath: string;
    try {
      workspacePath = await this.pathGuard.inspect(registration.relativePath, true);
      if (!recovery) {
        throw new WorkspaceError("WORKSPACE_FOREIGN_CONTENT", "Ein unerwarteter vorhandener Zielordner wird nicht uebernommen.");
      }
      await this.assertRecoveryContents(workspacePath);
      await this.verifyMetadata(registration, workspacePath);
    } catch (error) {
      if (!missingFilesystemEntry(error)) throw error;
      workspacePath = await this.pathGuard.createTarget(registration.relativePath);
      await this.writeMetadata(registration, workspacePath);
    }

    const gitPath = join(workspacePath, ".git");
    try {
      await lstat(gitPath);
      await this.git.verify(workspacePath, registration.gitBranch);
    } catch (error) {
      if (!missingFilesystemEntry(error)) throw error;
      await this.git.initialize(workspacePath, registration.gitBranch);
    }
  }

  private async assertRecoveryContents(workspacePath: string): Promise<void> {
    const entries = await readdir(workspacePath, { withFileTypes: true });
    const allowed = new Set([metadataFileName, ".git"]);
    if (entries.some((entry) => !allowed.has(entry.name)) || !entries.some((entry) => entry.name === metadataFileName)) {
      throw new WorkspaceError("WORKSPACE_FOREIGN_CONTENT", "Ein registrierter Recovery-Ordner enthaelt unerwartete oder ungebundene Inhalte.");
    }
  }

  private async writeMetadata(registration: WorkspaceRegistration, workspacePath: string): Promise<void> {
    await this.pathGuard.inspect(registration.relativePath, true);
    const metadataPath = join(workspacePath, metadataFileName);
    const handle = await open(metadataPath, "wx", 0o600).catch((error: unknown) => {
      throw new WorkspaceError("WORKSPACE_FOREIGN_CONTENT", "Vorhandene Workspace-Metadaten werden nicht ueberschrieben.", { cause: error });
    });
    try {
      await handle.writeFile(`${JSON.stringify(metadataFor(registration))}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await this.verifyMetadata(registration, workspacePath);
  }

  private async verifyMetadata(registration: WorkspaceRegistration, workspacePath: string): Promise<void> {
    const metadataPath = await this.pathGuard.assertContainedExistingPath(registration.relativePath, metadataFileName);
    const info = await lstat(metadataPath);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) {
      throw new WorkspaceError("WORKSPACE_FOREIGN_CONTENT", "Builder-Workspace-Metadaten muessen eine physische Datei sein.");
    }
    const canonicalMetadata = await realpath(metadataPath);
    if (!isPathWithin(workspacePath, canonicalMetadata)) {
      throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Workspace-Metadaten verlassen den Workspace.");
    }
    const actual = parseMetadata(await readFile(metadataPath, "utf8"));
    const expected = metadataFor(registration);
    if (!sameMetadata(actual, expected)) {
      throw new WorkspaceError("WORKSPACE_FOREIGN_CONTENT", "Workspace-Metadaten stimmen nicht mit der persistenten Registrierung ueberein.");
    }
  }

  private async verifyFilesystem(registration: WorkspaceRegistration): Promise<{ absolutePath: string; gitStatus: readonly string[] }> {
    assertRegistrationBinding(registration);
    const absolutePath = await this.pathGuard.inspect(registration.relativePath, true);
    await this.verifyMetadata(registration, absolutePath);
    const git = await this.git.verify(absolutePath, registration.gitBranch);
    return { absolutePath, gitStatus: git.status };
  }
}

export function sameWorkspaceRegistration(left: WorkspaceRegistration, right: WorkspaceRegistration): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.projectId === right.projectId &&
    left.projectRevision === right.projectRevision &&
    left.relativePath === right.relativePath &&
    left.gitBranch === right.gitBranch &&
    left.status === right.status &&
    left.createdBy === right.createdBy &&
    left.failureCode === right.failureCode &&
    sameDate(left.createdAt, right.createdAt) &&
    sameDate(left.readyAt, right.readyAt) &&
    sameDate(left.archivedAt, right.archivedAt)
  );
}
