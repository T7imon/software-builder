import { spawn } from "node:child_process";
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { buildCodexExecArguments, type ResolvedCodexCli } from "./codex-cli.js";
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

function assertChildEnvironment(request: CodexProviderRequest, environment: NodeJS.ProcessEnv): void {
  if (
    environment.CODEX_HOME !== request.builderCodexHome ||
    typeof environment.HOME !== "string" ||
    environment.HOME.length === 0 ||
    environment.USERPROFILE !== environment.HOME
  ) {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
  for (const key of Object.keys(environment)) {
    const allowed = process.platform === "win32"
      ? [...childEnvironmentKeys].some((candidate) => candidate.toLowerCase() === key.toLowerCase())
      : childEnvironmentKeys.has(key);
    if (!allowed) throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
}

function pathWithin(parent: string, child: string): boolean {
  const value = relative(parent, child);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

async function createIsolatedRunHome(request: CodexProviderRequest): Promise<{ home: string; tempRoot: string }> {
  const tempRoot = await realpath(tmpdir()).catch(() => {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  });
  const home = await mkdtemp(join(tempRoot, "builder-codex-run-")).catch(() => {
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  });
  try {
    const [canonicalHome, info] = await Promise.all([realpath(home), lstat(home)]);
    const protectedPaths = [request.workspacePath, request.repositoryRoot, request.builderCodexHome].map((value) => resolve(value));
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      dirname(canonicalHome) !== tempRoot ||
      !canonicalHome.startsWith(join(tempRoot, "builder-codex-run-")) ||
      protectedPaths.some((value) => pathWithin(value, canonicalHome) || pathWithin(canonicalHome, value))
    ) {
      throw new CodexProviderError("CODEX_SPAWN_FAILED");
    }
    return { home: canonicalHome, tempRoot };
  } catch (error) {
    if (dirname(home) === tempRoot && home.startsWith(join(tempRoot, "builder-codex-run-"))) {
      await rm(home, { recursive: true, force: true }).catch(() => undefined);
    }
    if (error instanceof CodexProviderError) throw error;
    throw new CodexProviderError("CODEX_SPAWN_FAILED");
  }
}

async function removeIsolatedRunHome(runHome: { home: string; tempRoot: string }): Promise<void> {
  try {
    if (
      dirname(runHome.home) !== runHome.tempRoot ||
      !runHome.home.startsWith(join(runHome.tempRoot, "builder-codex-run-"))
    ) return;
    const [info, canonicalParent, canonicalHome] = await Promise.all([
      lstat(runHome.home),
      realpath(dirname(runHome.home)),
      realpath(runHome.home),
    ]);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      canonicalParent !== runHome.tempRoot ||
      canonicalHome !== runHome.home
    ) return;
    await rm(runHome.home, { recursive: true, force: true });
  } catch {
    // Cleanup is best effort and never changes the sanitized run outcome.
  }
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
    const childEnvironment: NodeJS.ProcessEnv = {
      ...request.environment,
      HOME: runHome.home,
      USERPROFILE: runHome.home,
    };
    let child: CodexChildProcess;
    try {
      if (signalIsAborted(request.signal)) throw new CodexProviderError("CODEX_CANCELLED");
      assertChildEnvironment(request, childEnvironment);
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
