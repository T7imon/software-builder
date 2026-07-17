import {
  CodexExecAgentRuntime,
  CodexExecProvider,
  FakeAgentRuntime,
  type AgentRuntime,
  type CodexExecInFlightCoordinator,
  type CodexProvider,
  type RuntimeStore,
} from "@software-builder/agent-runtime";
import type { AgentJobClaim, PostgresCodexRuntimeRepository } from "@software-builder/database";
import type { CodexRuntimeContextResolver } from "./codex-runtime-context.js";

export interface AgentRuntimeFactoryInput {
  readonly mode: "fake" | "codex";
  readonly store: RuntimeStore;
  readonly claim: AgentJobClaim;
  readonly codexRepository?: PostgresCodexRuntimeRepository;
  readonly codexContextResolver?: CodexRuntimeContextResolver;
  readonly codexProvider?: CodexProvider;
  readonly codexCoordinator?: CodexExecInFlightCoordinator;
}

export async function createAgentRuntime(input: AgentRuntimeFactoryInput): Promise<AgentRuntime> {
  if (input.mode === "fake") return new FakeAgentRuntime({ store: input.store });
  if (input.claim.task.role !== "PLANNER") throw new Error("CODEX_ROLE_UNSUPPORTED");
  if (!input.codexRepository || !input.codexContextResolver) throw new Error("CODEX_RUNTIME_NOT_CONFIGURED");
  const context = await input.codexContextResolver.resolve(input.claim);
  return input.codexCoordinator === undefined
    ? new CodexExecAgentRuntime(context,input.codexRepository,input.codexProvider ?? new CodexExecProvider())
    : new CodexExecAgentRuntime(context,input.codexRepository,input.codexProvider ?? new CodexExecProvider(),input.codexCoordinator);
}
