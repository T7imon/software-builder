import { createRequire } from "node:module";
import { constants, type Stats } from "node:fs";
import { lstat, open, readFile, readdir, realpath, type FileHandle } from "node:fs/promises";
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

function pathsOverlap(left: string, right: string): boolean {
  return within(left, right) || within(right, left);
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

interface CodexAuthMetadata {
  readonly path: string;
  readonly info: Stats;
}

export interface CodexRunAuthFileReceipt {
  readonly dev: number;
  readonly ino: number;
  readonly nlink: number;
  readonly size: number;
  readonly mode: number;
  readonly uid: number;
  readonly gid: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  readonly birthtimeMs: number;
}

export type CodexRunAuthProvisioningReceipt =
  | { readonly status: "ABSENT" }
  | { readonly status: "PRESENT"; readonly file: CodexRunAuthFileReceipt };

function sameFileIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableFileMetadata(left: Stats, right: Stats): boolean {
  return (
    sameFileIdentity(left, right) &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    left.birthtimeMs === right.birthtimeMs
  );
}

function codexRunAuthFileReceipt(info: Stats): CodexRunAuthFileReceipt {
  return {
    dev: info.dev,
    ino: info.ino,
    nlink: info.nlink,
    size: info.size,
    mode: info.mode,
    uid: info.uid,
    gid: info.gid,
    mtimeMs: info.mtimeMs,
    ctimeMs: info.ctimeMs,
    birthtimeMs: info.birthtimeMs,
  };
}

export function codexRunAuthFileMatchesReceipt(info: Stats, receipt: CodexRunAuthFileReceipt): boolean {
  return (
    info.dev === receipt.dev &&
    info.ino === receipt.ino &&
    info.nlink === receipt.nlink &&
    info.size === receipt.size &&
    info.mode === receipt.mode &&
    info.uid === receipt.uid &&
    info.gid === receipt.gid &&
    info.mtimeMs === receipt.mtimeMs &&
    info.ctimeMs === receipt.ctimeMs &&
    info.birthtimeMs === receipt.birthtimeMs
  );
}

function credentialError(): CodexCliConfigurationError {
  return new CodexCliConfigurationError(
    "BUILDER_CODEX_HOME_UNSAFE",
    "BUILDER_CODEX_HOME credential metadata is unsafe",
  );
}

async function inspectCodexAuth(canonicalHome: string): Promise<CodexAuthMetadata | undefined> {
  const authPath = join(canonicalHome, "auth.json");
  let info: Stats;
  try {
    info = await lstat(authPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw credentialError();
  }
  let canonicalAuth: string;
  try {
    canonicalAuth = await realpath(authPath);
  } catch {
    throw credentialError();
  }
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    !samePath(canonicalAuth, resolve(authPath)) ||
    !within(canonicalHome, canonicalAuth)
  ) {
    throw credentialError();
  }
  return { path: authPath, info };
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
    "code_mode",
    "--disable",
    "code_mode_only",
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
  if (pathsOverlap(canonicalHome, normalHome)) {
    throw new CodexCliConfigurationError(
      "BUILDER_CODEX_HOME_UNSAFE",
      "BUILDER_CODEX_HOME must not overlap the Builder process default CODEX_HOME",
    );
  }
  try {
    if (pathsOverlap(canonicalHome, await realpath(normalHome))) {
      throw new CodexCliConfigurationError(
        "BUILDER_CODEX_HOME_UNSAFE",
        "BUILDER_CODEX_HOME resolves into the Builder process default CODEX_HOME",
      );
    }
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
  try {
    await inspectCodexAuth(canonicalHome);
  } catch (error) {
    if (error instanceof CodexCliConfigurationError) throw error;
    throw credentialError();
  }
  return canonicalHome;
}

export function buildCodexChildEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of childEnvironmentKeys) {
    const matching = Object.keys(source).find((candidate) => process.platform === "win32" ? candidate.toLowerCase() === key.toLowerCase() : candidate === key);
    const value = matching === undefined ? undefined : source[matching];
    if (value !== undefined && value.length > 0) result[key] = value;
  }
  return result;
}

