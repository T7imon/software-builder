import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectId, WorkspaceId } from "@software-builder/core";
import { loadWorkspaceConfig, type WorkspaceConfig } from "./config.js";
import { LocalGitAdapter, type LocalGitVerification } from "./local-git.js";
import { deriveWorkspaceRelativePath } from "./path-security.js";
import {
  type CreatingWorkspaceRegistration,
  type ProjectRevision,
  type WorkspaceFailureCode,
  type WorkspaceIdentity,
  type WorkspaceMutationSession,
  type WorkspaceRegistration,
  type WorkspaceRegistrationStore,
  type WorkspaceStatus,
  WorkspaceError,
} from "./types.js";
import { ProjectWorkspaceManager } from "./workspace-manager.js";

const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ProjectId;
const revision = "b".repeat(64) as ProjectRevision;
const identity = { projectId, projectRevision: revision };
const cleanups: string[] = [];

class MemoryWorkspaceStore implements WorkspaceRegistrationStore {
  readonly rows = new Map<string, WorkspaceRegistration>();
  private readonly tails = new Map<string, Promise<void>>();
  transitionFailures = 0;

  private key(value: WorkspaceIdentity): string {
    return `${value.projectId.toLowerCase()}:${value.projectRevision}`;
  }

  async getWorkspace(value: WorkspaceIdentity): Promise<WorkspaceRegistration | null> {
    return this.rows.get(this.key(value)) ?? null;
  }

  async listProjectWorkspaces(value: ProjectId): Promise<readonly WorkspaceRegistration[]> {
    return [...this.rows.values()].filter((row) => row.projectId === value);
  }

  async withWorkspaceLock<T>(value: WorkspaceIdentity, action: (session: WorkspaceMutationSession) => Promise<T>): Promise<T> {
    const key = this.key(value);
    const prior = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>((resolve) => { release = resolve; });
    this.tails.set(key, prior.then(() => tail));
    await prior;
    const session: WorkspaceMutationSession = {
      getWorkspace: (requested) => this.getWorkspace(requested),
      insertCreating: async (input) => this.insert(input),
      transitionStatus: async (workspaceId, expected, status, failureCode) => this.transition(workspaceId, expected, status, failureCode),
    };
    try {
      return await action(session);
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  private async insert(input: CreatingWorkspaceRegistration): Promise<WorkspaceRegistration> {
    const key = this.key(input);
    if (this.rows.has(key)) throw new Error("duplicate workspace");
    const row: WorkspaceRegistration = {
      ...input,
      status: "CREATING",
      createdAt: new Date(),
      readyAt: null,
      archivedAt: null,
      failureCode: null,
    };
    this.rows.set(key, row);
    return row;
  }

  private async transition(
    workspaceId: WorkspaceId,
    expected: readonly WorkspaceStatus[],
    status: WorkspaceStatus,
    failureCode?: WorkspaceFailureCode,
  ): Promise<WorkspaceRegistration> {
    if (this.transitionFailures > 0) {
      this.transitionFailures -= 1;
      throw new Error("injected database transition failure");
    }
    const entry = [...this.rows.entries()].find(([, row]) => row.workspaceId === workspaceId);
    if (!entry || !expected.includes(entry[1].status)) throw new Error("state conflict");
    const [key, current] = entry;
    const now = new Date();
    const next: WorkspaceRegistration = {
      ...current,
      status,
      readyAt: status === "READY" ? current.readyAt ?? now : current.readyAt,
      archivedAt: status === "ARCHIVED" ? now : null,
      failureCode: status === "FAILED" ? failureCode ?? "PROVISIONING_FAILED" : status === "ARCHIVED" ? current.failureCode : null,
    };
    this.rows.set(key, next);
    return next;
  }
}

class FailOnceGit extends LocalGitAdapter {
  private failed = false;
  override async initialize(workspacePath: string, branch: string): Promise<LocalGitVerification> {
    if (!this.failed) {
      this.failed = true;
      throw new WorkspaceError("WORKSPACE_GIT_INVALID", "injected git init failure");
    }
    return super.initialize(workspacePath, branch);
  }
}

async function setup(store = new MemoryWorkspaceStore(), git = new LocalGitAdapter()): Promise<{
  root: string;
  config: WorkspaceConfig;
  store: MemoryWorkspaceStore;
  manager: ProjectWorkspaceManager;
}> {
  const base = await mkdtemp(join(tmpdir(), "builder-workspace-manager-"));
  cleanups.push(base);
  const root = join(base, "workspaces");
  const repository = join(base, "repository");
  await Promise.all([mkdir(root), mkdir(repository)]);
  const config = await loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: root }, { builderRepositoryRoot: repository });
  return { root, config, store, manager: new ProjectWorkspaceManager(config, store, git) };
}

