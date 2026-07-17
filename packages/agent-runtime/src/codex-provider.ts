import { spawn } from "node:child_process";
import type { Stats } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import {
  buildCodexExecArguments,
  codexRunAuthFileMatchesReceipt,
  provisionCodexRunAuth,
  type CodexRunAuthProvisioningReceipt,
  type ResolvedCodexCli,
} from "./codex-cli.js";
import {
  containsCodexSecretMaterial,
  parseCodexPlannerOutput,
  type CodexPlannerOutput,
  type CodexProviderMetadata,
  type CodexUsage,
} from "./codex-schemas.js";

export type CodexPolicyEvent = "MCP_TOOL_CALL" | "WEB_SEARCH" | "FORBIDDEN_INTEGRATION";
export type CodexProviderErrorCode =
  | "CODEX_CANCELLED"
  | "CODEX_TIMEOUT"
  | "CODEX_SPAWN_FAILED"
  | "CODEX_PROCESS_FAILED"
  | "CODEX_JSONL_INVALID"
  | "CODEX_OUTPUT_INVALID"
  | "CODEX_OUTPUT_FAILED"
  | "CODEX_SECURITY_POLICY_VIOLATION";

export class CodexProviderError extends Error {
  constructor(readonly code: CodexProviderErrorCode, readonly policyEvent?: CodexPolicyEvent) {
    super(code);
    this.name = "CodexProviderError";
  }
}

export interface CodexProviderRequest {
  readonly cli: ResolvedCodexCli;
  readonly workspacePath: string;
  readonly repositoryRoot: string;
  readonly builderCodexHome: string;
  readonly outputSchemaPath: string;
  readonly prompt: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  readonly model?: string;
  readonly signal?: AbortSignal;
}

export interface CodexProviderResponse extends CodexProviderMetadata {
  readonly output: CodexPlannerOutput;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface CodexProcessSpec {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly workingDirectory: string;
  readonly environment: NodeJS.ProcessEnv;
}

export interface CodexProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface CodexChildProcess {
  readonly stdout: AsyncIterable<Uint8Array | string>;
  readonly stderr: AsyncIterable<Uint8Array | string>;
  writePrompt(prompt: string): Promise<void>;
  wait(): Promise<CodexProcessExit>;
  kill(): void;
}

export interface CodexProcessLauncher {
  start(spec: CodexProcessSpec): CodexChildProcess;
}

class SpawnedCodexChild implements CodexChildProcess {
  readonly stdout: Readable;
  readonly stderr: Readable;
  private readonly stdin: NonNullable<ReturnType<typeof spawn>["stdin"]>;
  private readonly exit: Promise<CodexProcessExit>;
  constructor(private readonly child: ReturnType<typeof spawn>) {
    if (!child.stdout || !child.stderr || !child.stdin) throw new CodexProviderError("CODEX_SPAWN_FAILED");
    this.stdout = child.stdout;
    this.stderr = child.stderr;
    this.stdin = child.stdin;
    this.stdin.on("error", () => {
      // The one-shot write promise below reports EPIPE. This listener prevents a later stream error from crashing the worker.
    });
    this.exit = new Promise((resolve, reject) => {
      child.once("error", () => reject(new CodexProviderError("CODEX_SPAWN_FAILED")));
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
  }
  writePrompt(prompt: string): Promise<void> {
    if (this.stdin.destroyed) return Promise.reject(new CodexProviderError("CODEX_SPAWN_FAILED"));
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: CodexProviderError): void => {
        if (settled) return;
        settled = true;
        this.stdin.off("error", onError);
        if (error) reject(error);
        else resolve();
      };
      const onError = (): void => finish(new CodexProviderError("CODEX_SPAWN_FAILED"));
      this.stdin.once("error", onError);
      this.stdin.end(prompt, "utf8", () => finish());
    });
  }
  wait(): Promise<CodexProcessExit> {
    return this.exit;
  }
  kill(): void {
    try {
      this.child.kill();
    } catch {
      // Best effort only. This DEVELOPMENT_ONLY adapter makes no process-tree termination claim.
    }
  }
}

