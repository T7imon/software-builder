import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

declare const workerProcessInstanceIdBrand: unique symbol;
declare const workerClaimIdBrand: unique symbol;
declare const workerOwnershipProofBrand: unique symbol;
declare const workerOwnershipDigestBrand: unique symbol;
declare const processLaunchIdBrand: unique symbol;
declare const processLaunchProofBrand: unique symbol;
declare const processLaunchDigestBrand: unique symbol;

export type WorkerProcessInstanceId = string & { readonly [workerProcessInstanceIdBrand]: true };
export type WorkerClaimId = string & { readonly [workerClaimIdBrand]: true };
export type WorkerOwnershipProof = string & { readonly [workerOwnershipProofBrand]: true };
export type WorkerOwnershipDigest = string & { readonly [workerOwnershipDigestBrand]: true };
export type ProcessLaunchId = string & { readonly [processLaunchIdBrand]: true };
export type ProcessLaunchProof = string & { readonly [processLaunchProofBrand]: true };
export type ProcessLaunchDigest = string & { readonly [processLaunchDigestBrand]: true };

export const WORKER_PROCESS_IDENTITY_POLICY_VERSION = "worker-process-identity-v1" as const;
export const WORKER_PROCESS_RUNTIME_VERSION = "node-worker-v1" as const;
export const WORKER_CLAIM_ID_POLICY_VERSION = "worker-claim-id-v1" as const;
export const PROCESS_LAUNCH_RECEIPT_POLICY_VERSION = "process-launch-receipt-v1" as const;

const lowerHex64 = /^[0-9a-f]{64}$/u;
const workerIdPattern = /^wpi_[0-9a-f]{64}$/u;
const workerClaimIdPattern = /^wcl_[0-9a-f]{64}$/u;
const workerProofPattern = /^wop_[0-9a-f]{64}$/u;
const sha256Pattern = /^sha256:[0-9a-f]{64}$/u;
const launchIdPattern = /^pli_[0-9a-f]{64}$/u;
const launchProofPattern = /^plp_[0-9a-f]{64}$/u;
const safeReference = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;

export interface WorkerProcessIdentity {
  readonly instanceId: WorkerProcessInstanceId;
  /** Process-local possession material. It must never be persisted or logged. */
  readonly ownershipProof: WorkerOwnershipProof;
  readonly ownershipDigest: WorkerOwnershipDigest;
  readonly policyVersion: typeof WORKER_PROCESS_IDENTITY_POLICY_VERSION;
  readonly runtimeVersion: typeof WORKER_PROCESS_RUNTIME_VERSION;
}

export interface ProcessLaunchBinding {
  readonly parentWorkerInstanceId: WorkerProcessInstanceId;
  readonly workerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly assignmentId: string;
  readonly claimId: string;
  readonly leaseGeneration: number;
  readonly fencingToken: number;
  readonly jobVersion: number;
}

export interface ProcessLaunchReceipt {
  readonly processLaunchId: ProcessLaunchId;
  /** Launch-local possession material. It must never be persisted or logged. */
  readonly launchProof: ProcessLaunchProof;
  readonly receiptDigest: ProcessLaunchDigest;
  readonly bindingDigest: ProcessLaunchDigest;
  readonly processIdDigest: ProcessLaunchDigest;
  /** The observed ChildProcess pid. It is validated in memory and never persisted. */
  readonly processId: number;
  readonly policyVersion: typeof PROCESS_LAUNCH_RECEIPT_POLICY_VERSION;
}

type RandomSource = (size: number) => Uint8Array;

function exactKeys(value: object, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(code);
}

function bytes(source: RandomSource): string {
  const value = source(32);
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) throw new Error("IDENTITY_RANDOM_SOURCE_INVALID");
  return Buffer.from(value).toString("hex");
}

