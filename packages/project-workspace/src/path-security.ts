import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { WorkspaceConfig } from "./config.js";
import type { ProjectId } from "@software-builder/core";
import type { ProjectRevision } from "./types.js";
import { WorkspaceError } from "./types.js";

const reservedWindowsSegment = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const safeSegment = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;

function comparable(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function samePath(left: string, right: string): boolean {
  return comparable(left) === comparable(right);
}

export function isPathWithin(parent: string, child: string, allowEqual = false): boolean {
  const childRelative = relative(parent, child);
  if (childRelative === "") return allowEqual;
  return !childRelative.startsWith(`..${sep}`) && childRelative !== ".." && !isAbsolute(childRelative);
}

function assertSafeSegment(segment: string): void {
  if (
    segment === "" ||
    segment === "." ||
    segment === ".." ||
    !safeSegment.test(segment) ||
    reservedWindowsSegment.test(segment) ||
    segment.endsWith(".") ||
    segment.endsWith(" ")
  ) {
    throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Der Builder-Workspace-Pfad enthaelt ein unzulaessiges Segment.");
  }
}

export function assertSafeRelativePath(value: string): void {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 512 ||
    value.includes("\\") ||
    value.includes(":") ||
    value.startsWith("/") ||
    value.startsWith("//") ||
    /^[A-Za-z]:/.test(value) ||
    isAbsolute(value)
  ) {
    throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Absolute, UNC-, Laufwerks- oder Backslash-Pfade sind nicht zulaessig.");
  }
  const segments = value.split("/");
  if (segments.length !== 2) {
    throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Workspace-Pfade muessen die feste zweistufige Builder-Struktur verwenden.");
  }
  segments.forEach(assertSafeSegment);
}

export function deriveWorkspaceRelativePath(projectId: ProjectId, projectRevision: ProjectRevision): string {
  const value = `${projectId}/revision-${projectRevision}`;
  assertSafeRelativePath(value);
  return value;
}

export function deriveWorkspaceGitBranch(projectId: ProjectId, projectRevision: ProjectRevision): string {
  return `builder/project-${projectId.slice(0, 8)}/revision-${projectRevision.slice(0, 16)}`;
}

async function assertPlainDirectory(path: string, label: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", `${label} darf kein Symlink, keine Junction und keine Datei sein.`);
  }
}

export class WorkspacePathGuard {
  constructor(private readonly config: WorkspaceConfig) {}

  private async assertStableRoot(): Promise<void> {
    await assertPlainDirectory(this.config.workspaceRoot, "Workspace-Root");
    const current = await realpath(this.config.workspaceRoot);
    if (!samePath(current, this.config.canonicalWorkspaceRoot)) {
      throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Der kanonische Workspace-Root hat sich geaendert.");
    }
  }

  resolveRelative(relativePath: string): string {
    assertSafeRelativePath(relativePath);
    const target = resolve(this.config.canonicalWorkspaceRoot, ...relativePath.split("/"));
    if (!isPathWithin(this.config.canonicalWorkspaceRoot, target)) {
      throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Workspace-Ziel liegt ausserhalb des konfigurierten Roots.");
    }
    return target;
  }

  async inspect(relativePath: string, mustExist = true): Promise<string> {
    await this.assertStableRoot();
    const target = this.resolveRelative(relativePath);
    const segments = relativePath.split("/");
    let current = this.config.canonicalWorkspaceRoot;
    for (let index = 0; index < segments.length; index += 1) {
      current = join(current, segments[index]!);
      let info;
      try {
        info = await lstat(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" && !mustExist) return target;
        throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Workspace-Pfad konnte nicht sicher geprueft werden.", { cause: error });
      }
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Workspace-Pfad enthaelt einen Symlink, eine Junction oder eine Datei.");
      }
      const canonical = await realpath(current);
      if (!isPathWithin(this.config.canonicalWorkspaceRoot, canonical)) {
        throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Workspace-Pfad verlaesst ueber eine kanonische Umleitung den Root.");
      }
      if (!samePath(canonical, current)) {
        throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Workspace-Pfad enthaelt eine kanonische Umleitung.");
      }
    }
    return target;
  }

  async createTarget(relativePath: string): Promise<string> {
    await this.assertStableRoot();
    const target = this.resolveRelative(relativePath);
    const [projectSegment] = relativePath.split("/");
    const projectDirectory = join(this.config.canonicalWorkspaceRoot, projectSegment!);
    try {
      await mkdir(projectDirectory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    await this.inspect(projectSegment! + "/placeholder", false);
    try {
      await mkdir(target, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new WorkspaceError("WORKSPACE_FOREIGN_CONTENT", "Der registrierte Workspace-Zielordner existiert bereits ohne sichere Uebernahme.", { cause: error });
      }
      throw error;
    }
    return this.inspect(relativePath, true);
  }

  async assertContainedExistingPath(relativePath: string, childName: string): Promise<string> {
    const workspace = await this.inspect(relativePath, true);
    if (childName.includes("/") || childName.includes("\\") || childName === "." || childName === "..") {
      throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Workspace-Kindpfad ist ungueltig.");
    }
    const child = join(workspace, childName);
    const info = await lstat(child);
    if (info.isSymbolicLink()) throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Workspace-Kindpfad ist ein Symlink oder eine Junction.");
    const canonical = await realpath(child);
    if (!isPathWithin(this.config.canonicalWorkspaceRoot, canonical)) {
      throw new WorkspaceError("WORKSPACE_PATH_UNSAFE", "Workspace-Kindpfad liegt ausserhalb des Roots.");
    }
    return child;
  }
}
