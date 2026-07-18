import {
  canonicalAgentOperationDigest,
  parseAgentTask,
  type AgentResult,
  type AgentRuntimeOperation,
  type Progress,
} from "./schemas.js";
import type { AgentRuntime, AbortableAgentRuntime, ExternallyPersistedAgentRuntime, RuntimeCommand, RuntimeStatus, StartRunCommand } from "./runtime.js";
import type { ResolvedCodexCli } from "./codex-cli.js";
import { buildCodexPlannerPrompt, codexPlannerOutputDigest, type CodexPlannerOutput, type CodexProviderMetadata, type CodexUsage } from "./codex-schemas.js";
import {
  CodexProviderError,
  type CodexPolicyEvent,
  type CodexProvider,
  type CodexProviderResponse,
} from "./codex-provider.js";
import type { ProcessLaunchBinding, ProcessLaunchId, ProcessLaunchReceipt, WorkerProcessIdentity } from "./process-identity.js";

export type CodexRunState = "DISPATCHED" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "POLICY_VIOLATION" | "RECOVERY_REQUIRED";
export type CodexRuntimeFailureCode =
  | "CODEX_CANCELLED"
  | "CODEX_TIMEOUT"
  | "CODEX_SPAWN_FAILED"
  | "CODEX_PROCESS_FAILED"
  | "CODEX_JSONL_INVALID"
  | "CODEX_OUTPUT_INVALID"
  | "CODEX_OUTPUT_FAILED"
  | "CODEX_SECURITY_POLICY_VIOLATION"
  | "CODEX_RECOVERY_REQUIRED";

export interface CodexRuntimeGuard {
  readonly jobId: string;
  readonly workerId: string;
  readonly workerProcessIdentity: WorkerProcessIdentity;
  readonly processLaunchId: ProcessLaunchId | null;
  readonly claimId: string;
  readonly fencingToken: number;
  readonly leaseGeneration: number;
  readonly claimedJobVersion: number;
}

export interface CodexRuntimeContext {
  readonly guard: CodexRuntimeGuard;
  readonly onProcessLaunchBound: (processLaunchId: ProcessLaunchId) => void;
  readonly assignmentRef: string;
  readonly agentId: string;
  readonly agentKey: string;
  readonly agentVersion: number;
  readonly assignmentRole: "PLANNER";
  readonly registryRole: "PLANNER";
  readonly registryInstructions: string;
  readonly projectId: string;
  readonly projectRevision: string;
  readonly workspaceId: string;
  readonly workspacePath: string;
  readonly repositoryRoot: string;
  readonly planningTask: string;
  readonly taskDigest: string;
  readonly builderCodexHome: string;
  readonly childEnvironment: NodeJS.ProcessEnv;
  readonly cli: ResolvedCodexCli;
  readonly outputSchemaPath: string;
  readonly timeoutMs: number;
  readonly model?: string;
}

export interface CodexPersistentRun extends CodexProviderMetadata {
  readonly jobId: string;
  readonly runId: string;
  readonly state: CodexRunState;
  readonly promptSha256: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly output?: CodexPlannerOutput;
  readonly errorCode?: CodexRuntimeFailureCode;
  readonly policyEvent?: CodexPolicyEvent;
}

export type CodexStartDecision =
  | { readonly action: "START"; readonly run: CodexPersistentRun }
  | { readonly action: "IN_FLIGHT"; readonly run: CodexPersistentRun }
  | { readonly action: "TERMINAL"; readonly run: CodexPersistentRun }
  | { readonly action: "RECOVERY_REQUIRED"; readonly run: CodexPersistentRun };

