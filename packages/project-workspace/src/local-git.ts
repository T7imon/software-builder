import { execFile } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { isPathWithin } from "./path-security.js";
import { WorkspaceError } from "./types.js";

const execFileAsync = promisify(execFile);
const branchPattern = /^[a-z0-9][a-z0-9._/-]{0,200}$/;
const allowedCoreKeys = new Set([
  "repositoryformatversion",
  "filemode",
  "bare",
  "logallrefupdates",
  "symlinks",
  "ignorecase",
  "precomposeunicode",
]);

function nullDevice(): string {
  return process.platform === "win32" ? "NUL" : "/dev/null";
}

function gitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: nullDevice(),
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    SSH_ASKPASS: "",
    GIT_LITERAL_PATHSPECS: "1",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    // Fixed, process-local Windows compatibility override; it never mutates local or global config.
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.longpaths",
    GIT_CONFIG_VALUE_0: "true",
    LC_ALL: "C",
  };
  for (const name of ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC", "TEMP", "TMP"]) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

function assertBranch(branch: string): void {
  if (
    !branchPattern.test(branch) ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.endsWith(".lock") ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.includes("@{") ||
    branch.split("/").some((part) => part === "" || part.startsWith("-") || part.endsWith("."))
  ) {
    throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Der erwartete lokale Git-Branch ist ungueltig.");
  }
}

function assertWorkspaceDirectory(workspacePath: string): string {
  if (!isAbsolute(workspacePath) || resolve(workspacePath) !== workspacePath) {
    throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Git darf nur in einem kanonischen absoluten Workspace-Pfad ausgefuehrt werden.");
  }
  return workspacePath;
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

async function assertExecutionBoundary(workspacePath: string, requireRepository: boolean): Promise<void> {
  const workspaceInfo = await lstat(workspacePath);
  if (!workspaceInfo.isDirectory() || workspaceInfo.isSymbolicLink() || !samePath(await realpath(workspacePath), workspacePath)) {
    throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Der Git-Ausfuehrungspfad ist keine stabile physische Workspace-Grenze.");
  }
  if (!requireRepository) return;
  const gitDirectory = join(workspacePath, ".git");
  const gitInfo = await lstat(gitDirectory);
  const canonicalGit = await realpath(gitDirectory);
  if (!gitInfo.isDirectory() || gitInfo.isSymbolicLink() || !samePath(canonicalGit, gitDirectory) || !isPathWithin(workspacePath, canonicalGit)) {
    throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Die Git-Ausfuehrung wuerde eine externe Repository-Grenze verwenden.");
  }
}

async function runGit(workspacePath: string, args: readonly string[], requireRepository = true): Promise<string> {
  try {
    await assertExecutionBoundary(workspacePath, requireRepository);
    const result = await execFileAsync("git", [...args], {
      cwd: workspacePath,
      env: gitEnvironment(),
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 15_000,
      windowsHide: true,
      shell: false,
    });
    return result.stdout.trim();
  } catch (error) {
    throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Die eng begrenzte lokale Git-Operation ist fehlgeschlagen.", { cause: error });
  }
}

async function assertNoLinkTree(root: string): Promise<void> {
  let visited = 0;
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > 16 || visited > 2048) {
      throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Das lokale Git-Verzeichnis ist unerwartet komplex.");
    }
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      visited += 1;
      const entryPath = join(directory, entry.name);
      const info = await lstat(entryPath);
      if (entry.isSymbolicLink() || info.isSymbolicLink()) {
        throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Das lokale Git-Verzeichnis enthaelt einen Symlink oder eine Junction.");
      }
      if (!entry.isDirectory() && info.nlink > 1) {
        throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Das lokale Git-Verzeichnis enthaelt eine extern gekoppelte Hardlink-Datei.");
      }
      const canonical = await realpath(entryPath);
      if (!isPathWithin(root, canonical)) {
        throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Das lokale Git-Verzeichnis verweist nach ausserhalb.");
      }
      if (entry.isDirectory()) await visit(entryPath, depth + 1);
    }
  }
  await visit(root, 0);
}

