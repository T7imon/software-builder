import { createHash } from "node:crypto";

export const AGENT_SCHEMA_VERSION = 1 as const;

export const agentRoles = ["PLANNER", "ARCHITECT", "SECURITY", "LEGAL", "EXECUTOR", "QA", "REVIEWER"] as const;
export type AgentRole = (typeof agentRoles)[number];
export const fakeScenarios = ["SUCCESS", "ERROR", "TIMEOUT", "CANCEL", "INVALID_OUTPUT", "RETRY", "SECURITY_BLOCK", "LEGAL_COUNSEL_REQUIRED"] as const;
export type FakeScenario = (typeof fakeScenarios)[number];

export interface AgentTask {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly role: AgentRole;
  readonly scenario: FakeScenario;
  readonly inputRef: string;
  readonly repairOrdinal: number;
}
export interface Finding {
  readonly schemaVersion: 1;
  readonly findingId: string;
  readonly category: "QUALITY" | "SECURITY" | "LEGAL";
  readonly severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly status: "OPEN" | "BLOCK" | "COUNSEL_REQUIRED";
  readonly evidenceRef: string;
}
export interface Artifact {
  readonly schemaVersion: 1;
  readonly artifactId: string;
  readonly kind: "REVISION" | "REPORT" | "EVIDENCE";
  readonly objectRef: string;
  readonly digest: string;
}
export interface Decision {
  readonly schemaVersion: 1;
  readonly decisionId: string;
  readonly kind: "QUALITY" | "SECURITY" | "LEGAL";
  readonly outcome: "PASS" | "FAIL" | "BLOCK" | "COUNSEL_REQUIRED";
  readonly rationaleRef: string;
}
export interface Progress {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly sequence: number;
  readonly phase: "STARTED" | "ANALYSING" | "PRODUCING" | "RETRYING" | "CANCELLING" | "FINISHED";
  readonly occurredAt: string;
}
export type AgentResultStatus = "SUCCESS" | "ERROR" | "TIMEOUT" | "CANCELLED" | "SECURITY_BLOCK" | "LEGAL_COUNSEL_REQUIRED";
export type AgentResultErrorCode = "FAKE_ERROR" | "FAKE_TIMEOUT" | "CODEX_TIMEOUT" | "CODEX_SPAWN_FAILED" | "CODEX_PROCESS_FAILED" | "CODEX_JSONL_INVALID" | "CODEX_OUTPUT_INVALID" | "CODEX_OUTPUT_FAILED" | "CODEX_SECURITY_POLICY_VIOLATION" | "CODEX_RECOVERY_REQUIRED";
export interface AgentResult {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly status: AgentResultStatus;
  readonly findings: readonly Finding[];
  readonly artifacts: readonly Artifact[];
  readonly decisions: readonly Decision[];
  readonly errorCode: AgentResultErrorCode | null;
}

export class SchemaValidationError extends Error {
  readonly code = "AGENT_SCHEMA_INVALID";
  constructor(message: string) { super(message); this.name = "SchemaValidationError"; }
}

type Shape = Readonly<Record<string, (value: unknown) => boolean>>;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512;
const ref = (value: unknown): value is string => text(value) && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value);
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const oneOf = <T extends string>(values: readonly T[]) => (value: unknown): value is T => typeof value === "string" && values.includes(value as T);
const integer = (min = 0) => (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= min;
const nullable = (validator: (value: unknown) => boolean) => (value: unknown) => value === null || validator(value);

function strictObject(value: unknown, name: string, shape: Shape): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SchemaValidationError(`${name} must be an object`);
  const keys = Object.keys(value);
  const expected = Object.keys(shape);
  if (keys.length !== expected.length || keys.some((key) => !(key in shape))) throw new SchemaValidationError(`${name} contains missing or additional fields`);
  for (const [key, validator] of Object.entries(shape)) if (!validator((value as Record<string, unknown>)[key])) throw new SchemaValidationError(`${name}.${key} is invalid`);
}
const version = (value: unknown) => value === AGENT_SCHEMA_VERSION;
const findingShape: Shape = { schemaVersion: version, findingId: ref, category: oneOf(["QUALITY", "SECURITY", "LEGAL"]), severity: oneOf(["LOW", "MEDIUM", "HIGH", "CRITICAL"]), status: oneOf(["OPEN", "BLOCK", "COUNSEL_REQUIRED"]), evidenceRef: ref };
const artifactShape: Shape = { schemaVersion: version, artifactId: ref, kind: oneOf(["REVISION", "REPORT", "EVIDENCE"]), objectRef: ref, digest };
const decisionShape: Shape = { schemaVersion: version, decisionId: ref, kind: oneOf(["QUALITY", "SECURITY", "LEGAL"]), outcome: oneOf(["PASS", "FAIL", "BLOCK", "COUNSEL_REQUIRED"]), rationaleRef: ref };

