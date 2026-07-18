import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import {
  assertNoProjectCodexConfiguration,
  buildCodexChildEnvironment,
  canonicalAgentOperationDigest,
  codexPlannerOutputSchemaPath,
  resolvePinnedCodexCli,
  validateBuilderCodexHome,
  type CodexRuntimeContext,
} from "@software-builder/agent-runtime";
import type { AgentJobClaim, PostgresCodexRuntimeRepository } from "@software-builder/database";
import type { ReadyWorkspaceReader, WorkspaceConfig } from "@software-builder/project-workspace";
import { CODEX_DEVELOPMENT_TIMEOUT_MS } from "./config.js";

export interface CodexRuntimeContextResolverOptions {
  readonly repository: PostgresCodexRuntimeRepository;
  readonly workspaceReader: ReadyWorkspaceReader;
  readonly workspaceConfig: WorkspaceConfig;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly builderCodexHome: string | undefined;
  readonly model?: string;
  readonly timeoutMs?: number;
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function within(parent: string, child: string): boolean {
  const value = relative(parent, child);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

export class CodexRuntimeContextResolver {
  constructor(private readonly options: CodexRuntimeContextResolverOptions) {}

  async resolve(claim: AgentJobClaim): Promise<CodexRuntimeContext> {
    if (claim.task.role !== "PLANNER") throw new Error("CODEX_ROLE_UNSUPPORTED");
    const guard = {
      jobId: claim.jobId,
      workerId: claim.workerId,
      workerProcessIdentity: claim.workerProcessIdentity,
      processLaunchId: claim.processLaunchId,
      claimId: claim.claimId,
      fencingToken: claim.fencingToken,
      leaseGeneration: claim.leaseGeneration,
      claimedJobVersion: claim.jobVersion,
    };
    const binding = await this.options.repository.loadBindingForClaim(guard);
    const assignment = claim.assignment;
    if (
      !assignment ||
      assignment.assignmentId.toLowerCase() !== binding.assignmentId.toLowerCase() ||
      assignment.agentId.toLowerCase() !== binding.agentId.toLowerCase() ||
      assignment.agentKey !== binding.agentKey ||
      assignment.agentVersion !== binding.agentVersion ||
      claim.projectId.toLowerCase() !== binding.projectId.toLowerCase()
    ) {
      throw new Error("CODEX_ASSIGNMENT_BINDING_MISMATCH");
    }
    const verified = await this.options.workspaceReader.getReadyWorkspace({
      projectId: binding.projectId as never,
      projectRevision: binding.projectRevision as never,
    });
    if (
      verified.status !== "READY" ||
      verified.workspaceId.toLowerCase() !== binding.workspaceId.toLowerCase() ||
      verified.projectId.toLowerCase() !== binding.projectId.toLowerCase() ||
      verified.projectRevision !== binding.projectRevision ||
      verified.gitBranch !== binding.workspaceGitBranch
    ) {
      throw new Error("CODEX_WORKSPACE_BINDING_MISMATCH");
    }
    const canonicalWorkspace = await realpath(verified.absolutePath);
    if (!samePath(canonicalWorkspace, verified.absolutePath) || !within(this.options.workspaceConfig.canonicalWorkspaceRoot, canonicalWorkspace)) {
      throw new Error("CODEX_WORKSPACE_PATH_UNSAFE");
    }
    await assertNoProjectCodexConfiguration(canonicalWorkspace);
    const schemaInfo = await lstat(codexPlannerOutputSchemaPath);
    if (!schemaInfo.isFile() || schemaInfo.isSymbolicLink()) throw new Error("CODEX_OUTPUT_SCHEMA_UNSAFE");
    const processCodexHome = this.options.environment.CODEX_HOME;
    const defaultUserHome = this.options.environment.USERPROFILE ?? this.options.environment.HOME;
    const builderCodexHome = await validateBuilderCodexHome({
      configuredHome: this.options.builderCodexHome,
      repositoryRoot: this.options.workspaceConfig.builderRepositoryRoot,
      workspacePath: canonicalWorkspace,
      ...(processCodexHome === undefined ? {} : { processCodexHome }),
      ...(defaultUserHome === undefined ? {} : { defaultUserHome }),
    });
    const cli = await resolvePinnedCodexCli(this.options.workspaceConfig.builderRepositoryRoot);
    const timeoutMs = this.options.timeoutMs ?? CODEX_DEVELOPMENT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > CODEX_DEVELOPMENT_TIMEOUT_MS) throw new Error("CODEX_TIMEOUT_INVALID");
    return {
      guard,
      onProcessLaunchBound:(processLaunchId)=>{claim.processLaunchId=processLaunchId;},
      assignmentRef: binding.assignmentId,
      agentId: binding.agentId,
      agentKey: binding.agentKey,
      agentVersion: binding.agentVersion,
      assignmentRole: binding.assignmentRole,
      registryRole: binding.registryRole,
      registryInstructions: binding.registryInstructions,
      projectId: binding.projectId,
      projectRevision: binding.projectRevision,
      workspaceId: binding.workspaceId,
      workspacePath: canonicalWorkspace,
      repositoryRoot: this.options.workspaceConfig.builderRepositoryRoot,
      planningTask: binding.planningTask,
      taskDigest: canonicalAgentOperationDigest("enqueue", claim.task),
      builderCodexHome,
      childEnvironment: buildCodexChildEnvironment(this.options.environment),
      cli,
      outputSchemaPath: codexPlannerOutputSchemaPath,
      timeoutMs,
      ...(this.options.model === undefined ? {} : { model: this.options.model }),
    };
  }
}