export interface CodexRuntimePersistence {
  authorizeStart(input: {
    readonly guard: CodexRuntimeGuard;
    readonly runId: string;
    readonly promptSha256: string;
    readonly cliVersion: string;
    readonly startedAt: string;
  }): Promise<CodexStartDecision>;
  bindProcessLaunch(input: {
    readonly guard: CodexRuntimeGuard;
    readonly runId: string;
    readonly binding: ProcessLaunchBinding;
    readonly receipt: ProcessLaunchReceipt;
  }): Promise<CodexRuntimeGuard>;
  complete(input: {
    readonly guard: CodexRuntimeGuard;
    readonly runId: string;
    readonly promptSha256: string;
    readonly output: CodexPlannerOutput;
    readonly completedAt: string;
    readonly threadId?: string;
    readonly model?: string;
    readonly usage?: CodexUsage;
  }): Promise<CodexPersistentRun>;
  fail(input: {
    readonly guard: CodexRuntimeGuard;
    readonly runId: string;
    readonly promptSha256: string;
    readonly state: Exclude<CodexRunState, "DISPATCHED" | "SUCCEEDED" | "RECOVERY_REQUIRED">;
    readonly errorCode: CodexRuntimeFailureCode;
    readonly completedAt: string;
    readonly policyEvent?: CodexPolicyEvent;
    readonly output?: CodexPlannerOutput;
    readonly threadId?: string;
    readonly model?: string;
    readonly usage?: CodexUsage;
  }): Promise<CodexPersistentRun>;
  load(jobId: string): Promise<CodexPersistentRun | undefined>;
}

interface InFlightEntry {
  readonly promise: Promise<RuntimeStatus>;
  readonly controller: AbortController;
}

export class CodexExecInFlightCoordinator {
  private readonly entries = new Map<string, InFlightEntry>();

  run(jobId: string, operation: (signal: AbortSignal) => Promise<RuntimeStatus>): Promise<RuntimeStatus> {
    const current = this.entries.get(jobId);
    if (current) return current.promise;
    const controller = new AbortController();
    const promise = operation(controller.signal).finally(() => {
      if (this.entries.get(jobId)?.promise === promise) this.entries.delete(jobId);
    });
    this.entries.set(jobId, { promise, controller });
    return promise;
  }

  abort(jobId: string, reason: "CANCELLED" | "LEASE_LOST" | "TIMEOUT" = "CANCELLED"): boolean {
    const current = this.entries.get(jobId);
    if (!current) return false;
    current.controller.abort(reason);
    return true;
  }

  get(jobId: string): Promise<RuntimeStatus> | undefined {
    return this.entries.get(jobId)?.promise;
  }
}

const processCoordinator = new CodexExecInFlightCoordinator();

function assertRuntimeBinding(
  command: RuntimeCommand,
  context: CodexRuntimeContext,
  operation: AgentRuntimeOperation,
): void {
  const task = parseAgentTask(command.task);
  if (
    task.role !== "PLANNER" ||
    context.assignmentRole !== "PLANNER" ||
    context.registryRole !== "PLANNER" ||
    command.runId !== command.task.runId ||
    command.projectId !== command.task.projectId ||
    command.taskId !== command.task.taskId ||
    command.attemptId !== command.task.attemptId ||
    command.projectId !== context.projectId ||
    command.fencingToken !== context.guard.fencingToken ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/u.test(command.idempotencyKey) ||
    command.requestDigest !== canonicalAgentOperationDigest(operation, task) ||
    context.taskDigest !== canonicalAgentOperationDigest("enqueue", task)
  ) {
    throw new Error("CODEX_RUNTIME_BINDING_MISMATCH");
  }
}

function progress(runId: string, run: CodexPersistentRun): readonly Progress[] {
  const values: Progress[] = [{ schemaVersion: 1, runId, sequence: 1, phase: "STARTED", occurredAt: run.startedAt }];
  if (run.state === "DISPATCHED") return values;
  values.push({ schemaVersion: 1, runId, sequence: 2, phase: "FINISHED", occurredAt: run.completedAt ?? run.startedAt });
  return values;
}

function successResult(command: RuntimeCommand, output: CodexPlannerOutput): AgentResult {
  return {
    schemaVersion: 1,
    projectId: command.projectId,
    taskId: command.taskId,
    attemptId: command.attemptId,
    runId: command.runId,
    status: "SUCCESS",
    findings: [],
    artifacts: [{
      schemaVersion: 1,
      artifactId: `codex/planner/${command.runId}`,
      kind: "REPORT",
      objectRef: `codex/planner-output/${command.runId}`,
      digest: codexPlannerOutputDigest(output),
    }],
    decisions: [],
    errorCode: null,
  };
}

