-- ORCHESTRATOR-IMPLEMENTATION-MVP-02. Development-only synthetic implementation ProcessInstance.

CREATE TABLE builder.implementation_runs (
  id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES builder.projects(id),
  planning_run_id uuid NOT NULL,
  project_revision text NOT NULL CHECK (project_revision ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN (
    'IMPLEMENTING','IMPLEMENTATION_REVIEW','READY_FOR_DELIVERY','CHANGES_REQUESTED',
    'BLOCKED','IMPLEMENTATION_FAILED','IMPLEMENTATION_CANCELLED'
  )),
  requested_by text NOT NULL CHECK (requested_by ~ '^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$'),
  blocked_at timestamptz,
  block_code text CHECK (block_code IS NULL OR block_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  block_role text CHECK (block_role IS NULL OR block_role IN ('EXECUTOR','QA','REVIEWER','SECURITY','LEGAL_DE_EU')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT implementation_runs_pkey PRIMARY KEY (id),
  CONSTRAINT implementation_runs_project_revision_unique UNIQUE (project_id,project_revision),
  CONSTRAINT implementation_runs_planning_run_unique UNIQUE (project_id,planning_run_id),
  CONSTRAINT implementation_runs_project_id_unique UNIQUE (project_id,id),
  CONSTRAINT implementation_runs_project_id_revision_unique UNIQUE (project_id,id,project_revision),
  CONSTRAINT implementation_runs_planning_revision_fk FOREIGN KEY (project_id,planning_run_id,project_revision)
    REFERENCES builder.planning_runs(project_id,id,project_revision),
  CONSTRAINT implementation_runs_block_state_check CHECK (
    (status='BLOCKED' AND blocked_at IS NOT NULL AND block_code IS NOT NULL AND block_role IS NOT NULL)
    OR (status<>'BLOCKED' AND blocked_at IS NULL AND block_code IS NULL AND block_role IS NULL)
  )
);

CREATE TABLE builder.implementation_jobs (
  id uuid NOT NULL,
  project_id uuid NOT NULL,
  implementation_run_id uuid NOT NULL,
  project_revision text NOT NULL CHECK (project_revision ~ '^[0-9a-f]{64}$'),
  role text NOT NULL CHECK (role IN ('EXECUTOR','QA','REVIEWER','SECURITY','LEGAL_DE_EU')),
  executor_result_id uuid,
  background_job_id uuid NOT NULL,
  runtime_run_id text NOT NULL,
  assignment_id uuid NOT NULL,
  input_ref builder.opaque_ref NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT implementation_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT implementation_jobs_run_role_unique UNIQUE (implementation_run_id,role),
  CONSTRAINT implementation_jobs_background_unique UNIQUE (background_job_id),
  CONSTRAINT implementation_jobs_runtime_run_unique UNIQUE (project_id,runtime_run_id),
  CONSTRAINT implementation_jobs_project_run_id_unique UNIQUE (project_id,implementation_run_id,id),
  CONSTRAINT implementation_jobs_run_revision_fk FOREIGN KEY (project_id,implementation_run_id,project_revision)
    REFERENCES builder.implementation_runs(project_id,id,project_revision),
  CONSTRAINT implementation_jobs_background_fk FOREIGN KEY (project_id,background_job_id)
    REFERENCES builder.background_jobs(project_id,id),
  CONSTRAINT implementation_jobs_runtime_run_fk FOREIGN KEY (project_id,runtime_run_id)
    REFERENCES builder.agent_runtime_runs(project_id,run_id),
  CONSTRAINT implementation_jobs_assignment_fk FOREIGN KEY (project_id,assignment_id)
    REFERENCES builder.agent_assignments(project_id,assignment_id),
  CONSTRAINT implementation_jobs_role_link_check CHECK (
    (role='EXECUTOR' AND executor_result_id IS NULL)
    OR (role<>'EXECUTOR' AND executor_result_id IS NOT NULL)
  )
);

CREATE TABLE builder.implementation_executor_results (
  implementation_result_id uuid NOT NULL,
  project_id uuid NOT NULL,
  implementation_run_id uuid NOT NULL,
  project_revision text NOT NULL CHECK (project_revision ~ '^[0-9a-f]{64}$'),
  executor_job_id uuid NOT NULL,
  runtime_result_id uuid,
  agent_id uuid NOT NULL,
  agent_key text NOT NULL CHECK (agent_key ~ '^[a-z][a-z0-9-]{0,63}$'),
  agent_version integer NOT NULL CHECK (agent_version>0),
  artifacts jsonb NOT NULL CHECK (jsonb_typeof(artifacts)='array' AND jsonb_array_length(artifacts)<=32),
  summary text NOT NULL CHECK (char_length(summary)<=512 AND summary ~ '^[A-Za-z0-9][A-Za-z0-9 .,:;()_/-]*$'),
  status text NOT NULL CHECK (status IN ('SUCCEEDED','FAILED','CANCELLED')),
  created_at timestamptz NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT implementation_executor_results_pkey PRIMARY KEY (implementation_result_id),
  CONSTRAINT implementation_executor_results_executor_unique UNIQUE (executor_job_id),
  CONSTRAINT implementation_executor_results_runtime_unique UNIQUE (runtime_result_id),
  CONSTRAINT implementation_executor_results_project_run_id_unique UNIQUE (project_id,implementation_run_id,implementation_result_id),
  CONSTRAINT implementation_executor_results_run_revision_fk FOREIGN KEY (project_id,implementation_run_id,project_revision)
    REFERENCES builder.implementation_runs(project_id,id,project_revision),
  CONSTRAINT implementation_executor_results_job_fk FOREIGN KEY (project_id,implementation_run_id,executor_job_id)
    REFERENCES builder.implementation_jobs(project_id,implementation_run_id,id),
  CONSTRAINT implementation_executor_results_runtime_fk FOREIGN KEY (project_id,runtime_result_id)
    REFERENCES builder.agent_runtime_results(project_id,id),
  CONSTRAINT implementation_executor_results_status_tuple_check CHECK (
    (status='SUCCEEDED' AND runtime_result_id IS NOT NULL AND jsonb_array_length(artifacts)>0)
    OR (status='FAILED' AND runtime_result_id IS NOT NULL AND jsonb_array_length(artifacts)=0)
    OR (status='CANCELLED' AND jsonb_array_length(artifacts)=0)
  )
);

ALTER TABLE builder.implementation_jobs ADD CONSTRAINT implementation_jobs_executor_result_fk
  FOREIGN KEY (project_id,implementation_run_id,executor_result_id)
  REFERENCES builder.implementation_executor_results(project_id,implementation_run_id,implementation_result_id);

CREATE TABLE builder.implementation_review_results (
  review_result_id uuid NOT NULL,
  project_id uuid NOT NULL,
  implementation_run_id uuid NOT NULL,
  project_revision text NOT NULL CHECK (project_revision ~ '^[0-9a-f]{64}$'),
  review_job_id uuid NOT NULL,
  implementation_result_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('QA','REVIEWER','SECURITY','LEGAL_DE_EU')),
  runtime_result_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('PASS','CHANGES_REQUESTED','PASS_WITH_REQUIREMENTS','BLOCK')),
  result_object_ref builder.opaque_ref NOT NULL,
  result_digest text NOT NULL CHECK (result_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT implementation_review_results_pkey PRIMARY KEY (review_result_id),
  CONSTRAINT implementation_review_results_job_unique UNIQUE (review_job_id),
  CONSTRAINT implementation_review_results_runtime_unique UNIQUE (runtime_result_id),
  CONSTRAINT implementation_review_results_project_run_id_unique UNIQUE (project_id,implementation_run_id,review_result_id),
  CONSTRAINT implementation_review_results_run_revision_fk FOREIGN KEY (project_id,implementation_run_id,project_revision)
    REFERENCES builder.implementation_runs(project_id,id,project_revision),
  CONSTRAINT implementation_review_results_job_fk FOREIGN KEY (project_id,implementation_run_id,review_job_id)
    REFERENCES builder.implementation_jobs(project_id,implementation_run_id,id),
  CONSTRAINT implementation_review_results_executor_fk FOREIGN KEY (project_id,implementation_run_id,implementation_result_id)
    REFERENCES builder.implementation_executor_results(project_id,implementation_run_id,implementation_result_id),
  CONSTRAINT implementation_review_results_runtime_fk FOREIGN KEY (project_id,runtime_result_id)
    REFERENCES builder.agent_runtime_results(project_id,id),
  CONSTRAINT implementation_review_results_role_outcome_check CHECK (
    (role IN ('QA','REVIEWER') AND outcome IN ('PASS','CHANGES_REQUESTED'))
    OR (role IN ('SECURITY','LEGAL_DE_EU') AND outcome IN ('PASS','PASS_WITH_REQUIREMENTS','BLOCK'))
  )
);

CREATE TABLE builder.implementation_review_requirements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  implementation_run_id uuid NOT NULL,
  review_result_id uuid NOT NULL,
  review_job_id uuid NOT NULL,
  requirement_code text NOT NULL CHECK (requirement_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  requirement_ref builder.opaque_ref NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT implementation_review_requirements_pkey PRIMARY KEY (id),
  CONSTRAINT implementation_review_requirements_unique UNIQUE (review_result_id,requirement_code,requirement_ref),
  CONSTRAINT implementation_review_requirements_job_fk FOREIGN KEY (project_id,implementation_run_id,review_job_id)
    REFERENCES builder.implementation_jobs(project_id,implementation_run_id,id),
  CONSTRAINT implementation_review_requirements_result_fk FOREIGN KEY (project_id,implementation_run_id,review_result_id)
    REFERENCES builder.implementation_review_results(project_id,implementation_run_id,review_result_id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE FUNCTION builder.validate_implementation_run_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_status text; v_decision text; v_approved_revision text;
BEGIN
  IF NEW.status<>'IMPLEMENTING' OR NEW.blocked_at IS NOT NULL OR NEW.block_code IS NOT NULL OR NEW.block_role IS NOT NULL THEN
    RAISE EXCEPTION 'implementation runs must start in IMPLEMENTING without terminal metadata' USING ERRCODE='23514';
  END IF;
  SELECT run.status,decision.decision,decision.approved_project_revision
    INTO v_status,v_decision,v_approved_revision
  FROM builder.planning_runs run
  LEFT JOIN builder.planning_owner_decisions decision
    ON decision.project_id=run.project_id AND decision.planning_run_id=run.id
  WHERE run.project_id=NEW.project_id AND run.id=NEW.planning_run_id AND run.project_revision=NEW.project_revision
  FOR SHARE OF run;
  IF NOT FOUND OR v_status<>'READY_FOR_IMPLEMENTATION' OR v_decision IS DISTINCT FROM 'APPROVE'
     OR v_approved_revision IS DISTINCT FROM NEW.project_revision THEN
    RAISE EXCEPTION 'implementation start requires the exact persistent owner-approved planning revision' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION builder.validate_implementation_job_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_run_status text; v_assignment_job_id uuid; v_assignment_role text; v_assignment_status text;
  v_background_run_id text; v_background_job_type text; v_runtime_role text; v_result_status text;
BEGIN
  SELECT status INTO v_run_status FROM builder.implementation_runs
  WHERE project_id=NEW.project_id AND id=NEW.implementation_run_id AND project_revision=NEW.project_revision FOR UPDATE;
  IF NOT FOUND OR v_run_status NOT IN ('IMPLEMENTING','IMPLEMENTATION_REVIEW') THEN
    RAISE EXCEPTION 'implementation job requires an active matching run' USING ERRCODE='23514';
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
    RAISE EXCEPTION 'implementation job runtime and assignment binding is inconsistent' USING ERRCODE='23514';
  END IF;
  IF NEW.role='EXECUTOR' THEN
    IF v_run_status<>'IMPLEMENTING' OR NEW.executor_result_id IS NOT NULL THEN
      RAISE EXCEPTION 'executor job is not authorized in this implementation state' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT status INTO v_result_status FROM builder.implementation_executor_results
    WHERE project_id=NEW.project_id AND implementation_run_id=NEW.implementation_run_id
      AND implementation_result_id=NEW.executor_result_id AND project_revision=NEW.project_revision;
    IF NOT FOUND OR v_result_status<>'SUCCEEDED' THEN
      RAISE EXCEPTION 'implementation review job requires the successful immutable executor result' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION builder.enforce_implementation_job_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'implementation job binding is immutable' USING ERRCODE='23514';
END $$;

CREATE FUNCTION builder.validate_implementation_executor_result() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_role text; v_background_job_id uuid; v_runtime_run_id text;
  v_assignment_agent_id uuid; v_assignment_agent_key text; v_assignment_agent_version integer;
  v_job_status text; v_background_result_id uuid; v_runtime_status text; v_result_run_id text; v_payload jsonb;
  v_artifact jsonb;
BEGIN
  SELECT job.role,job.background_job_id,job.runtime_run_id,
         assignment.agent_id,assignment.agent_key,assignment.agent_version,
         background.status,background.agent_result_id,runtime.status,runtime.run_id,runtime.result_payload
    INTO v_role,v_background_job_id,v_runtime_run_id,
         v_assignment_agent_id,v_assignment_agent_key,v_assignment_agent_version,
         v_job_status,v_background_result_id,v_runtime_status,v_result_run_id,v_payload
  FROM builder.implementation_jobs job
  JOIN builder.agent_assignments assignment
    ON assignment.project_id=job.project_id AND assignment.assignment_id=job.assignment_id
  JOIN builder.background_jobs background
    ON background.project_id=job.project_id AND background.id=job.background_job_id
  LEFT JOIN builder.agent_runtime_results runtime
    ON runtime.project_id=background.project_id AND runtime.id=background.agent_result_id
  WHERE job.project_id=NEW.project_id AND job.implementation_run_id=NEW.implementation_run_id
    AND job.id=NEW.executor_job_id AND job.project_revision=NEW.project_revision FOR UPDATE OF job,background;
  IF NOT FOUND OR v_role<>'EXECUTOR' OR v_assignment_agent_id<>NEW.agent_id
     OR v_assignment_agent_key<>NEW.agent_key OR v_assignment_agent_version<>NEW.agent_version
     OR v_background_result_id IS DISTINCT FROM NEW.runtime_result_id
     OR (NEW.runtime_result_id IS NOT NULL AND v_result_run_id IS DISTINCT FROM v_runtime_run_id) THEN
    RAISE EXCEPTION 'executor result job, runtime, revision, and assignment binding is inconsistent' USING ERRCODE='23514';
  END IF;
  IF (NEW.status='SUCCEEDED' AND (v_job_status<>'SUCCEEDED' OR v_runtime_status IS DISTINCT FROM 'SUCCESS'))
     OR (NEW.status='FAILED' AND (v_job_status<>'FAILED' OR v_runtime_status NOT IN ('ERROR','TIMEOUT')))
     OR (NEW.status='CANCELLED' AND (v_job_status<>'CANCELLED' OR (NEW.runtime_result_id IS NOT NULL AND v_runtime_status IS DISTINCT FROM 'CANCELLED'))) THEN
    RAISE EXCEPTION 'executor result status does not match the authoritative fake runtime job' USING ERRCODE='23514';
  END IF;
  FOR v_artifact IN SELECT value FROM jsonb_array_elements(NEW.artifacts) LOOP
    IF jsonb_typeof(v_artifact)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v_artifact))<>2
       OR NOT (v_artifact ? 'objectRef' AND v_artifact ? 'digest')
       OR char_length(v_artifact->>'objectRef')>512
       OR (v_artifact->>'objectRef') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
       OR (v_artifact->>'digest') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'executor result contains an invalid synthetic artifact reference' USING ERRCODE='23514';
    END IF;
    IF NEW.status='SUCCEEDED' AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_payload->'artifacts') runtime_artifact
      WHERE runtime_artifact->>'objectRef'=v_artifact->>'objectRef'
        AND runtime_artifact->>'digest'=v_artifact->>'digest'
    ) THEN
      RAISE EXCEPTION 'executor artifact does not match the bound successful fake runtime result' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(NEW.artifacts))<>
     (SELECT count(DISTINCT (value->>'objectRef',value->>'digest')) FROM jsonb_array_elements(NEW.artifacts)) THEN
    RAISE EXCEPTION 'executor result contains duplicate artifact references' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION builder.validate_implementation_requirement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_role text; v_existing_result uuid;
