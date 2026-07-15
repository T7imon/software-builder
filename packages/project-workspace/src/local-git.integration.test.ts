import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalGitAdapter } from "./local-git.js";

const cleanups: string[] = [];
const branch = `builder/project-aaaaaaaa/revision-${"b".repeat(64)}`;
async function workspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "builder-local-git-"));
  cleanups.push(path);
  await writeFile(join(path, ".builder-workspace.json"), "{}\n", "utf8");
  return path;
}
afterEach(async () => Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("eng begrenzter lokaler Git-Adapter", () => {
  it("initialisiert ein leeres lokales Repository ohne Commit, Remote oder Hook auf dem erwarteten Branch", async () => {
    const path = await workspace();
    const adapter = new LocalGitAdapter();
    const initialized = await adapter.initialize(path, branch);
    expect(initialized.branch).toBe(branch);
    expect(initialized.status).toContain("?? .builder-workspace.json");
    expect(await readFile(join(path, ".git", "HEAD"), "utf8")).toBe(`ref: refs/heads/${branch}\n`);
    expect((await readFile(join(path, ".git", "config"), "utf8")).toLowerCase()).not.toContain("remote");
    await expect(adapter.initialize(path, branch)).rejects.toThrow(/vorhandenes Git-Verzeichnis/);
  });

  it("weist falschen Branch, fehlendes Repository, Hooks und Remote-Konfiguration ab", async () => {
    const path = await workspace();
    const adapter = new LocalGitAdapter();
    await expect(adapter.verify(path, branch)).rejects.toThrow(/fehlt/);
    await adapter.initialize(path, branch);
    await writeFile(join(path, ".git", "HEAD"), "ref: refs/heads/builder/wrong\n", "utf8");
    await expect(adapter.verify(path, branch)).rejects.toThrow(/Branch/);
    await writeFile(join(path, ".git", "HEAD"), `ref: refs/heads/${branch}\n`, "utf8");
    await mkdir(join(path, ".git", "hooks"));
    await writeFile(join(path, ".git", "hooks", "pre-commit"), "exit 1\n", "utf8");
    await expect(adapter.verify(path, branch)).rejects.toThrow(/Hooks/);
    await rm(join(path, ".git", "hooks", "pre-commit"));
    await writeFile(join(path, ".git", "config"), `${await readFile(join(path, ".git", "config"), "utf8")}\n[remote "origin"]\n\turl = https://example.invalid/repo\n`, "utf8");
    await expect(adapter.verify(path, branch)).rejects.toThrow(/nicht erlaubte Sektion/);
  });

  it("weist ein externes .git per Symlink oder Junction ab", async () => {
    const path = await workspace();
    const outside = await mkdtemp(join(tmpdir(), "builder-local-git-outside-"));
    cleanups.push(outside);
    const adapter = new LocalGitAdapter();
    await adapter.initialize(path, branch);
    await rm(join(path, ".git"), { recursive: true, force: true });
    await mkdir(join(outside, "gitdir"));
    try {
      await symlink(join(outside, "gitdir"), join(path, ".git"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        expect(process.platform).toBe("win32");
        return;
      }
      throw error;
    }
    await expect(adapter.verify(path, branch)).rejects.toThrow(/physisches Verzeichnis/);
  });
});
