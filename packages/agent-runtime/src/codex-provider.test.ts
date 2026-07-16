import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { link, lstat, mkdtemp, mkdir, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CodexExecProvider,
  CodexJsonlAccumulator,
  CodexProviderError,
  provisionCodexRunAuth,
  validateBuilderCodexHome,
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

const temporaryDirectories: string[] = [];
let fixtureRoot: string;
let workspacePath: string;
let builderCodexHome: string;

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "builder-codex-provider-test-"));
  temporaryDirectories.push(fixtureRoot);
  workspacePath = join(fixtureRoot, "workspace");
  builderCodexHome = join(fixtureRoot, "credential-home");
  await Promise.all([mkdir(workspacePath), mkdir(builderCodexHome)]);
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

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
  constructor(readonly child: TestChild, private readonly onStart?: (spec: CodexProcessSpec) => void) {}
  start(spec: CodexProcessSpec): CodexChildProcess {
    this.specs.push(spec);
    this.onStart?.(spec);
    return this.child;
  }
}

function request(overrides: Partial<CodexProviderRequest> = {}): CodexProviderRequest {
  return {
    cli: {
      packageName: "@openai/codex",
      packageVersion: "0.132.0",
      packageRoot: resolve("node_modules/@openai/codex"),
      binPath: resolve("node_modules/@openai/codex/bin/codex.js"),
    },
    workspacePath,
    repositoryRoot: resolve("."),
    builderCodexHome,
    outputSchemaPath: resolve("synthetic-output.schema.json"),
    prompt: "synthetic planner prompt",
    environment: {
      CODEX_HOME: builderCodexHome,
      HOME: join(fixtureRoot, "normal-home"),
      USERPROFILE: join(fixtureRoot, "normal-profile"),
      PATH: "synthetic-path",
    },
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
    const spec = launcher.specs[0]!;
    expect(spec).toMatchObject({
      executable: process.execPath,
      workingDirectory: workspacePath,
    });
    expect(spec.environment).toEqual({
      CODEX_HOME: expect.any(String),
      HOME: expect.any(String),
      USERPROFILE: expect.any(String),
      PATH: "synthetic-path",
    });
    expect(spec.environment.CODEX_HOME).not.toBe(builderCodexHome);
    expect(spec.environment.HOME).not.toBe(join(fixtureRoot, "normal-home"));
    expect(spec.environment.USERPROFILE).toBe(spec.environment.HOME);
    expect(spec.environment.CODEX_HOME).not.toBe(spec.environment.HOME);
    const runRoot = dirname(spec.environment.CODEX_HOME!);
    expect(dirname(spec.environment.HOME!)).toBe(runRoot);
    expect(dirname(runRoot)).toBe(await realpath(tmpdir()));
    expect(spec.arguments[0]).toBe(resolve("node_modules/@openai/codex/bin/codex.js"));
    expect(spec.arguments).toContain("--ignore-user-config");
    expect(spec.arguments).toContain("read-only");
    expect(spec.arguments).not.toContain("synthetic planner prompt");
    await expect(lstat(runRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["MCP_TOOL_CALL", { type: "item.started", item: { type: "mcp_tool_call", server: "forbidden" } }],
    ["WEB_SEARCH", { type: "item.completed", item: { type: "web_search", query: "forbidden" } }],
    ["FORBIDDEN_INTEGRATION", { type: "item.started", item: { type: "subagent_call" } }],
  ] as const)("kills and fails closed on a %s event", async (policyEvent, event) => {
    const child = new TestChild(lines(event));
    const launcher = new TestLauncher(child);
    const provider = new CodexExecProvider(launcher);
    await expect(provider.execute(request())).rejects.toMatchObject({
      code: "CODEX_SECURITY_POLICY_VIOLATION",
      policyEvent,
    });
    expect(child.killed).toBe(true);
    await expect(lstat(dirname(launcher.specs[0]!.environment.CODEX_HOME!))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects malformed JSONL and invalid structured output", async () => {
    const malformedLauncher = new TestLauncher(new TestChild("not-json\n"));
    const malformed = new CodexExecProvider(malformedLauncher);
    await expect(malformed.execute(request())).rejects.toMatchObject({ code: "CODEX_JSONL_INVALID" });
    await expect(lstat(dirname(malformedLauncher.specs[0]!.environment.CODEX_HOME!))).rejects.toMatchObject({ code: "ENOENT" });
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
    const timeoutLauncher = new TestLauncher(timeoutChild);
    await expect(
      new CodexExecProvider(timeoutLauncher).execute(request({ timeoutMs: 100 })),
    ).rejects.toMatchObject({ code: "CODEX_TIMEOUT" });
    expect(timeoutChild.killed).toBe(true);
    await expect(lstat(dirname(timeoutLauncher.specs[0]!.environment.CODEX_HOME!))).rejects.toMatchObject({ code: "ENOENT" });

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
    await expect(lstat(dirname(cancelledLauncher.specs[0]!.environment.CODEX_HOME!))).rejects.toMatchObject({ code: "ENOENT" });
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

  it("uses distinct physical homes for every run and replaces all incoming home variables", async () => {
    const observedAtStart: boolean[] = [];
    const specs: CodexProcessSpec[] = [];
    const observeStart = (spec: CodexProcessSpec): void => {
      specs.push(spec);
      observedAtStart.push(
        existsSync(spec.environment.CODEX_HOME!) &&
        existsSync(spec.environment.HOME!) &&
        readdirSync(spec.environment.CODEX_HOME!).length === 0,
      );
    };
    const injectedEnvironment: NodeJS.ProcessEnv = {
      CODEX_HOME: builderCodexHome,
      HOME: "must-not-pass-home",
      USERPROFILE: "must-not-pass-profile",
      PATH: "synthetic-path",
      ...(process.platform === "win32"
        ? { cOdEx_HoMe: "must-not-pass-case", hOmE: "must-not-pass-case", userprofile: "must-not-pass-case" }
        : {}),
    };
    const output = lines({
      type: "item.completed",
      item: { type: "agent_message", text: JSON.stringify(plannerOutput) },
    });
    await new CodexExecProvider(new TestLauncher(new TestChild(output), observeStart)).execute(
      request({ environment: injectedEnvironment }),
    );
    await new CodexExecProvider(new TestLauncher(new TestChild(output), observeStart)).execute(
      request({ environment: injectedEnvironment }),
    );

    expect(observedAtStart).toEqual([true, true]);
    const first = specs[0]!.environment;
    const second = specs[1]!.environment;
    expect(first.CODEX_HOME).not.toBe(second.CODEX_HOME);
    expect(dirname(first.CODEX_HOME!)).not.toBe(dirname(second.CODEX_HOME!));
    expect(first.HOME).not.toBe(first.CODEX_HOME);
    expect(JSON.stringify(first)).not.toContain("must-not-pass");
    expect(JSON.stringify(second)).not.toContain("must-not-pass");
    await expect(lstat(dirname(first.CODEX_HOME!))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(dirname(second.CODEX_HOME!))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("copies only synthetic auth into the run home and contains CLI-created system skills", async () => {
    const syntheticAuth = '{"synthetic":"credential-only"}';
    await Promise.all([
      writeFile(join(builderCodexHome, "auth.json"), syntheticAuth, "utf8"),
      writeFile(join(builderCodexHome, "config.toml"), "synthetic_config = true", "utf8"),
    ]);
    await expect(validateBuilderCodexHome({
      configuredHome: builderCodexHome,
      repositoryRoot: resolve("."),
      workspacePath,
      defaultUserHome: join(fixtureRoot, "normal-user"),
    })).resolves.toBe(builderCodexHome);
    const stableEntriesBefore = readdirSync(builderCodexHome).sort();
    let runRoot: string | undefined;
    let copiedAuth: string | undefined;
    let initialRunEntries: string[] | undefined;
    let initialUserHomeEntries: string[] | undefined;
    const child = new TestChild(
      lines({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(plannerOutput) } }),
    );
    const launcher = new TestLauncher(child, (spec) => {
      const codexHome = spec.environment.CODEX_HOME!;
      runRoot = dirname(codexHome);
      initialRunEntries = readdirSync(codexHome).sort();
      initialUserHomeEntries = readdirSync(spec.environment.HOME!).sort();
      copiedAuth = readFileSync(join(codexHome, "auth.json"), "utf8");
      mkdirSync(join(codexHome, "skills", ".system"), { recursive: true });
    });

    await new CodexExecProvider(launcher).execute(request());

    expect(initialRunEntries).toEqual(["auth.json"]);
    expect(initialUserHomeEntries).toEqual([]);
    expect(copiedAuth).toBe(syntheticAuth);
    expect(stableEntriesBefore).toEqual(["auth.json", "config.toml"]);
    expect(readdirSync(builderCodexHome).sort()).toEqual(stableEntriesBefore);
    expect(existsSync(join(builderCodexHome, "skills"))).toBe(false);
    expect(existsSync(join(builderCodexHome, "plugins"))).toBe(false);
    expect(existsSync(join(builderCodexHome, ".agents"))).toBe(false);
    await expect(validateBuilderCodexHome({
      configuredHome: builderCodexHome,
      repositoryRoot: resolve("."),
      workspacePath,
      defaultUserHome: join(fixtureRoot, "normal-user"),
    })).resolves.toBe(builderCodexHome);
    expect(runRoot).toBeDefined();
    await expect(lstat(runRoot!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a post-validation hardlink exchange before starting a child", async () => {
    const authPath = join(builderCodexHome, "auth.json");
    await writeFile(authPath, '{"synthetic":"initial"}', "utf8");
    await expect(validateBuilderCodexHome({
      configuredHome: builderCodexHome,
      repositoryRoot: resolve("."),
      workspacePath,
      defaultUserHome: join(fixtureRoot, "normal-user"),
    })).resolves.toBe(builderCodexHome);
    await rm(authPath);
    const replacement = join(fixtureRoot, "synthetic-replacement.json");
    await writeFile(replacement, '{"synthetic":"replacement-must-not-leak"}', "utf8");
    await link(replacement, authPath);
    const launcher = new TestLauncher(new TestChild(""));

    const error = await new CodexExecProvider(launcher).execute(request()).catch((failure: unknown) => failure);

    expect(error).toEqual(new CodexProviderError("CODEX_SPAWN_FAILED"));
    expect(JSON.stringify(error)).not.toContain("replacement-must-not-leak");
    expect(launcher.specs).toHaveLength(0);
  });

  it("rejects an auth replacement injected after an ABSENT provisioning receipt", async () => {
    const launcher = new TestLauncher(new TestChild(""));
    let receiptStatus: string | undefined;
    let runRoot: string | undefined;
    const provider = new CodexExecProvider(launcher, undefined, async (credentialHome, runCodexHome) => {
      const receipt = await provisionCodexRunAuth(credentialHome, runCodexHome);
      receiptStatus = receipt.status;
      runRoot = dirname(runCodexHome);
      await writeFile(join(runCodexHome, "auth.json"), '{"synthetic":"injected-after-absent"}', "utf8");
      return receipt;
    });

    await expect(provider.execute(request())).rejects.toEqual(new CodexProviderError("CODEX_SPAWN_FAILED"));

    expect(receiptStatus).toBe("ABSENT");
    expect(launcher.specs).toHaveLength(0);
    expect(runRoot).toBeDefined();
    await expect(lstat(runRoot!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an exchanged copied target that no longer matches its PRESENT receipt", async () => {
    await writeFile(join(builderCodexHome, "auth.json"), '{"synthetic":"copied-target"}', "utf8");
    const launcher = new TestLauncher(new TestChild(""));
    let receiptStatus: string | undefined;
    let runRoot: string | undefined;
    const provider = new CodexExecProvider(launcher, undefined, async (credentialHome, runCodexHome) => {
      const receipt = await provisionCodexRunAuth(credentialHome, runCodexHome);
      receiptStatus = receipt.status;
      runRoot = dirname(runCodexHome);
      await rm(join(runCodexHome, "auth.json"));
      await writeFile(join(runCodexHome, "auth.json"), '{"synthetic":"exchanged-target"}', "utf8");
      return receipt;
    });

    await expect(provider.execute(request())).rejects.toEqual(new CodexProviderError("CODEX_SPAWN_FAILED"));

    expect(receiptStatus).toBe("PRESENT");
    expect(launcher.specs).toHaveLength(0);
    expect(runRoot).toBeDefined();
    await expect(lstat(runRoot!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a HOME junction in final readiness and cleanup never follows it", async () => {
    const outsideHome = join(fixtureRoot, "outside-normal-home");
    await mkdir(outsideHome);
    await writeFile(join(outsideHome, "marker.txt"), "synthetic-outside-home-marker", "utf8");
    const launcher = new TestLauncher(new TestChild(""));
    let runRoot: string | undefined;
    const provider = new CodexExecProvider(launcher, undefined, async (credentialHome, runCodexHome) => {
      const receipt = await provisionCodexRunAuth(credentialHome, runCodexHome);
      runRoot = dirname(runCodexHome);
      const runUserHome = join(runRoot, "home");
      await rm(runUserHome, { recursive: true, force: false });
      await symlink(outsideHome, runUserHome, "junction");
      return receipt;
    });

    const error = await provider.execute(request()).catch((failure: unknown) => failure);

    expect(error).toEqual(new CodexProviderError("CODEX_SPAWN_FAILED"));
    expect(JSON.stringify(error)).not.toContain(outsideHome);
    expect(launcher.specs).toHaveLength(0);
    expect(readFileSync(join(outsideHome, "marker.txt"), "utf8")).toBe("synthetic-outside-home-marker");
    expect(runRoot).toBeDefined();
    await expect(lstat(runRoot!)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails with a sanitized error instead of following a replaced cleanup root", async () => {
    const outside = join(fixtureRoot, "outside-cleanup-root");
    await mkdir(outside);
    await writeFile(join(outside, "marker.txt"), "synthetic-marker", "utf8");
    let runRoot: string | undefined;
    const child = new TestChild(
      lines({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(plannerOutput) } }),
    );
    const launcher = new TestLauncher(child, (spec) => {
      runRoot = dirname(spec.environment.CODEX_HOME!);
      rmSync(runRoot, { recursive: true, force: true });
      symlinkSync(outside, runRoot, "junction");
    });
    let error: unknown;
    try {
      error = await new CodexExecProvider(launcher).execute(request()).catch((failure: unknown) => failure);
    } finally {
      if (runRoot !== undefined) await unlink(runRoot).catch(() => undefined);
    }

    expect(error).toEqual(new CodexProviderError("CODEX_SPAWN_FAILED"));
    expect(JSON.stringify(error)).not.toContain(outside);
    expect(readFileSync(join(outside, "marker.txt"), "utf8")).toBe("synthetic-marker");
  });

  it("finds and removes the original run root after a direct TEMP rename", async () => {
    await writeFile(join(builderCodexHome, "auth.json"), '{"synthetic":"rename-cleanup"}', "utf8");
    let originalRoot: string | undefined;
    let renamedRoot: string | undefined;
    let copiedAuthWasPresent = false;
    const child = new TestChild(
      lines({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(plannerOutput) } }),
    );
    const launcher = new TestLauncher(child, (spec) => {
      originalRoot = dirname(spec.environment.CODEX_HOME!);
      renamedRoot = join(dirname(originalRoot), `${basename(originalRoot)}-renamed`);
      copiedAuthWasPresent = existsSync(join(spec.environment.CODEX_HOME!, "auth.json"));
      renameSync(originalRoot, renamedRoot);
    });
    try {
      await expect(new CodexExecProvider(launcher).execute(request())).resolves.toMatchObject({ output: plannerOutput });
      expect(originalRoot).toBeDefined();
      expect(renamedRoot).toBeDefined();
      expect(copiedAuthWasPresent).toBe(true);
      await expect(lstat(originalRoot!)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(lstat(renamedRoot!)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (renamedRoot !== undefined) await rm(renamedRoot, { recursive: true, force: true });
    }
  });

  it("removes a directly renamed original but preserves a physical replacement and fails closed", async () => {
    let originalRoot: string | undefined;
    let renamedRoot: string | undefined;
    const child = new TestChild(
      lines({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(plannerOutput) } }),
    );
    const launcher = new TestLauncher(child, (spec) => {
      originalRoot = dirname(spec.environment.CODEX_HOME!);
      renamedRoot = join(dirname(originalRoot), `${basename(originalRoot)}-renamed-with-replacement`);
      renameSync(originalRoot, renamedRoot);
      mkdirSync(originalRoot);
      writeFileSync(join(originalRoot, "replacement-marker.txt"), "synthetic-replacement-marker", "utf8");
    });
    try {
      const error = await new CodexExecProvider(launcher).execute(request()).catch((failure: unknown) => failure);
      expect(error).toEqual(new CodexProviderError("CODEX_SPAWN_FAILED"));
      expect(JSON.stringify(error)).not.toContain("replacement-marker");
      expect(originalRoot).toBeDefined();
      expect(renamedRoot).toBeDefined();
      expect(readFileSync(join(originalRoot!, "replacement-marker.txt"), "utf8")).toBe("synthetic-replacement-marker");
      await expect(lstat(renamedRoot!)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (originalRoot !== undefined) await rm(originalRoot, { recursive: true, force: true });
      if (renamedRoot !== undefined) await rm(renamedRoot, { recursive: true, force: true });
    }
  });

  it("never traverses TEMP children to delete a run root moved into the workspace", async () => {
    let originalRoot: string | undefined;
    let movedRoot: string | undefined;
    const child = new TestChild(
      lines({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(plannerOutput) } }),
    );
    const launcher = new TestLauncher(child, (spec) => {
      originalRoot = dirname(spec.environment.CODEX_HOME!);
      movedRoot = join(workspacePath, `${basename(originalRoot)}-moved-outside-temp-direct-children`);
      renameSync(originalRoot, movedRoot);
      writeFileSync(join(movedRoot, "outside-marker.txt"), "synthetic-moved-marker", "utf8");
    });
    try {
      const error = await new CodexExecProvider(launcher).execute(request()).catch((failure: unknown) => failure);
      expect(error).toEqual(new CodexProviderError("CODEX_SPAWN_FAILED"));
      expect(JSON.stringify(error)).not.toContain("moved-outside");
      expect(originalRoot).toBeDefined();
      expect(movedRoot).toBeDefined();
      await expect(lstat(originalRoot!)).rejects.toMatchObject({ code: "ENOENT" });
      expect(readFileSync(join(movedRoot!, "outside-marker.txt"), "utf8")).toBe("synthetic-moved-marker");
    } finally {
      if (movedRoot !== undefined) await rm(movedRoot, { recursive: true, force: true });
    }
  });

  it("normalizes raw launcher and child failures to closed provider codes", async () => {
    let failedRunRoot: string | undefined;
    const launcher: CodexProcessLauncher = {
      start: (spec) => {
        failedRunRoot = dirname(spec.environment.CODEX_HOME!);
        throw new Error("provider raw secret must not escape");
      },
    };
    await expect(new CodexExecProvider(launcher).execute(request())).rejects.toEqual(
      new CodexProviderError("CODEX_SPAWN_FAILED"),
    );
    expect(failedRunRoot).toBeDefined();
    await expect(lstat(failedRunRoot!)).rejects.toMatchObject({ code: "ENOENT" });
    const childFailureLauncher = new TestLauncher(
      new TestChild("", { code: 1, signal: null }, false, "OPENAI_API_KEY=raw-child-secret"),
    );
    const childFailure = new CodexExecProvider(childFailureLauncher);
    const error = await childFailure.execute(request()).catch((failure: unknown) => failure);
    expect(error).toEqual(new CodexProviderError("CODEX_PROCESS_FAILED"));
    expect(JSON.stringify(error)).not.toContain("raw-child-secret");
    await expect(lstat(dirname(childFailureLauncher.specs[0]!.environment.CODEX_HOME!))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
