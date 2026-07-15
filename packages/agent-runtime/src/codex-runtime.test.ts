import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CodexExecAgentRuntime,
  CodexExecInFlightCoordinator,
  CodexProviderError,
  canonicalAgentOperationDigest,
  type AgentRole,
  type CodexPersistentRun,
  type CodexProvider,
  type CodexProviderRequest,
  type CodexRuntimeContext,
  type CodexRuntimePersistence,
  type CodexStartDecision,
  type StartRunCommand,
} from "./index.js";

const plannerOutput = {
  status: "SUCCEEDED" as const,
  summary: "Synthetic plan completed.",
  requirements: ["Stay read-only."],
  assumptions: [],
  openQuestions: [],
  recommendedNextStep: "Review the synthetic plan.",
};

const context: CodexRuntimeContext = {
  guard: {
    jobId: "00000000-0000-4000-8000-000000000001",
    workerId: "worker/synthetic",
    claimId: "claim/synthetic",
    fencingToken: 1,
    leaseGeneration: 1,
    claimedJobVersion: 1,
  },
  assignmentRef: "00000000-0000-4000-8000-000000000002",
  agentId: "00000000-0000-4000-8000-000000000003",
  agentKey: "synthetic-planner",
  agentVersion: 1,
  assignmentRole: "PLANNER",
  registryRole: "PLANNER",
  registryInstructions: "Plan only the assigned synthetic task.",
  projectId: "00000000-0000-4000-8000-000000000004",
  projectRevision: "a".repeat(64),
  workspaceId: "00000000-0000-4000-8000-000000000005",
  workspacePath: resolve("synthetic-workspace"),
  repositoryRoot: resolve("."),
  planningTask: "Create one bounded read-only plan.",
  taskDigest: canonicalAgentOperationDigest("enqueue", {
    schemaVersion: 1,
    projectId: "00000000-0000-4000-8000-000000000004",
    taskId: "task/synthetic-planner",
    attemptId: "attempt/synthetic-planner",
    runId: "run/synthetic-planner",
    role: "PLANNER",
    scenario: "SUCCESS",
    inputRef: "synthetic/planning-input",
    repairOrdinal: 0,
  }),
  builderCodexHome: resolve("synthetic-codex-home"),
  childEnvironment: { CODEX_HOME: resolve("synthetic-codex-home") },
  cli: {
    packageName: "@openai/codex",
    packageVersion: "0.144.4",
    packageRoot: resolve("node_modules/@openai/codex"),
    binPath: resolve("node_modules/@openai/codex/bin/codex.js"),
  },
  outputSchemaPath: resolve("codex-planner-output.schema.json"),
  timeoutMs: 1_000,
};

function command(
  role: AgentRole = "PLANNER",
  operation: "startRun" | "continueRun" | "cancelRun" | "getRunStatus" = "startRun",
): StartRunCommand {
  const task = {
    schemaVersion: 1 as const,
    projectId: context.projectId,
    taskId: "task/synthetic-planner",
    attemptId: "attempt/synthetic-planner",
    runId: "run/synthetic-planner",
    role,
    scenario: "SUCCESS" as const,
    inputRef: "synthetic/planning-input",
    repairOrdinal: 0,
  };
  return {
    runId: "run/synthetic-planner",
    projectId: context.projectId,
    taskId: "task/synthetic-planner",
    attemptId: "attempt/synthetic-planner",
    idempotencyKey: "codex-start/synthetic",
    requestDigest: canonicalAgentOperationDigest(operation, task),
    fencingToken: 1,
    task,
  };
}

function persistentRun(
  input: { runId: string; promptSha256: string; startedAt?: string },
  state: CodexPersistentRun["state"] = "DISPATCHED",
): CodexPersistentRun {
  return {
    jobId: context.guard.jobId,
    runId: input.runId,
    state,
    promptSha256: input.promptSha256,
    startedAt: input.startedAt ?? "2026-01-01T00:00:00.000Z",
    ...(state === "DISPATCHED" ? {} : { completedAt: "2026-01-01T00:00:01.000Z" }),
    ...(state === "SUCCEEDED" ? { output: plannerOutput } : {}),
    ...(state === "RECOVERY_REQUIRED" ? { errorCode: "CODEX_RECOVERY_REQUIRED" as const } : {}),
  };
}

