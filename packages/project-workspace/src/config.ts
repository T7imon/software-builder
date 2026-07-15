import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WorkspaceError } from "./types.js";

export interface WorkspaceConfig {
  readonly workspaceRoot: string;
  readonly canonicalWorkspaceRoot: string;
  readonly builderRepositoryRoot: string;
}

export interface WorkspaceConfigOptions {
  readonly builderRepositoryRoot?: string;
}

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function isWithin(parent: string, child: string): boolean {
  const childRelative = relative(parent, child);
  return childRelative === "" || (!childRelative.startsWith(`..${sep}`) && childRelative !== ".." && !isAbsolute(childRelative));
}

async function canonicalExistingDirectory(value: string, label: string): Promise<string> {
  let info;
  try {
    info = await lstat(value);
  } catch (error) {
    throw new WorkspaceError("WORKSPACE_CONFIGURATION_UNSAFE", `${label} muss als vorhandenes Verzeichnis konfiguriert sein.`, { cause: error });
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new WorkspaceError("WORKSPACE_CONFIGURATION_UNSAFE", `${label} darf kein Symlink, keine Junction und keine Datei sein.`);
  }
  const canonical = await realpath(value);
  if (!samePath(canonical, resolve(value))) {
    throw new WorkspaceError("WORKSPACE_CONFIGURATION_UNSAFE", `${label} darf keine kanonische Umleitung enthalten.`);
  }
  return canonical;
}

export async function loadWorkspaceConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  options: WorkspaceConfigOptions = {},
): Promise<WorkspaceConfig> {
  const configured = environment.BUILDER_WORKSPACE_ROOT;
  if (!configured || configured.trim() !== configured || !isAbsolute(configured)) {
    throw new WorkspaceError("WORKSPACE_CONFIGURATION_UNSAFE", "BUILDER_WORKSPACE_ROOT muss explizit als absoluter Pfad gesetzt sein.");
  }
  if (process.platform === "win32" && (configured.startsWith("\\\\") || !/^[A-Za-z]:[\\/]/.test(configured))) {
    throw new WorkspaceError("WORKSPACE_CONFIGURATION_UNSAFE", "BUILDER_WORKSPACE_ROOT muss ein lokales Windows-Laufwerk und darf kein UNC-/Device-Pfad sein.");
  }
  const workspaceRoot = resolve(configured);
  if (samePath(workspaceRoot, parse(workspaceRoot).root)) {
    throw new WorkspaceError("WORKSPACE_CONFIGURATION_UNSAFE", "BUILDER_WORKSPACE_ROOT darf kein Dateisystem-Wurzelverzeichnis sein.");
  }
  const repositoryInput = resolve(options.builderRepositoryRoot ?? defaultRepositoryRoot);
  const [canonicalWorkspaceRoot, builderRepositoryRoot] = await Promise.all([
    canonicalExistingDirectory(workspaceRoot, "BUILDER_WORKSPACE_ROOT"),
    canonicalExistingDirectory(repositoryInput, "Builder-Repository-Root"),
  ]);
  if (isWithin(builderRepositoryRoot, canonicalWorkspaceRoot)) {
    throw new WorkspaceError(
      "WORKSPACE_CONFIGURATION_UNSAFE",
      "BUILDER_WORKSPACE_ROOT darf weder das Builder-Repository noch ein Verzeichnis darin sein.",
    );
  }
  return { workspaceRoot, canonicalWorkspaceRoot, builderRepositoryRoot };
}
