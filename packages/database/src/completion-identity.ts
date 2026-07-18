import { createHash } from "node:crypto";
import type { AgentTask } from "@software-builder/agent-runtime";

export const AGENT_JOB_COMPLETION_DOMAIN = "software-builder/agent-job-completion/v2" as const;

export interface CompletionAssignmentBinding {
  readonly assignmentId: string;
  readonly agentId: string;
  readonly agentKey: string;
  readonly agentVersion: number;
}

interface CompletionContextBase {
  readonly schemaVersion: 2;
  readonly operationSchemaVersion: 1;
  readonly projectId: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly role: AgentTask["role"];
  readonly workerId: string;
  readonly claimId: string;
  readonly fencingToken: number;
  readonly leaseGeneration: number;
  readonly jobVersion: number;
  readonly assignment: CompletionAssignmentBinding | null;
}

export interface CompleteAgentJobContext extends CompletionContextBase {
  readonly operation: "COMPLETE";
  readonly discriminator: {
    readonly kind: "RUNTIME_WATERMARK";
    readonly runtimeWatermark: number;
  };
}

export interface ConfirmCancelledAgentJobContext extends CompletionContextBase {
  readonly operation: "CONFIRM_CANCELLED";
  readonly discriminator: {
    readonly kind: "TERMINATION_EVIDENCE";
    readonly evidenceId: string;
    readonly runtimeWatermark: number;
  };
}

export type AgentJobCompletionContext = CompleteAgentJobContext | ConfirmCancelledAgentJobContext;

export interface CompletionClaimBinding {
  readonly jobId: string;
  readonly projectId: string;
  readonly task: Pick<AgentTask, "taskId" | "attemptId" | "runId" | "role">;
  readonly assignment?: CompletionAssignmentBinding;
  readonly workerId: string;
  readonly claimId: string;
  readonly fencingToken: number;
  readonly leaseGeneration: number;
  readonly jobVersion: number;
  readonly runtimeWatermark: number;
}

export function createAgentJobCompletionContext(claim: CompletionClaimBinding): CompleteAgentJobContext {
  return {
    ...baseContext(claim),
    operation: "COMPLETE",
    discriminator: { kind: "RUNTIME_WATERMARK", runtimeWatermark: claim.runtimeWatermark },
  };
}

export function createAgentJobCancellationCompletionContext(
  claim: CompletionClaimBinding,
  evidenceId: string,
): ConfirmCancelledAgentJobContext {
  return {
    ...baseContext(claim),
    operation: "CONFIRM_CANCELLED",
    discriminator: { kind: "TERMINATION_EVIDENCE", evidenceId, runtimeWatermark: claim.runtimeWatermark },
  };
}

export function deriveAgentJobCompletionId(context: AgentJobCompletionContext): string {
  assertAgentJobCompletionContext(context);
  const bytes = createHash("sha256").update(canonicalJson({ domain: AGENT_JOB_COMPLETION_DOMAIN, context })).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function completionSemanticDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function assertAgentJobCompletionContext(value: unknown): asserts value is AgentJobCompletionContext {
  if (!isRecord(value)) throw new Error("COMPLETION_CONTEXT_INVALID");
  exactKeys(value, [
    "assignment", "attemptId", "claimId", "discriminator", "fencingToken", "jobId", "jobVersion",
    "leaseGeneration", "operation", "operationSchemaVersion", "projectId", "role", "runId", "schemaVersion",
    "taskId", "workerId",
  ]);
  if (value.schemaVersion !== 2 || value.operationSchemaVersion !== 1) throw new Error("COMPLETION_CONTEXT_INVALID");
  uuid(value.projectId); uuid(value.jobId);
  bounded(value.taskId, 1, 512); bounded(value.attemptId, 1, 512); bounded(value.runId, 1, 512);
  boundedOwner(value.workerId); boundedOwner(value.claimId);
  const roles: readonly AgentTask["role"][] = ["PLANNER", "ARCHITECT", "SECURITY", "LEGAL", "EXECUTOR", "QA", "REVIEWER"];
  if (!roles.includes(value.role as AgentTask["role"])) throw new Error("COMPLETION_CONTEXT_INVALID");
  positive(value.fencingToken); positive(value.leaseGeneration); positive(value.jobVersion);
  if (value.assignment !== null) {
    if (!isRecord(value.assignment)) throw new Error("COMPLETION_CONTEXT_INVALID");
    exactKeys(value.assignment, ["agentId", "agentKey", "agentVersion", "assignmentId"]);
    uuid(value.assignment.assignmentId); uuid(value.assignment.agentId);
    if (typeof value.assignment.agentKey !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value.assignment.agentKey)) throw new Error("COMPLETION_CONTEXT_INVALID");
    positive(value.assignment.agentVersion);
  }
  if (!isRecord(value.discriminator)) throw new Error("COMPLETION_CONTEXT_INVALID");
  if (value.operation === "COMPLETE") {
    exactKeys(value.discriminator, ["kind", "runtimeWatermark"]);
    if (value.discriminator.kind !== "RUNTIME_WATERMARK") throw new Error("COMPLETION_CONTEXT_INVALID");
  } else if (value.operation === "CONFIRM_CANCELLED") {
    exactKeys(value.discriminator, ["evidenceId", "kind", "runtimeWatermark"]);
    if (value.discriminator.kind !== "TERMINATION_EVIDENCE") throw new Error("COMPLETION_CONTEXT_INVALID");
    bounded(value.discriminator.evidenceId, 1, 512);
  } else {
    throw new Error("COMPLETION_CONTEXT_INVALID");
  }
  nonNegative(value.discriminator.runtimeWatermark);
}

function baseContext(claim: CompletionClaimBinding): CompletionContextBase {
  return {
    schemaVersion: 2,
    operationSchemaVersion: 1,
    projectId: claim.projectId,
    jobId: claim.jobId,
    taskId: claim.task.taskId,
    attemptId: claim.task.attemptId,
    runId: claim.task.runId,
    role: claim.task.role,
    workerId: claim.workerId,
    claimId: claim.claimId,
    fencingToken: claim.fencingToken,
    leaseGeneration: claim.leaseGeneration,
    jobVersion: claim.jobVersion,
    assignment: claim.assignment ?? null,
  };
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  throw new Error("COMPLETION_CANONICAL_VALUE_INVALID");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new Error("COMPLETION_CONTEXT_INVALID");
}

function bounded(value: unknown, minimum: number, maximum: number): asserts value is string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) throw new Error("COMPLETION_CONTEXT_INVALID");
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x1f || codePoint === 0x7f) throw new Error("COMPLETION_CONTEXT_INVALID");
  }
}

function boundedOwner(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)) throw new Error("COMPLETION_CONTEXT_INVALID");
}

function uuid(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new Error("COMPLETION_CONTEXT_INVALID");
}

function positive(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error("COMPLETION_CONTEXT_INVALID");
}

function nonNegative(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("COMPLETION_CONTEXT_INVALID");
}
