import { describe, expect, it } from "vitest";

import { getWorkerHealthResponse, workerHealth } from "./health.js";

describe("worker health handler", () => {
  it("returns the machine-readable health payload", () => {
    expect(getWorkerHealthResponse("GET", "/health")).toEqual({
      statusCode: 200,
      body: workerHealth,
    });
  });

  it("does not expose health for another method or path", () => {
    expect(getWorkerHealthResponse("POST", "/health").statusCode).toBe(404);
    expect(getWorkerHealthResponse("GET", "/").statusCode).toBe(404);
  });
});