BEGIN
  SELECT job.role,result.review_result_id INTO v_role,v_existing_result
  FROM builder.implementation_jobs job
  LEFT JOIN builder.implementation_review_results result
    ON result.project_id=job.project_id AND result.implementation_run_id=job.implementation_run_id
      AND result.review_job_id=job.id
  WHERE job.project_id=NEW.project_id AND job.implementation_run_id=NEW.implementation_run_id
    AND job.id=NEW.review_job_id FOR UPDATE OF job;
  IF NOT FOUND OR v_role NOT IN ('SECURITY','LEGAL_DE_EU') OR v_existing_result IS NOT NULL THEN
    RAISE EXCEPTION 'implementation requirements can only be staged before the matching legal or security result' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION builder.validate_implementation_review_result() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_job_role text; v_executor_result_id uuid; v_job_revision text; v_background_job_id uuid; v_runtime_run_id text;
  v_job_status text; v_background_result_id uuid; v_runtime_status text; v_result_run_id text; v_payload jsonb;
BEGIN
  SELECT job.role,job.executor_result_id,job.project_revision,job.background_job_id,job.runtime_run_id,
         background.status,background.agent_result_id,runtime.status,runtime.run_id,runtime.result_payload
    INTO v_job_role,v_executor_result_id,v_job_revision,v_background_job_id,v_runtime_run_id,
         v_job_status,v_background_result_id,v_runtime_status,v_result_run_id,v_payload
  FROM builder.implementation_jobs job
  JOIN builder.background_jobs background
    ON background.project_id=job.project_id AND background.id=job.background_job_id
  JOIN builder.agent_runtime_results runtime
    ON runtime.project_id=background.project_id AND runtime.id=background.agent_result_id
  WHERE job.project_id=NEW.project_id AND job.implementation_run_id=NEW.implementation_run_id
    AND job.id=NEW.review_job_id FOR UPDATE OF job,background;
  IF NOT FOUND OR v_job_role IS DISTINCT FROM NEW.role OR v_job_revision IS DISTINCT FROM NEW.project_revision
     OR v_executor_result_id IS DISTINCT FROM NEW.implementation_result_id
     OR v_background_result_id IS DISTINCT FROM NEW.runtime_result_id
     OR v_job_status<>'SUCCEEDED' OR v_runtime_status<>'SUCCESS' OR v_result_run_id<>v_runtime_run_id THEN
    RAISE EXCEPTION 'review result job, executor, revision, and fake runtime binding is inconsistent' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_payload->'artifacts') artifact
    WHERE artifact->>'objectRef'=NEW.result_object_ref AND artifact->>'digest'=NEW.result_digest
  ) THEN
    RAISE EXCEPTION 'review result artifact does not match the bound successful fake runtime result' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION builder.check_implementation_requirement_parent() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_outcome text; v_job_id uuid;
