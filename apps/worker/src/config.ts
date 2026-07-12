export interface WorkerConfiguration {
  readonly host: "127.0.0.1";
  readonly port: number;
}

export function readWorkerConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): WorkerConfiguration {
  const host = environment.WORKER_HOST ?? "127.0.0.1";
  const portText = environment.WORKER_PORT ?? "3001";

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

  return { host, port };
}
