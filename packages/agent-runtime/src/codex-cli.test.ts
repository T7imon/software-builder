import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  CODEX_CLI_VERSION,
  assertNoProjectCodexConfiguration,
  buildCodexChildEnvironment,
  buildCodexExecArguments,
  provisionCodexRunAuth,
  resolvePinnedCodexCli,
  validateBuilderCodexHome,
} from "./index.js";

const temporaryDirectories: string[] = [];
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "builder-codex-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Codex CLI boundary", () => {
  it("resolves only the pinned project-local package metadata and JavaScript launcher", async () => {
    const cli = await resolvePinnedCodexCli(repositoryRoot);
    expect(cli).toMatchObject({ packageName: "@openai/codex", packageVersion: CODEX_CLI_VERSION });
    expect(cli.binPath.replaceAll("\\", "/")).toContain("/node_modules/@openai/codex/bin/codex.js");
  });

  it("builds the fixed supported argument vector without prompt or injected flags", () => {
    const workspacePath = resolve("synthetic-workspace");
    const outputSchemaPath = resolve("synthetic-output.schema.json");
    const argumentsList = buildCodexExecArguments({ workspacePath, outputSchemaPath, model: "gpt-5.4" });
    expect(argumentsList).toEqual([
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
      workspacePath,
      "--output-schema",
      outputSchemaPath,
      "--color",
      "never",
      "--config",
      'web_search="disabled"',
      "--config",
      'shell_environment_policy.inherit="none"',
      "--model",
      "gpt-5.4",
      "-",
    ]);
    expect(argumentsList.join(" ")).not.toContain("planning prompt");
    expect(() => buildCodexExecArguments({ workspacePath, outputSchemaPath, model: "gpt-5; --danger" })).toThrow(
      /CODEX_MODEL/,
    );
  });

  it("passes only the minimal environment allowlist and never propagates secrets", () => {
    const environment = buildCodexChildEnvironment({
      PATH: "synthetic-path",
      TEMP: "synthetic-temp",
      CODEX_HOME: "must-not-pass",
      HOME: "must-not-pass",
      USERPROFILE: "must-not-pass",
      OPENAI_API_KEY: "must-not-pass",
      GH_TOKEN: "must-not-pass",
      DATABASE_PASSWORD: "must-not-pass",
      UNRELATED: "must-not-pass",
    });
    expect(environment).toEqual({
      PATH: "synthetic-path",
      TEMP: "synthetic-temp",
    });
    expect(JSON.stringify(environment)).not.toContain("must-not-pass");
  });

  it("requires an existing dedicated home outside repository, workspace, and the normal Codex home", async () => {
    const root = await temporaryDirectory();
    const workspacePath = join(root, "workspace");
    const builderCodexHome = join(root, "dedicated-home");
    const normalUserHome = join(root, "user");
    await Promise.all([mkdir(workspacePath), mkdir(builderCodexHome), mkdir(normalUserHome)]);
    await expect(
      validateBuilderCodexHome({
        configuredHome: builderCodexHome,
        repositoryRoot,
        workspacePath,
        defaultUserHome: normalUserHome,
      }),
    ).resolves.toBe(builderCodexHome);
    await expect(
      validateBuilderCodexHome({
        configuredHome: undefined,
        repositoryRoot,
        workspacePath,
        defaultUserHome: normalUserHome,
      }),
    ).rejects.toMatchObject({ code: "BUILDER_CODEX_HOME_REQUIRED" });
    await expect(
      validateBuilderCodexHome({
        configuredHome: workspacePath,
        repositoryRoot,
        workspacePath,
        defaultUserHome: normalUserHome,
      }),
    ).rejects.toMatchObject({ code: "BUILDER_CODEX_HOME_UNSAFE" });
    await mkdir(join(normalUserHome, ".codex"));
    await expect(
      validateBuilderCodexHome({
        configuredHome: join(normalUserHome, ".codex"),
        repositoryRoot,
        workspacePath,
        defaultUserHome: normalUserHome,
      }),
    ).rejects.toMatchObject({ code: "BUILDER_CODEX_HOME_UNSAFE" });
  });

  it("rejects normal CODEX_HOME overlap in both directions", async () => {
    const root = await temporaryDirectory();
    const workspacePath = join(root, "workspace");
    const normalCodexHome = join(root, "normal-codex-home");
    const nestedCredentialHome = join(normalCodexHome, "credential-home");
    const parentCredentialHome = join(root, "parent-credential-home");
    await Promise.all([
      mkdir(workspacePath),
      mkdir(nestedCredentialHome, { recursive: true }),
      mkdir(parentCredentialHome),
    ]);
    await expect(validateBuilderCodexHome({
      configuredHome: nestedCredentialHome,
      repositoryRoot,
      workspacePath,
      processCodexHome: normalCodexHome,
    })).rejects.toMatchObject({ code: "BUILDER_CODEX_HOME_UNSAFE" });
    await expect(validateBuilderCodexHome({
      configuredHome: parentCredentialHome,
      repositoryRoot,
      workspacePath,
      processCodexHome: join(parentCredentialHome, "nested-normal-codex-home"),
    })).rejects.toMatchObject({ code: "BUILDER_CODEX_HOME_UNSAFE" });
  });

  it("checks only credential metadata and rejects an auth.json junction escape", async () => {
    const root = await temporaryDirectory();
    const workspacePath = join(root, "workspace");
    const builderCodexHome = join(root, "dedicated-home");
    const normalUserHome = join(root, "user");
    const outside = join(root, "outside-auth");
    await Promise.all([
      mkdir(workspacePath),
      mkdir(builderCodexHome),
      mkdir(normalUserHome),
      mkdir(outside),
    ]);
    await writeFile(join(outside, "opaque"), "must-not-be-read", "utf8");
    await symlink(outside, join(builderCodexHome, "auth.json"), "junction");
    await expect(
      validateBuilderCodexHome({
        configuredHome: builderCodexHome,
        repositoryRoot,
        workspacePath,
        defaultUserHome: normalUserHome,
      }),
    ).rejects.toMatchObject({ code: "BUILDER_CODEX_HOME_UNSAFE" });
  });

  it("requires an absent run target even when the credential source has no auth.json", async () => {
    const root = await temporaryDirectory();
    const builderCodexHome = join(root, "credential-home");
    const runCodexHome = join(root, "run-codex-home");
    await Promise.all([mkdir(builderCodexHome), mkdir(runCodexHome)]);
    await writeFile(join(runCodexHome, "auth.json"), '{"synthetic":"preexisting-target"}', "utf8");

    await expect(provisionCodexRunAuth(builderCodexHome, runCodexHome)).rejects.toMatchObject({
      code: "CODEX_RUN_HOME_UNSAFE",
    });
  });

  it.each([".agents", ".codex", ".codex-plugin"])("rejects project-local %s directories", async (entry) => {
    const workspacePath = await temporaryDirectory();
    await mkdir(join(workspacePath, entry));
    await expect(assertNoProjectCodexConfiguration(workspacePath)).rejects.toMatchObject({
      code: "CODEX_PROJECT_CONFIG_FORBIDDEN",
    });
  });

  it.each([".mcp.json", "codex.config.toml", "plugins.json"])(
    "rejects project-local %s files at any depth",
    async (entry) => {
      const workspacePath = await temporaryDirectory();
      await mkdir(join(workspacePath, "nested"));
      await writeFile(join(workspacePath, "nested", entry), "synthetic", "utf8");
      await expect(assertNoProjectCodexConfiguration(workspacePath)).rejects.toMatchObject({
        code: "CODEX_PROJECT_CONFIG_FORBIDDEN",
      });
    },
  );
});