BEGIN
  SELECT outcome,review_job_id INTO v_outcome,v_job_id FROM builder.implementation_review_results
  WHERE project_id=NEW.project_id AND implementation_run_id=NEW.implementation_run_id
    AND review_result_id=NEW.review_result_id;
  IF NOT FOUND OR v_job_id<>NEW.review_job_id OR v_outcome<>'PASS_WITH_REQUIREMENTS' THEN
    RAISE EXCEPTION 'staged implementation requirements and PASS_WITH_REQUIREMENTS must commit atomically' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION builder.check_implementation_review_requirements() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.outcome='PASS_WITH_REQUIREMENTS' AND NOT EXISTS (
    SELECT 1 FROM builder.implementation_review_requirements requirement
    WHERE requirement.project_id=NEW.project_id AND requirement.implementation_run_id=NEW.implementation_run_id
      AND requirement.review_result_id=NEW.review_result_id AND requirement.review_job_id=NEW.review_job_id
  ) THEN
    RAISE EXCEPTION 'implementation PASS_WITH_REQUIREMENTS needs at least one persisted requirement' USING ERRCODE='23514';
  END IF;
  IF NEW.outcome<>'PASS_WITH_REQUIREMENTS' AND EXISTS (
    SELECT 1 FROM builder.implementation_review_requirements requirement
    WHERE requirement.project_id=NEW.project_id AND requirement.implementation_run_id=NEW.implementation_run_id
      AND requirement.review_result_id=NEW.review_result_id
  ) THEN
    RAISE EXCEPTION 'implementation requirements are only valid for PASS_WITH_REQUIREMENTS' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION builder.check_implementation_executor_result_applied() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_status text; v_block_code text;