function failureResult(command: RuntimeCommand, errorCode: CodexRuntimeFailureCode): AgentResult {
  return {
    schemaVersion: 1,
    projectId: command.projectId,
    taskId: command.taskId,
    attemptId: command.attemptId,
    runId: command.runId,
    status: errorCode === "CODEX_TIMEOUT" ? "TIMEOUT" : errorCode === "CODEX_CANCELLED" ? "CANCELLED" : "ERROR",
    findings: [],
    artifacts: [],
    decisions: [],
    errorCode: errorCode === "CODEX_CANCELLED" ? null : errorCode,
  };
}

function runtimeStatus(command: RuntimeCommand, run: CodexPersistentRun): RuntimeStatus {
  if (run.state === "DISPATCHED") return { runId: command.runId, state: "RUNNING", retryCount: 0, terminal: false, result: null, progress: progress(command.runId, run) };
  if (run.state === "SUCCEEDED" && run.output) return { runId: command.runId, state: "SUCCEEDED", retryCount: 0, terminal: true, result: successResult(command, run.output), progress: progress(command.runId, run) };
  const errorCode = run.errorCode ?? "CODEX_RECOVERY_REQUIRED";
  return {
    runId: command.runId,
    state: run.state === "TIMED_OUT" ? "TIMED_OUT" : run.state === "CANCELLED" ? "CANCELLED" : "FAILED",
    retryCount: 0,
    terminal: true,
    result: failureResult(command, errorCode),
    progress: progress(command.runId, run),
  };
}

function providerFailure(error: CodexProviderError): { state: "FAILED" | "TIMED_OUT" | "CANCELLED" | "POLICY_VIOLATION"; code: CodexRuntimeFailureCode } {
  if(error.code==="CODEX_LAUNCH_BINDING_FAILED")throw error;
  if (error.code === "CODEX_TIMEOUT") return { state: "TIMED_OUT", code: error.code };
  if (error.code === "CODEX_CANCELLED") return { state: "CANCELLED", code: error.code };
  if (error.code === "CODEX_SECURITY_POLICY_VIOLATION") return { state: "POLICY_VIOLATION", code: error.code };
  return { state: "FAILED", code: error.code };
}

export class CodexExecAgentRuntime implements AgentRuntime, AbortableAgentRuntime, ExternallyPersistedAgentRuntime {
  readonly externalPersistentStatus = true as const;
  constructor(
    private readonly context: CodexRuntimeContext,
    private readonly persistence: CodexRuntimePersistence,
    private readonly provider: CodexProvider,
    private readonly coordinator: CodexExecInFlightCoordinator = processCoordinator,
    private readonly now: () => Date = () => new Date(),
  ) {}

  startRun(command: StartRunCommand): Promise<RuntimeStatus> {
    assertRuntimeBinding(command, this.context, "startRun");
    return this.coordinator.run(this.context.guard.jobId, (signal) => this.startWinner(command, signal));
  }

  async continueRun(command: RuntimeCommand): Promise<RuntimeStatus> {
    assertRuntimeBinding(command, this.context, "continueRun");
    return this.loadRunStatus(command);
  }

  async getRunStatus(command: RuntimeCommand): Promise<RuntimeStatus> {
    assertRuntimeBinding(command, this.context, "getRunStatus");
    return this.loadRunStatus(command);
  }

  private async loadRunStatus(command: RuntimeCommand): Promise<RuntimeStatus> {
    const active = this.coordinator.get(this.context.guard.jobId);
    if (active) return active;
    const run = await this.persistence.load(this.context.guard.jobId);
    if (!run || run.runId !== command.runId) throw new Error("CODEX_RUN_NOT_FOUND");
    return runtimeStatus(command, run);
  }

  async cancelRun(command: RuntimeCommand): Promise<RuntimeStatus> {
    assertRuntimeBinding(command, this.context, "cancelRun");
    this.coordinator.abort(this.context.guard.jobId, "CANCELLED");
    const active = this.coordinator.get(this.context.guard.jobId);
    if (active) return active;
    return this.loadRunStatus(command);
  }

