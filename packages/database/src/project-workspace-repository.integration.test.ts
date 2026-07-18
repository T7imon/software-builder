import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalAgentOperationDigest, FakeAgentRuntime, type AgentResult } from "@software-builder/agent-runtime";
import type { ProjectId } from "@software-builder/core";
import {
  loadWorkspaceConfig,
  LocalGitAdapter,
  ProjectWorkspaceManager,
  type LocalGitVerification,
  type WorkspaceIdentity,
  type WorkspaceMutationSession,
  type WorkspaceRegistrationStore,
  WorkspaceError,
} from "@software-builder/project-workspace";
import type { PlanningJobResult, PlanningJobRole, PlanningResultOutcome, PlanningStatusView } from "@software-builder/workflow-engine";
import {
  AgentJobRepository,
  HmacCapabilityAuthority,
  PostgresDatabase,
  PostgresPlanningOrchestratorRepository,
  PostgresProjectContextIssuer,
  createAgentJobCompletionContext,
} from "./index.js";
import { RegisteredWorkerProcessFixtureForTest } from "./agent-job-test-fixture.js";
import { migrate, resetDatabase } from "./migrations.js";

const adminUrl = process.env.TEST_DATABASE_URL;
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const testWorkers = new RegisteredWorkerProcessFixtureForTest("project-workspace-repository-integration");
const waitForDatabaseQuiescence = async (pool: Pool, timeoutMs = 5_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const active = await pool.query<{ count: string }>("SELECT count(*) count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()");
    if (Number(active.rows[0]!.count) === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for workspace test database quiescence");
};

class FailOnceGit extends LocalGitAdapter {
  private failed = false;
  override async initialize(workspacePath: string, branch: string): Promise<LocalGitVerification> {
    if (!this.failed) {
      this.failed = true;
      throw new WorkspaceError("WORKSPACE_GIT_INVALID", "injected PostgreSQL workspace git failure");
    }
    return super.initialize(workspacePath, branch);
  }
}

class TransitionFailingStore implements WorkspaceRegistrationStore {
  constructor(private readonly inner: WorkspaceRegistrationStore, private failures: number) {}
  getWorkspace = (identity: WorkspaceIdentity) => this.inner.getWorkspace(identity);
  listProjectWorkspaces = (projectId: ProjectId) => this.inner.listProjectWorkspaces(projectId);
  withWorkspaceLock<T>(identity: WorkspaceIdentity, action: (session: WorkspaceMutationSession) => Promise<T>): Promise<T> {
    return this.inner.withWorkspaceLock(identity, (session) => action({
      getWorkspace: (value) => session.getWorkspace(value),
      insertCreating: (input) => session.insertCreating(input),
      transitionStatus: (...args) => {
        if (this.failures > 0) {
          this.failures -= 1;
          throw new Error("injected PostgreSQL transition outage");
        }
        return session.transitionStatus(...args);
      },
    }));
  }
}

describe("Project Workspace PostgreSQL integration", () => {
  let admin: Pool;
  let runtime: Pool;
  let database: PostgresDatabase;
  let authority: HmacCapabilityAuthority;
  let orchestrator: PostgresPlanningOrchestratorRepository;
  let runtimeJobs: AgentJobRepository;
  let workspaceRoot: string;
  let repositoryRoot: string;
  const versions = new Map<PlanningJobRole, number>();
  const registryIdentity = new Map<PlanningJobRole, { agentId: string; agentKey: string }>();

  beforeAll(async () => {
    if (!adminUrl) throw new Error("TEST_DATABASE_URL ist fuer Project-Workspace-Integration verpflichtend; Skips sind nicht zulaessig.");
    const parsed = new URL(adminUrl);
    if (!parsed.pathname.toLowerCase().endsWith("_test")) throw new Error("TEST_DATABASE_URL muss auf _test enden.");
    admin = new Pool({ connectionString: adminUrl });
    await waitForDatabaseQuiescence(admin);
    await resetDatabase(admin, { connectionString: adminUrl, environment: "test" });
    expect(await migrate(admin)).toEqual([]);
    await admin.query("SELECT builder.provision_runtime_password('workspace-runtime-integration-only-123')");
    await admin.query("SELECT builder.provision_context_password('workspace-context-integration-only-123')");
    parsed.username = "builder_app_login";
    parsed.password = "workspace-runtime-integration-only-123";
    const contextUrl = new URL(parsed);
    contextUrl.username = "builder_context_login";
    contextUrl.password = "workspace-context-integration-only-123";
    runtime = new Pool({ connectionString: parsed.toString() });
    authority = new HmacCapabilityAuthority();
    database = await PostgresDatabase.connectRuntime(parsed.toString(), await PostgresProjectContextIssuer.connect(contextUrl.toString()), authority, authority);
    orchestrator = PostgresPlanningOrchestratorRepository.forTestHarness(admin);
    runtimeJobs = new AgentJobRepository(admin);
    for (const role of ["PLANNER", "ARCHITECT", "SECURITY", "LEGAL_DE_EU"] as const) await activateRole(role);
    const base = await mkdtemp(join(tmpdir(), "builder-workspace-postgres-"));
    workspaceRoot = join(base, "workspace root");
    repositoryRoot = join(base, "builder repository");
    await Promise.all([mkdir(workspaceRoot), mkdir(repositoryRoot)]);
  }, 30_000);

  afterAll(async () => {
    await database?.close();
    await runtime?.end();
    if (workspaceRoot) await rm(dirname(workspaceRoot), { recursive: true, force: true });
    if (admin) {
      await admin.end();
      const cleanup = new Pool({ connectionString: adminUrl! });
      try {
        await waitForDatabaseQuiescence(cleanup);
        await resetDatabase(cleanup, { connectionString: adminUrl!, environment: "test" });
      } finally {
        await cleanup.end();
      }
    }
  }, 30_000);

  async function activateRole(role: PlanningJobRole): Promise<void> {
    let identity = registryIdentity.get(role);
    if (!identity) {
      identity = { agentId: randomUUID(), agentKey: `workspace-${role.toLowerCase().replaceAll("_", "-")}` };
      registryIdentity.set(role, identity);
      await admin.query("INSERT INTO builder.agent_registry_identities(agent_key,agent_id,created_by) VALUES($1,$2,'workspace-integration')", [identity.agentKey, identity.agentId]);
    }
    const version = (versions.get(role) ?? 0) + 1;
    versions.set(role, version);
    await admin.query(`INSERT INTO builder.agent_registry_versions(agent_id,agent_key,display_name,role,description,version,revision,status,instructions,allowed_capabilities,forbidden_capabilities,created_by)
      VALUES($1,$2,$3,$4,'Synthetic workspace planning agent.',$5,$5,'ACTIVE','Process only synthetic Development Workspace planning data.',ARRAY['planning.synthetic'],ARRAY['production.deploy','github.write'],'workspace-integration')`,
    [identity.agentId, identity.agentKey, `Workspace ${role}`, role, version]);
  }

  async function completeRuntimeRole(status: PlanningStatusView, role: PlanningJobRole): Promise<PlanningJobResult> {
    const job = (await orchestrator.listPlanningJobs(status.projectId, status.planningRunId)).find((item) => item.role === role);
    if (!job) throw new Error(`Missing ${role} planning job`);
    const claim = await testWorkers.claimNext(runtimeJobs, `workspace-worker-${role.toLowerCase()}`, `claim-${randomUUID()}`, 120_000);
    if (!claim || claim.jobId !== job.backgroundJobId) throw new Error(`Unexpected runtime claim for ${role}`);
    const command = {
      runId: claim.task.runId,
      projectId: claim.projectId,
      taskId: claim.task.taskId,
      attemptId: claim.task.attemptId,
      idempotencyKey: `workspace-start-${claim.jobId}-${claim.fencingToken}`,
      requestDigest: canonicalAgentOperationDigest("startRun", claim.task),
      fencingToken: claim.fencingToken,
      task: claim.task,
    };
    const result = (await new FakeAgentRuntime().startRun(command)).result;
    if (!result) throw new Error("Fake runtime produced no workspace planning result");
    await runtimeJobs.complete(createAgentJobCompletionContext(claim), result);
    const runtimeResultId = (await admin.query<{ agent_result_id: string }>("SELECT agent_result_id FROM builder.background_jobs WHERE id=$1", [claim.jobId])).rows[0]!.agent_result_id;
    return planningResult(job.id, runtimeResultId, status.projectRevision, result);
  }

  function planningResult(jobId: string, runtimeResultId: string, projectRevision: string, result: AgentResult, outcome: PlanningResultOutcome = "PASS"): PlanningJobResult {
    const artifact = result.artifacts[0]!;
    return { jobId, runtimeResultId, projectRevision, outcome, objectRef: artifact.objectRef, digest: artifact.digest, requirements: [] };
  }

  async function approvedProject(label: string): Promise<{ projectId: ProjectId; projectRevision: string; owner: string; planningRunId: string }> {
    const projectId = randomUUID() as ProjectId;
    const projectRevision = digest(`workspace-approved:${label}`);
    const owner = `workspace-owner-${label}`;
    await admin.query("INSERT INTO builder.projects(id,project_type,status) VALUES($1,'FULL_STACK_WEB','PLANNING')", [projectId]);
    let status = await orchestrator.startPlanning(projectId, projectRevision, owner);
    status = await orchestrator.handleJobResult(projectId, status.planningRunId, await completeRuntimeRole(status, "PLANNER"));
    status = await orchestrator.handleJobResult(projectId, status.planningRunId, await completeRuntimeRole(status, "ARCHITECT"));
    const security = await completeRuntimeRole(status, "SECURITY");
    const legal = await completeRuntimeRole(status, "LEGAL_DE_EU");
    await orchestrator.handleJobResult(projectId, status.planningRunId, security);
    status = await orchestrator.handleJobResult(projectId, status.planningRunId, legal);
    status = await orchestrator.recordOwnerDecision(projectId, status.planningRunId, "APPROVE", owner, `approved-${label}`);
    expect(status.status).toBe("READY_FOR_IMPLEMENTATION");
    return { projectId, projectRevision, owner, planningRunId: status.planningRunId };
  }

  function capability(projectId: ProjectId, owner: string) {
    return authority.issueProject(projectId, {
      subject: owner,
      actorScope: "WORKSPACE_MANAGER",
      allowedRoles: ["WORKSPACE_MANAGER"],
      allowedOperations: ["workspace:read", "workspace:append"],
    }, 120_000);
  }

  async function managerFor(projectId: ProjectId, owner: string, git = new LocalGitAdapter()): Promise<{ manager: ProjectWorkspaceManager; store: WorkspaceRegistrationStore }> {
    const store = await database.createWorkspaceRegistrationStore(capability(projectId, owner));
    const config = await loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: workspaceRoot }, { builderRepositoryRoot: repositoryRoot });
    return { manager: new ProjectWorkspaceManager(config, store, git), store };
  }

  it("linearisiert parallele Creates, persistiert READY und findet denselben Workspace nach Restart", async () => {
    const approved = await approvedProject("parallel");
    const first = await managerFor(approved.projectId, approved.owner);
    const second = await managerFor(approved.projectId, approved.owner);
    const identity = { projectId: approved.projectId, projectRevision: approved.projectRevision as never };
    const results = await Promise.all([
      first.manager.createWorkspace({ ...identity, createdBy: approved.owner }),
      second.manager.createWorkspace({ ...identity, createdBy: approved.owner }),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]!.status).toBe("READY");
    expect(Number((await admin.query<{ count: string }>("SELECT count(*) count FROM builder.project_workspaces WHERE project_id=$1", [approved.projectId])).rows[0]!.count)).toBe(1);
    const restarted = await managerFor(approved.projectId, approved.owner);
    expect((await restarted.manager.getReadyWorkspace(identity)).workspaceId).toBe(results[0]!.workspaceId);
    expect((await restarted.manager.reconcileWorkspace(identity)).workspaceId).toBe(results[0]!.workspaceId);
    expect(Number((await runtime.query<{ count: string }>("SELECT count(*) count FROM builder.project_workspaces")).rows[0]!.count)).toBe(0);
  }, 30_000);

  it("recoveriert persistentes FAILED nach lokalem Git-Fehler ohne READY-Teilzustand", async () => {
    const approved = await approvedProject("failed-recovery");
    const failed = await managerFor(approved.projectId, approved.owner, new FailOnceGit());
    const identity = { projectId: approved.projectId, projectRevision: approved.projectRevision as never };
    await expect(failed.manager.createWorkspace({ ...identity, createdBy: approved.owner })).rejects.toThrow(/injected PostgreSQL workspace git failure/);
    expect((await failed.store.getWorkspace(identity))?.status).toBe("FAILED");
    const restarted = await managerFor(approved.projectId, approved.owner);
    expect((await restarted.manager.reconcileWorkspace(identity)).status).toBe("READY");
  }, 30_000);

  it("laesst DB-Fehler CREATING statt READY zurueck und recoveriert ohne Duplikat", async () => {
    const approved = await approvedProject("creating-recovery");
    const base = await managerFor(approved.projectId, approved.owner);
    const config = await loadWorkspaceConfig({ BUILDER_WORKSPACE_ROOT: workspaceRoot }, { builderRepositoryRoot: repositoryRoot });
    const failingStore = new TransitionFailingStore(base.store, 2);
    const manager = new ProjectWorkspaceManager(config, failingStore);
    const identity = { projectId: approved.projectId, projectRevision: approved.projectRevision as never };
    await expect(manager.createWorkspace({ ...identity, createdBy: approved.owner })).rejects.toThrow(/transition outage/);
    expect((await base.store.getWorkspace(identity))?.status).toBe("CREATING");
    const restarted = await managerFor(approved.projectId, approved.owner);
    expect((await restarted.manager.reconcileWorkspace(identity)).status).toBe("READY");
    expect(Number((await admin.query<{ count: string }>("SELECT count(*) count FROM builder.project_workspaces WHERE project_id=$1", [approved.projectId])).rows[0]!.count)).toBe(1);
  }, 30_000);

  it("verlangt Approval/Capability-Bindung und macht ARCHIVED terminal ohne Dateiloeschung", async () => {
    const approved = await approvedProject("archive");
    const scoped = await managerFor(approved.projectId, approved.owner);
    const identity = { projectId: approved.projectId, projectRevision: approved.projectRevision as never };
    const ready = await scoped.manager.createWorkspace({ ...identity, createdBy: approved.owner });
    await expect(admin.query("UPDATE builder.project_workspaces SET relative_path='tampered/revision-path' WHERE workspace_id=$1", [ready.workspaceId])).rejects.toThrow(/immutable/);
    const raced = await Promise.allSettled([
      scoped.manager.archiveWorkspace(identity),
      scoped.manager.createWorkspace({ ...identity, createdBy: approved.owner }),
    ]);
    expect(raced.some((result) => result.status === "fulfilled")).toBe(true);
    expect((await scoped.manager.archiveWorkspace(identity)).status).toBe("ARCHIVED");
    await expect(scoped.manager.createWorkspace({ ...identity, createdBy: approved.owner })).rejects.toThrow(/archiviert/);
    await expect(admin.query("UPDATE builder.project_workspaces SET status='READY' WHERE workspace_id=$1", [ready.workspaceId])).rejects.toThrow(/terminal/);
    await expect(admin.query("DELETE FROM builder.project_workspaces WHERE workspace_id=$1", [ready.workspaceId])).rejects.toThrow(/cannot be deleted/);
    await expect(database.createWorkspaceRegistrationStore("forged" as never)).rejects.toThrow(/Capability/);
  }, 30_000);

  it("erzeugt ohne exakt freigegebene Revision weder Registrierung noch Ordner", async () => {
    const projectId = randomUUID() as ProjectId;
    const projectRevision = digest("workspace-not-approved");
    const owner = "workspace-owner-not-approved";
    await admin.query("INSERT INTO builder.projects(id,project_type,status) VALUES($1,'FULL_STACK_WEB','PLANNING')", [projectId]);
    await orchestrator.startPlanning(projectId, projectRevision, owner);
    const scoped = await managerFor(projectId, owner);
    await expect(scoped.manager.createWorkspace({ projectId, projectRevision: projectRevision as never, createdBy: owner })).rejects.toThrow(/Owner-freigegebene|freigegebene/);
    expect((await scoped.store.getWorkspace({ projectId, projectRevision: projectRevision as never }))).toBeNull();
    expect(Number((await admin.query<{ count: string }>("SELECT count(*) count FROM builder.project_workspaces WHERE project_id=$1", [projectId])).rows[0]!.count)).toBe(0);
  }, 30_000);
});