export function parseAgentTask(value: unknown): AgentTask {
  strictObject(value, "AgentTask", { schemaVersion: version, projectId: ref, taskId: ref, attemptId: ref, runId: ref, role: oneOf(agentRoles), scenario: oneOf(fakeScenarios), inputRef: ref, repairOrdinal: integer() });
  const task=value as unknown as AgentTask;
  if (task.repairOrdinal > 1) throw new SchemaValidationError("AgentTask.repairOrdinal exceeds the single repair limit");
  return task;
}
export function parseFinding(value: unknown): Finding { strictObject(value, "Finding", findingShape); const item=value as unknown as Finding; if ((item.status === "BLOCK") !== (item.category === "SECURITY") || (item.status === "COUNSEL_REQUIRED") !== (item.category === "LEGAL")) throw new SchemaValidationError("Finding category/status combination is invalid"); return item; }
export function parseArtifact(value: unknown): Artifact { strictObject(value, "Artifact", artifactShape); return value as unknown as Artifact; }
export function parseDecision(value: unknown): Decision { strictObject(value, "Decision", decisionShape); const item=value as unknown as Decision; if ((item.outcome === "BLOCK") !== (item.kind === "SECURITY") || (item.outcome === "COUNSEL_REQUIRED") !== (item.kind === "LEGAL")) throw new SchemaValidationError("Decision kind/outcome combination is invalid"); return item; }
export function parseProgress(value: unknown): Progress { strictObject(value, "Progress", { schemaVersion: version, runId: ref, sequence: integer(1), phase: oneOf(["STARTED", "ANALYSING", "PRODUCING", "RETRYING", "CANCELLING", "FINISHED"]), occurredAt: (item) => typeof item === "string" && !Number.isNaN(Date.parse(item)) }); return value as unknown as Progress; }
export function parseAgentResult(value: unknown): AgentResult {
  strictObject(value, "AgentResult", { schemaVersion: version, projectId: ref, taskId: ref, attemptId: ref, runId: ref, status: oneOf(["SUCCESS", "ERROR", "TIMEOUT", "CANCELLED", "SECURITY_BLOCK", "LEGAL_COUNSEL_REQUIRED"]), findings: Array.isArray, artifacts: Array.isArray, decisions: Array.isArray, errorCode: nullable(oneOf(["FAKE_ERROR", "FAKE_TIMEOUT", "CODEX_TIMEOUT", "CODEX_SPAWN_FAILED", "CODEX_PROCESS_FAILED", "CODEX_JSONL_INVALID", "CODEX_OUTPUT_INVALID", "CODEX_OUTPUT_FAILED", "CODEX_SECURITY_POLICY_VIOLATION", "CODEX_RECOVERY_REQUIRED"])) });
  const result=value as unknown as AgentResult; result.findings.forEach(parseFinding); result.artifacts.forEach(parseArtifact); result.decisions.forEach(parseDecision);
  const stop = result.status === "SECURITY_BLOCK" ? "BLOCK" : result.status === "LEGAL_COUNSEL_REQUIRED" ? "COUNSEL_REQUIRED" : null;
  const securityFindings=result.findings.filter(item=>item.category==="SECURITY"||item.status==="BLOCK");
  const legalFindings=result.findings.filter(item=>item.category==="LEGAL"||item.status==="COUNSEL_REQUIRED");
  const securityDecisions=result.decisions.filter(item=>item.kind==="SECURITY"||item.outcome==="BLOCK");
  const legalDecisions=result.decisions.filter(item=>item.kind==="LEGAL"||item.outcome==="COUNSEL_REQUIRED");
  const errorCodes:readonly AgentResultErrorCode[]=["FAKE_ERROR","CODEX_SPAWN_FAILED","CODEX_PROCESS_FAILED","CODEX_JSONL_INVALID","CODEX_OUTPUT_INVALID","CODEX_OUTPUT_FAILED","CODEX_SECURITY_POLICY_VIOLATION","CODEX_RECOVERY_REQUIRED"];
  const timeoutCodes:readonly AgentResultErrorCode[]=["FAKE_TIMEOUT","CODEX_TIMEOUT"];
  if ((result.status === "ERROR") !== (result.errorCode!==null&&errorCodes.includes(result.errorCode)) || (result.status === "TIMEOUT") !== (result.errorCode!==null&&timeoutCodes.includes(result.errorCode)) || (result.status==="CANCELLED"&&result.errorCode!==null)) throw new SchemaValidationError("AgentResult status/errorCode combination is invalid");
  if (result.status === "SUCCESS" && result.artifacts.length === 0) throw new SchemaValidationError("Successful AgentResult needs an artifact");
  if(securityFindings.length>0&&legalFindings.length>0||securityDecisions.length>0&&legalDecisions.length>0)throw new SchemaValidationError("Mixed security/legal stop output is invalid");
  if (stop === "BLOCK" && (securityFindings.length===0||!securityDecisions.some(item=>item.outcome==="BLOCK")||legalFindings.length>0||legalDecisions.length>0)) throw new SchemaValidationError("Security stop needs matching security finding and decision only");
  if (stop === "COUNSEL_REQUIRED" && (legalFindings.length===0||!legalDecisions.some(item=>item.outcome==="COUNSEL_REQUIRED")||securityFindings.length>0||securityDecisions.length>0)) throw new SchemaValidationError("Legal stop needs matching legal finding and decision only");
  if (!stop && (securityFindings.length>0||legalFindings.length>0||securityDecisions.some(item=>item.outcome==="BLOCK")||legalDecisions.some(item=>item.outcome==="COUNSEL_REQUIRED"))) throw new SchemaValidationError("Stop finding or decision requires the matching stop result");
  return result;
}

export type AgentRuntimeOperation="startRun"|"continueRun"|"cancelRun"|"getRunStatus"|"enqueue";
export function canonicalAgentOperationDigest(operation:AgentRuntimeOperation,task:AgentTask):string{const value=parseAgentTask(task);return createHash("sha256").update(JSON.stringify({operation,schemaVersion:value.schemaVersion,projectId:value.projectId,taskId:value.taskId,attemptId:value.attemptId,runId:value.runId,role:value.role,scenario:value.scenario,inputRef:value.inputRef,repairOrdinal:value.repairOrdinal})).digest("hex");}