  abortActiveRun(reason: "CANCELLED" | "LEASE_LOST" | "TIMEOUT"): void {
    this.coordinator.abort(this.context.guard.jobId, reason);
  }

  private async startWinner(command: StartRunCommand, signal: AbortSignal): Promise<RuntimeStatus> {
    const prompt = buildCodexPlannerPrompt({
      assignmentRef: this.context.assignmentRef,
      agentId: this.context.agentId,
      agentKey: this.context.agentKey,
      agentVersion: this.context.agentVersion,
      registryInstructions: this.context.registryInstructions,
      projectId: this.context.projectId,
      projectRevision: this.context.projectRevision,
      planningTask: this.context.planningTask,
    });
    const startedAt = this.now().toISOString();
    const authorization = await this.persistence.authorizeStart({
      guard: this.context.guard,
      runId: command.runId,
      promptSha256: prompt.sha256,
      cliVersion: this.context.cli.packageVersion,
      startedAt,
    });
    if (authorization.action !== "START") return runtimeStatus(command, authorization.run);
    let response: CodexProviderResponse;
    let activeGuard=this.context.guard;
    const processLaunchBinding:ProcessLaunchBinding={parentWorkerInstanceId:activeGuard.workerProcessIdentity.instanceId,workerId:activeGuard.workerId,projectId:this.context.projectId,jobId:activeGuard.jobId,taskId:command.taskId,attemptId:command.attemptId,runId:command.runId,assignmentId:this.context.assignmentRef,claimId:activeGuard.claimId,leaseGeneration:activeGuard.leaseGeneration,fencingToken:activeGuard.fencingToken,jobVersion:activeGuard.claimedJobVersion+1};
    try {
      response = await this.provider.execute({
        cli: this.context.cli,
        workspacePath: this.context.workspacePath,
        repositoryRoot: this.context.repositoryRoot,
        builderCodexHome: this.context.builderCodexHome,
        outputSchemaPath: this.context.outputSchemaPath,
        prompt: prompt.prompt,
        environment: this.context.childEnvironment,
        timeoutMs: this.context.timeoutMs,
        processLaunchBinding,
        onProcessLaunched:async receipt=>{activeGuard=await this.persistence.bindProcessLaunch({guard:activeGuard,runId:command.runId,binding:processLaunchBinding,receipt});this.context.onProcessLaunchBound(activeGuard.processLaunchId!);},
        ...(this.context.model === undefined ? {} : { model: this.context.model }),
        signal,
      });
    } catch (error) {
      const safe = error instanceof CodexProviderError ? error : new CodexProviderError("CODEX_PROCESS_FAILED");
      if(safe.code==="CODEX_LAUNCH_BINDING_FAILED")throw safe;
      const failure = providerFailure(safe);
      const persisted = await this.persistence.fail({
        guard: activeGuard,
        runId: command.runId,
        promptSha256: prompt.sha256,
        state: failure.state,
        errorCode: failure.code,
        completedAt: this.now().toISOString(),
        ...(safe.policyEvent === undefined ? {} : { policyEvent: safe.policyEvent }),
      });
      return runtimeStatus(command, persisted);
    }
    if (response.output.status === "FAILED") {
      const failed = await this.persistence.fail({
        guard: activeGuard,
        runId: command.runId,
        promptSha256: prompt.sha256,
        state: "FAILED",
        errorCode: "CODEX_OUTPUT_FAILED",
        completedAt: response.completedAt,
        output: response.output,
        ...(response.threadId === undefined ? {} : { threadId: response.threadId }),
        ...(response.model === undefined ? {} : { model: response.model }),
        ...(response.usage === undefined ? {} : { usage: response.usage }),
      });
      return runtimeStatus(command, failed);
    }
    const completed = await this.persistence.complete({
      guard: activeGuard,
      runId: command.runId,
      promptSha256: prompt.sha256,
      output: response.output,
      completedAt: response.completedAt,
      ...(response.threadId === undefined ? {} : { threadId: response.threadId }),
      ...(response.model === undefined ? {} : { model: response.model }),
      ...(response.usage === undefined ? {} : { usage: response.usage }),
    });
    return runtimeStatus(command, completed);
  }
}
