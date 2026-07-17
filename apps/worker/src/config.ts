export interface WorkerConfiguration {
  readonly host: "127.0.0.1";
  readonly port: number;
  readonly agentRuntime: "fake" | "codex";
  readonly builderCodexHome?: string;
  readonly codexModel?: string;
  readonly codexRealSmokeTest: boolean;
}

export const CODEX_DEVELOPMENT_TIMEOUT_MS = 120_000;
const modelPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

export function readWorkerConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): WorkerConfiguration {
  const host = environment.WORKER_HOST ?? "127.0.0.1";
  const portText = environment.WORKER_PORT ?? "3001";
  const runtime = environment.AGENT_RUNTIME ?? "fake";

  if (host !== "127.0.0.1") {
    throw new Error("WORKER_HOST must be 127.0.0.1 during FOUNDATION");
  }

  if (!/^[1-9]\d{0,4}$/.test(portText)) {
    throw new Error("WORKER_PORT must be a decimal integer between 1 and 65535");
  }

  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new Error("WORKER_PORT must be a decimal integer between 1 and 65535");
  }

  if (runtime !== "fake" && runtime !== "codex") throw new Error("AGENT_RUNTIME must be fake or codex");
  const smoke = environment.CODEX_REAL_SMOKE_TEST ?? "0";
  if (smoke !== "0" && smoke !== "1") throw new Error("CODEX_REAL_SMOKE_TEST must be 0 or 1");
  const model = environment.CODEX_MODEL === "" ? undefined : environment.CODEX_MODEL;
  if (model !== undefined && !modelPattern.test(model)) throw new Error("CODEX_MODEL is invalid");
  const builderCodexHome = environment.BUILDER_CODEX_HOME === "" ? undefined : environment.BUILDER_CODEX_HOME;
  if (builderCodexHome !== undefined && builderCodexHome.trim() !== builderCodexHome) throw new Error("BUILDER_CODEX_HOME is invalid");

  return {
    host,
    port,
    agentRuntime: runtime,
    codexRealSmokeTest: smoke === "1",
    ...(builderCodexHome === undefined ? {} : { builderCodexHome }),
    ...(model === undefined ? {} : { codexModel: model }),
  };
}
