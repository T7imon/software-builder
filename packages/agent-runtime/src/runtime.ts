import type { AgentResult, AgentTask, Progress } from "./schemas.js";

export type RuntimeState = "RUNNING" | "RETRY_PENDING" | "CANCELLATION_REQUESTED" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "BLOCKED";
export interface RuntimeCommand { readonly runId: string; readonly projectId: string; readonly taskId: string; readonly attemptId: string; readonly idempotencyKey: string; readonly requestDigest: string; readonly fencingToken: number; readonly task:AgentTask; }
export type StartRunCommand = RuntimeCommand;
export interface RuntimeStatus { readonly runId: string; readonly state: RuntimeState; readonly retryCount: number; readonly terminal: boolean; readonly result: AgentResult | null; readonly progress: readonly Progress[]; }
export interface AgentRuntime { startRun(command: StartRunCommand): Promise<RuntimeStatus>; continueRun(command: RuntimeCommand): Promise<RuntimeStatus>; cancelRun(command: RuntimeCommand): Promise<RuntimeStatus>; getRunStatus(command: RuntimeCommand): Promise<RuntimeStatus>; }

export interface RuntimeStoredRun { binding: Omit<RuntimeCommand, "idempotencyKey" | "requestDigest"|"task">; readonly startKey: string; readonly task: AgentTask; state: RuntimeState; retryCount: number; result: AgentResult | null; progress: Progress[]; commands: Map<string, { digest: string; fence: number; status: RuntimeStatus }>; }
export interface RuntimeStore { load(runId: string): Promise<RuntimeStoredRun | undefined>; save(run: RuntimeStoredRun): Promise<void>; }
export class InMemoryRuntimeStore implements RuntimeStore { private readonly runs=new Map<string,RuntimeStoredRun>(); async load(runId:string){return this.runs.get(runId);} async save(run:RuntimeStoredRun){this.runs.set(run.binding.runId,run);} }
