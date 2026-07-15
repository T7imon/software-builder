-- CANCELLATION-EVIDENCE-RECONCILIATION-02. Runtime-issued negative evidence and durable reconciliation execution.

CREATE TABLE builder.agent_runtime_workload_operations (
  project_id uuid NOT NULL REFERENCES builder.projects(id),
  runtime_id text NOT NULL,
  start_operation_id text NOT NULL,
  disposition text NOT NULL CHECK(disposition IN ('WORKLOAD_CREATED','WORKLOAD_NOT_CREATED_ATTESTED')),
  runtime_watermark bigint NOT NULL DEFAULT 0 CHECK(runtime_watermark>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,runtime_id,start_operation_id),
  FOREIGN KEY(project_id,runtime_id) REFERENCES builder.agent_runtime_runs(project_id,run_id)
);

ALTER TABLE builder.agent_runtime_workload_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.agent_runtime_workload_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY project_isolation ON builder.agent_runtime_workload_operations
  USING (project_id=builder.current_project_id()) WITH CHECK(project_id=builder.current_project_id());
GRANT SELECT,INSERT ON builder.agent_runtime_workload_operations TO builder_runtime;

ALTER TABLE builder.runtime_termination_evidence
  ADD COLUMN start_operation_id text GENERATED ALWAYS AS (candidate->>'startOperationId') STORED;

DO $$ DECLARE constraint_name text; BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='builder.runtime_termination_evidence'::regclass AND contype='c'
      AND (pg_get_constraintdef(oid) LIKE '%workload_id IS NULL%process_identity IS NULL%'
        OR pg_get_constraintdef(oid) LIKE '%verification_method%FAKE_DETERMINISTIC_V1%evidence_type%FAKE_RUNTIME_TERMINATION%')
  LOOP EXECUTE format('ALTER TABLE builder.runtime_termination_evidence DROP CONSTRAINT %I',constraint_name); END LOOP;
END $$;

ALTER TABLE builder.runtime_termination_evidence
  ADD CONSTRAINT runtime_termination_evidence_identity_check CHECK(
    (evidence_type='WORKLOAD_NOT_CREATED' AND workload_id IS NULL AND process_identity IS NULL AND terminal_state='NOT_CREATED') OR
    (evidence_type<>'WORKLOAD_NOT_CREATED' AND (workload_id IS NULL)<>(process_identity IS NULL))
  ),
  ADD CONSTRAINT runtime_termination_evidence_fake_method_check CHECK(
    verification_method<>'FAKE_DETERMINISTIC_V1' OR evidence_type IN ('FAKE_RUNTIME_TERMINATION','WORKLOAD_NOT_CREATED')
  ),
  ADD CONSTRAINT runtime_termination_evidence_fake_environment_check CHECK(
    evidence_type NOT IN ('FAKE_RUNTIME_TERMINATION','WORKLOAD_NOT_CREATED') OR
    (verification_method='FAKE_DETERMINISTIC_V1' AND issuer_environment IN ('DEVELOPMENT','TEST'))
  );

DROP TRIGGER cancellation_reconciliations_immutable ON builder.agent_job_cancellation_reconciliations;
ALTER TABLE builder.agent_job_cancellation_reconciliations
  ALTER COLUMN status_query_operation_id DROP NOT NULL,
  ALTER COLUMN status_queried_at DROP NOT NULL,
  ALTER COLUMN events_ingested_at DROP NOT NULL,
  ALTER COLUMN evidence_reverified_at DROP NOT NULL,
  ALTER COLUMN completed_at DROP NOT NULL,
  ADD COLUMN operation_id text,
  ADD COLUMN input_digest text,
  ADD COLUMN observed_job_version bigint,
  ADD COLUMN cancellation_sequence bigint,
  ADD COLUMN start_watermark bigint,
  ADD COLUMN final_watermark bigint,
  ADD COLUMN started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN runtime_query_result jsonb,
  ADD COLUMN ingested_runtime_event_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN evidence_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN verification_decision_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN attempt_budget_snapshot jsonb,
  ADD COLUMN execution_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN io_claimed_at timestamptz,
  ADD COLUMN execution_state text NOT NULL DEFAULT 'COMPLETED' CHECK(execution_state IN ('STARTED','RUNTIME_OBSERVED','EVIDENCE_VERIFIED','COMPLETED','REJECTED')),
  ADD COLUMN result text,
  ADD COLUMN result_digest text,
  ADD COLUMN failure_reason text;

