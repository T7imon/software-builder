import { createServer, type Server } from "node:http";

export const workerHealth = {
  service: "software-builder-worker",
  status: "ok",
} as const;

export interface WorkerHealthServerOptions {
  readonly host: string;
  readonly port: number;
}

export interface WorkerHealthResponse {
  readonly statusCode: 200 | 404;
  readonly body: typeof workerHealth | { readonly status: "not_found" };
}

export function getWorkerHealthResponse(method: string | undefined, url: string | undefined): WorkerHealthResponse {
  if (method !== "GET" || url !== "/health") {
    return { statusCode: 404, body: { status: "not_found" } };
  }

  return { statusCode: 200, body: workerHealth };
}

export function createWorkerHealthServer(): Server {
  return createServer((request, response) => {
    const healthResponse = getWorkerHealthResponse(request.method, request.url);

    response.writeHead(healthResponse.statusCode, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(healthResponse.body));
  });
}

export function listenForHealth(server: Server, options: WorkerHealthServerOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}
