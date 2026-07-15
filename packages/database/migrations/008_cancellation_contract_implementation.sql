-- CANCELLATION-CONTRACT-IMPLEMENTATION-01. Structured evidence and shared cancellation/completion CAS.

ALTER TABLE builder.background_jobs
  ADD COLUMN job_version bigint NOT NULL DEFAULT 1 CHECK(job_version>0),
  ADD COLUMN lease_generation bigint NOT NULL DEFAULT 0 CHECK(lease_generation>=0),
  ADD COLUMN cancellation_request_id uuid,
  ADD COLUMN cancellation_sequence bigint,
  ADD COLUMN completion_sequence bigint,
  ADD COLUMN cancellation_runtime_watermark bigint NOT NULL DEFAULT 0 CHECK(cancellation_runtime_watermark>=0),
  ADD COLUMN cancellation_reconciled_at timestamptz,
  ADD COLUMN cancel_remaining_attempts integer NOT NULL DEFAULT 3 CHECK(cancel_remaining_attempts BETWEEN 0 AND 20);

CREATE TABLE builder.agent_job_cancellation_requests (
  project_id uuid NOT NULL REFERENCES builder.projects(id), request_id uuid NOT NULL, job_id uuid NOT NULL,
  consumer_identity text NOT NULL, message_id uuid NOT NULL, idempotency_key text NOT NULL, request_digest text NOT NULL CHECK(request_digest~'^[0-9a-f]{64}$'),
  status text NOT NULL CHECK(status IN ('ACCEPTED','REJECTED_TOO_LATE')),
  reason_code text CHECK(reason_code IS NULL OR reason_code='CANCEL_REJECTED_TOO_LATE'),
  aggregate_sequence bigint NOT NULL CHECK(aggregate_sequence>0), completion_sequence bigint,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,request_id), UNIQUE(project_id,job_id,idempotency_key), UNIQUE(consumer_identity,message_id),
  FOREIGN KEY(project_id,job_id) REFERENCES builder.background_jobs(project_id,id)
);

CREATE TABLE builder.agent_job_cancellation_attempts (
  project_id uuid NOT NULL REFERENCES builder.projects(id), job_id uuid NOT NULL, request_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK(attempt_number>0), operation_id uuid NOT NULL,
  lease_generation bigint NOT NULL CHECK(lease_generation>0), fencing_token bigint NOT NULL CHECK(fencing_token>0),
  started_at timestamptz NOT NULL, finished_at timestamptz,
  outcome text CHECK(outcome IS NULL OR outcome IN ('FAILED','TIMED_OUT','REJECTED','SUCCEEDED_WITHOUT_EVIDENCE','EVIDENCE_RECEIVED')),
  error_code builder.short_code, next_retry_at timestamptz, runtime_watermark bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(project_id,job_id,attempt_number), UNIQUE(project_id,operation_id),
  FOREIGN KEY(project_id,job_id) REFERENCES builder.background_jobs(project_id,id),
  FOREIGN KEY(project_id,request_id) REFERENCES builder.agent_job_cancellation_requests(project_id,request_id),
  CHECK((outcome IS NULL AND finished_at IS NULL) OR (outcome IS NOT NULL AND finished_at IS NOT NULL))
);