BEGIN
  SELECT status,block_code INTO v_status,v_block_code FROM builder.implementation_runs
  WHERE project_id=NEW.project_id AND id=NEW.implementation_run_id;
  IF (NEW.status='SUCCEEDED' AND NOT (v_status='IMPLEMENTATION_REVIEW' OR (v_status='BLOCKED' AND v_block_code IN ('NO_ACTIVE_AGENT_VERSION','AMBIGUOUS_ACTIVE_AGENT_VERSION'))))
     OR (NEW.status='FAILED' AND v_status IS DISTINCT FROM 'IMPLEMENTATION_FAILED')
     OR (NEW.status='CANCELLED' AND v_status IS DISTINCT FROM 'IMPLEMENTATION_CANCELLED') THEN
    RAISE EXCEPTION 'executor result and implementation state must commit atomically' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION builder.check_implementation_review_result_applied() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_count integer; v_blocks integer; v_changes integer; v_status text;
BEGIN
  SELECT count(*),count(*) FILTER (WHERE outcome='BLOCK'),count(*) FILTER (WHERE outcome='CHANGES_REQUESTED')
    INTO v_count,v_blocks,v_changes FROM builder.implementation_review_results
  WHERE project_id=NEW.project_id AND implementation_run_id=NEW.implementation_run_id;
  SELECT status INTO v_status FROM builder.implementation_runs
  WHERE project_id=NEW.project_id AND id=NEW.implementation_run_id;
  IF v_count<4 AND v_status<>'IMPLEMENTATION_REVIEW' THEN
    RAISE EXCEPTION 'partial implementation reviews cannot produce a terminal decision' USING ERRCODE='23514';
  END IF;
  IF v_count=4 AND ((v_blocks>0 AND v_status<>'BLOCKED')
     OR (v_blocks=0 AND v_changes>0 AND v_status<>'CHANGES_REQUESTED')
     OR (v_blocks=0 AND v_changes=0 AND v_status<>'READY_FOR_DELIVERY')) THEN
    RAISE EXCEPTION 'implementation review barrier and deterministic terminal decision must commit atomically' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION builder.enforce_implementation_run_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_result_status text; v_review_count integer; v_block_count integer; v_change_count integer;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'implementation runs cannot be deleted' USING ERRCODE='23514'; END IF;
  IF ROW(OLD.id,OLD.project_id,OLD.planning_run_id,OLD.project_revision,OLD.requested_by,OLD.created_at)
     IS DISTINCT FROM ROW(NEW.id,NEW.project_id,NEW.planning_run_id,NEW.project_revision,NEW.requested_by,NEW.created_at) THEN
    RAISE EXCEPTION 'implementation run binding is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status IN ('READY_FOR_DELIVERY','CHANGES_REQUESTED','BLOCKED','IMPLEMENTATION_FAILED','IMPLEMENTATION_CANCELLED') THEN
    RAISE EXCEPTION 'terminal implementation run is immutable' USING ERRCODE='23514';
  END IF;
  IF NOT (
    (OLD.status='IMPLEMENTING' AND NEW.status IN ('IMPLEMENTATION_REVIEW','BLOCKED','IMPLEMENTATION_FAILED','IMPLEMENTATION_CANCELLED'))
    OR (OLD.status='IMPLEMENTATION_REVIEW' AND NEW.status IN ('READY_FOR_DELIVERY','CHANGES_REQUESTED','BLOCKED'))
  ) THEN RAISE EXCEPTION 'invalid implementation run status transition' USING ERRCODE='23514'; END IF;

  SELECT status INTO v_result_status FROM builder.implementation_executor_results
  WHERE project_id=NEW.project_id AND implementation_run_id=NEW.id;
  IF NEW.status='IMPLEMENTATION_REVIEW' THEN
    IF v_result_status IS DISTINCT FROM 'SUCCEEDED' OR
       (SELECT count(*) FROM builder.implementation_jobs WHERE project_id=NEW.project_id AND implementation_run_id=NEW.id
          AND role IN ('QA','REVIEWER','SECURITY','LEGAL_DE_EU'))<>4 OR
       (SELECT count(DISTINCT executor_result_id) FROM builder.implementation_jobs WHERE project_id=NEW.project_id
          AND implementation_run_id=NEW.id AND role IN ('QA','REVIEWER','SECURITY','LEGAL_DE_EU'))<>1 THEN
      RAISE EXCEPTION 'implementation review requires four jobs bound to one successful executor result' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.status='IMPLEMENTATION_FAILED' AND v_result_status IS DISTINCT FROM 'FAILED' THEN
    RAISE EXCEPTION 'IMPLEMENTATION_FAILED requires the immutable failed executor result' USING ERRCODE='23514';
  END IF;
  IF NEW.status='IMPLEMENTATION_CANCELLED' AND v_result_status IS DISTINCT FROM 'CANCELLED' THEN
    RAISE EXCEPTION 'IMPLEMENTATION_CANCELLED requires the immutable cancelled executor result' USING ERRCODE='23514';
  END IF;
  IF NEW.status IN ('READY_FOR_DELIVERY','CHANGES_REQUESTED') OR (NEW.status='BLOCKED' AND NEW.block_code='REVIEW_BLOCK') THEN
    SELECT count(*),count(*) FILTER (WHERE outcome='BLOCK'),count(*) FILTER (WHERE outcome='CHANGES_REQUESTED')
      INTO v_review_count,v_block_count,v_change_count FROM builder.implementation_review_results
    WHERE project_id=NEW.project_id AND implementation_run_id=NEW.id;
    IF v_review_count<>4
       OR (NEW.status='READY_FOR_DELIVERY' AND (v_block_count<>0 OR v_change_count<>0))
       OR (NEW.status='CHANGES_REQUESTED' AND (v_block_count<>0 OR v_change_count=0))
       OR (NEW.status='BLOCKED' AND v_block_count=0) THEN
      RAISE EXCEPTION 'implementation terminal review decision violates the four-result priority barrier' USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.updated_at=clock_timestamp();
  RETURN NEW;