export async function provisionCodexRunAuth(
  builderCodexHome: string,
  runCodexHome: string,
): Promise<CodexRunAuthProvisioningReceipt> {
  const [canonicalBuilderHome, canonicalRunHome] = await Promise.all([
    canonicalDirectory(builderCodexHome, "BUILDER_CODEX_HOME_UNSAFE", "BUILDER_CODEX_HOME"),
    canonicalDirectory(runCodexHome, "CODEX_RUN_HOME_UNSAFE", "Codex run home"),
  ]);
  if (pathsOverlap(canonicalBuilderHome, canonicalRunHome)) {
    throw new CodexCliConfigurationError("CODEX_RUN_HOME_UNSAFE", "Codex run home must not overlap the credential home");
  }
  const targetPath = join(canonicalRunHome, "auth.json");
  try {
    await lstat(targetPath);
    throw new CodexCliConfigurationError("CODEX_RUN_HOME_UNSAFE", "Codex run credential target must not exist");
  } catch (error) {
    if (error instanceof CodexCliConfigurationError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new CodexCliConfigurationError("CODEX_RUN_HOME_UNSAFE", "Codex run credential target is unsafe");
    }
  }
  const initial = await inspectCodexAuth(canonicalBuilderHome);
  if (initial === undefined) return { status: "ABSENT" };

  let source: FileHandle | undefined;
  let target: FileHandle | undefined;
  let receipt: CodexRunAuthProvisioningReceipt | undefined;
  let closeFailed = false;
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    source = await open(initial.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await source.stat();
    const immediatelyBeforeCopy = await inspectCodexAuth(canonicalBuilderHome);
    if (
      immediatelyBeforeCopy === undefined ||
      !opened.isFile() ||
      opened.nlink !== 1 ||
      !Number.isSafeInteger(opened.size) ||
      opened.size < 0 ||
      !sameStableFileMetadata(initial.info, opened) ||
      !sameStableFileMetadata(opened, immediatelyBeforeCopy.info)
    ) {
      throw credentialError();
    }

    target = await open(
      targetPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    let position = 0;
    while (position < opened.size) {
      const length = Math.min(buffer.byteLength, opened.size - position);
      const { bytesRead } = await source.read(buffer, 0, length, position);
      if (bytesRead !== length) throw credentialError();
      let offset = 0;
      while (offset < bytesRead) {
        const { bytesWritten } = await target.write(buffer, offset, bytesRead - offset, position + offset);
        if (bytesWritten <= 0) throw credentialError();
        offset += bytesWritten;
      }
      position += bytesRead;
    }
    await target.sync();

    const [sourceAfterCopy, pathAfterCopy, targetInfo] = await Promise.all([
      source.stat(),
      inspectCodexAuth(canonicalBuilderHome),
      target.stat(),
    ]);
    if (
      pathAfterCopy === undefined ||
      !sameStableFileMetadata(opened, sourceAfterCopy) ||
      !sameStableFileMetadata(sourceAfterCopy, pathAfterCopy.info) ||
      !targetInfo.isFile() ||
      targetInfo.nlink !== 1 ||
      targetInfo.size !== opened.size
    ) {
      throw credentialError();
    }
    receipt = { status: "PRESENT", file: codexRunAuthFileReceipt(targetInfo) };
  } catch (error) {
    if (error instanceof CodexCliConfigurationError) throw error;
    throw credentialError();
  } finally {
    buffer.fill(0);
    const closeResults = await Promise.allSettled([
      ...(source === undefined ? [] : [source.close()]),
      ...(target === undefined ? [] : [target.close()]),
    ]);
    closeFailed = closeResults.some((result) => result.status === "rejected");
  }
  if (closeFailed) {
    throw new CodexCliConfigurationError("CODEX_RUN_HOME_UNSAFE", "Codex run credential target is unsafe");
  }

  try {
    const [targetInfo, canonicalTarget] = await Promise.all([lstat(targetPath), realpath(targetPath)]);
    if (
      receipt?.status !== "PRESENT" ||
      !targetInfo.isFile() ||
      targetInfo.isSymbolicLink() ||
      targetInfo.nlink !== 1 ||
      !samePath(canonicalTarget, resolve(targetPath)) ||
      !within(canonicalRunHome, canonicalTarget) ||
      !codexRunAuthFileMatchesReceipt(targetInfo, receipt.file)
    ) {
      throw new CodexCliConfigurationError("CODEX_RUN_HOME_UNSAFE", "Codex run credential target is unsafe");
    }
  } catch (error) {
    if (error instanceof CodexCliConfigurationError) throw error;
    throw new CodexCliConfigurationError("CODEX_RUN_HOME_UNSAFE", "Codex run credential target is unsafe");
  }
  return receipt;
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
