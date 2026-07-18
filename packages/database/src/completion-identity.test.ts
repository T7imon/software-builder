import { describe, expect, it } from "vitest";
import {
  AGENT_JOB_COMPLETION_DOMAIN,
  completionSemanticDigest,
  deriveAgentJobCompletionId,
  type CompleteAgentJobContext,
  type ConfirmCancelledAgentJobContext,
} from "./completion-identity.js";

const vector: CompleteAgentJobContext = {
  assignment: null,
  attemptId: "attempt/vector",
  claimId: "claim/vector",
  discriminator: { kind: "RUNTIME_WATERMARK", runtimeWatermark: 5 },
  fencingToken: 7,
  jobId: "22222222-2222-4222-8222-222222222222",
  jobVersion: 11,
  leaseGeneration: 3,
  operation: "COMPLETE",
  operationSchemaVersion: 1,
  projectId: "11111111-1111-4111-8111-111111111111",
  role: "PLANNER",
  runId: "run/vector",
  schemaVersion: 2,
  taskId: "task/vector",
  workerId: "worker/vector",
};

describe("agent job completion identity", () => {
  it("matches the independently calculated SHA-256 UUID-v8 vector", () => {
    expect(completionSemanticDigest({ domain: AGENT_JOB_COMPLETION_DOMAIN, context: vector })).toBe(
      "bad59cd5a6ba3905de27adb747577eece94802ee222328230fc00cd12211ed19",
    );
    expect(deriveAgentJobCompletionId(vector)).toBe("bad59cd5-a6ba-8905-9e27-adb747577eec");
  });

  it("is lowercase UUID-v8 with the RFC variant", () => {
    expect(deriveAgentJobCompletionId(vector)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("separates every required completion binding", () => {
    const assignment = { assignmentId: "33333333-3333-4333-8333-333333333333", agentId: "44444444-4444-4444-8444-444444444444", agentKey: "planner-one", agentVersion: 2 };
    const values: CompleteAgentJobContext[] = [
      { ...vector, projectId: "55555555-5555-4555-8555-555555555555" },
      { ...vector, jobId: "66666666-6666-4666-8666-666666666666" },
      { ...vector, taskId: "task/other" },
      { ...vector, attemptId: "attempt/other" },
      { ...vector, runId: "run/other" },
      { ...vector, role: "ARCHITECT" },
      { ...vector, workerId: "worker/other" },
      { ...vector, claimId: "claim/other" },
      { ...vector, fencingToken: 8 },
      { ...vector, leaseGeneration: 4 },
      { ...vector, jobVersion: 12 },
      { ...vector, assignment },
      { ...vector, discriminator: { kind: "RUNTIME_WATERMARK", runtimeWatermark: 6 } },
    ];
    const baseline = deriveAgentJobCompletionId(vector);
    expect(new Set([baseline, ...values.map(deriveAgentJobCompletionId)]).size).toBe(values.length + 1);
    expect(deriveAgentJobCompletionId({ ...vector, assignment })).not.toBe(
      deriveAgentJobCompletionId({ ...vector, assignment: { ...assignment, agentVersion: 3 } }),
    );
    for (const key of ["assignmentId", "agentId", "agentKey"] as const) {
      const changed = key === "agentKey" ? "planner-two" : "77777777-7777-4777-8777-777777777777";
      expect(deriveAgentJobCompletionId({ ...vector, assignment: { ...assignment, [key]: changed } })).not.toBe(
        deriveAgentJobCompletionId({ ...vector, assignment }),
      );
    }
  });

  it("separates completion from evidence-bound cancellation", () => {
    const cancellation: ConfirmCancelledAgentJobContext = {
      ...vector,
      operation: "CONFIRM_CANCELLED",
      discriminator: { kind: "TERMINATION_EVIDENCE", evidenceId: "evidence/vector", runtimeWatermark: 5 },
    };
    expect(deriveAgentJobCompletionId(cancellation)).not.toBe(deriveAgentJobCompletionId(vector));
    expect(deriveAgentJobCompletionId(cancellation)).not.toBe(
      deriveAgentJobCompletionId({ ...cancellation, discriminator: { ...cancellation.discriminator, evidenceId: "evidence/other" } }),
    );
  });

  it.each([
    ["missing field", Object.fromEntries(Object.entries(vector).filter(([key]) => key !== "assignment"))],
    ["additional field", { ...vector, arbitraryCompletionId: "00000000-0000-8000-8000-000000000000" }],
    ["invalid context schema", { ...vector, schemaVersion: 3 }],
    ["invalid operation schema", { ...vector, operationSchemaVersion: 2 }],
    ["operation/discriminator mismatch", { ...vector, operation: "CONFIRM_CANCELLED" }],
    ["malformed project", { ...vector, projectId: "not-a-uuid" }],
    ["non-canonical uppercase UUID", { ...vector, projectId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }],
    ["stale numeric shape", { ...vector, fencingToken: 0 }],
    ["malformed watermark", { ...vector, discriminator: { kind: "RUNTIME_WATERMARK", runtimeWatermark: -1 } }],
  ])("rejects strict malformed context: %s", (_label, value) => {
    expect(() => deriveAgentJobCompletionId(value as CompleteAgentJobContext)).toThrow("COMPLETION_CONTEXT_INVALID");
  });
});