type TestPersistence = CodexRuntimePersistence & {
  authorizeStart: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
};

function persistence(overrides: Partial<CodexRuntimePersistence> = {}): TestPersistence {
  const value = {
    authorizeStart: vi.fn(async (input: Parameters<CodexRuntimePersistence["authorizeStart"]>[0]) => ({
      action: "START",
      run: persistentRun(input),
    } satisfies CodexStartDecision)),
    complete: vi.fn(async (input: Parameters<CodexRuntimePersistence["complete"]>[0]) => ({
      ...persistentRun(input, "SUCCEEDED"),
      output: input.output,
      completedAt: input.completedAt,
    })),
    fail: vi.fn(async (input: Parameters<CodexRuntimePersistence["fail"]>[0]) => ({
      ...persistentRun(input, input.state),
      completedAt: input.completedAt,
      errorCode: input.errorCode,
      ...(input.policyEvent === undefined ? {} : { policyEvent: input.policyEvent }),
      ...(input.output === undefined ? {} : { output: input.output }),
    })),
    load: vi.fn(async () => undefined),
    ...overrides,
  };
  return value as unknown as TestPersistence;
}

type TestProvider = CodexProvider & { execute: ReturnType<typeof vi.fn> };

function provider(execute: ReturnType<typeof vi.fn> = vi.fn(async () => ({
  output: plannerOutput,
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:00:01.000Z",
  threadId: "thread/synthetic",
  model: "gpt-5.4",
  usage: { inputTokens: 10, outputTokens: 5 },
}))): TestProvider {
  return { execute } as TestProvider;
}

const now = (): Date => new Date("2026-01-01T00:00:00.000Z");