CREATE TABLE builder.runtime_termination_evidence (
  project_id uuid NOT NULL REFERENCES builder.projects(id), evidence_id text NOT NULL,
  evidence_type text NOT NULL CHECK(evidence_type IN ('RUNTIME_TERMINATION_ATTESTATION','PROCESS_EXIT_ATTESTATION','RUNTIME_TERMINAL_STATUS_ATTESTATION','WORKLOAD_NOT_CREATED','FAKE_RUNTIME_TERMINATION')),
  runtime_id text NOT NULL, agent_run_id text NOT NULL, attempt_id text NOT NULL, job_id uuid NOT NULL, cancellation_request_id uuid NOT NULL,
  workload_id text, process_identity text, lease_generation bigint NOT NULL, fencing_token bigint NOT NULL,
  cancellation_sequence bigint NOT NULL, runtime_event_sequence bigint NOT NULL,
  terminal_state text NOT NULL CHECK(terminal_state IN ('TERMINATED','CANCELLED','EXITED','NOT_CREATED','SUCCEEDED','FAILED','TIMED_OUT','BLOCKED')),
  issued_by text NOT NULL, issuer_environment text NOT NULL CHECK(issuer_environment IN ('DEVELOPMENT','TEST','RELEASE_CANDIDATE','PRODUCTION')), observed_at timestamptz NOT NULL,
  verification_method text NOT NULL CHECK(verification_method IN ('SIGNED_RUNTIME_ATTESTATION_V1','LOCAL_PROCESS_ATTESTATION_V1','FAKE_DETERMINISTIC_V1')),
  attestation_payload_digest text NOT NULL CHECK(attestation_payload_digest~'^[0-9a-f]{64}$'),
  evidence_digest text NOT NULL CHECK(evidence_digest~'^[0-9a-f]{64}$'), candidate jsonb NOT NULL,
  verified_at timestamptz NOT NULL, verifier_identity text NOT NULL, validity text NOT NULL CHECK(validity IN ('VALID','REJECTED')),
  rejection_reason text, consumed_at timestamptz, consumed_job_version bigint,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,evidence_id),
  FOREIGN KEY(project_id,job_id) REFERENCES builder.background_jobs(project_id,id),
  FOREIGN KEY(project_id,cancellation_request_id) REFERENCES builder.agent_job_cancellation_requests(project_id,request_id),
  CHECK((workload_id IS NULL)<>(process_identity IS NULL)),
  CHECK(evidence_type<>'FAKE_RUNTIME_TERMINATION' OR (verification_method='FAKE_DETERMINISTIC_V1' AND issuer_environment IN ('DEVELOPMENT','TEST'))),
  CHECK(verification_method<>'FAKE_DETERMINISTIC_V1' OR evidence_type='FAKE_RUNTIME_TERMINATION'),
  CHECK((validity='VALID' AND rejection_reason IS NULL) OR (validity='REJECTED' AND rejection_reason IS NOT NULL)),
  CHECK((consumed_at IS NULL AND consumed_job_version IS NULL) OR (consumed_at IS NOT NULL AND consumed_job_version IS NOT NULL))
);

CREATE TABLE builder.agent_job_cancellation_reconciliations (
  project_id uuid NOT NULL REFERENCES builder.projects(id), job_id uuid NOT NULL, request_id uuid NOT NULL,
  reconciliation_id uuid NOT NULL, after_attempt_count integer NOT NULL CHECK(after_attempt_count>=0),
  status_query_operation_id uuid NOT NULL, status_queried_at timestamptz NOT NULL, runtime_watermark bigint NOT NULL CHECK(runtime_watermark>=0),
  lease_generation bigint NOT NULL CHECK(lease_generation>0), fencing_token bigint NOT NULL CHECK(fencing_token>0),
  events_ingested_at timestamptz NOT NULL, evidence_reverified_at timestamptz NOT NULL, evidence_candidate_count integer NOT NULL CHECK(evidence_candidate_count>=0),
  completed_at timestamptz NOT NULL,
  PRIMARY KEY(project_id,reconciliation_id), UNIQUE(project_id,job_id,request_id,after_attempt_count,lease_generation,fencing_token),
  FOREIGN KEY(project_id,job_id) REFERENCES builder.background_jobs(project_id,id),
  FOREIGN KEY(project_id,request_id) REFERENCES builder.agent_job_cancellation_requests(project_id,request_id)
);

