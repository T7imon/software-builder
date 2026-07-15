import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadWorkspaceConfig } from "./config.js";

const cleanups: string[] = [];
async function fixture(): Promise<{ base: string; root: string; repository: string }> {
  const base = await mkdtemp(join(tmpdir(), "builder-workspace-config-"));
  cleanups.push(base);
  const root = join(base, "workspace root with spaces");
  const repository = join(base, "software-builder-fixture");
  await Promise.all([mkdir(root), mkdir(repository)]);
  return { base, root, repository };
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Workspace-Konfiguration", () => {
  it("verlangt einen vorhandenen absoluten expliziten Root und kanonisiert Leerzeichen", async () => {
    const { root, repository } = await fixture();
    await expect(loadWorkspaceConfig({}, { builderRepositoryRoot: repository })).rejects.toThrow(/BUILDER_WORKSPACE_ROOT/);
    await expect(loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: "relative/workspaces" }, { builderRepositoryRoot: repository })).rejects.toThrow(/absoluter Pfad/);
    await expect(loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: join(root, "missing") }, { builderRepositoryRoot: repository })).rejects.toThrow(/vorhandenes Verzeichnis/);
    const config = await loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: root }, { builderRepositoryRoot: repository });
    expect(config.workspaceRoot).toBe(root);
    expect(config.canonicalWorkspaceRoot).toBe(root);
  });

  it("weist Dateisystem-Root, Repository-Root und Repository-Unterordner ab", async () => {
    const { root, repository } = await fixture();
    await expect(loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: parse(root).root }, { builderRepositoryRoot: repository })).rejects.toThrow(/Wurzelverzeichnis/);
    await expect(loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: repository }, { builderRepositoryRoot: repository })).rejects.toThrow(/Builder-Repository/);
    const nested = join(repository, "nested");
    await mkdir(nested);
    await expect(loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: nested }, { builderRepositoryRoot: repository })).rejects.toThrow(/Builder-Repository/);
  });

  it("weist einen Root-Symlink beziehungsweise eine Windows-Junction fail-closed ab", async () => {
    const { base, root, repository } = await fixture();
    const link = join(base, "workspace-link");
    try {
      await symlink(root, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        expect(process.platform).toBe("win32");
        return;
      }
      throw error;
    }
    expect(relative(base, link)).not.toBe("");
    await expect(loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: link }, { builderRepositoryRoot: repository })).rejects.toThrow(/Symlink|Junction|Umleitung/);
  });
});
