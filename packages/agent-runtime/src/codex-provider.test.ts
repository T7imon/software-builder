import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CodexExecProvider,
  CodexJsonlAccumulator,
  CodexProviderError,
  type CodexChildProcess,
  type CodexProcessExit,
  type CodexProcessLauncher,
  type CodexProcessSpec,
  type CodexProviderRequest,
} from "./index.js";

const plannerOutput = {
  status: "SUCCEEDED" as const,
  summary: "Synthetic plan completed.",
  requirements: ["Stay read-only."],
  assumptions: [],
  openQuestions: [],
  recommendedNextStep: "Review the synthetic plan.",
};

function lines(...events: unknown[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

class TestChild implements CodexChildProcess {
  readonly stderr: AsyncIterable<Uint8Array | string>;
  readonly stdout: AsyncIterable<Uint8Array | string>;
  prompt: string | undefined;
  killed = false;
  private releaseKill!: () => void;
  private readonly killedPromise = new Promise<void>((resolveKill) => {
    this.releaseKill = resolveKill;
  });

  constructor(
    stdout: string,
    private readonly exit: CodexProcessExit = { code: 0, signal: null },
    private readonly hangs = false,
    stderr = "",
  ) {
    this.stdout = this.stream(stdout);
    this.stderr = this.stream(stderr);
  }

  async writePrompt(prompt: string): Promise<void> {
    this.prompt = prompt;
  }

  async wait(): Promise<CodexProcessExit> {
    if (this.hangs) await this.killedPromise;
    return this.exit;
  }

  kill(): void {
    this.killed = true;
    this.releaseKill();
  }

  private async *stream(value: string): AsyncIterable<Uint8Array | string> {
    if (value.length > 0) yield value;
    if (this.hangs) await this.killedPromise;
  }
}

class TestLauncher implements CodexProcessLauncher {
  readonly specs: CodexProcessSpec[] = [];
  constructor(readonly child: TestChild) {}
  start(spec: CodexProcessSpec): CodexChildProcess {
    this.specs.push(spec);
    return this.child;
  }
}

function request(overrides: Partial<CodexProviderRequest> = {}): CodexProviderRequest {
  return {
    cli: {
      packageName: "@openai/codex",
      packageVersion: "0.144.4",
      packageRoot: resolve("node_modules/@openai/codex"),
      binPath: resolve("node_modules/@openai/codex/bin/codex.js"),
    },
    workspacePath: resolve("synthetic-workspace"),
    repositoryRoot: resolve("."),
    builderCodexHome: resolve("synthetic-codex-home"),
    outputSchemaPath: resolve("synthetic-output.schema.json"),
    prompt: "synthetic planner prompt",
    environment: { CODEX_HOME: resolve("synthetic-codex-home"), PATH: "synthetic-path" },
    timeoutMs: 1_000,
    ...overrides,
  };
}

describe("CodexExecProvider", () => {
  it("spawns the pinned JavaScript launcher through Node, parses safe JSONL metadata, and writes the prompt via stdin", async () => {
    const child = new TestChild(
      lines(
        { type: "thread.started", thread_id: "thread/synthetic" },
        { type: "future.unknown", raw_provider_detail: "ignored" },
        { type: "turn.completed", model: "gpt-5.4", usage: { input_tokens: 10, output_tokens: 5 } },
        { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(plannerOutput) } },
      ),
    );
    const launcher = new TestLauncher(child);
    const provider = new CodexExecProvider(launcher, () => new Date("2026-01-01T00:00:00.000Z"));
    const response = await provider.execute(request());
    expect(response).toEqual({
      output: plannerOutput,
      threadId: "thread/synthetic",
      model: "gpt-5.4",
      usage: { inputTokens: 10, outputTokens: 5 },
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(child.prompt).toBe("synthetic planner prompt");
    expect(launcher.specs).toHaveLength(1);
    expect(launcher.specs[0]).toMatchObject({
      executable: process.execPath,
      workingDirectory: resolve("synthetic-workspace"),
      environment: { CODEX_HOME: resolve("synthetic-codex-home"), PATH: "synthetic-path" },
    });
    expect(launcher.specs[0]!.arguments[0]).toBe(resolve("node_modules/@openai/codex/bin/codex.js"));
    expect(launcher.specs[0]!.arguments).toContain("--ignore-user-config");
    expect(launcher.specs[0]!.arguments).toContain("read-only");
    expect(launcher.specs[0]!.arguments).not.toContain("synthetic planner prompt");
  });

  it.each([
    ["MCP_TOOL_CALL", { type: "item.started", item: { type: "mcp_tool_call", server: "forbidden" } }],
    ["WEB_SEARCH", { type: "item.completed", item: { type: "web_search", query: "forbidden" } }],
    ["FORBIDDEN_INTEGRATION", { type: "item.started", item: { type: "subagent_call" } }],
  ] as const)("kills and fails closed on a %s event", async (policyEvent, event) => {
    const child = new TestChild(lines(event));
    const provider = new CodexExecProvider(new TestLauncher(child));
    await expect(provider.execute(request())).rejects.toMatchObject({
      code: "CODEX_SECURITY_POLICY_VIOLATION",
      policyEvent,
    });
    expect(child.killed).toBe(true);
  });

  it("rejects malformed JSONL and invalid structured output", async () => {
    const malformed = new CodexExecProvider(new TestLauncher(new TestChild("not-json\n")));
    await expect(malformed.execute(request())).rejects.toMatchObject({ code: "CODEX_JSONL_INVALID" });
    const invalidOutput = new CodexExecProvider(
      new TestLauncher(
        new TestChild(lines({ type: "item.completed", item: { type: "agent_message", text: '{"status":"SUCCEEDED"}' } })),
      ),
    );
    await expect(invalidOutput.execute(request())).rejects.toMatchObject({ code: "CODEX_OUTPUT_INVALID" });
  });

  it("decodes UTF-8 defensively across chunk boundaries", () => {
    const parser = new CodexJsonlAccumulator();
    const bytes = new TextEncoder().encode(
      lines({ type: "item.completed", item: { type: "agent_message", text: "Grüße" } }),
    );
    const split = bytes.indexOf(0xc3) + 1;
    parser.push(bytes.slice(0, split));
    parser.push(bytes.slice(split));
    expect(parser.finish().finalMessage).toBe("Grüße");
  });

  it("returns sanitized timeout and cancellation errors and kills the child", async () => {
    const timeoutChild = new TestChild("", { code: null, signal: "SIGTERM" }, true);
    await expect(
      new CodexExecProvider(new TestLauncher(timeoutChild)).execute(request({ timeoutMs: 100 })),
    ).rejects.toMatchObject({ code: "CODEX_TIMEOUT" });
    expect(timeoutChild.killed).toBe(true);

    const controller = new AbortController();
    const cancelledChild = new TestChild("", { code: null, signal: "SIGTERM" }, true);
    const cancelledLauncher = new TestLauncher(cancelledChild);
    const cancellation = new CodexExecProvider(cancelledLauncher).execute(
      request({ signal: controller.signal }),
    );
    await vi.waitFor(() => expect(cancelledLauncher.specs).toHaveLength(1));
    controller.abort();
    await expect(cancellation).rejects.toMatchObject({ code: "CODEX_CANCELLED" });
    expect(cancelledChild.killed).toBe(true);
  });

  it("does not spawn when cancellation wins before process creation", async () => {
    const controller = new AbortController();
    controller.abort();
    const launcher = new TestLauncher(new TestChild(""));
    await expect(new CodexExecProvider(launcher).execute(request({ signal: controller.signal }))).rejects.toMatchObject({
      code: "CODEX_CANCELLED",
    });
    expect(launcher.specs).toHaveLength(0);
  });

  it("normalizes raw launcher and child failures to closed provider codes", async () => {
    const launcher: CodexProcessLauncher = {
      start: () => {
        throw new Error("provider raw secret must not escape");
      },
    };
    await expect(new CodexExecProvider(launcher).execute(request())).rejects.toEqual(
      new CodexProviderError("CODEX_SPAWN_FAILED"),
    );
    const childFailure = new CodexExecProvider(
      new TestLauncher(
        new TestChild("", { code: 1, signal: null }, false, "OPENAI_API_KEY=raw-child-secret"),
      ),
    );
    const error = await childFailure.execute(request()).catch((failure: unknown) => failure);
    expect(error).toEqual(new CodexProviderError("CODEX_PROCESS_FAILED"));
    expect(JSON.stringify(error)).not.toContain("raw-child-secret");
  });
});
