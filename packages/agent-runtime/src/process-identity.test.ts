import { describe, expect, it } from "vitest";
import {
  WorkerProcessBootIdentity,
  assertProcessLaunchReceipt,
  assertWorkerProcessIdentity,
  createProcessLaunchReceiptForTest,
  createWorkerProcessIdentityForTest,
  deriveWorkerClaimId,
  parseProcessLaunchId,
  parseWorkerClaimId,
  parseWorkerProcessInstanceId,
  type ProcessLaunchBinding,
} from "./process-identity.js";

const a = "11".repeat(32);
const b = "22".repeat(32);
const c = "33".repeat(32);
const d = "44".repeat(32);

function binding(worker = createWorkerProcessIdentityForTest(a, b)): ProcessLaunchBinding {
  return {
    parentWorkerInstanceId: worker.instanceId,
    workerId: "worker-alpha",
    projectId: "11111111-1111-4111-8111-111111111111",
    jobId: "22222222-2222-4222-8222-222222222222",
    taskId: "task-1",
    attemptId: "attempt-1",
    runId: "run-1",
    assignmentId: "33333333-3333-4333-8333-333333333333",
    claimId: "claim-1",
    leaseGeneration: 2,
    fencingToken: 3,
    jobVersion: 4,
  };
}

describe("real worker/process identity", () => {
  it("creates strict immutable worker identities through the explicit deterministic seam", () => {
    const identity = createWorkerProcessIdentityForTest(a, b);
    expect(assertWorkerProcessIdentity(identity)).toBe(identity);
    expect(Object.isFrozen(identity)).toBe(true);
    expect(() => assertWorkerProcessIdentity({ ...identity, extra: "forbidden" })).toThrow("WORKER_PROCESS_IDENTITY_INVALID");
    expect(() => assertWorkerProcessIdentity({ ...identity, ownershipProof: `wop_${c}` })).toThrow("WORKER_PROCESS_IDENTITY_PROOF_INVALID");
    expect(() => parseWorkerProcessInstanceId("1234")).toThrow("WORKER_PROCESS_INSTANCE_ID_INVALID");
    expect(() => parseWorkerProcessInstanceId(`wpi_${"g".repeat(64)}`)).toThrow("WORKER_PROCESS_INSTANCE_ID_INVALID");
  });

  it("holds exactly one identity for a boot and changes identity on a new boot", () => {
    const first = WorkerProcessBootIdentity.forTest(a, b);
    const second = WorkerProcessBootIdentity.forTest(c, d);
    expect(first.get()).toBe(first.get());
    expect(first.get().instanceId).not.toBe(second.get().instanceId);
  });

  it("derives strict claim ids from boot identity and a positive monotonic ordinal", () => {
    const firstBoot = createWorkerProcessIdentityForTest(a, b);
    const secondBoot = createWorkerProcessIdentityForTest(c, d);
    const first = deriveWorkerClaimId(firstBoot.instanceId, 1);
    expect(parseWorkerClaimId(first)).toBe(first);
    expect(first).toMatch(/^wcl_[0-9a-f]{64}$/u);
    expect(deriveWorkerClaimId(firstBoot.instanceId, 2)).not.toBe(first);
    expect(deriveWorkerClaimId(secondBoot.instanceId, 1)).not.toBe(first);
    expect(deriveWorkerClaimId(firstBoot.instanceId, 1)).toBe(first);
    expect(() => deriveWorkerClaimId(firstBoot.instanceId, 0)).toThrow("WORKER_CLAIM_ORDINAL_INVALID");
    expect(() => deriveWorkerClaimId(firstBoot.instanceId, Number.MAX_SAFE_INTEGER + 1)).toThrow("WORKER_CLAIM_ORDINAL_INVALID");
    expect(() => deriveWorkerClaimId("worker-chosen" as never, 1)).toThrow("WORKER_PROCESS_INSTANCE_ID_INVALID");
    expect(() => parseWorkerClaimId("worker-alpha:claim:1")).toThrow("WORKER_CLAIM_ID_INVALID");
  });

  it("binds launch identity to actual pid and the complete context without making termination claims", () => {
    const launchBinding = binding();
    const receipt = createProcessLaunchReceiptForTest(7312, launchBinding, c, d);
    expect(assertProcessLaunchReceipt(receipt, launchBinding)).toBe(receipt);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.keys(receipt).sort()).toEqual(["bindingDigest", "launchProof", "policyVersion", "processId", "processIdDigest", "processLaunchId", "receiptDigest"].sort());
    expect(() => assertProcessLaunchReceipt(receipt, { ...launchBinding, fencingToken: 4 })).toThrow("PROCESS_LAUNCH_RECEIPT_PROOF_INVALID");
    expect(() => assertProcessLaunchReceipt({ ...receipt, receiptDigest: `sha256:${a}` }, launchBinding)).toThrow("PROCESS_LAUNCH_RECEIPT_PROOF_INVALID");
    expect(() => parseProcessLaunchId(String(receipt.processId))).toThrow("PROCESS_LAUNCH_ID_INVALID");
  });

  it("does not reuse identity when a pid is reused", () => {
    const launchBinding = binding();
    const first = createProcessLaunchReceiptForTest(4242, launchBinding, a, b);
    const second = createProcessLaunchReceiptForTest(4242, launchBinding, c, d);
    expect(first.processLaunchId).not.toBe(second.processLaunchId);
    expect(first.receiptDigest).not.toBe(second.receiptDigest);
  });

  it("rejects malformed, missing and arbitrary identity material fail closed", () => {
    expect(() => createWorkerProcessIdentityForTest("short", b)).toThrow("TEST_IDENTITY_SEED_INVALID");
    expect(() => assertWorkerProcessIdentity(undefined)).toThrow("WORKER_PROCESS_IDENTITY_INVALID");
    expect(() => assertProcessLaunchReceipt(undefined, binding())).toThrow("PROCESS_LAUNCH_RECEIPT_INVALID");
    expect(() => createProcessLaunchReceiptForTest(0, binding(), a, b)).toThrow("PROCESS_LAUNCH_PID_INVALID");
  });
});
