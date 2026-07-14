-- WORKER-FAKE-RUNTIME-01. Development-only synthetic agent execution persistence.

CREATE TABLE builder.agent_runtime_tasks (
  project_id uuid NOT NULL REFERENCES builder.projects(id), task_id text NOT NULL, attempt_id text NOT NULL,
  run_id text NOT NULL, schema_version integer NOT NULL CHECK(schema_version=1), role text NOT NULL CHECK(role IN ('PLANNER','ARCHITECT','SECURITY','LEGAL','EXECUTOR','QA','REVIEWER')),
  scenario text NOT NULL CHECK(scenario IN ('SUCCESS','ERROR','TIMEOUT','CANCEL','INVALID_OUTPUT','RETRY','SECURITY_BLOCK','LEGAL_COUNSEL_REQUIRED')),
  input_ref builder.opaque_ref NOT NULL, repair_ordinal integer NOT NULL CHECK(repair_ordinal BETWEEN 0 AND 1),
  request_digest text NOT NULL CHECK(request_digest~'^[0-9a-f]{64}$'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,run_id), UNIQUE(project_id,task_id,attempt_id,run_id)
);
CREATE TABLE builder.agent_runtime_runs (
  project_id uuid NOT NULL REFERENCES builder.projects(id), run_id text NOT NULL, task_id text NOT NULL, attempt_id text NOT NULL,
  state text NOT NULL CHECK(state IN ('QUEUED','RUNNING','RETRY_PENDING','CANCELLATION_REQUESTED','SUCCEEDED','FAILED','TIMED_OUT','CANCELLED','BLOCKED','SCHEMA_ERROR')),
  runtime_retry_count integer NOT NULL DEFAULT 0 CHECK(runtime_retry_count BETWEEN 0 AND 20), result_id uuid,
  runtime_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, runtime_fencing_token bigint NOT NULL DEFAULT 0 CHECK(runtime_fencing_token>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), terminal_at timestamptz,
  PRIMARY KEY(project_id,run_id), FOREIGN KEY(project_id,run_id) REFERENCES builder.agent_runtime_tasks(project_id,run_id)
);
CREATE TABLE builder.agent_runtime_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES builder.projects(id), run_id text NOT NULL,
  schema_version integer NOT NULL CHECK(schema_version=1), status text NOT NULL CHECK(status IN ('SUCCESS','ERROR','TIMEOUT','CANCELLED','SECURITY_BLOCK','LEGAL_COUNSEL_REQUIRED')),
  result_payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(project_id,id), UNIQUE(project_id,run_id),
  FOREIGN KEY(project_id,run_id) REFERENCES builder.agent_runtime_runs(project_id,run_id)
);
ALTER TABLE builder.agent_runtime_runs ADD CONSTRAINT agent_runtime_runs_result_fk FOREIGN KEY(project_id,result_id) REFERENCES builder.agent_runtime_results(project_id,id);
CREATE TABLE builder.agent_runtime_progress (
  project_id uuid NOT NULL REFERENCES builder.projects(id), run_id text NOT NULL, sequence integer NOT NULL CHECK(sequence>0),
  schema_version integer NOT NULL CHECK(schema_version=1), phase text NOT NULL CHECK(phase IN ('STARTED','ANALYSING','PRODUCING','RETRYING','CANCELLING','FINISHED')),
  occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,run_id,sequence),
  FOREIGN KEY(project_id,run_id) REFERENCES builder.agent_runtime_runs(project_id,run_id)
);
CREATE TABLE builder.agent_job_audit_events (
  project_id uuid NOT NULL REFERENCES builder.projects(id), event_id uuid NOT NULL DEFAULT gen_random_uuid(), job_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('ENQUEUED','CLAIMED','RECLAIMED','HEARTBEAT','PROGRESS','RETRY_SCHEDULED','RETRY_EXHAUSTED','CANCEL_REQUESTED','CANCELLED','COMPLETED','FAILED','SCHEMA_REJECTED','LEASE_LOST')),
  fencing_token bigint, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,event_id), FOREIGN KEY(project_id,job_id) REFERENCES builder.background_jobs(project_id,id)
);

ALTER TABLE builder.background_jobs
  ADD COLUMN agent_run_id text,
  ADD COLUMN agent_attempt_id text,
  ADD COLUMN heartbeat_at timestamptz,
  ADD COLUMN cancel_requested_at timestamptz,
  ADD COLUMN agent_result_id uuid,
  ADD COLUMN last_error_code builder.short_code,
  ADD CONSTRAINT background_jobs_cancelling_claim_check CHECK(status<>'CANCELLING' OR job_type<>'AGENT_RUNTIME' OR (cancel_requested_at IS NOT NULL AND lease_owner IS NOT NULL AND claim_idempotency_key IS NOT NULL AND fencing_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  ADD CONSTRAINT background_jobs_agent_run_fk FOREIGN KEY(project_id,agent_run_id) REFERENCES builder.agent_runtime_runs(project_id,run_id),
  ADD CONSTRAINT background_jobs_agent_result_fk FOREIGN KEY(project_id,agent_result_id) REFERENCES builder.agent_runtime_results(project_id,id);
CREATE INDEX background_jobs_agent_claim_idx ON builder.background_jobs(available_at,created_at,id)
  WHERE job_type='AGENT_RUNTIME' AND status IN ('PENDING','RETRY_SCHEDULED','CLAIMED','RUNNING','CANCELLING');
INSERT INTO builder.worker_job_type_permissions(worker_type,job_type) VALUES ('CONTROL','AGENT_RUNTIME') ON CONFLICT DO NOTHING;
ALTER TABLE builder.inbox_events ADD COLUMN semantic_digest text CHECK(semantic_digest IS NULL OR semantic_digest~'^[0-9a-f]{64}$');

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['agent_runtime_tasks','agent_runtime_runs','agent_runtime_results','agent_runtime_progress','agent_job_audit_events'] LOOP
    EXECUTE format('ALTER TABLE builder.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE builder.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY project_isolation ON builder.%I USING (project_id=builder.current_project_id()) WITH CHECK(project_id=builder.current_project_id())',table_name);
    EXECUTE format('GRANT SELECT,INSERT ON builder.%I TO builder_runtime',table_name);
  END LOOP;
END $$;
GRANT UPDATE(state,runtime_retry_count,result_id,runtime_snapshot,runtime_fencing_token,updated_at,terminal_at) ON builder.agent_runtime_runs TO builder_runtime;
GRANT UPDATE(status,retry_count,error_message,available_at,claimed_at,claimed_by,terminal_at,lease_owner,claim_idempotency_key,lease_expires_at,fencing_token,agent_run_id,agent_attempt_id,heartbeat_at,cancel_requested_at,agent_result_id,last_error_code,updated_at) ON builder.background_jobs TO builder_runtime;
CREATE TRIGGER agent_runtime_runs_touch BEFORE UPDATE ON builder.agent_runtime_runs FOR EACH ROW EXECUTE FUNCTION builder.touch_updated_at();
CREATE TRIGGER agent_runtime_tasks_immutable BEFORE UPDATE OR DELETE ON builder.agent_runtime_tasks FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER agent_runtime_results_immutable BEFORE UPDATE OR DELETE ON builder.agent_runtime_results FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER agent_runtime_progress_immutable BEFORE UPDATE OR DELETE ON builder.agent_runtime_progress FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER agent_job_audit_immutable BEFORE UPDATE OR DELETE ON builder.agent_job_audit_events FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