afterEach(async () => Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("ProjectWorkspaceManager", () => {
  it("erstellt Registrierung, Metadaten und lokales Git erst vollstaendig vor READY", async () => {
    const { root, manager } = await setup();
    const registration = await manager.createWorkspace({ ...identity, createdBy: "workspace-executor" });
    expect(registration).toMatchObject({ ...identity, status: "READY", createdBy: "workspace-executor", failureCode: null });
    const verified = await manager.verifyWorkspace(identity);
    expect(verified.absolutePath).toBe(join(root, ...registration.relativePath.split("/")));
    expect(verified.gitStatus).toContain("?? .builder-workspace.json");
    expect(await manager.listProjectWorkspaces(projectId)).toHaveLength(1);
  });

  it("normalisiert UUID-Replays und serialisiert parallele Creates auf genau eine Identitaet", async () => {
    const { manager } = await setup();
    const requests = await Promise.all(Array.from({ length: 6 }, () => manager.createWorkspace({ projectId: projectId.toUpperCase() as ProjectId, projectRevision: revision, createdBy: "workspace-executor" })));
    expect(new Set(requests.map((row) => row.workspaceId)).size).toBe(1);
    expect(new Set(requests.map((row) => row.relativePath)).size).toBe(1);
    expect((await manager.createWorkspace({ ...identity, createdBy: "workspace-executor" })).workspaceId).toBe(requests[0]!.workspaceId);
    await expect(manager.createWorkspace({ ...identity, createdBy: "different-writer" })).rejects.toThrow(/widerspruechlichen/);
  });

  it("findet einen READY-Workspace nach Manager-Neustart ohne Duplikat wieder", async () => {
    const { config, store, manager } = await setup();
    const first = await manager.createWorkspace({ ...identity, createdBy: "workspace-executor" });
    const restarted = new ProjectWorkspaceManager(config, store);
    expect((await restarted.getReadyWorkspace(identity)).workspaceId).toBe(first.workspaceId);
    expect((await restarted.reconcileWorkspace(identity)).workspaceId).toBe(first.workspaceId);
  });

  it("verwaltet verschiedene Projektversionen als gleich tiefe getrennte Workspaces", async () => {
    const { manager } = await setup();
    const successorRevision = "c".repeat(64) as ProjectRevision;
    const [first, successor] = await Promise.all([
      manager.createWorkspace({ ...identity, createdBy: "workspace-executor" }),
      manager.createWorkspace({ projectId, projectRevision: successorRevision, createdBy: "workspace-executor" }),
    ]);
    expect(first.workspaceId).not.toBe(successor.workspaceId);
    expect(first.relativePath.split("/")).toHaveLength(2);
    expect(successor.relativePath.split("/")).toHaveLength(2);
    expect(await manager.listProjectWorkspaces(projectId)).toHaveLength(2);
  });

  it("recoveriert FAILED nach lokalem Git-Fehler sicher und hinterlaesst vorher nie READY", async () => {
    const store = new MemoryWorkspaceStore();
    const { config, manager } = await setup(store, new FailOnceGit());
    await expect(manager.createWorkspace({ ...identity, createdBy: "workspace-executor" })).rejects.toThrow(/injected git/);
    expect((await store.getWorkspace(identity))?.status).toBe("FAILED");
    const restarted = new ProjectWorkspaceManager(config, store);
    expect((await restarted.reconcileWorkspace(identity)).status).toBe("READY");
  });

  it("recoveriert CREATING nach DB-Fehler hinter vollstaendig erzeugtem Dateisystem", async () => {
    const store = new MemoryWorkspaceStore();
    store.transitionFailures = 2;
    const { config, manager } = await setup(store);
    await expect(manager.createWorkspace({ ...identity, createdBy: "workspace-executor" })).rejects.toThrow(/database transition failure/);
    expect((await store.getWorkspace(identity))?.status).toBe("CREATING");
    const restarted = new ProjectWorkspaceManager(config, store);
    expect((await restarted.reconcileWorkspace(identity)).status).toBe("READY");
    expect(await store.listProjectWorkspaces(projectId)).toHaveLength(1);
  });

  it("uebernimmt keinen bereits vorhandenen fremden Ordner und ueberschreibt keine Inhalte", async () => {
    const { root, store, manager } = await setup();
    const relativePath = deriveWorkspaceRelativePath(projectId, revision);
    const target = join(root, ...relativePath.split("/"));
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "foreign.txt"), "do not overwrite", "utf8");
    await expect(manager.createWorkspace({ ...identity, createdBy: "workspace-executor" })).rejects.toThrow(/vorhandener Zielordner/);
    expect((await store.getWorkspace(identity))?.status).toBe("FAILED");
    expect(await import("node:fs/promises").then((fs) => fs.readFile(join(target, "foreign.txt"), "utf8"))).toBe("do not overwrite");
  });

  it("markiert falschen Branch und fehlendes Git bei verifyWorkspace persistent FAILED", async () => {
    const first = await setup();
    const registration = await first.manager.createWorkspace({ ...identity, createdBy: "workspace-executor" });
    const target = join(first.root, ...registration.relativePath.split("/"));
    await writeFile(join(target, ".git", "HEAD"), "ref: refs/heads/builder/wrong\n", "utf8");
    await expect(first.manager.verifyWorkspace(identity)).rejects.toThrow(/Branch/);
    expect((await first.store.getWorkspace(identity))?.status).toBe("FAILED");

    const otherRevision = "c".repeat(64) as ProjectRevision;
    const otherIdentity = { projectId, projectRevision: otherRevision };
    const second = await setup();
    const secondRegistration = await second.manager.createWorkspace({ ...otherIdentity, createdBy: "workspace-executor" });
    await rm(join(second.root, ...secondRegistration.relativePath.split("/"), ".git"), { recursive: true, force: true });
    await expect(second.manager.verifyWorkspace(otherIdentity)).rejects.toThrow(/fehlt/);
    expect((await second.store.getWorkspace(otherIdentity))?.status).toBe("FAILED");
  });

  it("archiviert terminal und idempotent ohne physische Loeschung oder Create-Mischzustand", async () => {
    const { root, manager } = await setup();
    const ready = await manager.createWorkspace({ ...identity, createdBy: "workspace-executor" });
    const [archiveResult, createResult] = await Promise.allSettled([
      manager.archiveWorkspace(identity),
      manager.createWorkspace({ ...identity, createdBy: "workspace-executor" }),
    ]);
    expect([archiveResult.status, createResult.status]).toContain("fulfilled");
    const archived = await manager.archiveWorkspace(identity);
    expect(archived.status).toBe("ARCHIVED");
    await expect(manager.createWorkspace({ ...identity, createdBy: "workspace-executor" })).rejects.toThrow(/archiviert/);
    await expect(manager.verifyWorkspace(identity)).rejects.toThrow(/archiviert/);
    expect(await import("node:fs/promises").then((fs) => fs.stat(join(root, ...ready.relativePath.split("/"))))).toBeDefined();
  });

  it("weist Traversal, absolute, Windows-Laufwerk- und UNC-artige Identitaeten vor Persistenz ab", async () => {
    const { store, manager } = await setup();
    for (const malicious of ["../escape", "/absolute", "C:\\escape", "C:/escape", "\\\\server\\share"]) {
      await expect(manager.createWorkspace({ projectId: malicious as ProjectId, projectRevision: revision, createdBy: "workspace-executor" })).rejects.toThrow(/projectId/);
    }
    expect(store.rows.size).toBe(0);
  });
});