UPDATE builder.agent_job_cancellation_reconciliations
SET operation_id=status_query_operation_id::text,
    input_digest=encode(digest(reconciliation_id::text,'sha256'),'hex'),
    observed_job_version=1,
    cancellation_sequence=1,
    start_watermark=runtime_watermark,
    final_watermark=runtime_watermark,
    runtime_query_result=jsonb_build_object('legacy',true),
    attempt_budget_snapshot=jsonb_build_object('afterAttemptCount',after_attempt_count),
    result='LEGACY_COMPLETED',
    result_digest=encode(digest(reconciliation_id::text||':legacy','sha256'),'hex')
WHERE operation_id IS NULL;

ALTER TABLE builder.agent_job_cancellation_reconciliations
  ALTER COLUMN operation_id SET NOT NULL,
  ALTER COLUMN operation_id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN input_digest SET NOT NULL,
  ALTER COLUMN input_digest SET DEFAULT encode(digest(gen_random_uuid()::text,'sha256'),'hex'),
  ALTER COLUMN observed_job_version SET NOT NULL,
  ALTER COLUMN observed_job_version SET DEFAULT 1,
  ALTER COLUMN cancellation_sequence SET NOT NULL,
  ALTER COLUMN cancellation_sequence SET DEFAULT 1,
  ALTER COLUMN start_watermark SET NOT NULL,
  ALTER COLUMN start_watermark SET DEFAULT 0,
  ADD CONSTRAINT cancellation_reconciliation_input_digest_check CHECK(input_digest~'^[0-9a-f]{64}$'),
  ADD CONSTRAINT cancellation_reconciliation_result_digest_check CHECK(result_digest IS NULL OR result_digest~'^[0-9a-f]{64}$'),
  ADD CONSTRAINT cancellation_reconciliation_operation_unique UNIQUE(project_id,operation_id);

GRANT UPDATE(status_query_operation_id,status_queried_at,runtime_watermark,lease_generation,fencing_token,
  events_ingested_at,evidence_reverified_at,evidence_candidate_count,completed_at,final_watermark,runtime_query_result,
  ingested_runtime_event_refs,evidence_candidates,verification_decision_refs,execution_token,io_claimed_at,execution_state,result,result_digest,failure_reason)
  ON builder.agent_job_cancellation_reconciliations TO builder_runtime;

CREATE FUNCTION builder.reject_completed_reconciliation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CANCELLATION_RECONCILIATION_IMMUTABLE'; END IF;
  IF OLD.execution_state IN ('COMPLETED','REJECTED') THEN RAISE EXCEPTION 'CANCELLATION_RECONCILIATION_IMMUTABLE'; END IF;
  IF NEW.lease_generation>OLD.lease_generation THEN
    NEW.execution_token:=gen_random_uuid();
    NEW.io_claimed_at:=NULL;
  END IF;
  IF NEW.project_id<>OLD.project_id OR NEW.reconciliation_id<>OLD.reconciliation_id OR NEW.operation_id<>OLD.operation_id OR
     NEW.input_digest<>OLD.input_digest OR NEW.job_id<>OLD.job_id OR NEW.request_id<>OLD.request_id OR
     NEW.observed_job_version<>OLD.observed_job_version OR NEW.cancellation_sequence<>OLD.cancellation_sequence OR
     NEW.start_watermark<>OLD.start_watermark OR NEW.started_at<>OLD.started_at THEN
    RAISE EXCEPTION 'CANCELLATION_RECONCILIATION_BINDING_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cancellation_reconciliations_guard BEFORE UPDATE OR DELETE ON builder.agent_job_cancellation_reconciliations
FOR EACH ROW EXECUTE FUNCTION builder.reject_completed_reconciliation_mutation();

CREATE FUNCTION builder.complete_reconciliation_inbox() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.execution_state='COMPLETED' AND OLD.execution_state<>'COMPLETED' THEN
    INSERT INTO builder.inbox_events(project_id,consumer_identity,message_id,status,semantic_digest,processed_at)
    VALUES(NEW.project_id,'cancellation-reconciliation',md5(NEW.operation_id)::uuid,'PROCESSED',NEW.result_digest,clock_timestamp())
    ON CONFLICT(consumer_identity,message_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cancellation_reconciliation_inbox AFTER UPDATE OF execution_state ON builder.agent_job_cancellation_reconciliations
FOR EACH ROW EXECUTE FUNCTION builder.complete_reconciliation_inbox();