CREATE TABLE builder.agent_job_cancellation_projections (
  project_id uuid NOT NULL REFERENCES builder.projects(id), job_id uuid NOT NULL, attempt_id text NOT NULL,
  workflow_state text NOT NULL CHECK(workflow_state IN ('CANCELLING','CANCELLED','CANCEL_STUCK')),
  attempt_state text NOT NULL CHECK(attempt_state IN ('CANCELLING','CANCELLED','CANCEL_STUCK')),
  job_version bigint NOT NULL CHECK(job_version>0), cancellation_request_id uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,job_id), FOREIGN KEY(project_id,job_id) REFERENCES builder.background_jobs(project_id,id),
  FOREIGN KEY(project_id,cancellation_request_id) REFERENCES builder.agent_job_cancellation_requests(project_id,request_id)
);

CREATE TABLE builder.agent_job_late_results (
  project_id uuid NOT NULL REFERENCES builder.projects(id), job_id uuid NOT NULL, cancellation_request_id uuid NOT NULL,
  message_id uuid NOT NULL, result_digest text NOT NULL CHECK(result_digest~'^[0-9a-f]{64}$'),
  disposition text NOT NULL CHECK(disposition='LATE_RESULT_DISCARDED'), metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,job_id,message_id),
  FOREIGN KEY(project_id,job_id) REFERENCES builder.background_jobs(project_id,id),
  FOREIGN KEY(project_id,cancellation_request_id) REFERENCES builder.agent_job_cancellation_requests(project_id,request_id)
);