export class NodeCodexProcessLauncher implements CodexProcessLauncher {
  start(spec: CodexProcessSpec): CodexChildProcess {
    return new SpawnedCodexChild(spawn(spec.executable, [...spec.arguments], {
      cwd: spec.workingDirectory,
      env: spec.environment,
      shell: false,
      windowsHide: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    }));
  }
}

interface JsonlSummary extends CodexProviderMetadata {
  readonly finalMessage: string | null;
  readonly failed: boolean;
}

const safeReference = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const safeModel = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const mcpTypes = new Set(["mcp_tool_call", "mcp_call"]);
const webTypes = new Set(["web_search", "web_search_call", "web_search_request"]);
const forbiddenIntegrationType = /(?:browser|computer|subagent|multi_agent|plugin|app_tool|hook|spawn_agent|collab|file_change|image_generation)/u;
const childEnvironmentKeys = new Set([
  "CODEX_HOME",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "HOME",
]);
const controlledHomeEnvironmentKeys = new Set(["CODEX_HOME", "HOME", "USERPROFILE"]);
const runRootPrefix = "builder-codex-run-";
const maxTempRootEntries = 10_000;

function finiteToken(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function parseUsage(value: unknown): CodexUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const inputTokens = finiteToken(record.input_tokens);
  const cachedInputTokens = finiteToken(record.cached_input_tokens);
  const outputTokens = finiteToken(record.output_tokens);
  if (inputTokens === undefined && cachedInputTokens === undefined && outputTokens === undefined) return undefined;
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
}

function policyType(value: unknown): CodexPolicyEvent | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (mcpTypes.has(normalized)) return "MCP_TOOL_CALL";
  if (webTypes.has(normalized)) return "WEB_SEARCH";
  if (forbiddenIntegrationType.test(normalized)) return "FORBIDDEN_INTEGRATION";
  return undefined;
}

export class CodexJsonlAccumulator {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private buffer = "";
  private bytes = 0;
  private events = 0;
  private threadId: string | undefined;
  private model: string | undefined;
  private usage: CodexUsage | undefined;
  private finalMessage: string | null = null;
  private failed = false;

  push(chunk: Uint8Array | string): void {
    let value: string;
    try {
      value = typeof chunk === "string"
        ? `${this.decoder.decode()}${chunk}`
        : this.decoder.decode(chunk, { stream: true });
    } catch {
      throw new CodexProviderError("CODEX_JSONL_INVALID");
    }
    this.bytes += typeof chunk === "string" ? Buffer.byteLength(chunk, "utf8") : chunk.byteLength;
    if (this.bytes > 8 * 1024 * 1024) throw new CodexProviderError("CODEX_JSONL_INVALID");
    this.append(value);
  }

  private append(value: string): void {
    this.buffer += value;
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline).replace(/\r$/u, "");
      this.buffer = this.buffer.slice(newline + 1);
      this.consumeLine(line);
    }
    if (Buffer.byteLength(this.buffer, "utf8") > 1024 * 1024) throw new CodexProviderError("CODEX_JSONL_INVALID");
  }

  finish(): JsonlSummary {
    try {
      this.append(this.decoder.decode());
    } catch {
      throw new CodexProviderError("CODEX_JSONL_INVALID");
    }
    if (this.buffer.length > 0) this.consumeLine(this.buffer.replace(/\r$/u, ""));
    this.buffer = "";
    return {
      finalMessage: this.finalMessage,
      failed: this.failed,
      ...(this.threadId === undefined ? {} : { threadId: this.threadId }),
      ...(this.model === undefined ? {} : { model: this.model }),
      ...(this.usage === undefined ? {} : { usage: this.usage }),
    };
  }

  private consumeLine(line: string): void {
    if (line.trim().length === 0) return;
    if (++this.events > 10_000 || Buffer.byteLength(line, "utf8") > 1024 * 1024) throw new CodexProviderError("CODEX_JSONL_INVALID");
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new CodexProviderError("CODEX_JSONL_INVALID");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new CodexProviderError("CODEX_JSONL_INVALID");
    const event = value as Record<string, unknown>;
    const item = event.item && typeof event.item === "object" && !Array.isArray(event.item) ? event.item as Record<string, unknown> : undefined;
    const forbidden = policyType(event.type) ?? policyType(item?.type);
    if (forbidden) throw new CodexProviderError("CODEX_SECURITY_POLICY_VIOLATION", forbidden);
    if (event.type === "thread.started" && typeof event.thread_id === "string" && safeReference.test(event.thread_id) && !containsCodexSecretMaterial(event.thread_id)) this.threadId = event.thread_id;
    if (event.type === "turn.started" || event.type === "turn.completed") {
      const candidateModel = typeof event.model === "string" ? event.model : typeof item?.model === "string" ? item.model : undefined;
      if (candidateModel !== undefined && safeModel.test(candidateModel) && !containsCodexSecretMaterial(candidateModel)) this.model = candidateModel;
      const candidateUsage = parseUsage(event.usage);
      if (candidateUsage !== undefined) this.usage = candidateUsage;
    }
    if (event.type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") {
      if (Buffer.byteLength(item.text, "utf8") > 1024 * 1024) throw new CodexProviderError("CODEX_OUTPUT_INVALID");
      this.finalMessage = item.text;
    }
    if (event.type === "turn.failed" || event.type === "error") this.failed = true;
  }
}