END $$;

CREATE TRIGGER implementation_runs_validate_insert BEFORE INSERT ON builder.implementation_runs
  FOR EACH ROW EXECUTE FUNCTION builder.validate_implementation_run_insert();
CREATE TRIGGER implementation_jobs_validate_insert BEFORE INSERT ON builder.implementation_jobs
  FOR EACH ROW EXECUTE FUNCTION builder.validate_implementation_job_insert();
CREATE TRIGGER implementation_jobs_immutable BEFORE UPDATE OR DELETE ON builder.implementation_jobs
  FOR EACH ROW EXECUTE FUNCTION builder.enforce_implementation_job_immutable();
CREATE TRIGGER implementation_executor_results_validate BEFORE INSERT ON builder.implementation_executor_results
  FOR EACH ROW EXECUTE FUNCTION builder.validate_implementation_executor_result();
CREATE TRIGGER implementation_executor_results_immutable BEFORE UPDATE OR DELETE ON builder.implementation_executor_results
  FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE CONSTRAINT TRIGGER implementation_executor_results_applied
  AFTER INSERT ON builder.implementation_executor_results DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION builder.check_implementation_executor_result_applied();
CREATE TRIGGER implementation_review_results_validate BEFORE INSERT ON builder.implementation_review_results
  FOR EACH ROW EXECUTE FUNCTION builder.validate_implementation_review_result();