ALTER TABLE builder.background_jobs
  ADD CONSTRAINT background_jobs_cancellation_request_fk FOREIGN KEY(project_id,cancellation_request_id)
  REFERENCES builder.agent_job_cancellation_requests(project_id,request_id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT background_jobs_cancellation_order_check CHECK(
    (cancellation_request_id IS NULL AND cancellation_sequence IS NULL) OR
    (cancellation_request_id IS NOT NULL AND cancellation_sequence IS NOT NULL)
  );

ALTER TABLE builder.agent_job_audit_events
  DROP CONSTRAINT agent_job_audit_events_event_type_check,
  ADD CONSTRAINT agent_job_audit_events_event_type_check CHECK(event_type IN (
    'ENQUEUED','CLAIMED','RECLAIMED','HEARTBEAT','PROGRESS','RETRY_SCHEDULED','RETRY_EXHAUSTED',
    'CANCEL_REQUESTED','CANCEL_REPEATED','CANCEL_REJECTED','CANCEL_ATTEMPTED','CANCEL_ATTEMPT_FAILED','CANCEL_RETRY_SCHEDULED',
    'EVIDENCE_VERIFIED','EVIDENCE_REJECTED','CANCEL_CONFIRMED','CANCEL_STUCK','PROJECT_HOLD_CLEARED',
    'LATE_COMPLETION_DISCARDED','CANCELLED','COMPLETED','FAILED','SCHEMA_REJECTED','LEASE_LOST'
  ));

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['agent_job_cancellation_requests','agent_job_cancellation_attempts','runtime_termination_evidence','agent_job_late_results','agent_job_cancellation_reconciliations','agent_job_cancellation_projections'] LOOP
    EXECUTE format('ALTER TABLE builder.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE builder.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY project_isolation ON builder.%I USING (project_id=builder.current_project_id()) WITH CHECK(project_id=builder.current_project_id())',table_name);
    EXECUTE format('GRANT SELECT,INSERT ON builder.%I TO builder_runtime',table_name);
  END LOOP;
END $$;
GRANT UPDATE(outcome,error_code,finished_at,next_retry_at,runtime_watermark) ON builder.agent_job_cancellation_attempts TO builder_runtime;
GRANT UPDATE(consumed_at,consumed_job_version) ON builder.runtime_termination_evidence TO builder_runtime;
GRANT UPDATE(workflow_state,attempt_state,job_version,updated_at) ON builder.agent_job_cancellation_projections TO builder_runtime;
GRANT UPDATE(job_version,lease_generation,cancellation_request_id,cancellation_sequence,completion_sequence,cancellation_runtime_watermark,cancellation_reconciled_at,cancel_remaining_attempts) ON builder.background_jobs TO builder_runtime;
CREATE TRIGGER cancellation_requests_immutable BEFORE UPDATE OR DELETE ON builder.agent_job_cancellation_requests FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER late_results_immutable BEFORE UPDATE OR DELETE ON builder.agent_job_late_results FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER cancellation_reconciliations_immutable BEFORE UPDATE OR DELETE ON builder.agent_job_cancellation_reconciliations FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();

CREATE FUNCTION builder.require_cancellation_reconciliation_before_retry() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.attempt_number>1 AND NOT EXISTS(
    SELECT 1 FROM builder.agent_job_cancellation_reconciliations r
    WHERE r.project_id=NEW.project_id AND r.job_id=NEW.job_id AND r.request_id=NEW.request_id
      AND r.after_attempt_count=NEW.attempt_number-1 AND r.lease_generation=NEW.lease_generation
      AND r.fencing_token=NEW.fencing_token AND r.completed_at IS NOT NULL
      AND r.events_ingested_at IS NOT NULL AND r.evidence_reverified_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'CANCEL_RECONCILIATION_REQUIRED'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cancellation_attempt_requires_reconciliation BEFORE INSERT ON builder.agent_job_cancellation_attempts
FOR EACH ROW EXECUTE FUNCTION builder.require_cancellation_reconciliation_before_retry();

CREATE FUNCTION builder.require_cancellation_reconciliation_before_stuck() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='CANCEL_STUCK' AND OLD.status<>'CANCEL_STUCK' AND NOT EXISTS(
    SELECT 1 FROM builder.agent_job_cancellation_reconciliations r
    WHERE r.project_id=NEW.project_id AND r.job_id=NEW.id AND r.request_id=NEW.cancellation_request_id
      AND r.after_attempt_count=NEW.cancel_attempt_count AND r.lease_generation=NEW.lease_generation
      AND r.fencing_token=NEW.fencing_token AND r.completed_at IS NOT NULL
      AND r.events_ingested_at IS NOT NULL AND r.evidence_reverified_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'CANCEL_RECONCILIATION_REQUIRED'; END IF;
  IF NEW.status='CANCEL_STUCK' AND OLD.status<>'CANCEL_STUCK' THEN
    NEW.lease_owner:=OLD.lease_owner; NEW.claim_idempotency_key:=OLD.claim_idempotency_key;
    NEW.lease_expires_at:=OLD.lease_expires_at;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cancellation_stuck_requires_reconciliation BEFORE UPDATE OF status ON builder.background_jobs
FOR EACH ROW EXECUTE FUNCTION builder.require_cancellation_reconciliation_before_stuck();

CREATE FUNCTION builder.sync_cancellation_budget_and_projection() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.cancel_remaining_attempts:=GREATEST(0,NEW.cancel_max_attempts-NEW.cancel_attempt_count);
  RETURN NEW;
END $$;
CREATE TRIGGER cancellation_budget_sync BEFORE UPDATE OF cancel_attempt_count,cancel_max_attempts ON builder.background_jobs
FOR EACH ROW EXECUTE FUNCTION builder.sync_cancellation_budget_and_projection();

CREATE FUNCTION builder.project_agent_job_cancellation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('CANCELLING','CANCELLED','CANCEL_STUCK') AND NEW.cancellation_request_id IS NOT NULL THEN
    INSERT INTO builder.agent_job_cancellation_projections(project_id,job_id,attempt_id,workflow_state,attempt_state,job_version,cancellation_request_id)
    VALUES(NEW.project_id,NEW.id,NEW.agent_attempt_id,NEW.status,NEW.status,NEW.job_version,NEW.cancellation_request_id)
    ON CONFLICT(project_id,job_id) DO UPDATE SET workflow_state=excluded.workflow_state,attempt_state=excluded.attempt_state,
      job_version=excluded.job_version,cancellation_request_id=excluded.cancellation_request_id,updated_at=clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cancellation_projection_sync AFTER UPDATE OF status,job_version ON builder.background_jobs
FOR EACH ROW EXECUTE FUNCTION builder.project_agent_job_cancellation();
