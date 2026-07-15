import { readWorkerConfiguration } from "./config.js";
import { createWorkerHealthServer, listenForHealth, workerHealth } from "./health.js";

const mode = process.argv[2] ?? "";
const agentTestModes = [
  "agent-once",
  "agent-worker",
  "agent-crash",
  "agent-prestart-cancel",
  "agent-job-cancelled-outbox-once",
];

if (agentTestModes.includes(mode)) {
  const [
    { Pool },
    { AgentJobRepository, PostgresCodexRuntimeRepository, PostgresWorkspaceRegistrationStore },
    { FakeAgentRuntime },
    { ProjectWorkspaceManager, loadWorkspaceConfig },
    { CodexRuntimeContextResolver },
    { createAgentRuntime },
    { AgentJobProcessor },
    { BackgroundWorker },
  ] = await Promise.all([
    import("pg"),
    import("@software-builder/database"),
    import("@software-builder/agent-runtime"),
    import("@software-builder/project-workspace"),
    import("./codex-runtime-context.js"),
    import("./runtime-factory.js"),
    import("./job-processor.js"),
    import("./worker-loop.js"),
  ]);
  const connectionString = process.env.PROCESS_DATABASE_URL;
  if (!connectionString) throw new Error("PROCESS_DATABASE_URL is required for explicit agent test mode");
  const target = new URL(connectionString);
  if (
    process.env.AGENT_WORKER_TEST_MODE !== "1" ||
    !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
    !target.pathname.toLowerCase().endsWith("_test")
  ) {
    throw new Error("agent test modes are restricted to an explicit loopback test database");
  }
  const configuration = readWorkerConfiguration(process.env);
  const pool = new Pool({ connectionString, application_name: "software-builder-agent-worker" });
  try {
    const repository = new AgentJobRepository(pool);
    if (mode === "agent-prestart-cancel") {
      const jobId = process.argv[3];
      if (!jobId) throw new Error("agent-prestart-cancel requires a job id");
      const status = await repository.requestCancel(jobId);
      if (process.env.PRESTART_CANCEL_CRASH_AFTER_COMMIT === "1") process.exit(87);
      process.stdout.write(JSON.stringify({ ok: true, status: status.status }));
    } else if (mode === "agent-job-cancelled-outbox-once") {
      const processed = await repository.dispatchNextJobCancelled(
        process.argv[3] ?? "agent-job-cancelled-projection",
        process.env.JOB_CANCELLED_OUTBOX_JOB_ID,
      );
      process.stdout.write(JSON.stringify({ ok: true, processed }));
    } else {
      const delayMs = Number(process.env.FAKE_RUNTIME_DELAY_MS ?? 0);
      const codexRepository = configuration.agentRuntime === "codex"
        ? new PostgresCodexRuntimeRepository(pool)
        : undefined;
      const workspaceConfig = configuration.agentRuntime === "codex"
        ? await loadWorkspaceConfig(process.env)
        : undefined;
      const processor = new AgentJobProcessor(repository, {
        runtimeFactory: async (store, claim) => {
          if (configuration.agentRuntime === "fake") {
            const base = new FakeAgentRuntime({ store });
            if (delayMs <= 0) return base;
            let cancellation: Awaited<ReturnType<typeof base.cancelRun>> | undefined;
            return {
              startRun: async (command) => {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
                return cancellation ?? base.startRun(command);
              },
              continueRun: (command) => base.continueRun(command),
              cancelRun: async (command) => (cancellation = await base.cancelRun(command)),
              getRunStatus: (command) => base.getRunStatus(command),
            };
          }
          if (!codexRepository || !workspaceConfig) throw new Error("CODEX_RUNTIME_NOT_CONFIGURED");
          const workspaceStore = PostgresWorkspaceRegistrationStore.forTestHarness(
            pool,
            claim.projectId as never,
            "codex-runtime-reader",
            connectionString,
          );
          const workspaceReader = new ProjectWorkspaceManager(workspaceConfig, workspaceStore);
          const codexContextResolver = new CodexRuntimeContextResolver({
            repository: codexRepository,
            workspaceReader,
            workspaceConfig,
            environment: process.env,
            builderCodexHome: configuration.builderCodexHome,
            ...(configuration.codexModel === undefined ? {} : { model: configuration.codexModel }),
          });
          return createAgentRuntime({
            mode: "codex",
            store,
            claim,
            codexRepository,
            codexContextResolver,
          });
        },
        ...(mode === "agent-crash" ? { afterRuntimePersisted: () => process.exit(86) } : {}),
      });
      const worker = new BackgroundWorker(repository, processor, {
        workerId: process.argv[3] ?? "process-worker",
        leaseMs: Number(process.env.AGENT_WORKER_LEASE_MS ?? 10_000),
        heartbeatIntervalMs: Number(process.env.AGENT_WORKER_HEARTBEAT_MS ?? 1_000),
        pollIntervalMs: Number(process.env.AGENT_WORKER_POLL_MS ?? 100),
      });
      if (mode === "agent-once" || mode === "agent-crash") {
        const processed = await worker.runOnce();
        process.stdout.write(JSON.stringify({ ok: true, processed }));
      } else {
        if (process.env.AGENT_WORKER_ENABLED !== "1") {
          throw new Error("agent-worker requires explicit AGENT_WORKER_ENABLED=1");
        }
        const shutdown = (): void => worker.stop();
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
        process.stdout.write(`${JSON.stringify({ ok: true, state: "polling" })}\n`);
        await worker.run();
      }
    }
  } finally {
    await pool.end();
  }
} else {
  const { host, port } = readWorkerConfiguration(process.env);
  const server = createWorkerHealthServer();
  await listenForHealth(server, { host, port });
  console.log(`[worker] health=${workerHealth.status} service=${workerHealth.service} endpoint=http://${host}:${port}/health`);
  function shutdown(signal: string): void {
    console.log(`[worker] shutdown signal=${signal}`);
    server.close((error) => {
      if (error) {
        console.error("[worker] shutdown failed");
        process.exitCode = 1;
      }
    });
  }
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
