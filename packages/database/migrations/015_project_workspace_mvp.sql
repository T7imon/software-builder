-- PROJECT-WORKSPACE-MVP-01. Local DEVELOPMENT_ONLY workspace registration.

CREATE TABLE builder.project_workspaces (
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  planning_run_id uuid NOT NULL,
  project_revision text NOT NULL CHECK (project_revision ~ '^[0-9a-f]{64}$'),
  relative_path text NOT NULL CHECK (
    relative_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/revision-[0-9a-f]{64}$'
  ),
  git_branch text NOT NULL CHECK (
    git_branch ~ '^builder/project-[0-9a-f]{8}/revision-[0-9a-f]{16}$'
  ),
  status text NOT NULL CHECK (status IN ('CREATING','READY','ARCHIVED','FAILED')),
  created_by text NOT NULL CHECK (created_by ~ '^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$'),
  failure_code text CHECK (failure_code IS NULL OR failure_code IN ('PROVISIONING_FAILED','VERIFICATION_FAILED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ready_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT project_workspaces_pkey PRIMARY KEY (workspace_id),
  CONSTRAINT project_workspaces_project_revision_unique UNIQUE (project_id,project_revision),
  CONSTRAINT project_workspaces_relative_path_unique UNIQUE (relative_path),
  CONSTRAINT project_workspaces_project_workspace_unique UNIQUE (project_id,workspace_id),
  CONSTRAINT project_workspaces_planning_revision_fk FOREIGN KEY (project_id,planning_run_id,project_revision)
    REFERENCES builder.planning_runs(project_id,id,project_revision),
  CONSTRAINT project_workspaces_owner_decision_fk FOREIGN KEY (project_id,planning_run_id)
    REFERENCES builder.planning_owner_decisions(project_id,planning_run_id),
  CONSTRAINT project_workspaces_status_tuple_check CHECK (
    (status='CREATING' AND ready_at IS NULL AND archived_at IS NULL AND failure_code IS NULL)
    OR (status='READY' AND ready_at IS NOT NULL AND archived_at IS NULL AND failure_code IS NULL)
    OR (status='FAILED' AND archived_at IS NULL AND failure_code IS NOT NULL)
    OR (status='ARCHIVED' AND archived_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX project_workspaces_one_ready_revision
  ON builder.project_workspaces(project_id,project_revision) WHERE status='READY';

CREATE FUNCTION builder.validate_project_workspace_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_run_status text; v_decision text; v_approved_revision text;
BEGIN
  IF NEW.status<>'CREATING' OR NEW.ready_at IS NOT NULL OR NEW.archived_at IS NOT NULL OR NEW.failure_code IS NOT NULL THEN
    RAISE EXCEPTION 'project workspaces must start in CREATING without terminal metadata' USING ERRCODE='23514';
  END IF;
  IF NEW.relative_path IS DISTINCT FROM (NEW.project_id::text || '/revision-' || NEW.project_revision)
     OR NEW.git_branch IS DISTINCT FROM ('builder/project-' || left(NEW.project_id::text,8) || '/revision-' || left(NEW.project_revision,16)) THEN
    RAISE EXCEPTION 'project workspace path and branch must equal the deterministic Builder derivation' USING ERRCODE='23514';
  END IF;
  SELECT run.status,decision.decision,decision.approved_project_revision
    INTO v_run_status,v_decision,v_approved_revision
  FROM builder.planning_runs run
  JOIN builder.planning_owner_decisions decision
    ON decision.project_id=run.project_id AND decision.planning_run_id=run.id
  WHERE run.project_id=NEW.project_id AND run.id=NEW.planning_run_id AND run.project_revision=NEW.project_revision
  FOR SHARE OF run;
  IF NOT FOUND OR v_run_status<>'READY_FOR_IMPLEMENTATION' OR v_decision<>'APPROVE'
     OR v_approved_revision IS DISTINCT FROM NEW.project_revision THEN
    RAISE EXCEPTION 'project workspace requires the exact persistent owner-approved planning revision' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION builder.enforce_project_workspace_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'project workspaces cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF ROW(OLD.workspace_id,OLD.project_id,OLD.planning_run_id,OLD.project_revision,OLD.relative_path,
         OLD.git_branch,OLD.created_by,OLD.created_at)
     IS DISTINCT FROM
     ROW(NEW.workspace_id,NEW.project_id,NEW.planning_run_id,NEW.project_revision,NEW.relative_path,
         NEW.git_branch,NEW.created_by,NEW.created_at) THEN
    RAISE EXCEPTION 'project workspace identity and binding are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status='ARCHIVED' THEN
    RAISE EXCEPTION 'ARCHIVED project workspace is terminal' USING ERRCODE='23514';
  END IF;
  IF NOT (
    (OLD.status='CREATING' AND NEW.status IN ('READY','FAILED','ARCHIVED'))
    OR (OLD.status='READY' AND NEW.status IN ('FAILED','ARCHIVED'))
    OR (OLD.status='FAILED' AND NEW.status IN ('READY','ARCHIVED'))
  ) THEN
    RAISE EXCEPTION 'invalid project workspace status transition' USING ERRCODE='23514';
  END IF;
  IF NEW.status='READY' THEN
    NEW.ready_at=COALESCE(OLD.ready_at,clock_timestamp());
    NEW.archived_at=NULL;
    NEW.failure_code=NULL;
  ELSIF NEW.status='FAILED' THEN
    NEW.ready_at=OLD.ready_at;
    NEW.archived_at=NULL;
    IF NEW.failure_code IS NULL THEN
      RAISE EXCEPTION 'FAILED project workspace requires a failure code' USING ERRCODE='23514';
    END IF;
  ELSE
    NEW.ready_at=OLD.ready_at;
    NEW.archived_at=clock_timestamp();
    NEW.failure_code=OLD.failure_code;
  END IF;
  NEW.updated_at=clock_timestamp();
  RETURN NEW;
END $$;

CREATE TRIGGER project_workspaces_validate_insert BEFORE INSERT ON builder.project_workspaces
  FOR EACH ROW EXECUTE FUNCTION builder.validate_project_workspace_insert();
CREATE TRIGGER project_workspaces_transition BEFORE UPDATE OR DELETE ON builder.project_workspaces
  FOR EACH ROW EXECUTE FUNCTION builder.enforce_project_workspace_transition();

ALTER TABLE builder.project_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.project_workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY project_isolation ON builder.project_workspaces
  USING (project_id=builder.current_project_id()) WITH CHECK (project_id=builder.current_project_id());

GRANT SELECT,INSERT ON builder.project_workspaces TO builder_runtime;
GRANT UPDATE(status,failure_code) ON builder.project_workspaces TO builder_runtime;

ALTER TABLE builder.project_workspaces OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_project_workspace_insert() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.enforce_project_workspace_transition() OWNER TO builder_schema_owner;
