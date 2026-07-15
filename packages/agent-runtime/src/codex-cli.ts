import { createRequire } from "node:module";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CODEX_CLI_PACKAGE, CODEX_CLI_VERSION } from "./codex-schemas.js";

export interface ResolvedCodexCli {
  readonly packageName: typeof CODEX_CLI_PACKAGE;
  readonly packageVersion: typeof CODEX_CLI_VERSION;
  readonly packageRoot: string;
  readonly binPath: string;
}

export interface CodexCliArgumentsInput {
  readonly workspacePath: string;
  readonly outputSchemaPath?: string;
  readonly model?: string;
}

export interface CodexHomeValidationInput {
  readonly configuredHome: string | undefined;
  readonly repositoryRoot: string;
  readonly workspacePath: string;
  readonly processCodexHome?: string;
  readonly defaultUserHome?: string;
}

export class CodexCliConfigurationError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CodexCliConfigurationError";
  }
}

const require = createRequire(import.meta.url);
const modelPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const forbiddenCodexFiles = new Set([
  ".codex.json",
  ".codex.toml",
  ".codexrc",
  ".codexrc.json",
  ".codexrc.toml",
  ".mcp.json",
  ".mcp.toml",
  ".mcp.yaml",
  ".mcp.yml",
  ".plugins.json",
  ".plugins.toml",
  "codex.config.json",
  "codex.config.toml",
  "codex.config.yaml",
  "codex.config.yml",
  "codex.json",
  "codex.toml",
  "mcp.json",
  "mcp.toml",
  "mcp.yaml",
  "mcp.yml",
  "plugins.json",
  "plugins.toml",
]);
const forbiddenCodexDirectories = new Set([".agents", ".codex", ".codex-plugin"]);
const forbiddenDedicatedHomeExtensions = [".agents", "plugins", "skills"] as const;
const childEnvironmentKeys = ["PATH", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP"] as const;

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function within(parent: string, child: string): boolean {
  const value = relative(parent, child);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function assertContained(parent: string, child: string, code: string, message: string): void {
  if (!within(parent, child)) throw new CodexCliConfigurationError(code, message);
}

async function canonicalDirectory(value: string, code: string, label: string): Promise<string> {
  let info;
  try {
    info = await lstat(value);
  } catch (error) {
    throw new CodexCliConfigurationError(code, `${label} must exist as a directory`, { cause: error });
  }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new CodexCliConfigurationError(code, `${label} must be a physical directory`);
  const canonical = await realpath(value);
  if (!samePath(canonical, resolve(value))) throw new CodexCliConfigurationError(code, `${label} must not contain a symlink or junction redirect`);
  return canonical;
}

export async function resolvePinnedCodexCli(repositoryRoot: string): Promise<ResolvedCodexCli> {
  const canonicalRepository = await canonicalDirectory(repositoryRoot, "CODEX_CLI_UNSAFE", "Builder repository root");
  const canonicalNodeModules = await canonicalDirectory(join(canonicalRepository, "node_modules"), "CODEX_CLI_NOT_INSTALLED", "Project node_modules");
  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve(`${CODEX_CLI_PACKAGE}/package.json`);
  } catch (error) {
    throw new CodexCliConfigurationError("CODEX_CLI_NOT_INSTALLED", "The pinned local Codex CLI package is unavailable", { cause: error });
  }
  const canonicalPackageJson = await realpath(packageJsonPath);
  assertContained(canonicalNodeModules, canonicalPackageJson, "CODEX_CLI_UNSAFE", "Codex package resolved outside project node_modules");
  const packageRoot = dirname(canonicalPackageJson);
  const packageInfo = await lstat(canonicalPackageJson);
  if (!packageInfo.isFile() || packageInfo.isSymbolicLink() || packageInfo.size > 64 * 1024) {
    throw new CodexCliConfigurationError("CODEX_CLI_UNSAFE", "Codex package metadata is not a bounded physical file");
  }
  let metadata: unknown;
  try {
    metadata = JSON.parse(await readFile(canonicalPackageJson, "utf8"));
  } catch (error) {
    throw new CodexCliConfigurationError("CODEX_CLI_UNSAFE", "Codex package metadata is invalid", { cause: error });
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new CodexCliConfigurationError("CODEX_CLI_UNSAFE", "Codex package metadata is invalid");
  const record = metadata as Record<string, unknown>;
  const bin = record.bin;
  if (
    record.name !== CODEX_CLI_PACKAGE ||
    record.version !== CODEX_CLI_VERSION ||
    !bin ||
    typeof bin !== "object" ||
    Array.isArray(bin) ||
    (bin as Record<string, unknown>).codex !== "bin/codex.js"
  ) {
    throw new CodexCliConfigurationError("CODEX_CLI_VERSION_MISMATCH", "Codex package name, version, or bin metadata differs from the pinned contract");
  }
  const expectedBin = resolve(packageRoot, "bin/codex.js");
  assertContained(packageRoot, expectedBin, "CODEX_CLI_UNSAFE", "Codex bin metadata escapes its package");
  const canonicalBin = await realpath(expectedBin).catch((error: unknown) => {
    throw new CodexCliConfigurationError("CODEX_CLI_NOT_INSTALLED", "Codex JavaScript launcher is unavailable", { cause: error });
  });
  assertContained(packageRoot, canonicalBin, "CODEX_CLI_UNSAFE", "Codex JavaScript launcher resolves outside its package");
  const binInfo = await lstat(canonicalBin);
  if (!binInfo.isFile() || binInfo.isSymbolicLink()) throw new CodexCliConfigurationError("CODEX_CLI_UNSAFE", "Codex JavaScript launcher must be a physical file");
  return { packageName: CODEX_CLI_PACKAGE, packageVersion: CODEX_CLI_VERSION, packageRoot, binPath: canonicalBin };
}

export const codexPlannerOutputSchemaPath = fileURLToPath(new URL("../src/codex-planner-output.schema.json", import.meta.url));

export function buildCodexExecArguments(input: CodexCliArgumentsInput): readonly string[] {
  if (!isAbsolute(input.workspacePath)) throw new CodexCliConfigurationError("CODEX_WORKSPACE_UNSAFE", "Codex working directory must be absolute");
  const schemaPath = input.outputSchemaPath ?? codexPlannerOutputSchemaPath;
  if (!isAbsolute(schemaPath)) throw new CodexCliConfigurationError("CODEX_SCHEMA_UNSAFE", "Codex output schema path must be absolute");
  if (input.model !== undefined && !modelPattern.test(input.model)) throw new CodexCliConfigurationError("CODEX_MODEL_INVALID", "CODEX_MODEL is invalid");
  return [
    "--ask-for-approval",
    "never",
    "exec",
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--json",
    "--strict-config",
    "--disable",
    "plugins",
    "--disable",
    "apps",
    "--disable",
    "hooks",
    "--disable",
    "multi_agent",
    "--disable",
    "browser_use",
    "--disable",
    "browser_use_external",
    "--disable",
    "browser_use_full_cdp_access",
    "--disable",
    "in_app_browser",
    "--disable",
    "remote_plugin",
    "--disable",
    "plugin_sharing",
    "--disable",
    "enable_mcp_apps",
    "--disable",
    "auth_elicitation",
    "--disable",
    "code_mode_host",
    "--disable",
    "computer_use",
    "--disable",
    "image_generation",
    "--disable",
    "skill_mcp_dependency_install",
    "--disable",
    "tool_call_mcp_elicitation",
    "--sandbox",
    "read-only",
    "--cd",
    input.workspacePath,
    "--output-schema",
    schemaPath,
    "--color",
    "never",
    "--config",
    'web_search="disabled"',
    "--config",
    'shell_environment_policy.inherit="none"',
    ...(input.model === undefined ? [] : ["--model", input.model]),
    "-",
  ];
}

export async function validateBuilderCodexHome(input: CodexHomeValidationInput): Promise<string> {
  const value = input.configuredHome;
  if (!value || value.trim() !== value || !isAbsolute(value)) {
    throw new CodexCliConfigurationError("BUILDER_CODEX_HOME_REQUIRED", "BUILDER_CODEX_HOME must be an explicit absolute path");
  }
  if (process.platform === "win32" && (value.startsWith("\\\\") || !/^[A-Za-z]:[\\/]/u.test(value))) {
    throw new CodexCliConfigurationError("BUILDER_CODEX_HOME_UNSAFE", "BUILDER_CODEX_HOME must be a local Windows path");
  }
  const configured = resolve(value);
  if (samePath(configured, parse(configured).root)) throw new CodexCliConfigurationError("BUILDER_CODEX_HOME_UNSAFE", "BUILDER_CODEX_HOME must not be a filesystem root");
  const [canonicalHome, canonicalRepository, canonicalWorkspace] = await Promise.all([
    canonicalDirectory(configured, "BUILDER_CODEX_HOME_UNSAFE", "BUILDER_CODEX_HOME"),
    canonicalDirectory(input.repositoryRoot, "BUILDER_CODEX_HOME_UNSAFE", "Builder repository root"),
    canonicalDirectory(input.workspacePath, "BUILDER_CODEX_HOME_UNSAFE", "Target workspace"),
  ]);
  if (
    within(canonicalRepository, canonicalHome) ||
    within(canonicalHome, canonicalRepository) ||
    within(canonicalWorkspace, canonicalHome) ||
    within(canonicalHome, canonicalWorkspace)
  ) {
    throw new CodexCliConfigurationError("BUILDER_CODEX_HOME_UNSAFE", "BUILDER_CODEX_HOME must not overlap the repository or target workspace");
  }
  const normalHome = resolve(input.processCodexHome ?? join(input.defaultUserHome ?? homedir(), ".codex"));
  if (samePath(canonicalHome, normalHome)) throw new CodexCliConfigurationError("BUILDER_CODEX_HOME_UNSAFE", "BUILDER_CODEX_HOME must differ from the Builder process default CODEX_HOME");
  try {
    if (samePath(canonicalHome, await realpath(normalHome))) throw new CodexCliConfigurationError("BUILDER_CODEX_HOME_UNSAFE", "BUILDER_CODEX_HOME resolves to the Builder process default CODEX_HOME");
  } catch (error) {
    if (error instanceof CodexCliConfigurationError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new CodexCliConfigurationError("BUILDER_CODEX_HOME_UNSAFE", "Default CODEX_HOME could not be verified", { cause: error });
  }
  for (const entry of forbiddenDedicatedHomeExtensions) {
    try {
      await lstat(join(canonicalHome, entry));
      throw new CodexCliConfigurationError(
        "BUILDER_CODEX_HOME_UNSAFE",
        "BUILDER_CODEX_HOME must not contain inherited skills, plugins, or .agents extensions",
      );
    } catch (error) {
      if (error instanceof CodexCliConfigurationError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new CodexCliConfigurationError("BUILDER_CODEX_HOME_UNSAFE", "BUILDER_CODEX_HOME extensions could not be verified", { cause: error });
      }
    }
  }
  const authPath = join(canonicalHome, "auth.json");
  try {
    const authInfo = await lstat(authPath);
    const canonicalAuth = await realpath(authPath);
    if (
      !authInfo.isFile() ||
      authInfo.isSymbolicLink() ||
      authInfo.nlink !== 1 ||
      !samePath(canonicalAuth, resolve(authPath)) ||
      !within(canonicalHome, canonicalAuth)
    ) {
      throw new CodexCliConfigurationError(
        "BUILDER_CODEX_HOME_UNSAFE",
        "BUILDER_CODEX_HOME credential metadata is unsafe",
      );
    }
  } catch (error) {
    if (error instanceof CodexCliConfigurationError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new CodexCliConfigurationError(
        "BUILDER_CODEX_HOME_UNSAFE",
        "BUILDER_CODEX_HOME credential metadata could not be verified",
        { cause: error },
      );
    }
  }
  return canonicalHome;
}

export function buildCodexChildEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  builderCodexHome: string,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { CODEX_HOME: builderCodexHome };
  for (const key of childEnvironmentKeys) {
    const matching = Object.keys(source).find((candidate) => process.platform === "win32" ? candidate.toLowerCase() === key.toLowerCase() : candidate === key);
    const value = matching === undefined ? undefined : source[matching];
    if (value !== undefined && value.length > 0) result[key] = value;
  }
  return result;
}

export async function assertNoProjectCodexConfiguration(workspacePath: string): Promise<void> {
  const root = await canonicalDirectory(workspacePath, "CODEX_WORKSPACE_UNSAFE", "Target workspace");
  const pending: { path: string; depth: number }[] = [{ path: root, depth: 0 }];
  let inspected = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.depth > 32) throw new CodexCliConfigurationError("CODEX_WORKSPACE_UNSAFE", "Workspace tree exceeds the verification depth limit");
    for (const entry of await readdir(current.path, { withFileTypes: true })) {
      if (++inspected > 10_000) throw new CodexCliConfigurationError("CODEX_WORKSPACE_UNSAFE", "Workspace tree exceeds the verification entry limit");
      if (current.depth === 0 && entry.name === ".git") continue;
      const name = entry.name.toLowerCase();
      if (forbiddenCodexDirectories.has(name) || forbiddenCodexFiles.has(name)) {
        throw new CodexCliConfigurationError("CODEX_PROJECT_CONFIG_FORBIDDEN", "Project-local Codex, plugin, or MCP configuration is forbidden");
      }
      const absolute = join(current.path, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new CodexCliConfigurationError("CODEX_WORKSPACE_UNSAFE", "Workspace symlinks and junctions are forbidden for the Codex MVP");
      if (entry.isDirectory()) pending.push({ path: absolute, depth: current.depth + 1 });
    }
  }
}
