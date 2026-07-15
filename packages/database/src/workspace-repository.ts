import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import type { ProjectId, WorkspaceId } from "@software-builder/core";
import {
  canonicalIdentity,
  parseCreatedBy,
  parseProjectId,
  type CreatingWorkspaceRegistration,
  type WorkspaceFailureCode,
  type WorkspaceIdentity,
  type WorkspaceMutationSession,
  type WorkspaceRegistration,
  type WorkspaceRegistrationStore,
  type WorkspaceStatus,
  WorkspaceError,
} from "@software-builder/project-workspace";

export interface WorkspaceRepositoryQuery {
  query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
}

export type WorkspaceRepositoryTransaction = <T>(
  operation: "workspace:read" | "workspace:append",
  action: (query: WorkspaceRepositoryQuery) => Promise<T>,
) => Promise<T>;

export type WorkspaceRepositoryLock = <T>(
  lockName: string,
  action: (transaction: WorkspaceRepositoryTransaction) => Promise<T>,
) => Promise<T>;

interface WorkspaceRow {
  workspace_id: string;
  project_id: string;
  project_revision: string;
  relative_path: string;
  git_branch: string;
  status: WorkspaceStatus;
  created_at: Date;
  created_by: string;
  ready_at: Date | null;
  archived_at: Date | null;
  failure_code: WorkspaceFailureCode | null;
}

const columns = `workspace_id,project_id,project_revision,relative_path,git_branch,status,
  created_at,created_by,ready_at,archived_at,failure_code`;

function mapWorkspace(row: WorkspaceRow): WorkspaceRegistration {
  return {
    workspaceId: row.workspace_id as WorkspaceId,
    projectId: row.project_id as ProjectId,
    projectRevision: row.project_revision as never,
    relativePath: row.relative_path,
    gitBranch: row.git_branch,
    status: row.status,
    createdAt: row.created_at,
    createdBy: row.created_by,
    readyAt: row.ready_at,
    archivedAt: row.archived_at,
    failureCode: row.failure_code,
  };
}

function assertProject(expected: ProjectId, identity: WorkspaceIdentity): WorkspaceIdentity {
  const canonical = canonicalIdentity(identity);
  if (canonical.projectId !== expected) throw new WorkspaceError("WORKSPACE_CONFLICT", "Workspace-Repository ist an ein anderes Projekt gebunden.");
  return canonical;
}

class PostgresWorkspaceMutationSession implements WorkspaceMutationSession {
  constructor(
    private readonly projectId: ProjectId,
    private readonly subject: string,
    private readonly transaction: WorkspaceRepositoryTransaction,
  ) {}

  getWorkspace(identity: WorkspaceIdentity): Promise<WorkspaceRegistration | null> {
    const canonical = assertProject(this.projectId, identity);
    return this.transaction("workspace:append", async (query) => {
      const row = (await query.query<WorkspaceRow>(
        `SELECT ${columns} FROM builder.project_workspaces WHERE project_id=$1 AND project_revision=$2`,
        [canonical.projectId, canonical.projectRevision],
      )).rows[0];
      return row ? mapWorkspace(row) : null;
    });
  }

  insertCreating(input: CreatingWorkspaceRegistration): Promise<WorkspaceRegistration> {
    const identity = assertProject(this.projectId, input);
    if (parseCreatedBy(input.createdBy) !== this.subject) {
      throw new WorkspaceError("WORKSPACE_CONFLICT", "createdBy stimmt nicht mit der gebundenen Capability-Identitaet ueberein.");
    }
    return this.transaction("workspace:append", async (query) => {
      const result = await query.query<WorkspaceRow>(`INSERT INTO builder.project_workspaces(
          workspace_id,project_id,planning_run_id,project_revision,relative_path,git_branch,status,created_by
        )
        SELECT $1,$2,run.id,$3,$4,$5,'CREATING',$6
        FROM builder.planning_runs run
        JOIN builder.planning_owner_decisions decision
          ON decision.project_id=run.project_id AND decision.planning_run_id=run.id
        WHERE run.project_id=$2 AND run.project_revision=$3 AND run.status='READY_FOR_IMPLEMENTATION'
          AND decision.decision='APPROVE' AND decision.approved_project_revision=$3
        RETURNING ${columns}`,
        [input.workspaceId, identity.projectId, identity.projectRevision, input.relativePath, input.gitBranch, input.createdBy]);
      const row = result.rows[0];
      if (!row) throw new WorkspaceError("WORKSPACE_STATE_CONFLICT", "Workspace-Erstellung erfordert die exakt Owner-freigegebene Planning-Revision.");
      return mapWorkspace(row);
    });
  }