function digest(domain: string, ...values: readonly string[]): string {
  const hash = createHash("sha256");
  hash.update(domain, "utf8");
  for (const value of values) {
    hash.update("\0", "utf8");
    hash.update(value, "utf8");
  }
  return `sha256:${hash.digest("hex")}`;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

export function parseWorkerProcessInstanceId(value: unknown): WorkerProcessInstanceId {
  if (typeof value !== "string" || !workerIdPattern.test(value)) throw new Error("WORKER_PROCESS_INSTANCE_ID_INVALID");
  return value as WorkerProcessInstanceId;
}

export function parseWorkerClaimId(value: unknown): WorkerClaimId {
  if (typeof value !== "string" || !workerClaimIdPattern.test(value)) throw new Error("WORKER_CLAIM_ID_INVALID");
  return value as WorkerClaimId;
}

export function deriveWorkerClaimId(instanceId: WorkerProcessInstanceId, ordinal: number): WorkerClaimId {
  const validatedInstanceId = parseWorkerProcessInstanceId(instanceId);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) throw new Error("WORKER_CLAIM_ORDINAL_INVALID");
  const value = digest(WORKER_CLAIM_ID_POLICY_VERSION, validatedInstanceId, String(ordinal)).slice("sha256:".length);
  return parseWorkerClaimId(`wcl_${value}`);
}

export function parseProcessLaunchId(value: unknown): ProcessLaunchId {
  if (typeof value !== "string" || !launchIdPattern.test(value)) throw new Error("PROCESS_LAUNCH_ID_INVALID");
  return value as ProcessLaunchId;
}

export function parseWorkerOwnershipDigest(value: unknown): WorkerOwnershipDigest {
  if (typeof value !== "string" || !sha256Pattern.test(value)) throw new Error("WORKER_OWNERSHIP_DIGEST_INVALID");
  return value as WorkerOwnershipDigest;
}

export function parseProcessLaunchDigest(value: unknown): ProcessLaunchDigest {
  if (typeof value !== "string" || !sha256Pattern.test(value)) throw new Error("PROCESS_LAUNCH_DIGEST_INVALID");
  return value as ProcessLaunchDigest;
}

export function deriveWorkerOwnershipDigest(instanceId: WorkerProcessInstanceId, ownershipProof: WorkerOwnershipProof): WorkerOwnershipDigest {
  return digest(WORKER_PROCESS_IDENTITY_POLICY_VERSION, instanceId, ownershipProof) as WorkerOwnershipDigest;
}

function createWorkerIdentity(source: RandomSource): WorkerProcessIdentity {
  const instanceId = `wpi_${bytes(source)}` as WorkerProcessInstanceId;
  const ownershipProof = `wop_${bytes(source)}` as WorkerOwnershipProof;
  return Object.freeze({
    instanceId,
    ownershipProof,
    ownershipDigest: deriveWorkerOwnershipDigest(instanceId, ownershipProof),
    policyVersion: WORKER_PROCESS_IDENTITY_POLICY_VERSION,
    runtimeVersion: WORKER_PROCESS_RUNTIME_VERSION,
  });
}

export function createWorkerProcessIdentity(): WorkerProcessIdentity {
  return createWorkerIdentity(size => randomBytes(size));
}

/** Explicit deterministic seam for unit and harmless multiprocess tests only. */
export function createWorkerProcessIdentityForTest(instanceSeed: string, proofSeed: string): WorkerProcessIdentity {
  if (!lowerHex64.test(instanceSeed) || !lowerHex64.test(proofSeed)) throw new Error("TEST_IDENTITY_SEED_INVALID");
  const values = [Buffer.from(instanceSeed, "hex"), Buffer.from(proofSeed, "hex")];
  return createWorkerIdentity(size => {
    if (size !== 32 || values.length === 0) throw new Error("TEST_IDENTITY_RANDOM_EXHAUSTED");
    return values.shift()!;
  });
}

