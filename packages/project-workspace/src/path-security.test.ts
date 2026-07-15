import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectId } from "@software-builder/core";
import { loadWorkspaceConfig } from "./config.js";
import { assertSafeRelativePath, deriveWorkspaceGitBranch, deriveWorkspaceRelativePath, isPathWithin, WorkspacePathGuard } from "./path-security.js";
import type { ProjectRevision } from "./types.js";

const cleanups: string[] = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("Workspace-Pfadsicherheit", () => {
  it.each([
    "../escape/revision-a",
    "/absolute/revision-a",
    "C:/windows/revision-a",
    "C:\\windows\\revision-a",
    "\\\\server\\share\\revision-a",
    "project/../../escape",
    "project/revision-a/child",
    "con/revision-a",
    "project/nul",
    "project\\revision-a",
  ])("weist eingeschleusten Pfad %s ab", (candidate) => {
    expect(() => assertSafeRelativePath(candidate)).toThrow();
  });

  it("erzeugt ausschliesslich die feste gleich tiefe UUID-/SHA-256-Struktur", () => {
    const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ProjectId;
    const revision = "b".repeat(64) as ProjectRevision;
    expect(deriveWorkspaceRelativePath(projectId, revision)).toBe(`${projectId}/revision-${revision}`);
    expect(deriveWorkspaceGitBranch(projectId, revision)).toBe(`builder/project-aaaaaaaa/revision-${revision.slice(0, 16)}`);
    expect(isPathWithin("C:\\root", "C:\\rooted\\escape")).toBe(false);
  });

  it("erstellt und prueft nur physische Verzeichnisse unter dem kanonischen Root", async () => {
    const base = await mkdtemp(join(tmpdir(), "builder-workspace-path-"));
    cleanups.push(base);
    const root = join(base, "root");
    const repository = join(base, "repo");
    await Promise.all([mkdir(root), mkdir(repository)]);
    const guard = new WorkspacePathGuard(await loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: root }, { builderRepositoryRoot: repository }));
    const relativePath = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/revision-" + "b".repeat(64);
    const absolute = await guard.createTarget(relativePath);
    expect(absolute).toBe(join(root, ...relativePath.split("/")));
    expect(await guard.inspect(relativePath)).toBe(absolute);
    await expect(guard.createTarget(relativePath)).rejects.toThrow(/existiert bereits/);
  });

  it("erkennt einen Symlink-/Junction-Ausbruch in einem bestehenden Segment", async () => {
    const base = await mkdtemp(join(tmpdir(), "builder-workspace-junction-"));
    cleanups.push(base);
    const root = join(base, "root");
    const repository = join(base, "repo");
    const outside = join(base, "outside");
    await Promise.all([mkdir(root), mkdir(repository), mkdir(outside)]);
    const projectSegment = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    try {
      await symlink(outside, join(root, projectSegment), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        expect(process.platform).toBe("win32");
        return;
      }
      throw error;
    }
    const guard = new WorkspacePathGuard(await loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: root }, { builderRepositoryRoot: repository }));
    await expect(guard.inspect(`${projectSegment}/revision-${"b".repeat(64)}`, false)).rejects.toThrow(/Symlink|Junction|Umleitung/);
  });
});
