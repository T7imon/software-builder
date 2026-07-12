import { describe, expect, it } from "vitest";

import { readWorkerConfiguration } from "./config.js";

describe("readWorkerConfiguration", () => {
  it("uses loopback-only defaults", () => {
    expect(readWorkerConfiguration({})).toEqual({ host: "127.0.0.1", port: 3001 });
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