export class WorkerProcessBootIdentity {
  private readonly identity: WorkerProcessIdentity;
  private constructor(identity: WorkerProcessIdentity) {
    this.identity = assertWorkerProcessIdentity(identity);
  }
  static create(): WorkerProcessBootIdentity {
    return new WorkerProcessBootIdentity(createWorkerProcessIdentity());
  }
  /** Explicit deterministic boot seam for tests; production code must use create(). */
  static forTest(instanceSeed: string, proofSeed: string): WorkerProcessBootIdentity {
    return new WorkerProcessBootIdentity(createWorkerProcessIdentityForTest(instanceSeed, proofSeed));
  }
  get(): WorkerProcessIdentity {
    return this.identity;
  }
}

export function assertWorkerProcessIdentity(value: unknown): WorkerProcessIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("WORKER_PROCESS_IDENTITY_INVALID");
  exactKeys(value, ["instanceId", "ownershipProof", "ownershipDigest", "policyVersion", "runtimeVersion"], "WORKER_PROCESS_IDENTITY_INVALID");
  const record = value as Record<string, unknown>;
  const instanceId = parseWorkerProcessInstanceId(record.instanceId);
  if (typeof record.ownershipProof !== "string" || !workerProofPattern.test(record.ownershipProof)) throw new Error("WORKER_OWNERSHIP_PROOF_INVALID");
  const ownershipProof = record.ownershipProof as WorkerOwnershipProof;
  const ownershipDigest = parseWorkerOwnershipDigest(record.ownershipDigest);
  if (record.policyVersion !== WORKER_PROCESS_IDENTITY_POLICY_VERSION || record.runtimeVersion !== WORKER_PROCESS_RUNTIME_VERSION) throw new Error("WORKER_PROCESS_IDENTITY_VERSION_INVALID");
  if (!safeEqual(ownershipDigest, deriveWorkerOwnershipDigest(instanceId, ownershipProof))) throw new Error("WORKER_PROCESS_IDENTITY_PROOF_INVALID");
  return value as WorkerProcessIdentity;
}

export function assertProcessLaunchBinding(value: unknown): ProcessLaunchBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROCESS_LAUNCH_BINDING_INVALID");
  exactKeys(value, ["parentWorkerInstanceId", "workerId", "projectId", "jobId", "taskId", "attemptId", "runId", "assignmentId", "claimId", "leaseGeneration", "fencingToken", "jobVersion"], "PROCESS_LAUNCH_BINDING_INVALID");
  const binding = value as unknown as ProcessLaunchBinding;
  parseWorkerProcessInstanceId(binding.parentWorkerInstanceId);
  for (const key of ["workerId", "projectId", "jobId", "taskId", "attemptId", "runId", "assignmentId", "claimId"] as const) {
    if (typeof binding[key] !== "string" || !safeReference.test(binding[key])) throw new Error("PROCESS_LAUNCH_BINDING_INVALID");
  }
  for (const key of ["leaseGeneration", "fencingToken", "jobVersion"] as const) {
    if (!Number.isSafeInteger(binding[key]) || binding[key] < 1) throw new Error("PROCESS_LAUNCH_BINDING_INVALID");
  }
  return binding;
}

function canonicalBinding(binding: ProcessLaunchBinding): string {
  assertProcessLaunchBinding(binding);
  return JSON.stringify(Object.fromEntries(Object.entries(binding).sort(([left], [right]) => left.localeCompare(right))));
}

export function deriveProcessLaunchBindingDigest(binding: ProcessLaunchBinding): ProcessLaunchDigest {
  return digest(PROCESS_LAUNCH_RECEIPT_POLICY_VERSION, "BINDING", canonicalBinding(binding)) as ProcessLaunchDigest;
}

