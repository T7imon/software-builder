-- ORCHESTRATOR-PLANNING-MVP-01. Development-only persisted planning ProcessInstance.

CREATE TABLE builder.planning_runs (
  id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES builder.projects(id),
  project_revision text NOT NULL CHECK (project_revision ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN (
    'PLANNING','ARCHITECTURE_REVIEW','SECURITY_LEGAL_REVIEW',
    'WAITING_FOR_OWNER_APPROVAL','READY_FOR_IMPLEMENTATION','BLOCKED','REJECTED'
  )),
  requested_by text NOT NULL CHECK (requested_by ~ '^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$'),
  blocked_at timestamptz,
  block_code text CHECK (block_code IS NULL OR block_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  block_role text CHECK (block_role IS NULL OR block_role IN ('PLANNER','ARCHITECT','SECURITY','LEGAL_DE_EU')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT planning_runs_pkey PRIMARY KEY (id),
  CONSTRAINT planning_runs_project_revision_unique UNIQUE (project_id,project_revision),
  CONSTRAINT planning_runs_project_id_unique UNIQUE (project_id,id),
  CONSTRAINT planning_runs_project_id_revision_unique UNIQUE (project_id,id,project_revision),
  CONSTRAINT planning_runs_block_state_check CHECK (
    (status='BLOCKED' AND blocked_at IS NOT NULL AND block_code IS NOT NULL AND block_role IS NOT NULL)
    OR (status<>'BLOCKED' AND blocked_at IS NULL AND block_code IS NULL AND block_role IS NULL)
  )
);

CREATE TABLE builder.planning_jobs (
  id uuid NOT NULL,
  project_id uuid NOT NULL,
  planning_run_id uuid NOT NULL,
  project_revision text NOT NULL CHECK (project_revision ~ '^[0-9a-f]{64}$'),
  role text NOT NULL CHECK (role IN ('PLANNER','ARCHITECT','SECURITY','LEGAL_DE_EU')),
  prerequisite_job_id uuid,
  architecture_job_id uuid,
  background_job_id uuid NOT NULL,
  runtime_run_id text NOT NULL,
  assignment_id uuid NOT NULL,
  input_ref builder.opaque_ref NOT NULL,
  runtime_result_id uuid,
  outcome text CHECK (outcome IS NULL OR outcome IN ('PASS','PASS_WITH_REQUIREMENTS','BLOCK')),
  result_object_ref builder.opaque_ref,
  result_digest text CHECK (result_digest IS NULL OR result_digest ~ '^[0-9a-f]{64}$'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT planning_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT planning_jobs_run_role_unique UNIQUE (planning_run_id,role),
  CONSTRAINT planning_jobs_background_unique UNIQUE (background_job_id),
  CONSTRAINT planning_jobs_runtime_run_unique UNIQUE (project_id,runtime_run_id),
  CONSTRAINT planning_jobs_runtime_result_unique UNIQUE (runtime_result_id),
  CONSTRAINT planning_jobs_project_run_id_unique UNIQUE (project_id,planning_run_id,id),
  CONSTRAINT planning_jobs_run_revision_fk FOREIGN KEY (project_id,planning_run_id,project_revision)
    REFERENCES builder.planning_runs(project_id,id,project_revision),
  CONSTRAINT planning_jobs_background_fk FOREIGN KEY (project_id,background_job_id)
    REFERENCES builder.background_jobs(project_id,id),
  CONSTRAINT planning_jobs_runtime_run_fk FOREIGN KEY (project_id,runtime_run_id)
    REFERENCES builder.agent_runtime_runs(project_id,run_id),
  CONSTRAINT planning_jobs_runtime_result_fk FOREIGN KEY (project_id,runtime_result_id)
    REFERENCES builder.agent_runtime_results(project_id,id),
  CONSTRAINT planning_jobs_assignment_fk FOREIGN KEY (project_id,assignment_id)
    REFERENCES builder.agent_assignments(project_id,assignment_id),
  CONSTRAINT planning_jobs_prerequisite_fk FOREIGN KEY (project_id,planning_run_id,prerequisite_job_id)
    REFERENCES builder.planning_jobs(project_id,planning_run_id,id),
  CONSTRAINT planning_jobs_architecture_fk FOREIGN KEY (project_id,planning_run_id,architecture_job_id)
    REFERENCES builder.planning_jobs(project_id,planning_run_id,id),
  CONSTRAINT planning_jobs_role_links_check CHECK (
    (role='PLANNER' AND prerequisite_job_id IS NULL AND architecture_job_id IS NULL)
    OR (role='ARCHITECT' AND prerequisite_job_id IS NOT NULL AND architecture_job_id IS NULL)
    OR (role IN ('SECURITY','LEGAL_DE_EU') AND prerequisite_job_id IS NOT NULL AND architecture_job_id=prerequisite_job_id)
  ),
  CONSTRAINT planning_jobs_result_tuple_check CHECK (
    (runtime_result_id IS NULL AND outcome IS NULL AND result_object_ref IS NULL AND result_digest IS NULL AND completed_at IS NULL)
    OR (runtime_result_id IS NOT NULL AND outcome IS NOT NULL AND result_object_ref IS NOT NULL AND result_digest IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT planning_jobs_role_outcome_check CHECK (
    role IN ('SECURITY','LEGAL_DE_EU') OR outcome IS NULL OR outcome='PASS'
  )
);

CREATE TABLE builder.planning_review_requirements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  planning_run_id uuid NOT NULL,
  planning_job_id uuid NOT NULL,
  requirement_code text NOT NULL CHECK (requirement_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  requirement_ref builder.opaque_ref NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT planning_review_requirements_pkey PRIMARY KEY (id),
  CONSTRAINT planning_review_requirements_unique UNIQUE (planning_job_id,requirement_code,requirement_ref),
  CONSTRAINT planning_review_requirements_job_fk FOREIGN KEY (project_id,planning_run_id,planning_job_id)
    REFERENCES builder.planning_jobs(project_id,planning_run_id,id)
);

CREATE TABLE builder.planning_owner_decisions (
  project_id uuid NOT NULL,
  planning_run_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVE','REJECT')),
  decided_by text NOT NULL CHECK (decided_by ~ '^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$'),
  reason_ref builder.opaque_ref NOT NULL,
  approved_project_revision text CHECK (approved_project_revision IS NULL OR approved_project_revision ~ '^[0-9a-f]{64}$'),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT planning_owner_decisions_pkey PRIMARY KEY (project_id,planning_run_id),
  CONSTRAINT planning_owner_decisions_run_fk FOREIGN KEY (project_id,planning_run_id)
    REFERENCES builder.planning_runs(project_id,id),
  CONSTRAINT planning_owner_decisions_revision_check CHECK (
    (decision='APPROVE' AND approved_project_revision IS NOT NULL)
    OR (decision='REJECT' AND approved_project_revision IS NULL)
  )
);

CREATE FUNCTION builder.validate_planning_run_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status<>'PLANNING' OR NEW.blocked_at IS NOT NULL OR NEW.block_code IS NOT NULL OR NEW.block_role IS NOT NULL THEN
    RAISE EXCEPTION 'planning runs must start in PLANNING without terminal metadata' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION builder.validate_planning_job_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_predecessor_role text; v_predecessor_outcome text;
  v_assignment_job_id uuid; v_assignment_role text; v_assignment_status text;
  v_background_run_id text; v_background_job_type text; v_runtime_role text;
BEGIN
  IF NEW.runtime_result_id IS NOT NULL OR NEW.outcome IS NOT NULL OR NEW.result_object_ref IS NOT NULL
     OR NEW.result_digest IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'planning jobs must start without a result' USING ERRCODE='23514';
  END IF;
  SELECT assignment.job_id,assignment.required_role,assignment.assignment_status,
         background.agent_run_id,background.job_type,task.role
    INTO v_assignment_job_id,v_assignment_role,v_assignment_status,
         v_background_run_id,v_background_job_type,v_runtime_role
  FROM builder.agent_assignments assignment
  JOIN builder.background_jobs background
    ON background.project_id=NEW.project_id AND background.id=NEW.background_job_id
  LEFT JOIN builder.agent_runtime_tasks task
    ON task.project_id=background.project_id AND task.run_id=background.agent_run_id
  WHERE assignment.project_id=NEW.project_id AND assignment.assignment_id=NEW.assignment_id;
  IF NOT FOUND OR v_assignment_job_id<>NEW.background_job_id OR v_assignment_role<>NEW.role
     OR v_assignment_status<>'ASSIGNED' OR v_background_job_type<>'AGENT_RUNTIME'
     OR v_background_run_id IS DISTINCT FROM NEW.runtime_run_id
     OR (CASE WHEN v_runtime_role='LEGAL' THEN 'LEGAL_DE_EU' ELSE v_runtime_role END) IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'planning job runtime and assignment binding is inconsistent' USING ERRCODE='23514';
  END IF;
  IF NEW.role <> 'PLANNER' THEN
    SELECT role,outcome INTO v_predecessor_role,v_predecessor_outcome
    FROM builder.planning_jobs
    WHERE project_id=NEW.project_id AND planning_run_id=NEW.planning_run_id AND id=NEW.prerequisite_job_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'planning prerequisite job is missing' USING ERRCODE='23514';
    END IF;
    IF NEW.role='ARCHITECT' AND (v_predecessor_role<>'PLANNER' OR v_predecessor_outcome<>'PASS') THEN
      RAISE EXCEPTION 'architect requires a successful planner result' USING ERRCODE='23514';
    END IF;
    IF NEW.role IN ('SECURITY','LEGAL_DE_EU') AND (v_predecessor_role<>'ARCHITECT' OR v_predecessor_outcome<>'PASS') THEN
      RAISE EXCEPTION 'review requires the successful architecture job' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION builder.enforce_planning_job_result() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_job_status text; v_runtime_status text; v_runtime_run_id text; v_result_payload jsonb;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'planning jobs cannot be deleted' USING ERRCODE='23514'; END IF;
  IF ROW(OLD.id,OLD.project_id,OLD.planning_run_id,OLD.project_revision,OLD.role,OLD.prerequisite_job_id,
         OLD.architecture_job_id,OLD.background_job_id,OLD.runtime_run_id,OLD.assignment_id,OLD.input_ref,OLD.created_at)
     IS DISTINCT FROM
     ROW(NEW.id,NEW.project_id,NEW.planning_run_id,NEW.project_revision,NEW.role,NEW.prerequisite_job_id,
         NEW.architecture_job_id,NEW.background_job_id,NEW.runtime_run_id,NEW.assignment_id,NEW.input_ref,NEW.created_at) THEN
    RAISE EXCEPTION 'planning job binding is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.runtime_result_id IS NOT NULL THEN
    RAISE EXCEPTION 'accepted planning job result is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.runtime_result_id IS NULL THEN
    RAISE EXCEPTION 'planning job update must atomically accept one result' USING ERRCODE='23514';
  END IF;
  SELECT job.status,result.status,result.run_id,result.result_payload
    INTO v_job_status,v_runtime_status,v_runtime_run_id,v_result_payload
  FROM builder.background_jobs job
  JOIN builder.agent_runtime_results result
    ON result.project_id=job.project_id AND result.id=job.agent_result_id
  WHERE job.project_id=NEW.project_id AND job.id=NEW.background_job_id
    AND result.id=NEW.runtime_result_id;
  IF NOT FOUND OR v_job_status<>'SUCCEEDED' OR v_runtime_status<>'SUCCESS' OR v_runtime_run_id<>NEW.runtime_run_id THEN
    RAISE EXCEPTION 'planning result requires the bound successful fake runtime result' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_result_payload->'artifacts') artifact
    WHERE artifact->>'objectRef'=NEW.result_object_ref AND artifact->>'digest'=NEW.result_digest
  ) THEN
    RAISE EXCEPTION 'planning result artifact does not match the successful fake runtime result' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION builder.validate_planning_requirement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_role text; v_outcome text;
BEGIN
  SELECT role,outcome INTO v_role,v_outcome FROM builder.planning_jobs
  WHERE project_id=NEW.project_id AND planning_run_id=NEW.planning_run_id AND id=NEW.planning_job_id FOR UPDATE;
  IF NOT FOUND OR v_role NOT IN ('SECURITY','LEGAL_DE_EU') OR v_outcome IS NOT NULL THEN
    RAISE EXCEPTION 'planning requirements can only be staged before the matching review result' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION builder.check_planning_requirement_parent_result() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_outcome text;
BEGIN
  SELECT outcome INTO v_outcome FROM builder.planning_jobs
  WHERE project_id=NEW.project_id AND planning_run_id=NEW.planning_run_id AND id=NEW.planning_job_id;
  IF v_outcome IS DISTINCT FROM 'PASS_WITH_REQUIREMENTS' THEN
    RAISE EXCEPTION 'staged planning requirements and PASS_WITH_REQUIREMENTS must commit atomically' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION builder.check_planning_requirements_present() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.outcome='PASS_WITH_REQUIREMENTS' AND NOT EXISTS (
    SELECT 1 FROM builder.planning_review_requirements requirement
    WHERE requirement.project_id=NEW.project_id AND requirement.planning_run_id=NEW.planning_run_id
      AND requirement.planning_job_id=NEW.id
  ) THEN
    RAISE EXCEPTION 'PASS_WITH_REQUIREMENTS needs at least one persisted requirement' USING ERRCODE='23514';
  END IF;
  IF NEW.outcome IS DISTINCT FROM 'PASS_WITH_REQUIREMENTS' AND EXISTS (
    SELECT 1 FROM builder.planning_review_requirements requirement
    WHERE requirement.project_id=NEW.project_id AND requirement.planning_run_id=NEW.planning_run_id
      AND requirement.planning_job_id=NEW.id
  ) THEN
    RAISE EXCEPTION 'requirements are only valid for PASS_WITH_REQUIREMENTS' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION builder.enforce_planning_run_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_owner_decision text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'planning runs cannot be deleted' USING ERRCODE='23514'; END IF;
  IF ROW(OLD.id,OLD.project_id,OLD.project_revision,OLD.requested_by,OLD.created_at)
     IS DISTINCT FROM ROW(NEW.id,NEW.project_id,NEW.project_revision,NEW.requested_by,NEW.created_at) THEN
    RAISE EXCEPTION 'planning run binding is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status IN ('READY_FOR_IMPLEMENTATION','BLOCKED','REJECTED') THEN
    RAISE EXCEPTION 'terminal planning run is immutable' USING ERRCODE='23514';
  END IF;
  IF NOT (
    (OLD.status='PLANNING' AND NEW.status IN ('ARCHITECTURE_REVIEW','BLOCKED'))
    OR (OLD.status='ARCHITECTURE_REVIEW' AND NEW.status IN ('SECURITY_LEGAL_REVIEW','BLOCKED'))
    OR (OLD.status='SECURITY_LEGAL_REVIEW' AND NEW.status IN ('WAITING_FOR_OWNER_APPROVAL','BLOCKED'))
    OR (OLD.status='WAITING_FOR_OWNER_APPROVAL' AND NEW.status IN ('READY_FOR_IMPLEMENTATION','REJECTED'))
  ) THEN RAISE EXCEPTION 'invalid planning run status transition' USING ERRCODE='23514'; END IF;
  IF NEW.status='ARCHITECTURE_REVIEW' AND NOT EXISTS (
    SELECT 1 FROM builder.planning_jobs WHERE planning_run_id=NEW.id AND role='ARCHITECT'
  ) THEN RAISE EXCEPTION 'architecture review requires an architect job' USING ERRCODE='23514'; END IF;
  IF NEW.status='SECURITY_LEGAL_REVIEW' AND (
    (SELECT count(*) FROM builder.planning_jobs WHERE planning_run_id=NEW.id AND role IN ('SECURITY','LEGAL_DE_EU'))<>2
  ) THEN RAISE EXCEPTION 'security/legal review requires both review jobs' USING ERRCODE='23514'; END IF;
  IF NEW.status='WAITING_FOR_OWNER_APPROVAL' AND (
    SELECT count(*) FROM builder.planning_jobs WHERE planning_run_id=NEW.id AND role IN ('SECURITY','LEGAL_DE_EU')
      AND outcome IN ('PASS','PASS_WITH_REQUIREMENTS')
  )<>2 THEN RAISE EXCEPTION 'owner approval requires both successful terminal reviews' USING ERRCODE='23514'; END IF;
  IF NEW.status IN ('READY_FOR_IMPLEMENTATION','REJECTED') THEN
    SELECT decision INTO v_owner_decision FROM builder.planning_owner_decisions
    WHERE project_id=NEW.project_id AND planning_run_id=NEW.id;
    IF (NEW.status='READY_FOR_IMPLEMENTATION' AND v_owner_decision IS DISTINCT FROM 'APPROVE')
       OR (NEW.status='REJECTED' AND v_owner_decision IS DISTINCT FROM 'REJECT') THEN
      RAISE EXCEPTION 'planning terminal decision does not match owner decision' USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.updated_at=clock_timestamp();
  RETURN NEW;
END $$;

CREATE FUNCTION builder.validate_planning_owner_decision() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_status text; v_revision text;
BEGIN
  SELECT status,project_revision INTO v_status,v_revision FROM builder.planning_runs
  WHERE project_id=NEW.project_id AND id=NEW.planning_run_id FOR UPDATE;
  IF NOT FOUND OR v_status<>'WAITING_FOR_OWNER_APPROVAL' THEN
    RAISE EXCEPTION 'owner decision requires WAITING_FOR_OWNER_APPROVAL' USING ERRCODE='23514';
  END IF;
  IF NEW.decision='APPROVE' AND NEW.approved_project_revision<>v_revision THEN
    RAISE EXCEPTION 'approved revision must equal planning run revision' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION builder.check_planning_owner_decision_applied() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM builder.planning_runs
  WHERE project_id=NEW.project_id AND id=NEW.planning_run_id;
  IF (NEW.decision='APPROVE' AND v_status IS DISTINCT FROM 'READY_FOR_IMPLEMENTATION')
     OR (NEW.decision='REJECT' AND v_status IS DISTINCT FROM 'REJECTED') THEN
    RAISE EXCEPTION 'owner decision and planning run terminal state must commit atomically' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER planning_runs_validate_insert BEFORE INSERT ON builder.planning_runs
  FOR EACH ROW EXECUTE FUNCTION builder.validate_planning_run_insert();
CREATE TRIGGER planning_jobs_validate_insert BEFORE INSERT ON builder.planning_jobs
  FOR EACH ROW EXECUTE FUNCTION builder.validate_planning_job_insert();
CREATE TRIGGER planning_jobs_result_immutable BEFORE UPDATE OR DELETE ON builder.planning_jobs
  FOR EACH ROW EXECUTE FUNCTION builder.enforce_planning_job_result();
CREATE CONSTRAINT TRIGGER planning_jobs_requirements_present
  AFTER INSERT OR UPDATE ON builder.planning_jobs DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION builder.check_planning_requirements_present();
CREATE TRIGGER planning_requirements_validate BEFORE INSERT ON builder.planning_review_requirements
  FOR EACH ROW EXECUTE FUNCTION builder.validate_planning_requirement();
CREATE CONSTRAINT TRIGGER planning_requirements_parent_result
  AFTER INSERT ON builder.planning_review_requirements DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION builder.check_planning_requirement_parent_result();
CREATE TRIGGER planning_requirements_immutable BEFORE UPDATE OR DELETE ON builder.planning_review_requirements
  FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER planning_runs_transition BEFORE UPDATE OR DELETE ON builder.planning_runs
  FOR EACH ROW EXECUTE FUNCTION builder.enforce_planning_run_transition();
CREATE TRIGGER planning_owner_decisions_validate BEFORE INSERT ON builder.planning_owner_decisions
  FOR EACH ROW EXECUTE FUNCTION builder.validate_planning_owner_decision();
CREATE CONSTRAINT TRIGGER planning_owner_decisions_applied
  AFTER INSERT ON builder.planning_owner_decisions DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION builder.check_planning_owner_decision_applied();
CREATE TRIGGER planning_owner_decisions_immutable BEFORE UPDATE OR DELETE ON builder.planning_owner_decisions
  FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['planning_runs','planning_jobs','planning_review_requirements','planning_owner_decisions'] LOOP
    EXECUTE format('ALTER TABLE builder.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE builder.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY project_isolation ON builder.%I USING (project_id=builder.current_project_id()) WITH CHECK(project_id=builder.current_project_id())',table_name);
    EXECUTE format('GRANT SELECT,INSERT ON builder.%I TO builder_runtime',table_name);
    EXECUTE format('ALTER TABLE builder.%I OWNER TO builder_schema_owner',table_name);
  END LOOP;
END $$;
GRANT UPDATE(status,blocked_at,block_code,block_role,updated_at) ON builder.planning_runs TO builder_runtime;
GRANT UPDATE(runtime_result_id,outcome,result_object_ref,result_digest,completed_at) ON builder.planning_jobs TO builder_runtime;
GRANT UPDATE(status,processed_at) ON builder.inbox_events TO builder_runtime;

ALTER FUNCTION builder.validate_planning_run_insert() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_planning_job_insert() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.enforce_planning_job_result() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_planning_requirement() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.check_planning_requirement_parent_result() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.check_planning_requirements_present() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.enforce_planning_run_transition() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_planning_owner_decision() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.check_planning_owner_decision_applied() OWNER TO builder_schema_owner;
