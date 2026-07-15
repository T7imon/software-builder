-- CODEX-EXEC-RUNTIME-ADAPTER-MVP-02. DEVELOPMENT_ONLY, read-only PLANNER exec binding and start ledger.

CREATE TABLE builder.codex_exec_job_bindings (
  project_id uuid NOT NULL,
  job_id uuid NOT NULL,
  project_revision text NOT NULL CHECK (project_revision ~ '^[0-9a-f]{64}$'),
  workspace_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  required_role text NOT NULL DEFAULT 'PLANNER' CHECK (required_role='PLANNER'),
  agent_id uuid NOT NULL,
  agent_key text NOT NULL CHECK (agent_key ~ '^[a-z][a-z0-9-]{0,63}$'),
  agent_version integer NOT NULL CHECK (agent_version>0),
  planning_task text NOT NULL CHECK (length(btrim(planning_task)) BETWEEN 1 AND 2000),
  created_by text NOT NULL CHECK (
    created_by ~ '^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$'
    AND created_by !~* '(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_|glpat-|xox[baprs]-|npm_|pypi-|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)'
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT codex_exec_job_bindings_pkey PRIMARY KEY (project_id,job_id),
  CONSTRAINT codex_exec_job_bindings_job_unique UNIQUE (job_id),
  CONSTRAINT codex_exec_job_bindings_job_fk FOREIGN KEY (project_id,job_id)
    REFERENCES builder.background_jobs(project_id,id),
  CONSTRAINT codex_exec_job_bindings_workspace_fk FOREIGN KEY (project_id,workspace_id)
    REFERENCES builder.project_workspaces(project_id,workspace_id),
  CONSTRAINT codex_exec_job_bindings_assignment_fk FOREIGN KEY (project_id,assignment_id)
    REFERENCES builder.agent_assignments(project_id,assignment_id),
  CONSTRAINT codex_exec_job_bindings_registry_fk FOREIGN KEY (agent_id,agent_key,agent_version,required_role)
    REFERENCES builder.agent_registry_versions(agent_id,agent_key,version,role),
  CHECK (planning_task !~* '(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|npm_[a-z0-9]{20,}|pypi-[a-z0-9_-]{20,}|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|bearer\s+[a-z0-9._~+/-]{12,}|(api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\s*[:=]|aws[_-]?(access|secret)|[a-z][a-z0-9+.-]*://[^/@\s]+:[^/@\s]+@|BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY)')
);

CREATE FUNCTION builder.validate_codex_exec_job_binding() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_job_project uuid;
  v_task_role text;
  v_assignment record;
  v_workspace record;
  v_registry_role text;
BEGIN
  SELECT job.project_id,task.role INTO v_job_project,v_task_role
  FROM builder.background_jobs job
  JOIN builder.agent_runtime_tasks task
    ON task.project_id=job.project_id AND task.run_id=job.agent_run_id
  WHERE job.project_id=NEW.project_id AND job.id=NEW.job_id
  FOR SHARE OF job,task;
  IF NOT FOUND OR v_job_project<>NEW.project_id OR v_task_role<>'PLANNER' THEN
    RAISE EXCEPTION 'Codex exec binding requires a persistent PLANNER runtime job' USING ERRCODE='23514';
  END IF;

  SELECT assignment_id,job_id,required_role,agent_id,agent_key,agent_version,assignment_status
    INTO v_assignment
  FROM builder.agent_assignments
  WHERE project_id=NEW.project_id AND assignment_id=NEW.assignment_id
  FOR SHARE;
  IF NOT FOUND OR v_assignment.job_id<>NEW.job_id OR v_assignment.required_role<>'PLANNER'
     OR v_assignment.assignment_status<>'ASSIGNED'
     OR ROW(v_assignment.agent_id,v_assignment.agent_key,v_assignment.agent_version)
        IS DISTINCT FROM ROW(NEW.agent_id,NEW.agent_key,NEW.agent_version) THEN
    RAISE EXCEPTION 'Codex exec binding assignment snapshot is inconsistent' USING ERRCODE='23514';
  END IF;

  SELECT project_revision,status INTO v_workspace
  FROM builder.project_workspaces
  WHERE project_id=NEW.project_id AND workspace_id=NEW.workspace_id
  FOR SHARE;
  IF NOT FOUND OR v_workspace.project_revision<>NEW.project_revision OR v_workspace.status<>'READY' THEN
    RAISE EXCEPTION 'Codex exec binding requires the exact persistent READY workspace revision' USING ERRCODE='23514';
  END IF;

  SELECT role INTO v_registry_role FROM builder.agent_registry_versions
  WHERE agent_id=NEW.agent_id AND agent_key=NEW.agent_key AND version=NEW.agent_version;
  IF v_registry_role IS DISTINCT FROM 'PLANNER' THEN
    RAISE EXCEPTION 'Codex exec binding requires the exact PLANNER registry revision' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER codex_exec_job_bindings_validate BEFORE INSERT ON builder.codex_exec_job_bindings
  FOR EACH ROW EXECUTE FUNCTION builder.validate_codex_exec_job_binding();
CREATE TRIGGER codex_exec_job_bindings_immutable BEFORE UPDATE OR DELETE ON builder.codex_exec_job_bindings
  FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();

CREATE FUNCTION builder.codex_exec_usage_is_valid(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item record; numeric_value numeric;
BEGIN
  IF value IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(value)<>'object' OR value - ARRAY['inputTokens','cachedInputTokens','outputTokens'] <> '{}'::jsonb THEN RETURN false; END IF;
  FOR item IN SELECT * FROM jsonb_each(value) LOOP
    IF jsonb_typeof(item.value)<>'number' THEN RETURN false; END IF;
    numeric_value := (item.value::text)::numeric;
    IF numeric_value<0 OR numeric_value<>trunc(numeric_value) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE FUNCTION builder.codex_exec_output_is_valid(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb;
BEGIN
  IF value IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(value)<>'object'
     OR value - ARRAY['status','summary','requirements','assumptions','openQuestions','recommendedNextStep'] <> '{}'::jsonb
     OR NOT value ?& ARRAY['status','summary','requirements','assumptions','openQuestions','recommendedNextStep']
     OR value->>'status' NOT IN ('SUCCEEDED','FAILED')
     OR jsonb_typeof(value->'summary')<>'string' OR length(btrim(value->>'summary')) NOT BETWEEN 1 AND 2000
     OR jsonb_typeof(value->'recommendedNextStep')<>'string' OR length(btrim(value->>'recommendedNextStep')) NOT BETWEEN 1 AND 1000
     OR jsonb_typeof(value->'requirements')<>'array' OR jsonb_array_length(value->'requirements')>50
     OR jsonb_typeof(value->'assumptions')<>'array' OR jsonb_array_length(value->'assumptions')>50
     OR jsonb_typeof(value->'openQuestions')<>'array' OR jsonb_array_length(value->'openQuestions')>50
     OR value::text ~* '(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|npm_[a-z0-9]{20,}|pypi-[a-z0-9_-]{20,}|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|bearer\s+[a-z0-9._~+/-]{12,}|(api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\s*[:=]|aws[_-]?(access|secret)|[a-z][a-z0-9+.-]*://[^/@\s]+:[^/@\s]+@|BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY)'
  THEN RETURN false; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements((value->'requirements')||(value->'assumptions')||(value->'openQuestions')) LOOP
    IF jsonb_typeof(item)<>'string' OR length(btrim(item#>>'{}')) NOT BETWEEN 1 AND 512 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE TABLE builder.codex_exec_runs (
  project_id uuid NOT NULL,
  job_id uuid NOT NULL,
  run_id text NOT NULL CHECK (length(run_id) BETWEEN 1 AND 512 AND run_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'),
  state text NOT NULL CHECK (state IN ('DISPATCHED','SUCCEEDED','FAILED','TIMED_OUT','CANCELLED','POLICY_VIOLATION','RECOVERY_REQUIRED')),
  prompt_sha256 text NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  cli_version text NOT NULL CHECK (cli_version='0.144.4'),
  worker_id text NOT NULL CHECK (worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  claim_id text NOT NULL CHECK (claim_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  lease_generation bigint NOT NULL CHECK (lease_generation>0),
  fencing_token bigint NOT NULL CHECK (fencing_token>0),
  claimed_job_version bigint NOT NULL CHECK (claimed_job_version>0),
  thread_id text CHECK (thread_id IS NULL OR (
    thread_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
    AND thread_id !~* '(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_|glpat-|xox[baprs]-|npm_|pypi-|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)'
  )),
  model text CHECK (model IS NULL OR (
    model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
    AND model !~* '(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_|glpat-|xox[baprs]-|npm_|pypi-|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)'
  )),
  usage jsonb,
  output jsonb,
  error_code text CHECK (error_code IS NULL OR error_code IN (
    'CODEX_CANCELLED','CODEX_TIMEOUT','CODEX_SPAWN_FAILED','CODEX_PROCESS_FAILED','CODEX_JSONL_INVALID',
    'CODEX_OUTPUT_INVALID','CODEX_OUTPUT_FAILED','CODEX_SECURITY_POLICY_VIOLATION','CODEX_RECOVERY_REQUIRED'
  )),
  policy_event text CHECK (policy_event IS NULL OR policy_event IN ('MCP_TOOL_CALL','WEB_SEARCH','FORBIDDEN_INTEGRATION')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  recovery_fencing_token bigint CHECK (recovery_fencing_token IS NULL OR recovery_fencing_token>0),
  CONSTRAINT codex_exec_runs_pkey PRIMARY KEY (project_id,job_id),
  CONSTRAINT codex_exec_runs_job_unique UNIQUE (job_id),
  CONSTRAINT codex_exec_runs_run_unique UNIQUE (project_id,run_id),
  CONSTRAINT codex_exec_runs_binding_fk FOREIGN KEY (project_id,job_id)
    REFERENCES builder.codex_exec_job_bindings(project_id,job_id),
  CONSTRAINT codex_exec_runs_usage_check CHECK (builder.codex_exec_usage_is_valid(usage)),
  CONSTRAINT codex_exec_runs_output_check CHECK (builder.codex_exec_output_is_valid(output)),
  CONSTRAINT codex_exec_runs_state_tuple_check CHECK (
    (state='DISPATCHED' AND completed_at IS NULL AND output IS NULL AND error_code IS NULL AND policy_event IS NULL AND recovery_fencing_token IS NULL)
    OR (state='SUCCEEDED' AND completed_at IS NOT NULL AND output IS NOT NULL AND output->>'status'='SUCCEEDED' AND error_code IS NULL AND policy_event IS NULL AND recovery_fencing_token IS NULL)
    OR (state='FAILED' AND completed_at IS NOT NULL AND (output IS NULL OR output->>'status'='FAILED') AND error_code IS NOT NULL AND error_code NOT IN ('CODEX_CANCELLED','CODEX_TIMEOUT','CODEX_SECURITY_POLICY_VIOLATION','CODEX_RECOVERY_REQUIRED') AND policy_event IS NULL AND recovery_fencing_token IS NULL)
    OR (state='TIMED_OUT' AND completed_at IS NOT NULL AND output IS NULL AND error_code='CODEX_TIMEOUT' AND policy_event IS NULL AND recovery_fencing_token IS NULL)
    OR (state='CANCELLED' AND completed_at IS NOT NULL AND output IS NULL AND error_code='CODEX_CANCELLED' AND policy_event IS NULL AND recovery_fencing_token IS NULL)
    OR (state='POLICY_VIOLATION' AND completed_at IS NOT NULL AND output IS NULL AND error_code='CODEX_SECURITY_POLICY_VIOLATION' AND policy_event IS NOT NULL AND recovery_fencing_token IS NULL)
    OR (state='RECOVERY_REQUIRED' AND completed_at IS NOT NULL AND output IS NULL AND error_code='CODEX_RECOVERY_REQUIRED' AND policy_event IS NULL AND recovery_fencing_token IS NOT NULL)
  )
);

CREATE FUNCTION builder.validate_codex_exec_run_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE valid_start boolean;
BEGIN
  SELECT true INTO valid_start
  FROM builder.background_jobs job
  JOIN builder.agent_runtime_runs runtime
    ON runtime.project_id=job.project_id AND runtime.run_id=job.agent_run_id
  JOIN builder.codex_exec_job_bindings binding
    ON binding.project_id=job.project_id AND binding.job_id=job.id
  JOIN builder.agent_assignments assignment
    ON assignment.project_id=binding.project_id AND assignment.assignment_id=binding.assignment_id
       AND assignment.job_id=binding.job_id AND assignment.required_role='PLANNER'
       AND assignment.assignment_status='ASSIGNED'
       AND assignment.agent_id=binding.agent_id AND assignment.agent_key=binding.agent_key
       AND assignment.agent_version=binding.agent_version
  JOIN builder.agent_registry_versions registry
    ON registry.agent_id=binding.agent_id AND registry.agent_key=binding.agent_key
       AND registry.version=binding.agent_version AND registry.role='PLANNER'
  JOIN builder.project_workspaces workspace
    ON workspace.project_id=binding.project_id AND workspace.workspace_id=binding.workspace_id
       AND workspace.project_revision=binding.project_revision AND workspace.status='READY'
  WHERE job.project_id=NEW.project_id AND job.id=NEW.job_id AND job.agent_run_id=NEW.run_id
    AND job.status='CLAIMED' AND job.cancel_requested_at IS NULL
    AND job.lease_owner=NEW.worker_id AND job.claim_idempotency_key=NEW.claim_id
    AND job.fencing_token=NEW.fencing_token AND job.lease_generation=NEW.lease_generation
    AND job.job_version IN (NEW.claimed_job_version,NEW.claimed_job_version+1)
    AND job.lease_expires_at>clock_timestamp()
    AND runtime.state='RUNNING' AND runtime.runtime_start_dispatched_at IS NOT NULL
    AND runtime.runtime_start_job_version=job.job_version AND runtime.runtime_started_at IS NULL
    AND runtime.runtime_snapshot='{}'::jsonb AND runtime.runtime_fencing_token=0
    AND runtime.result_id IS NULL AND runtime.workload_id IS NULL AND runtime.process_identity IS NULL
  FOR SHARE OF job,binding,assignment,registry,workspace;
  IF NOT FOUND OR valid_start IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Codex exec run insert requires the exact active claimed PLANNER start fence' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER codex_exec_runs_validate_insert BEFORE INSERT ON builder.codex_exec_runs
  FOR EACH ROW EXECUTE FUNCTION builder.validate_codex_exec_run_insert();

CREATE FUNCTION builder.enforce_codex_exec_run_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE valid_transition boolean;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Codex exec runs cannot be deleted' USING ERRCODE='23514'; END IF;
  IF ROW(OLD.project_id,OLD.job_id,OLD.run_id,OLD.prompt_sha256,OLD.cli_version,OLD.worker_id,OLD.claim_id,
         OLD.lease_generation,OLD.fencing_token,OLD.claimed_job_version,OLD.started_at)
     IS DISTINCT FROM
     ROW(NEW.project_id,NEW.job_id,NEW.run_id,NEW.prompt_sha256,NEW.cli_version,NEW.worker_id,NEW.claim_id,
         NEW.lease_generation,NEW.fencing_token,NEW.claimed_job_version,NEW.started_at) THEN
    RAISE EXCEPTION 'Codex exec run start binding is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.state<>'DISPATCHED' OR NEW.state NOT IN ('SUCCEEDED','FAILED','TIMED_OUT','CANCELLED','POLICY_VIOLATION','RECOVERY_REQUIRED') THEN
    RAISE EXCEPTION 'Codex exec run transition is invalid or terminal' USING ERRCODE='23514';
  END IF;
  valid_transition := false;
  IF NEW.state='RECOVERY_REQUIRED' THEN
    SELECT true INTO valid_transition
    FROM builder.background_jobs job
    JOIN builder.agent_runtime_runs runtime
      ON runtime.project_id=job.project_id AND runtime.run_id=job.agent_run_id
    JOIN builder.codex_exec_job_bindings binding
      ON binding.project_id=job.project_id AND binding.job_id=job.id
    JOIN builder.agent_assignments assignment
      ON assignment.project_id=binding.project_id AND assignment.assignment_id=binding.assignment_id
         AND assignment.job_id=binding.job_id AND assignment.required_role='PLANNER'
         AND assignment.assignment_status='ASSIGNED'
         AND assignment.agent_id=binding.agent_id AND assignment.agent_key=binding.agent_key
         AND assignment.agent_version=binding.agent_version
    JOIN builder.agent_registry_versions registry
      ON registry.agent_id=binding.agent_id AND registry.agent_key=binding.agent_key
         AND registry.version=binding.agent_version AND registry.role='PLANNER'
    JOIN builder.project_workspaces workspace
      ON workspace.project_id=binding.project_id AND workspace.workspace_id=binding.workspace_id
         AND workspace.project_revision=binding.project_revision AND workspace.status='READY'
    WHERE job.project_id=NEW.project_id AND job.id=NEW.job_id AND job.agent_run_id=NEW.run_id
      AND job.status='CLAIMED' AND job.cancel_requested_at IS NULL
      AND job.lease_owner IS NOT NULL AND job.claim_idempotency_key IS NOT NULL
      AND job.fencing_token=NEW.recovery_fencing_token AND job.fencing_token>OLD.fencing_token
      AND job.lease_generation>OLD.lease_generation AND job.job_version>OLD.claimed_job_version
      AND job.lease_expires_at>clock_timestamp()
      AND runtime.state='RUNNING' AND runtime.runtime_start_dispatched_at IS NOT NULL
      AND runtime.runtime_start_job_version=job.job_version AND runtime.runtime_started_at IS NULL
      AND runtime.runtime_snapshot='{}'::jsonb AND runtime.runtime_fencing_token=0
      AND runtime.result_id IS NULL AND runtime.workload_id IS NULL AND runtime.process_identity IS NULL
    FOR SHARE OF job,binding,assignment,registry,workspace;
  ELSE
    SELECT true INTO valid_transition
    FROM builder.background_jobs job
    JOIN builder.agent_runtime_runs runtime
      ON runtime.project_id=job.project_id AND runtime.run_id=job.agent_run_id
    JOIN builder.codex_exec_job_bindings binding
      ON binding.project_id=job.project_id AND binding.job_id=job.id
    JOIN builder.agent_assignments assignment
      ON assignment.project_id=binding.project_id AND assignment.assignment_id=binding.assignment_id
         AND assignment.job_id=binding.job_id AND assignment.required_role='PLANNER'
         AND assignment.assignment_status='ASSIGNED'
         AND assignment.agent_id=binding.agent_id AND assignment.agent_key=binding.agent_key
         AND assignment.agent_version=binding.agent_version
    JOIN builder.agent_registry_versions registry
      ON registry.agent_id=binding.agent_id AND registry.agent_key=binding.agent_key
         AND registry.version=binding.agent_version AND registry.role='PLANNER'
    JOIN builder.project_workspaces workspace
      ON workspace.project_id=binding.project_id AND workspace.workspace_id=binding.workspace_id
         AND workspace.project_revision=binding.project_revision AND workspace.status='READY'
    WHERE job.project_id=NEW.project_id AND job.id=NEW.job_id AND job.agent_run_id=NEW.run_id
      AND job.lease_owner=OLD.worker_id AND job.claim_idempotency_key=OLD.claim_id
      AND job.fencing_token=OLD.fencing_token AND job.lease_generation=OLD.lease_generation
      AND job.lease_expires_at>clock_timestamp()
      AND runtime.runtime_start_dispatched_at IS NOT NULL AND runtime.runtime_started_at IS NULL
      AND runtime.runtime_snapshot='{}'::jsonb AND runtime.runtime_fencing_token=0
      AND runtime.result_id IS NULL AND runtime.workload_id IS NULL AND runtime.process_identity IS NULL
      AND (
        (job.status='CLAIMED' AND job.cancel_requested_at IS NULL
          AND job.job_version IN (OLD.claimed_job_version,OLD.claimed_job_version+1)
          AND runtime.runtime_start_job_version=job.job_version AND runtime.state='RUNNING')
        OR (NEW.state<>'SUCCEEDED' AND job.status='CANCELLING' AND job.cancel_requested_at IS NOT NULL
          AND job.cancellation_request_id IS NOT NULL AND job.cancellation_sequence IS NOT NULL
          AND runtime.runtime_start_job_version<job.cancellation_sequence
          AND job.cancellation_sequence<=job.job_version AND runtime.state='CANCELLATION_REQUESTED')
      )
    FOR SHARE OF job,binding,assignment,registry,workspace;
  END IF;
  IF valid_transition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Codex exec run transition requires the exact active runtime fence' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER codex_exec_runs_transition BEFORE UPDATE OR DELETE ON builder.codex_exec_runs
  FOR EACH ROW EXECUTE FUNCTION builder.enforce_codex_exec_run_transition();

CREATE TABLE builder.codex_exec_audit_events (
  project_id uuid NOT NULL,
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  run_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('START_RESERVED','SUCCEEDED','FAILED','POLICY_VIOLATION','RECOVERY_REQUIRED')),
  fencing_token bigint NOT NULL CHECK (fencing_token>0),
  error_code text CHECK (error_code IS NULL OR error_code IN (
    'CODEX_CANCELLED','CODEX_TIMEOUT','CODEX_SPAWN_FAILED','CODEX_PROCESS_FAILED','CODEX_JSONL_INVALID',
    'CODEX_OUTPUT_INVALID','CODEX_OUTPUT_FAILED','CODEX_SECURITY_POLICY_VIOLATION','CODEX_RECOVERY_REQUIRED'
  )),
  policy_event text CHECK (policy_event IS NULL OR policy_event IN ('MCP_TOOL_CALL','WEB_SEARCH','FORBIDDEN_INTEGRATION')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT codex_exec_audit_events_pkey PRIMARY KEY (project_id,event_id),
  CONSTRAINT codex_exec_audit_events_binding_fk FOREIGN KEY (project_id,job_id)
    REFERENCES builder.codex_exec_job_bindings(project_id,job_id),
  CONSTRAINT codex_exec_audit_events_run_fk FOREIGN KEY (project_id,run_id)
    REFERENCES builder.codex_exec_runs(project_id,run_id),
  CHECK (
    (event_type IN ('START_RESERVED','SUCCEEDED') AND error_code IS NULL AND policy_event IS NULL)
    OR (event_type='FAILED' AND error_code IS NOT NULL AND error_code NOT IN ('CODEX_SECURITY_POLICY_VIOLATION','CODEX_RECOVERY_REQUIRED') AND policy_event IS NULL)
    OR (event_type='POLICY_VIOLATION' AND error_code='CODEX_SECURITY_POLICY_VIOLATION' AND policy_event IS NOT NULL)
    OR (event_type='RECOVERY_REQUIRED' AND error_code='CODEX_RECOVERY_REQUIRED' AND policy_event IS NULL)
  )
);

CREATE FUNCTION builder.validate_codex_exec_audit_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE run_state text; run_fence bigint; recovery_fence bigint;
BEGIN
  SELECT state,fencing_token,recovery_fencing_token INTO run_state,run_fence,recovery_fence
  FROM builder.codex_exec_runs
  WHERE project_id=NEW.project_id AND job_id=NEW.job_id AND run_id=NEW.run_id
  FOR SHARE;
  IF NOT FOUND
     OR (NEW.event_type='START_RESERVED' AND run_state<>'DISPATCHED')
     OR (NEW.event_type='SUCCEEDED' AND run_state<>'SUCCEEDED')
     OR (NEW.event_type='FAILED' AND run_state NOT IN ('FAILED','TIMED_OUT','CANCELLED'))
     OR (NEW.event_type='POLICY_VIOLATION' AND run_state<>'POLICY_VIOLATION')
     OR (NEW.event_type='RECOVERY_REQUIRED' AND run_state<>'RECOVERY_REQUIRED')
     OR (NEW.event_type='RECOVERY_REQUIRED' AND NEW.fencing_token IS DISTINCT FROM recovery_fence)
     OR (NEW.event_type<>'RECOVERY_REQUIRED' AND NEW.fencing_token IS DISTINCT FROM run_fence) THEN
    RAISE EXCEPTION 'Codex exec audit event does not match the persistent run state and fence' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER codex_exec_audit_events_validate_insert BEFORE INSERT ON builder.codex_exec_audit_events
  FOR EACH ROW EXECUTE FUNCTION builder.validate_codex_exec_audit_insert();
CREATE TRIGGER codex_exec_audit_events_immutable BEFORE UPDATE OR DELETE ON builder.codex_exec_audit_events
  FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['codex_exec_job_bindings','codex_exec_runs','codex_exec_audit_events'] LOOP
    EXECUTE format('ALTER TABLE builder.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE builder.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY project_isolation ON builder.%I USING (project_id=builder.current_project_id()) WITH CHECK(project_id=builder.current_project_id())',table_name);
    EXECUTE format('GRANT SELECT,INSERT ON builder.%I TO builder_runtime',table_name);
    EXECUTE format('ALTER TABLE builder.%I OWNER TO builder_schema_owner',table_name);
  END LOOP;
END $$;
GRANT UPDATE(state,thread_id,model,usage,output,error_code,policy_event,completed_at,recovery_fencing_token)
  ON builder.codex_exec_runs TO builder_runtime;

ALTER FUNCTION builder.validate_codex_exec_job_binding() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.codex_exec_usage_is_valid(jsonb) OWNER TO builder_schema_owner;
ALTER FUNCTION builder.codex_exec_output_is_valid(jsonb) OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_codex_exec_run_insert() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.enforce_codex_exec_run_transition() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_codex_exec_audit_insert() OWNER TO builder_schema_owner;