function createLaunchReceipt(processId: number, binding: ProcessLaunchBinding, source: RandomSource): ProcessLaunchReceipt {
  if (!Number.isSafeInteger(processId) || processId < 1) throw new Error("PROCESS_LAUNCH_PID_INVALID");
  const processLaunchId = `pli_${bytes(source)}` as ProcessLaunchId;
  const launchProof = `plp_${bytes(source)}` as ProcessLaunchProof;
  const bindingDigest = deriveProcessLaunchBindingDigest(binding);
  const processIdDigest = digest(PROCESS_LAUNCH_RECEIPT_POLICY_VERSION, "PID", String(processId), launchProof) as ProcessLaunchDigest;
  const receiptDigest = digest(PROCESS_LAUNCH_RECEIPT_POLICY_VERSION, "RECEIPT", processLaunchId, launchProof, String(processId), bindingDigest) as ProcessLaunchDigest;
  return Object.freeze({ processLaunchId, launchProof, receiptDigest, bindingDigest, processIdDigest, processId, policyVersion: PROCESS_LAUNCH_RECEIPT_POLICY_VERSION });
}

export function createProcessLaunchReceipt(processId: number, binding: ProcessLaunchBinding): ProcessLaunchReceipt {
  return createLaunchReceipt(processId, binding, size => randomBytes(size));
}

/** Explicit deterministic seam for launcher/PID-reuse tests only. */
export function createProcessLaunchReceiptForTest(processId: number, binding: ProcessLaunchBinding, identitySeed: string, proofSeed: string): ProcessLaunchReceipt {
  if (!lowerHex64.test(identitySeed) || !lowerHex64.test(proofSeed)) throw new Error("TEST_LAUNCH_SEED_INVALID");
  const values = [Buffer.from(identitySeed, "hex"), Buffer.from(proofSeed, "hex")];
  return createLaunchReceipt(processId, binding, size => {
    if (size !== 32 || values.length === 0) throw new Error("TEST_LAUNCH_RANDOM_EXHAUSTED");
    return values.shift()!;
  });
}

export function assertProcessLaunchReceipt(value: unknown, binding: ProcessLaunchBinding): ProcessLaunchReceipt {
  assertProcessLaunchBinding(binding);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROCESS_LAUNCH_RECEIPT_INVALID");
  exactKeys(value, ["processLaunchId", "launchProof", "receiptDigest", "bindingDigest", "processIdDigest", "processId", "policyVersion"], "PROCESS_LAUNCH_RECEIPT_INVALID");
  const receipt = value as unknown as ProcessLaunchReceipt;
  parseProcessLaunchId(receipt.processLaunchId);
  if (typeof receipt.launchProof !== "string" || !launchProofPattern.test(receipt.launchProof)) throw new Error("PROCESS_LAUNCH_PROOF_INVALID");
  parseProcessLaunchDigest(receipt.receiptDigest);
  parseProcessLaunchDigest(receipt.bindingDigest);
  parseProcessLaunchDigest(receipt.processIdDigest);
  if (!Number.isSafeInteger(receipt.processId) || receipt.processId < 1 || receipt.policyVersion !== PROCESS_LAUNCH_RECEIPT_POLICY_VERSION) throw new Error("PROCESS_LAUNCH_RECEIPT_INVALID");
  const expectedBinding = deriveProcessLaunchBindingDigest(binding);
  const expectedPid = digest(PROCESS_LAUNCH_RECEIPT_POLICY_VERSION, "PID", String(receipt.processId), receipt.launchProof) as ProcessLaunchDigest;
  const expectedReceipt = digest(PROCESS_LAUNCH_RECEIPT_POLICY_VERSION, "RECEIPT", receipt.processLaunchId, receipt.launchProof, String(receipt.processId), expectedBinding) as ProcessLaunchDigest;
  if (!safeEqual(receipt.bindingDigest, expectedBinding) || !safeEqual(receipt.processIdDigest, expectedPid) || !safeEqual(receipt.receiptDigest, expectedReceipt)) throw new Error("PROCESS_LAUNCH_RECEIPT_PROOF_INVALID");
  return receipt;
}