  transitionStatus(
    workspaceId: WorkspaceId,
    expectedStatuses: readonly WorkspaceStatus[],
    status: WorkspaceStatus,
    failureCode?: WorkspaceFailureCode,
  ): Promise<WorkspaceRegistration> {
    if (expectedStatuses.length === 0) throw new WorkspaceError("WORKSPACE_STATE_CONFLICT", "Workspace-CAS benoetigt einen Ausgangsstatus.");
    if (status === "FAILED" && failureCode === undefined) {
      throw new WorkspaceError("WORKSPACE_STATE_CONFLICT", "FAILED benoetigt einen minimierten Fehlercode.");
    }
    if (status !== "FAILED" && failureCode !== undefined) {
      throw new WorkspaceError("WORKSPACE_STATE_CONFLICT", "Nur FAILED darf einen neuen Fehlercode setzen.");
    }
    return this.transaction("workspace:append", async (query) => {
      const result = await query.query<WorkspaceRow>(`UPDATE builder.project_workspaces
        SET status=$3,failure_code=$4
        WHERE project_id=$1 AND workspace_id=$2 AND status=ANY($5::text[])
        RETURNING ${columns}`,
        [this.projectId, workspaceId, status, failureCode ?? null, [...expectedStatuses]]);
      const row = result.rows[0];
      if (!row) throw new WorkspaceError("WORKSPACE_STATE_CONFLICT", "Workspace-Status-CAS wurde abgelehnt.");
      return mapWorkspace(row);
    });
  }
}

export class PostgresWorkspaceRegistrationStore implements WorkspaceRegistrationStore {
  private readonly projectId: ProjectId;
  private readonly subject: string;
  constructor(
    projectId: ProjectId,
    subject: string,
    private readonly transaction: WorkspaceRepositoryTransaction,
    private readonly lock: WorkspaceRepositoryLock,
  ) {
    this.projectId = parseProjectId(projectId);
    this.subject = parseCreatedBy(subject);
  }

  static forTestHarness(pool: Pool, projectId: ProjectId, subject: string, connectionString: string): PostgresWorkspaceRegistrationStore {
    const target = new URL(connectionString);
    if (!target.pathname.toLowerCase().endsWith("_test") || !["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
      throw new Error("Workspace-Test-Harness ist nur fuer eine lokale _test-Datenbank zulaessig.");
    }
    const checkedClients = new WeakSet<PoolClient>();
    const verify = async (client: PoolClient): Promise<void> => {
      if (checkedClients.has(client)) return;
      const row = (await client.query<{ database: string; user_name: string }>("SELECT current_database() database,current_user user_name")).rows[0];
      if (!row?.database.toLowerCase().endsWith("_test") || row.user_name !== "builder_migrator") {
        throw new Error("Workspace-Test-Harness ist nur fuer builder_migrator auf einer lokalen _test-Datenbank zulaessig.");
      }
      checkedClients.add(client);
    };
    const run = (client?: PoolClient): WorkspaceRepositoryTransaction => async (_operation, action) => {
      const connection = client ?? await pool.connect();
      try {
        await verify(connection);
        await connection.query("BEGIN");
        try {
          const result = await action({ query: (sql, values = []) => connection.query(sql, [...values]) });
          await connection.query("COMMIT");
          return result;
        } catch (error) {
          await connection.query("ROLLBACK");
          throw error;
        }
      } finally {
        if (!client) connection.release();
      }
    };
    const lock: WorkspaceRepositoryLock = async (lockName, action) => {
      const client = await pool.connect();
      try {
        await verify(client);
        await client.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [lockName]);
        return await action(run(client));
      } finally {
        await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [lockName]).catch(() => undefined);
        client.release();
      }
    };
    return new PostgresWorkspaceRegistrationStore(projectId, parseCreatedBy(subject), run(), lock);
  }

  async getWorkspace(identity: WorkspaceIdentity): Promise<WorkspaceRegistration | null> {
    const canonical = assertProject(this.projectId, identity);
    return this.transaction("workspace:read", async (query) => {
      const row = (await query.query<WorkspaceRow>(
        `SELECT ${columns} FROM builder.project_workspaces WHERE project_id=$1 AND project_revision=$2`,
        [canonical.projectId, canonical.projectRevision],
      )).rows[0];
      return row ? mapWorkspace(row) : null;
    });
  }

  async listProjectWorkspaces(projectId: ProjectId): Promise<readonly WorkspaceRegistration[]> {
    if (projectId !== this.projectId) throw new WorkspaceError("WORKSPACE_CONFLICT", "Workspace-Repository ist an ein anderes Projekt gebunden.");
    return this.transaction("workspace:read", async (query) => {
      const rows = (await query.query<WorkspaceRow>(
        `SELECT ${columns} FROM builder.project_workspaces WHERE project_id=$1 ORDER BY created_at,workspace_id`,
        [projectId],
      )).rows;
      return rows.map(mapWorkspace);
    });
  }

  withWorkspaceLock<T>(identity: WorkspaceIdentity, action: (session: WorkspaceMutationSession) => Promise<T>): Promise<T> {
    const canonical = assertProject(this.projectId, identity);
    const lockName = `project-workspace:${canonical.projectId}:${canonical.projectRevision}`;
    return this.lock(lockName, (transaction) => action(new PostgresWorkspaceMutationSession(this.projectId, this.subject, transaction)));
  }
}
