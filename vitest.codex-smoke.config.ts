import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/worker/src/codex-runtime.real-smoke.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 300_000,
    hookTimeout: 30_000,
  },
});
