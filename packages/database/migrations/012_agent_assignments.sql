-- AGENT-ASSIGNMENT-01. Immutable binding of one background job to one registry version.

ALTER TABLE builder.agent_registry_versions
  ADD CONSTRAINT agent_registry_versions_assignment_identity_unique
  UNIQUE (agent_id,agent_key,version,role);

CREATE TABLE builder.agent_assignments (
  assignment_id uuid NOT NULL,
  project_id uuid NOT NULL,
  job_id uuid NOT NULL,
  required_role text NOT NULL CHECK (required_role IN (
    'ORCHESTRATOR','PLANNER','ARCHITECT','EXECUTOR','QA','REVIEWER','SECURITY','LEGAL_DE_EU'
  )),
  agent_id uuid NOT NULL,
  agent_key text NOT NULL CHECK (agent_key ~ '^[a-z][a-z0-9-]{0,63}$'),
  agent_version integer NOT NULL CHECK (agent_version > 0),
  assignment_status text NOT NULL DEFAULT 'ASSIGNED'
    CHECK (assignment_status IN ('ASSIGNED','RELEASED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by text NOT NULL CHECK (
    created_by ~ '^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$'
    AND created_by !~* '(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|npm_[a-z0-9]{20,}|pypi-[a-z0-9_-]{20,}|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|[a-z][a-z0-9+.-]*://[^/@]+:[^/@]+@)'
  ),
  released_at timestamptz,
  released_by text CHECK (released_by IS NULL OR (
    released_by ~ '^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$'
    AND released_by !~* '(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|npm_[a-z0-9]{20,}|pypi-[a-z0-9_-]{20,}|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|[a-z][a-z0-9+.-]*://[^/@]+:[^/@]+@)'
  )),
  CONSTRAINT agent_assignments_pkey PRIMARY KEY (assignment_id),
  CONSTRAINT agent_assignments_job_id_unique UNIQUE (job_id),
  CONSTRAINT agent_assignments_project_assignment_unique UNIQUE (project_id,assignment_id),
  CONSTRAINT agent_assignments_project_job_fk FOREIGN KEY (project_id,job_id)
    REFERENCES builder.background_jobs(project_id,id),
  CONSTRAINT agent_assignments_registry_version_fk
    FOREIGN KEY (agent_id,agent_key,agent_version,required_role)
    REFERENCES builder.agent_registry_versions(agent_id,agent_key,version,role),
  CONSTRAINT agent_assignments_release_state_check CHECK (
    (assignment_status='ASSIGNED' AND released_at IS NULL AND released_by IS NULL)
    OR
    (assignment_status='RELEASED' AND released_at IS NOT NULL AND released_by IS NOT NULL)
  )
);

CREATE FUNCTION builder.validate_agent_assignment_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_job_type text;
  v_agent_run_id text;
  v_task_role text;
  v_active_count integer := 0;
  v_active_agent_id uuid;
  v_active_agent_key text;
  v_active_agent_version integer;
  v_candidate record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('agent-assignment:' || NEW.job_id::text,0));

  IF NEW.assignment_status <> 'ASSIGNED' OR NEW.released_at IS NOT NULL OR NEW.released_by IS NOT NULL THEN
    RAISE EXCEPTION 'new agent assignments must start ASSIGNED'
      USING ERRCODE='23514', CONSTRAINT='agent_assignments_initial_state_check';
  END IF;

  SELECT job.job_type,job.agent_run_id
    INTO v_job_type,v_agent_run_id
  FROM builder.background_jobs job
  WHERE job.project_id=NEW.project_id AND job.id=NEW.job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent assignment job is unknown in project'
      USING ERRCODE='23503', CONSTRAINT='agent_assignments_project_job_fk';
  END IF;

  IF v_job_type='AGENT_RUNTIME' THEN
    SELECT task.role INTO v_task_role
    FROM builder.agent_runtime_tasks task
    WHERE task.project_id=NEW.project_id AND task.run_id=v_agent_run_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'agent runtime task is missing for assignment'
        USING ERRCODE='23514', CONSTRAINT='agent_assignments_runtime_task_check';
    END IF;
    IF (CASE WHEN v_task_role='LEGAL' THEN 'LEGAL_DE_EU' ELSE v_task_role END) <> NEW.required_role THEN
      RAISE EXCEPTION 'agent assignment role does not match runtime task role'
        USING ERRCODE='23514', CONSTRAINT='agent_assignments_runtime_role_check';
    END IF;
  END IF;

  -- Coordinate with the registry's activation lock for the concrete identity.
  PERFORM pg_advisory_xact_lock(hashtextextended('agent-registry:' || NEW.agent_key,0));

  FOR v_candidate IN
    SELECT registry.agent_id,registry.agent_key,registry.version
    FROM builder.agent_registry_versions registry
    WHERE registry.role=NEW.required_role AND registry.status='ACTIVE'
    ORDER BY registry.agent_key,registry.version
    FOR UPDATE
  LOOP
    v_active_count := v_active_count + 1;
    v_active_agent_id := v_candidate.agent_id;
    v_active_agent_key := v_candidate.agent_key;
    v_active_agent_version := v_candidate.version;
  END LOOP;

  IF v_active_count <> 1 THEN
    RAISE EXCEPTION 'agent assignment requires exactly one active registry candidate for role'
      USING ERRCODE='23514', CONSTRAINT='agent_assignments_single_active_role_check';
  END IF;
  IF ROW(v_active_agent_id,v_active_agent_key,v_active_agent_version)
     IS DISTINCT FROM ROW(NEW.agent_id,NEW.agent_key,NEW.agent_version) THEN
    RAISE EXCEPTION 'agent assignment must bind the active registry candidate'
      USING ERRCODE='23514', CONSTRAINT='agent_assignments_active_registry_check';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION builder.enforce_agent_assignment_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'agent assignments cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF ROW(OLD.assignment_id,OLD.project_id,OLD.job_id,OLD.required_role,OLD.agent_id,OLD.agent_key,
         OLD.agent_version,OLD.created_at,OLD.created_by)
     IS DISTINCT FROM
     ROW(NEW.assignment_id,NEW.project_id,NEW.job_id,NEW.required_role,NEW.agent_id,NEW.agent_key,
         NEW.agent_version,NEW.created_at,NEW.created_by) THEN
    RAISE EXCEPTION 'agent assignment binding is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.assignment_status='ASSIGNED' AND NEW.assignment_status='RELEASED'
     AND OLD.released_at IS NULL AND OLD.released_by IS NULL
     AND NEW.released_at IS NOT NULL AND NEW.released_by IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid agent assignment status transition' USING ERRCODE='23514';
END $$;

CREATE TRIGGER agent_assignments_validate_insert
  BEFORE INSERT ON builder.agent_assignments
  FOR EACH ROW EXECUTE FUNCTION builder.validate_agent_assignment_insert();
CREATE TRIGGER agent_assignments_immutable
  BEFORE UPDATE OR DELETE ON builder.agent_assignments
  FOR EACH ROW EXECUTE FUNCTION builder.enforce_agent_assignment_immutability();

ALTER TABLE builder.agent_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.agent_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_assignments_project_isolation ON builder.agent_assignments
  USING (project_id=builder.current_project_id())
  WITH CHECK (project_id=builder.current_project_id());

GRANT SELECT,INSERT ON builder.agent_assignments TO builder_runtime;
GRANT UPDATE(assignment_status,released_at,released_by) ON builder.agent_assignments TO builder_runtime;

ALTER TABLE builder.agent_assignments OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_agent_assignment_insert() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.enforce_agent_assignment_immutability() OWNER TO builder_schema_owner;