function validateLocalConfig(contents: string): void {
  if (Buffer.byteLength(contents, "utf8") > 64 * 1024 || contents.includes("\0")) {
    throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Die lokale Git-Konfiguration ist ungueltig.");
  }
  let section = "";
  const values = new Map<string, string>();
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const sectionMatch = /^\[([A-Za-z0-9.-]+)(?:\s+"[^"]*")?\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1]!.toLowerCase();
      if (section !== "core") throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Die lokale Git-Konfiguration enthaelt eine nicht erlaubte Sektion.");
      continue;
    }
    const assignment = /^([A-Za-z][A-Za-z0-9.-]*)\s*=\s*(.*)$/.exec(line);
    if (!assignment || section !== "core") throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Die lokale Git-Konfiguration ist nicht streng parsebar.");
    const key = assignment[1]!.toLowerCase();
    if (!allowedCoreKeys.has(key) || values.has(key)) {
      throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Die lokale Git-Konfiguration enthaelt eine nicht erlaubte oder doppelte Option.");
    }
    values.set(key, assignment[2]!.trim().toLowerCase());
  }
  if (values.get("repositoryformatversion") !== "0" || values.get("bare") !== "false") {
    throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Das Git-Repository ist nicht das erwartete lokale Non-Bare-Format.");
  }
}

export interface LocalGitVerification {
  readonly branch: string;
  readonly status: readonly string[];
}

export class LocalGitAdapter {
  async initialize(workspacePath: string, branch: string): Promise<LocalGitVerification> {
    const workspace = assertWorkspaceDirectory(workspacePath);
    assertBranch(branch);
    try {
      await lstat(join(workspace, ".git"));
      throw new WorkspaceError("WORKSPACE_FOREIGN_CONTENT", "Ein bereits vorhandenes Git-Verzeichnis wird nicht ueberschrieben.");
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await runGit(workspace, ["init", "--quiet", "--template=", `--initial-branch=${branch}`, "."], false);
    return this.verify(workspace, branch);
  }

  async verify(workspacePath: string, expectedBranch: string): Promise<LocalGitVerification> {
    const workspace = assertWorkspaceDirectory(workspacePath);
    assertBranch(expectedBranch);
    const gitDirectory = join(workspace, ".git");
    let info;
    try {
      info = await lstat(gitDirectory);
    } catch (error) {
      throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Das lokale Git-Repository fehlt.", { cause: error });
    }
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new WorkspaceError("WORKSPACE_GIT_INVALID", ".git muss ein lokales physisches Verzeichnis sein.");
    }
    const canonicalWorkspace = await realpath(workspace);
    const canonicalGit = await realpath(gitDirectory);
    if (!isPathWithin(canonicalWorkspace, canonicalGit) || !samePath(canonicalGit, gitDirectory)) {
      throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Das Git-Verzeichnis ist nicht lokal an den Workspace gebunden.");
    }
    for (const forbidden of ["commondir", "gitdir", join("objects", "info", "alternates")]) {
      try {
        await lstat(join(gitDirectory, forbidden));
        throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Externe Git-Objekt-, Common- oder Worktree-Bindungen sind verboten.");
      } catch (error) {
        if (error instanceof WorkspaceError) throw error;
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await assertNoLinkTree(gitDirectory);
    validateLocalConfig(await readFile(join(gitDirectory, "config"), "utf8"));
    const hooks = join(gitDirectory, "hooks");
    try {
      if ((await readdir(hooks)).length !== 0) throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Git-Hooks sind in Builder-Workspaces verboten.");
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const topLevel = await runGit(workspace, ["rev-parse", "--show-toplevel"]);
    const actualGitDirectory = await runGit(workspace, ["rev-parse", "--absolute-git-dir"]);
    const commonDirectory = await runGit(workspace, ["rev-parse", "--git-common-dir"]);
    const branch = await runGit(workspace, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    const statusOutput = await runGit(workspace, ["status", "--porcelain=v1", "--untracked-files=all"]);
    const canonicalTopLevel = await realpath(topLevel);
    const commonAbsolute = resolve(workspace, commonDirectory);
    if (
      !samePath(canonicalTopLevel, canonicalWorkspace) ||
      !samePath(actualGitDirectory, canonicalGit) ||
      !samePath(commonAbsolute, canonicalGit) ||
      branch !== expectedBranch
    ) {
      throw new WorkspaceError("WORKSPACE_GIT_INVALID", "Git-Root, Common-Directory oder aktiver Branch weicht von der Registrierung ab.");
    }
    return { branch, status: statusOutput === "" ? [] : statusOutput.split(/\r?\n/u) };
  }
}