CREATE TRIGGER implementation_review_results_immutable BEFORE UPDATE OR DELETE ON builder.implementation_review_results
  FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE CONSTRAINT TRIGGER implementation_review_results_requirements
  AFTER INSERT ON builder.implementation_review_results DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION builder.check_implementation_review_requirements();
CREATE CONSTRAINT TRIGGER implementation_review_results_applied
  AFTER INSERT ON builder.implementation_review_results DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION builder.check_implementation_review_result_applied();
CREATE TRIGGER implementation_requirements_validate BEFORE INSERT ON builder.implementation_review_requirements
  FOR EACH ROW EXECUTE FUNCTION builder.validate_implementation_requirement();
CREATE CONSTRAINT TRIGGER implementation_requirements_parent
  AFTER INSERT ON builder.implementation_review_requirements DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION builder.check_implementation_requirement_parent();
CREATE TRIGGER implementation_requirements_immutable BEFORE UPDATE OR DELETE ON builder.implementation_review_requirements
  FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER implementation_runs_transition BEFORE UPDATE OR DELETE ON builder.implementation_runs
  FOR EACH ROW EXECUTE FUNCTION builder.enforce_implementation_run_transition();

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'implementation_runs','implementation_jobs','implementation_executor_results',
    'implementation_review_results','implementation_review_requirements'
  ] LOOP
    EXECUTE format('ALTER TABLE builder.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE builder.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY project_isolation ON builder.%I USING (project_id=builder.current_project_id()) WITH CHECK(project_id=builder.current_project_id())',table_name);
    EXECUTE format('GRANT SELECT,INSERT ON builder.%I TO builder_runtime',table_name);
    EXECUTE format('ALTER TABLE builder.%I OWNER TO builder_schema_owner',table_name);
  END LOOP;
END $$;
GRANT UPDATE(status,blocked_at,block_code,block_role,updated_at) ON builder.implementation_runs TO builder_runtime;

ALTER FUNCTION builder.validate_implementation_run_insert() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_implementation_job_insert() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.enforce_implementation_job_immutable() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_implementation_executor_result() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_implementation_requirement() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_implementation_review_result() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.check_implementation_requirement_parent() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.check_implementation_review_requirements() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.check_implementation_executor_result_applied() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.check_implementation_review_result_applied() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.enforce_implementation_run_transition() OWNER TO builder_schema_owner;
