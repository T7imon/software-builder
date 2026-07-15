import { describe, expect, it } from "vitest";

import { readWorkerConfiguration } from "./config.js";

describe("readWorkerConfiguration", () => {
  it("uses loopback-only defaults", () => {
    expect(readWorkerConfiguration({})).toEqual({
      host: "127.0.0.1",
      port: 3001,
      agentRuntime: "fake",
      codexRealSmokeTest: false,
    });
  });

  it("keeps fake as the explicit default and enables Codex only on the exact value", () => {
    expect(readWorkerConfiguration({ AGENT_RUNTIME: "fake" }).agentRuntime).toBe("fake");
    expect(readWorkerConfiguration({ AGENT_RUNTIME: "codex" }).agentRuntime).toBe("codex");
    expect(() => readWorkerConfiguration({ AGENT_RUNTIME: "CODEX" })).toThrow("AGENT_RUNTIME must be fake or codex");
    expect(() => readWorkerConfiguration({ AGENT_RUNTIME: "unknown" })).toThrow(
      "AGENT_RUNTIME must be fake or codex",
    );
  });

  it("treats blank example values as unset without weakening Codex start validation", () => {
    expect(readWorkerConfiguration({ BUILDER_CODEX_HOME: "", CODEX_MODEL: "", CODEX_REAL_SMOKE_TEST: "0" })).toEqual({
      host: "127.0.0.1",
      port: 3001,
      agentRuntime: "fake",
      codexRealSmokeTest: false,
    });
    expect(readWorkerConfiguration({ CODEX_REAL_SMOKE_TEST: "1" }).codexRealSmokeTest).toBe(true);
    expect(() => readWorkerConfiguration({ CODEX_REAL_SMOKE_TEST: "yes" })).toThrow(
      "CODEX_REAL_SMOKE_TEST must be 0 or 1",
    );
  });

  it.each(["3001suffix", "3001.5", "0", "65536", " 3001", "+3001", "03001"])(
    "rejects an invalid complete decimal port: %s",
    (port) => {
      expect(() => readWorkerConfiguration({ WORKER_PORT: port })).toThrow(
        "WORKER_PORT must be a decimal integer between 1 and 65535",
      );
    },
  );

  it("rejects non-loopback hosts", () => {
    expect(() => readWorkerConfiguration({ WORKER_HOST: "0.0.0.0" })).toThrow(
      "WORKER_HOST must be 127.0.0.1 during FOUNDATION",
    );
  });
});