export function parseCodexJsonl(value: string): JsonlSummary {
  const parser = new CodexJsonlAccumulator();
  parser.push(value);
  return parser.finish();
}

async function drainBounded(stream: AsyncIterable<Uint8Array | string>): Promise<void> {
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += typeof chunk === "string" ? Buffer.byteLength(chunk, "utf8") : chunk.byteLength;
    if (bytes > 64 * 1024) throw new CodexProviderError("CODEX_PROCESS_FAILED");
  }
}

function pathWithin(parent: string, child: string): boolean {
  const value = relative(parent, child);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function pathsOverlap(left: string, right: string): boolean {
  return pathWithin(left, right) || pathWithin(right, left);
}

interface PhysicalDirectory {
  readonly canonical: string;
  readonly info: Stats;
}

interface DirectoryIdentityReceipt {
  readonly dev: number;
  readonly ino: number;
  readonly mode: number;
  readonly uid: number;
  readonly gid: number;
  readonly birthtimeMs: number;
}

async function inspectPhysicalDirectory(value: string): Promise<PhysicalDirectory> {
  let info: Stats;
  try {
    info = await lstat(value);
  } catch {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new CodexProviderError("CODEX_SPAWN_FAILED");
  let canonical: string;
  try {
    canonical = await realpath(value);
  } catch {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  if (!samePath(canonical, resolve(value))) throw new CodexProviderError("CODEX_SPAWN_FAILED");
  return { canonical, info };
}

function directoryIdentityReceipt(info: Stats): DirectoryIdentityReceipt {
  return {
    dev: info.dev,
    ino: info.ino,
    mode: info.mode,
    uid: info.uid,
    gid: info.gid,
    birthtimeMs: info.birthtimeMs,
  };
}

function directoryMatchesReceipt(info: Stats, receipt: DirectoryIdentityReceipt): boolean {
  return (
    info.dev === receipt.dev &&
    info.ino === receipt.ino &&
    info.mode === receipt.mode &&
    info.uid === receipt.uid &&
    info.gid === receipt.gid &&
    info.birthtimeMs === receipt.birthtimeMs
  );
}

interface IsolatedCodexRunHome {
  readonly root: string;
  readonly home: string;
  readonly codexHome: string;
  readonly tempRoot: string;
  readonly rootIdentity: DirectoryIdentityReceipt;
  readonly tempRootIdentity: DirectoryIdentityReceipt;
}

function isBoundedRunRoot(root: string, tempRoot: string): boolean {
  const name = basename(root);
  return (
    samePath(dirname(root), tempRoot) &&
    name.startsWith(runRootPrefix) &&
    name.length > runRootPrefix.length
  );
}

function assertRunDirectoryRelationships(
  runHome: IsolatedCodexRunHome,
  directories: {
    readonly tempRoot: string;
    readonly root: string;
    readonly home: string;
    readonly codexHome: string;
    readonly protectedPaths: readonly string[];
  },
): void {
  if (
    !samePath(directories.tempRoot, runHome.tempRoot) ||
    !samePath(directories.root, runHome.root) ||
    !isBoundedRunRoot(directories.root, directories.tempRoot) ||
    !samePath(directories.home, join(directories.root, "home")) ||
    !samePath(directories.codexHome, join(directories.root, "codex-home")) ||
    samePath(directories.home, directories.codexHome) ||
    directories.protectedPaths.some((value) => pathsOverlap(value, directories.root))
  ) {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
}

async function assertTempRootIdentity(runHome: IsolatedCodexRunHome): Promise<string> {
  const current = await inspectPhysicalDirectory(runHome.tempRoot);
  if (!directoryMatchesReceipt(current.info, runHome.tempRootIdentity)) {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  return current.canonical;
}

type OriginalRootState = "MATCH" | "MISSING" | "FOREIGN";

async function inspectOriginalRootState(runHome: IsolatedCodexRunHome): Promise<OriginalRootState> {
  let info: Stats;
  try {
    info = await lstat(runHome.root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "MISSING";
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  if (!info.isDirectory() || info.isSymbolicLink()) return "FOREIGN";
  let canonical: string;
  try {
    canonical = await realpath(runHome.root);
  } catch {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  if (!samePath(canonical, resolve(runHome.root))) return "FOREIGN";
  return directoryMatchesReceipt(info, runHome.rootIdentity) ? "MATCH" : "FOREIGN";
}

async function findDirectRootIdentityMatches(runHome: IsolatedCodexRunHome): Promise<readonly string[]> {
  const canonicalTempRoot = await assertTempRootIdentity(runHome);
  let names: string[];
  try {
    names = await readdir(canonicalTempRoot);
  } catch {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  if (names.length > maxTempRootEntries) throw new CodexProviderError("CODEX_SPAWN_FAILED");
  const matches: string[] = [];
  for (const name of names) {
    const candidate = join(canonicalTempRoot, name);
    let info: Stats;
    try {
      info = await lstat(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw new CodexProviderError("CODEX_SPAWN_FAILED");
    }
    if (!info.isDirectory() || info.isSymbolicLink() || !directoryMatchesReceipt(info, runHome.rootIdentity)) {
      continue;
    }
    let canonicalCandidate: string;
    try {
      canonicalCandidate = await realpath(candidate);
    } catch {
      throw new CodexProviderError("CODEX_SPAWN_FAILED");
    }
    if (
      !samePath(canonicalCandidate, resolve(candidate)) ||
      !samePath(dirname(canonicalCandidate), canonicalTempRoot)
    ) {
      throw new CodexProviderError("CODEX_SPAWN_FAILED");
    }
    matches.push(canonicalCandidate);
  }
  await assertTempRootIdentity(runHome);
  return matches;
}

async function assertDeletedRootIdentityAbsent(
  runHome: IsolatedCodexRunHome,
  deletedPath: string,
): Promise<void> {
  await assertTempRootIdentity(runHome);
  try {
    await lstat(deletedPath);
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  } catch (error) {
    if (error instanceof CodexProviderError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new CodexProviderError("CODEX_SPAWN_FAILED");
    }
  }
  if ((await findDirectRootIdentityMatches(runHome)).length !== 0) {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
}

async function removeVerifiedRootPath(runHome: IsolatedCodexRunHome, target: string): Promise<void> {
  const canonicalTempRoot = await assertTempRootIdentity(runHome);
  const current = await inspectPhysicalDirectory(target);
  if (
    !samePath(dirname(current.canonical), canonicalTempRoot) ||
    !directoryMatchesReceipt(current.info, runHome.rootIdentity)
  ) {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  try {
    await rm(current.canonical, { recursive: true, force: false });
  } catch {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  await assertDeletedRootIdentityAbsent(runHome, current.canonical);
}

async function removeIsolatedRunHome(runHome: IsolatedCodexRunHome): Promise<void> {
  if (!isBoundedRunRoot(runHome.root, runHome.tempRoot)) {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  await assertTempRootIdentity(runHome);
  const originalState = await inspectOriginalRootState(runHome);
  if (originalState === "MATCH") {
    await removeVerifiedRootPath(runHome, runHome.root);
    return;
  }
  const matches = await findDirectRootIdentityMatches(runHome);
  if (matches.length !== 1 || samePath(matches[0]!, runHome.root)) {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  await removeVerifiedRootPath(runHome, matches[0]!);
  if (originalState === "FOREIGN") throw new CodexProviderError("CODEX_SPAWN_FAILED");
}

async function createIsolatedRunHome(request: CodexProviderRequest): Promise<IsolatedCodexRunHome> {
  const tempDirectory = await inspectPhysicalDirectory(tmpdir());
  const tempRootIdentity = directoryIdentityReceipt(tempDirectory.info);
  let root: string;
  try {
    root = await mkdtemp(join(tempDirectory.canonical, runRootPrefix));
  } catch {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  let initialRootInfo: Stats;
  try {
    initialRootInfo = await lstat(root);
  } catch {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  let runHome: IsolatedCodexRunHome = {
    root: resolve(root),
    home: join(resolve(root), "home"),
    codexHome: join(resolve(root), "codex-home"),
    tempRoot: tempDirectory.canonical,
    rootIdentity: directoryIdentityReceipt(initialRootInfo),
    tempRootIdentity,
  };
  try {
    const initialRoot = await inspectPhysicalDirectory(root);
    if (!directoryMatchesReceipt(initialRoot.info, runHome.rootIdentity)) {
      throw new CodexProviderError("CODEX_SPAWN_FAILED");
    }
    runHome = {
      ...runHome,
      root: initialRoot.canonical,
      home: join(initialRoot.canonical, "home"),
      codexHome: join(initialRoot.canonical, "codex-home"),
    };
    await Promise.all([mkdir(runHome.home), mkdir(runHome.codexHome)]);
    const [currentTemp, currentRoot, currentHome, currentCodexHome, ...protectedDirectories] = await Promise.all([
      inspectPhysicalDirectory(runHome.tempRoot),
      inspectPhysicalDirectory(runHome.root),
      inspectPhysicalDirectory(runHome.home),
      inspectPhysicalDirectory(runHome.codexHome),
      inspectPhysicalDirectory(request.workspacePath),
      inspectPhysicalDirectory(request.repositoryRoot),
      inspectPhysicalDirectory(request.builderCodexHome),
    ]);
    if (
      !directoryMatchesReceipt(currentTemp.info, runHome.tempRootIdentity) ||
      !directoryMatchesReceipt(currentRoot.info, runHome.rootIdentity)
    ) {
      throw new CodexProviderError("CODEX_SPAWN_FAILED");
    }
    assertRunDirectoryRelationships(runHome, {
      tempRoot: currentTemp.canonical,
      root: currentRoot.canonical,
      home: currentHome.canonical,
      codexHome: currentCodexHome.canonical,
      protectedPaths: protectedDirectories.map((directory) => directory.canonical),
    });
    return runHome;
  } catch (error) {
    try {
      await removeIsolatedRunHome(runHome);
    } catch {
      throw new CodexProviderError("CODEX_SPAWN_FAILED");
    }
    if (error instanceof CodexProviderError) throw error;
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
}

function normalizedEnvironmentKey(key: string): string {
  return process.platform === "win32" ? key.toUpperCase() : key;
}

function buildRunChildEnvironment(
  source: NodeJS.ProcessEnv,
  runHome: IsolatedCodexRunHome,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (controlledHomeEnvironmentKeys.has(normalizedEnvironmentKey(key))) continue;
    environment[key] = value;
  }
  environment.CODEX_HOME = runHome.codexHome;
  environment.HOME = runHome.home;
  environment.USERPROFILE = runHome.home;
  return environment;
}

function assertChildEnvironment(
  request: CodexProviderRequest,
  runHome: IsolatedCodexRunHome,
  environment: NodeJS.ProcessEnv,
): void {
  if (
    environment.CODEX_HOME !== runHome.codexHome ||
    environment.HOME !== runHome.home ||
    environment.USERPROFILE !== runHome.home ||
    samePath(environment.CODEX_HOME, request.builderCodexHome) ||
    samePath(environment.HOME, request.builderCodexHome) ||
    samePath(environment.CODEX_HOME, environment.HOME)
  ) {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  const seen = new Set<string>();
  for (const key of Object.keys(environment)) {
    const normalized = normalizedEnvironmentKey(key);
    const allowed = process.platform === "win32"
      ? [...childEnvironmentKeys].some((candidate) => candidate.toUpperCase() === normalized)
      : childEnvironmentKeys.has(key);
    if (!allowed || seen.has(normalized)) throw new CodexProviderError("CODEX_SPAWN_FAILED");
    seen.add(normalized);
  }
}

async function readDirectoryEntries(directory: string): Promise<readonly string[]> {
  try {
    return await readdir(directory);
  } catch {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
}

async function assertCodexHomeReceipt(
  codexHome: string,
  runHome: IsolatedCodexRunHome,
  receipt: CodexRunAuthProvisioningReceipt,
): Promise<void> {
  if (!samePath(codexHome, runHome.codexHome)) throw new CodexProviderError("CODEX_SPAWN_FAILED");
  const entries = await readDirectoryEntries(codexHome);
  if (receipt.status === "ABSENT") {
    if (entries.length !== 0) throw new CodexProviderError("CODEX_SPAWN_FAILED");
    return;
  }
  if (entries.length !== 1 || entries[0] !== "auth.json") throw new CodexProviderError("CODEX_SPAWN_FAILED");
  if (receipt.status === "PRESENT") {
    const authPath = join(codexHome, "auth.json");
    try {
      const info = await lstat(authPath);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.nlink !== 1
      ) {
        throw new CodexProviderError("CODEX_SPAWN_FAILED");
      }
      const canonicalAuth = await realpath(authPath);
      if (
        !samePath(canonicalAuth, resolve(authPath)) ||
        !pathWithin(codexHome, canonicalAuth) ||
        !codexRunAuthFileMatchesReceipt(info, receipt.file)
      ) {
        throw new CodexProviderError("CODEX_SPAWN_FAILED");
      }
    } catch (error) {
      if (error instanceof CodexProviderError) throw error;
      throw new CodexProviderError("CODEX_SPAWN_FAILED");
    }
  }
}

async function assertRunReadyForLaunch(
  request: CodexProviderRequest,
  runHome: IsolatedCodexRunHome,
  receipt: CodexRunAuthProvisioningReceipt,
): Promise<void> {
  const [tempDirectory, rootDirectory, homeDirectory, codexDirectory, ...protectedDirectories] = await Promise.all([
    inspectPhysicalDirectory(runHome.tempRoot),
    inspectPhysicalDirectory(runHome.root),
    inspectPhysicalDirectory(runHome.home),
    inspectPhysicalDirectory(runHome.codexHome),
    inspectPhysicalDirectory(request.repositoryRoot),
    inspectPhysicalDirectory(request.workspacePath),
    inspectPhysicalDirectory(request.builderCodexHome),
  ]);
  if (
    !directoryMatchesReceipt(tempDirectory.info, runHome.tempRootIdentity) ||
    !directoryMatchesReceipt(rootDirectory.info, runHome.rootIdentity)
  ) {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  assertRunDirectoryRelationships(runHome, {
    tempRoot: tempDirectory.canonical,
    root: rootDirectory.canonical,
    home: homeDirectory.canonical,
    codexHome: codexDirectory.canonical,
    protectedPaths: protectedDirectories.map((directory) => directory.canonical),
  });
  const rootEntries = [...await readDirectoryEntries(rootDirectory.canonical)].sort();
  if (rootEntries.length !== 2 || rootEntries[0] !== "codex-home" || rootEntries[1] !== "home") {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  if ((await readDirectoryEntries(homeDirectory.canonical)).length !== 0) {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  await assertCodexHomeReceipt(codexDirectory.canonical, runHome, receipt);
  if (signalIsAborted(request.signal)) throw new CodexProviderError("CODEX_CANCELLED");
}

async function settleBounded(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function signalIsAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export interface CodexProvider {
  execute(request: CodexProviderRequest): Promise<CodexProviderResponse>;
}

export class CodexExecProvider implements CodexProvider {
  constructor(
    private readonly launcher: CodexProcessLauncher = new NodeCodexProcessLauncher(),
    private readonly now: () => Date = () => new Date(),
    private readonly provisionRunAuth: (
      builderCodexHome: string,
      runCodexHome: string,
    ) => Promise<CodexRunAuthProvisioningReceipt> = provisionCodexRunAuth,
  ) {}

  async execute(request: CodexProviderRequest): Promise<CodexProviderResponse> {
    if (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 100 || request.timeoutMs > 1_800_000) {
      throw new CodexProviderError("CODEX_SPAWN_FAILED");
    }
    if (signalIsAborted(request.signal)) throw new CodexProviderError("CODEX_CANCELLED");
    const startedAt = this.now().toISOString();
    const args = buildCodexExecArguments({
      workspacePath: request.workspacePath,
      outputSchemaPath: request.outputSchemaPath,
      ...(request.model === undefined ? {} : { model: request.model }),
    });
    const runHome = await createIsolatedRunHome(request);
    let child: CodexChildProcess;
    try {
      if (signalIsAborted(request.signal)) throw new CodexProviderError("CODEX_CANCELLED");
      const authReceipt = await this.provisionRunAuth(request.builderCodexHome, runHome.codexHome);
      if (signalIsAborted(request.signal)) throw new CodexProviderError("CODEX_CANCELLED");
      const childEnvironment = buildRunChildEnvironment(request.environment, runHome);
      assertChildEnvironment(request, runHome, childEnvironment);
      await assertRunReadyForLaunch(request, runHome, authReceipt);
      child = this.launcher.start({
        executable: process.execPath,
        arguments: [request.cli.binPath, ...args],
        workingDirectory: request.workspacePath,
        environment: childEnvironment,
      });
    } catch (error) {
      await removeIsolatedRunHome(runHome);
      if (error instanceof CodexProviderError) throw error;
      throw new CodexProviderError("CODEX_SPAWN_FAILED");
    }
    const parser = new CodexJsonlAccumulator();
    let stop: ((error: CodexProviderError) => void) | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      stop = (error) => reject(error);
    });
    let stoppedError: CodexProviderError | undefined;
    const requestStop = (error: CodexProviderError): void => {
      if (stoppedError !== undefined) return;
      stoppedError = error;
      stop?.(error);
      child.kill();
    };
    const abort = (): void => requestStop(new CodexProviderError("CODEX_CANCELLED"));
    request.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => requestStop(new CodexProviderError("CODEX_TIMEOUT")), request.timeoutMs);
    if (signalIsAborted(request.signal)) abort();
    const operation = (async (): Promise<CodexProviderResponse> => {
      if (stoppedError !== undefined) throw stoppedError;
      const output = (async (): Promise<void> => {
        for await (const chunk of child.stdout) parser.push(chunk);
      })();
      const stderr = drainBounded(child.stderr);
      const exit = child.wait();
      const processSettled = Promise.all([exit, output, stderr]);
      void processSettled.catch(() => undefined);
      try {
        await child.writePrompt(request.prompt);
      } catch (error) {
        child.kill();
        await settleBounded(Promise.allSettled([processSettled]), 1_000);
        throw error;
      }
      const [processExit] = await processSettled;
      if (processExit.code !== 0) throw new CodexProviderError("CODEX_PROCESS_FAILED");
      const summary = parser.finish();
      if (summary.failed) throw new CodexProviderError("CODEX_PROCESS_FAILED");
      if (summary.finalMessage === null) throw new CodexProviderError("CODEX_OUTPUT_INVALID");
      let structuredOutput: CodexPlannerOutput;
      try {
        structuredOutput = parseCodexPlannerOutput(JSON.parse(summary.finalMessage));
      } catch {
        throw new CodexProviderError("CODEX_OUTPUT_INVALID");
      }
      return {
        output: structuredOutput,
        startedAt,
        completedAt: this.now().toISOString(),
        ...(summary.threadId === undefined ? {} : { threadId: summary.threadId }),
        ...(summary.model === undefined ? {} : { model: summary.model }),
        ...(summary.usage === undefined ? {} : { usage: summary.usage }),
      };
    })();
    try {
      return await Promise.race([operation, stopped]);
    } catch (error) {
      child.kill();
      await settleBounded(Promise.allSettled([operation, child.wait()]), 1_000);
      if (error instanceof CodexProviderError) throw error;
      throw new CodexProviderError("CODEX_PROCESS_FAILED");
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", abort);
      await removeIsolatedRunHome(runHome);
    }
  }
}
