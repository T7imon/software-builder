import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectId, WorkspaceId } from "@software-builder/core";
import { loadWorkspaceConfig } from "./config.js";
import type { CreatingWorkspaceRegistration, ProjectRevision, WorkspaceIdentity, WorkspaceMutationSession, WorkspaceRegistration, WorkspaceRegistrationStore, WorkspaceStatus } from "./types.js";
import { ProjectWorkspaceManager } from "./workspace-manager.js";

const projectId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as ProjectId;
const revision = "e".repeat(64) as ProjectRevision;
const identity = { projectId, projectRevision: revision };
const cleanups: string[] = [];

class Store implements WorkspaceRegistrationStore {
  row: WorkspaceRegistration | null = null;
  getWorkspace = async () => this.row;
  listProjectWorkspaces = async () => this.row ? [this.row] : [];
  async withWorkspaceLock<T>(_identity: WorkspaceIdentity, action: (session: WorkspaceMutationSession) => Promise<T>): Promise<T> {
    return action({
      getWorkspace: this.getWorkspace,
      insertCreating: async (input: CreatingWorkspaceRegistration) => {
        this.row = { ...input, status: "CREATING", createdAt: new Date(), readyAt: null, archivedAt: null, failureCode: null };
        return this.row;
      },
      transitionStatus: async (workspaceId: WorkspaceId, expected: readonly WorkspaceStatus[], status: WorkspaceStatus, failureCode) => {
        if (!this.row || this.row.workspaceId !== workspaceId || !expected.includes(this.row.status)) throw new Error("state conflict");
        this.row = { ...this.row, status, readyAt: status === "READY" ? this.row.readyAt ?? new Date() : this.row.readyAt, archivedAt: status === "ARCHIVED" ? new Date() : null, failureCode: status === "FAILED" ? failureCode ?? "PROVISIONING_FAILED" : null };
        return this.row;
      },
    });
  }
}

async function setup(): Promise<{ base: string; root: string; store: Store; manager: ProjectWorkspaceManager }> {
  const base = await mkdtemp(join(tmpdir(), "builder-workspace-fs-"));
  cleanups.push(base);
  const root = join(base, "root");
  const repository = join(base, "repository");
  await Promise.all([mkdir(root), mkdir(repository)]);
  const store = new Store();
  const config = await loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: root }, { builderRepositoryRoot: repository });
  return { base, root, store, manager: new ProjectWorkspaceManager(config, store) };
}

afterEach(async () => Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("Workspace-Dateisystemgrenze", () => {
  it("weist manipulierte Ownership-Metadaten fail-closed ab", async () => {
    const { root, store, manager } = await setup();
    const ready = await manager.createWorkspace({ ...identity, createdBy: "workspace-executor" });
    const metadataPath = join(root, ...ready.relativePath.split("/"), ".builder-workspace.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;
    metadata.projectRevision = "f".repeat(64);
    await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`, "utf8");
    await expect(manager.verifyWorkspace(identity)).rejects.toThrow(/Metadaten/);
    expect(store.row?.status).toBe("FAILED");
  });

  it("weist einen Metadaten-Symlink beziehungsweise eine Junction-artige Umleitung ab", async () => {
    const { base, root, store, manager } = await setup();
    const ready = await manager.createWorkspace({ ...identity, createdBy: "workspace-executor" });
    const metadataPath = join(root, ...ready.relativePath.split("/"), ".builder-workspace.json");
    const outside = join(base, "outside-metadata.json");
    await writeFile(outside, await readFile(metadataPath));
    await rm(metadataPath);
    try {
      await symlink(outside, metadataPath, "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        expect(process.platform).toBe("win32");
        return;
      }
      throw error;
    }
    await expect(manager.verifyWorkspace(identity)).rejects.toThrow(/Symlink|Junction/);
    expect(store.row?.status).toBe("FAILED");
  });

  it("uebernimmt bei CREATING-Recovery keinen Ordner mit zusaetzlichen unerwarteten Inhalten", async () => {
    const { root, store, manager } = await setup();
    const ready = await manager.createWorkspace({ ...identity, createdBy: "workspace-executor" });
    store.row = { ...ready, status: "CREATING", readyAt: null, failureCode: null };
    await writeFile(join(root, ...ready.relativePath.split("/"), "foreign.txt"), "foreign", "utf8");
    await expect(manager.reconcileWorkspace(identity)).rejects.toThrow(/unerwartete/);
    expect(store.row?.status).toBe("FAILED");
  });
});
