import { readWorkerConfiguration } from "./config.js";
import { createWorkerHealthServer, listenForHealth, workerHealth } from "./health.js";

const { host, port } = readWorkerConfiguration(process.env);

const server = createWorkerHealthServer();
await listenForHealth(server, { host, port });

console.log(
  `[worker] health=${workerHealth.status} service=${workerHealth.service} endpoint=http://${host}:${port}/health`,
);

function shutdown(signal: string) {
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