describe("CodexExecAgentRuntime", () => {
  it("runs one successful PLANNER turn and persists only structured output and safe metadata", async () => {
    const repository = persistence();
    const codex = provider();
    const runtime = new CodexExecAgentRuntime(context, repository, codex, new CodexExecInFlightCoordinator(), now);
    const result = await runtime.startRun(command());
    expect(result).toMatchObject({ state: "SUCCEEDED", terminal: true, result: { status: "SUCCESS" } });
    expect(codex.execute).toHaveBeenCalledOnce();
    expect(repository.complete).toHaveBeenCalledWith(expect.objectContaining({
      output: plannerOutput,
      threadId: "thread/synthetic",
      model: "gpt-5.4",
      usage: { inputTokens: 10, outputTokens: 5 },
    }));
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it.each(["ARCHITECT", "SECURITY", "LEGAL", "EXECUTOR", "QA", "REVIEWER"] as const)(
    "rejects the unsupported %s role before authorization or provider execution",
    (role) => {
      const repository = persistence();
      const codex = provider();
      const runtime = new CodexExecAgentRuntime(context, repository, codex, new CodexExecInFlightCoordinator(), now);
      expect(() => runtime.startRun(command(role))).toThrow("CODEX_RUNTIME_BINDING_MISMATCH");
      expect(repository.authorizeStart).not.toHaveBeenCalled();
      expect(codex.execute).not.toHaveBeenCalled();
    },
  );

  it("rejects a semantically divergent PLANNER task even when its operation digest is self-consistent", () => {
    const repository = persistence();
    const codex = provider();
    const runtime = new CodexExecAgentRuntime(context, repository, codex, new CodexExecInFlightCoordinator(), now);
    const base = command();
    const task = { ...base.task, inputRef: "synthetic/divergent-input" };
    expect(() => runtime.startRun({
      ...base,
      task,
      requestDigest: canonicalAgentOperationDigest("startRun", task),
    })).toThrow("CODEX_RUNTIME_BINDING_MISMATCH");
    expect(repository.authorizeStart).not.toHaveBeenCalled();
    expect(codex.execute).not.toHaveBeenCalled();
  });

  it("gives parallel starts one in-process winner and one provider process", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolveWait) => {
      release = resolveWait;
    });
    const codex = provider(vi.fn(async () => {
      await wait;
      return {
        output: plannerOutput,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
      };
    }));
    const repository = persistence();
    const runtime = new CodexExecAgentRuntime(context, repository, codex, new CodexExecInFlightCoordinator(), now);
    const first = runtime.startRun(command());
    const second = runtime.startRun(command());
    await vi.waitFor(() => expect(codex.execute).toHaveBeenCalledOnce());
    release();
    expect(await second).toEqual(await first);
    expect(repository.authorizeStart).toHaveBeenCalledOnce();
    expect(repository.complete).toHaveBeenCalledOnce();
  });

  it.each([
    ["MCP_TOOL_CALL", "MCP_TOOL_CALL"],
    ["WEB_SEARCH", "WEB_SEARCH"],
  ] as const)("persists a sanitized %s policy violation without completion", async (_name, policyEvent) => {
    const repository = persistence();
    const codex = provider(vi.fn(async () => {
      throw new CodexProviderError("CODEX_SECURITY_POLICY_VIOLATION", policyEvent);
    }));
    const result = await new CodexExecAgentRuntime(
      context,
      repository,
      codex,
      new CodexExecInFlightCoordinator(),
      now,
    ).startRun(command());
    expect(result).toMatchObject({
      state: "FAILED",
      result: { status: "ERROR", errorCode: "CODEX_SECURITY_POLICY_VIOLATION" },
    });
    expect(repository.fail).toHaveBeenCalledWith(expect.objectContaining({
      state: "POLICY_VIOLATION",
      errorCode: "CODEX_SECURITY_POLICY_VIOLATION",
      policyEvent,
    }));
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("cancels the sole in-flight turn through its AbortSignal and never starts another process", async () => {
    const repository = persistence();
    const codex = provider(vi.fn(async (request: CodexProviderRequest) => new Promise((_resolve, reject) => {
      request.signal?.addEventListener(
        "abort",
        () => reject(new CodexProviderError("CODEX_CANCELLED")),
        { once: true },
      );
    })));
    const runtime = new CodexExecAgentRuntime(context, repository, codex, new CodexExecInFlightCoordinator(), now);
    const started = runtime.startRun(command());
    await vi.waitFor(() => expect(codex.execute).toHaveBeenCalledOnce());
    const cancelled = runtime.cancelRun(command("PLANNER", "cancelRun"));
    expect(await cancelled).toEqual(await started);
    expect(await cancelled).toMatchObject({ state: "CANCELLED", result: { status: "CANCELLED", errorCode: null } });
    expect(codex.execute).toHaveBeenCalledOnce();
  });

  it("does not spawn for status queries or a persisted recovery-required restart", async () => {
    const recovery = persistentRun(
      { runId: command().runId, promptSha256: "c".repeat(64) },
      "RECOVERY_REQUIRED",
    );
    const repository = persistence({
      authorizeStart: vi.fn(async () => ({ action: "RECOVERY_REQUIRED", run: recovery } satisfies CodexStartDecision)),
      load: vi.fn(async () => recovery),
    });
    const codex = provider();
    const runtime = new CodexExecAgentRuntime(context, repository, codex, new CodexExecInFlightCoordinator(), now);
    expect(await runtime.startRun(command())).toMatchObject({
      state: "FAILED",
      result: { errorCode: "CODEX_RECOVERY_REQUIRED" },
    });
    expect(await runtime.getRunStatus(command("PLANNER", "getRunStatus"))).toMatchObject({ state: "FAILED" });
    expect(await runtime.continueRun(command("PLANNER", "continueRun"))).toMatchObject({ state: "FAILED" });
    expect(codex.execute).not.toHaveBeenCalled();
  });

  it("rejects a late provider result after persistence loses the lease without converting the CAS error", async () => {
    const leaseError = new Error("LEASE_FENCE_LOST");
    const repository = persistence({ complete: vi.fn(async () => Promise.reject(leaseError)) });
    const runtime = new CodexExecAgentRuntime(
      context,
      repository,
      provider(),
      new CodexExecInFlightCoordinator(),
      now,
    );
    await expect(runtime.startRun(command())).rejects.toBe(leaseError);
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("sanitizes an unknown provider exception before persistence and emits no raw secret", async () => {
    const repository = persistence();
    const codex = provider(vi.fn(async () => {
      throw new Error("OPENAI_API_KEY=raw-provider-secret");
    }));
    await new CodexExecAgentRuntime(context, repository, codex, new CodexExecInFlightCoordinator(), now).startRun(
      command(),
    );
    expect(repository.fail).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "CODEX_PROCESS_FAILED" }));
    expect(JSON.stringify(repository.fail.mock.calls)).not.toContain("raw-provider-secret");
  });
});
