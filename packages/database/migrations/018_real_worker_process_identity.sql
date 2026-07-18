-- REAL-WORKER-PROCESS-IDENTITY-01. DEVELOPMENT_ONLY worker-instance and child-launch bindings.

CREATE TABLE builder.worker_process_instances (
  worker_process_instance_id text PRIMARY KEY CHECK (worker_process_instance_id ~ '^wpi_[0-9a-f]{64}$'),
  logical_worker_id text NOT NULL CHECK (logical_worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  ownership_digest text NOT NULL CHECK (ownership_digest ~ '^sha256:[0-9a-f]{64}$'),
  policy_version text NOT NULL CHECK (policy_version='worker-process-identity-v1'),
  runtime_version text NOT NULL CHECK (runtime_version='node-worker-v1'),
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT worker_process_instances_identity_digest_unique UNIQUE(worker_process_instance_id,ownership_digest),
  CONSTRAINT worker_process_instances_full_tuple_unique UNIQUE(worker_process_instance_id,ownership_digest,logical_worker_id)
);
CREATE TRIGGER worker_process_instances_immutable BEFORE UPDATE OR DELETE ON builder.worker_process_instances
  FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();

ALTER TABLE builder.background_jobs
  ADD COLUMN worker_process_instance_id text,
  ADD COLUMN worker_ownership_digest text,
  ADD COLUMN process_launch_id text,
  ADD CONSTRAINT background_jobs_worker_process_fk
    FOREIGN KEY(worker_process_instance_id,worker_ownership_digest)
    REFERENCES builder.worker_process_instances(worker_process_instance_id,ownership_digest),
  ADD CONSTRAINT background_jobs_worker_process_full_fk
    FOREIGN KEY(worker_process_instance_id,worker_ownership_digest,lease_owner)
    REFERENCES builder.worker_process_instances(worker_process_instance_id,ownership_digest,logical_worker_id),
  ADD CONSTRAINT background_jobs_worker_process_tuple_check CHECK (
    (worker_process_instance_id IS NULL AND worker_ownership_digest IS NULL AND process_launch_id IS NULL)
    OR
    (worker_process_instance_id ~ '^wpi_[0-9a-f]{64}$'
      AND worker_ownership_digest ~ '^sha256:[0-9a-f]{64}$'
      AND (process_launch_id IS NULL OR process_launch_id ~ '^pli_[0-9a-f]{64}$'))
  ),
  ADD CONSTRAINT background_jobs_agent_worker_identity_claim_check CHECK (
    job_type<>'AGENT_RUNTIME' OR lease_owner IS NULL
    OR (worker_process_instance_id IS NOT NULL AND worker_ownership_digest IS NOT NULL
      AND claim_idempotency_key IS NOT NULL AND fencing_token IS NOT NULL AND lease_generation>0)
  );

ALTER TABLE builder.agent_runtime_runs
  ADD COLUMN worker_process_instance_id text,
  ADD COLUMN worker_ownership_digest text,
  ADD COLUMN process_launch_receipt_digest text,
  ADD COLUMN process_launch_binding_digest text,
  ADD COLUMN process_id_digest text,
  ADD CONSTRAINT agent_runtime_runs_worker_process_fk
    FOREIGN KEY(worker_process_instance_id,worker_ownership_digest)
    REFERENCES builder.worker_process_instances(worker_process_instance_id,ownership_digest),
  ADD CONSTRAINT agent_runtime_runs_worker_process_tuple_check CHECK (
    (worker_process_instance_id IS NULL AND worker_ownership_digest IS NULL)
    OR
    (worker_process_instance_id ~ '^wpi_[0-9a-f]{64}$' AND worker_ownership_digest ~ '^sha256:[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT agent_runtime_runs_launch_tuple_check CHECK (
    (process_identity IS NULL AND process_launch_receipt_digest IS NULL AND process_launch_binding_digest IS NULL AND process_id_digest IS NULL)
    OR
    (process_identity ~ '^pli_[0-9a-f]{64}$' AND process_launch_receipt_digest ~ '^sha256:[0-9a-f]{64}$'
      AND process_launch_binding_digest ~ '^sha256:[0-9a-f]{64}$' AND process_id_digest ~ '^sha256:[0-9a-f]{64}$'
      AND worker_process_instance_id IS NOT NULL AND worker_ownership_digest IS NOT NULL)
  );

CREATE TABLE builder.process_launch_receipts (
  project_id uuid NOT NULL,
  process_launch_id text NOT NULL CHECK (process_launch_id ~ '^pli_[0-9a-f]{64}$'),
  parent_worker_process_instance_id text NOT NULL CHECK (parent_worker_process_instance_id ~ '^wpi_[0-9a-f]{64}$'),
  worker_ownership_digest text NOT NULL CHECK (worker_ownership_digest ~ '^sha256:[0-9a-f]{64}$'),
  logical_worker_id text NOT NULL CHECK (logical_worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  job_id uuid NOT NULL,
  task_id text NOT NULL,
  attempt_id text NOT NULL,
  run_id text NOT NULL,
  assignment_id uuid NOT NULL,
  claim_id text NOT NULL CHECK (claim_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  lease_generation bigint NOT NULL CHECK (lease_generation>0),
  fencing_token bigint NOT NULL CHECK (fencing_token>0),
  job_version bigint NOT NULL CHECK (job_version>0),
  receipt_digest text NOT NULL CHECK (receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  binding_digest text NOT NULL CHECK (binding_digest ~ '^sha256:[0-9a-f]{64}$'),
  process_id_digest text NOT NULL CHECK (process_id_digest ~ '^sha256:[0-9a-f]{64}$'),
  policy_version text NOT NULL CHECK (policy_version='process-launch-receipt-v1'),
  launched_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT process_launch_receipts_pkey PRIMARY KEY(project_id,process_launch_id),
  CONSTRAINT process_launch_receipts_launch_unique UNIQUE(process_launch_id),
  CONSTRAINT process_launch_receipts_claim_unique UNIQUE(project_id,job_id,claim_id,lease_generation,fencing_token,job_version),
  CONSTRAINT process_launch_receipts_receipt_digest_unique UNIQUE(receipt_digest),
  CONSTRAINT process_launch_receipts_process_id_digest_unique UNIQUE(process_id_digest),
  CONSTRAINT process_launch_receipts_worker_fk FOREIGN KEY(parent_worker_process_instance_id,worker_ownership_digest)
    REFERENCES builder.worker_process_instances(worker_process_instance_id,ownership_digest),
  CONSTRAINT process_launch_receipts_job_fk FOREIGN KEY(project_id,job_id)
    REFERENCES builder.background_jobs(project_id,id),
  CONSTRAINT process_launch_receipts_assignment_fk FOREIGN KEY(project_id,assignment_id)
    REFERENCES builder.agent_assignments(project_id,assignment_id)
);

CREATE FUNCTION builder.validate_process_launch_receipt_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE valid_binding boolean;
BEGIN
  SELECT true INTO valid_binding
  FROM builder.background_jobs job
  JOIN builder.agent_runtime_tasks task ON task.project_id=job.project_id AND task.run_id=job.agent_run_id
  JOIN builder.agent_assignments assignment ON assignment.project_id=job.project_id AND assignment.job_id=job.id
  JOIN builder.worker_process_instances worker ON worker.worker_process_instance_id=job.worker_process_instance_id
  WHERE job.project_id=NEW.project_id AND job.id=NEW.job_id
    AND job.lease_owner=NEW.logical_worker_id AND job.claim_idempotency_key=NEW.claim_id
    AND job.worker_process_instance_id=NEW.parent_worker_process_instance_id
    AND job.worker_ownership_digest=NEW.worker_ownership_digest AND job.process_launch_id IS NULL
    AND job.lease_generation=NEW.lease_generation AND job.fencing_token=NEW.fencing_token
    AND job.job_version=NEW.job_version AND job.lease_expires_at>clock_timestamp()
    AND task.task_id=NEW.task_id AND task.attempt_id=NEW.attempt_id AND task.run_id=NEW.run_id
    AND assignment.assignment_id=NEW.assignment_id AND assignment.assignment_status='ASSIGNED'
    AND worker.logical_worker_id=NEW.logical_worker_id
  FOR SHARE OF job,task,assignment,worker;
  IF valid_binding IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Process launch receipt requires exact active worker/claim/run/assignment binding' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER process_launch_receipts_validate BEFORE INSERT ON builder.process_launch_receipts
  FOR EACH ROW EXECUTE FUNCTION builder.validate_process_launch_receipt_insert();
CREATE TRIGGER process_launch_receipts_immutable BEFORE UPDATE OR DELETE ON builder.process_launch_receipts
  FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();

ALTER TABLE builder.background_jobs ADD CONSTRAINT background_jobs_process_launch_fk
  FOREIGN KEY(project_id,process_launch_id) REFERENCES builder.process_launch_receipts(project_id,process_launch_id);
ALTER TABLE builder.agent_runtime_runs ADD CONSTRAINT agent_runtime_runs_process_launch_fk
  FOREIGN KEY(project_id,process_identity) REFERENCES builder.process_launch_receipts(project_id,process_launch_id);

CREATE FUNCTION builder.enforce_background_job_worker_process_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE valid_worker boolean;
BEGIN
  IF NEW.job_type<>'AGENT_RUNTIME' THEN
    IF NEW.worker_process_instance_id IS NOT NULL OR NEW.worker_ownership_digest IS NOT NULL OR NEW.process_launch_id IS NOT NULL THEN
      RAISE EXCEPTION 'Worker process identity is restricted to agent runtime jobs' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.worker_process_instance_id IS NULL)<>(NEW.worker_ownership_digest IS NULL) THEN
    RAISE EXCEPTION 'Worker process identity tuple is incomplete' USING ERRCODE='23514';
  END IF;

  IF NEW.lease_owner IS NOT NULL THEN
    SELECT true INTO valid_worker FROM builder.worker_process_instances worker
    WHERE worker.worker_process_instance_id=NEW.worker_process_instance_id
      AND worker.ownership_digest=NEW.worker_ownership_digest
      AND worker.logical_worker_id=NEW.lease_owner
    FOR SHARE;
    IF valid_worker IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Active claim requires an exact registered worker process identity tuple' USING ERRCODE='23514';
    END IF;
  END IF;

  IF ROW(NEW.worker_process_instance_id,NEW.worker_ownership_digest)
     IS DISTINCT FROM ROW(OLD.worker_process_instance_id,OLD.worker_ownership_digest) THEN
    IF NEW.worker_process_instance_id IS NULL OR NEW.lease_owner IS NULL OR NEW.claim_idempotency_key IS NULL
       OR NEW.claim_idempotency_key IS NOT DISTINCT FROM OLD.claim_idempotency_key
       OR NEW.lease_generation<=OLD.lease_generation
       OR NEW.fencing_token IS NULL OR NEW.fencing_token<=COALESCE(OLD.fencing_token,0) THEN
      RAISE EXCEPTION 'Worker process identity can change only on an authoritative fenced reclaim' USING ERRCODE='23514';
    END IF;
    IF OLD.process_launch_id IS NOT NULL AND NEW.process_launch_id IS NOT NULL THEN
      RAISE EXCEPTION 'Worker process reclaim must clear the prior launch binding' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER background_jobs_worker_process_identity_guard
  BEFORE UPDATE OF worker_process_instance_id,worker_ownership_digest,lease_owner,claim_idempotency_key,lease_generation,fencing_token
  ON builder.background_jobs FOR EACH ROW EXECUTE FUNCTION builder.enforce_background_job_worker_process_identity();

CREATE FUNCTION builder.enforce_background_job_process_launch() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE valid_binding boolean;
BEGIN
  IF OLD.process_launch_id IS NOT NULL THEN
    IF NEW.process_launch_id IS NULL AND NEW.claim_idempotency_key IS NOT NULL
       AND NEW.claim_idempotency_key IS DISTINCT FROM OLD.claim_idempotency_key
       AND NEW.lease_owner IS NOT NULL AND NEW.lease_generation>OLD.lease_generation
       AND NEW.fencing_token IS NOT NULL AND NEW.fencing_token>COALESCE(OLD.fencing_token,0) THEN RETURN NEW; END IF;
    IF NEW.process_launch_id IS DISTINCT FROM OLD.process_launch_id THEN
      RAISE EXCEPTION 'Bound process launch identity is immutable within a claim' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.process_launch_id IS NULL THEN RETURN NEW; END IF;
  SELECT true INTO valid_binding FROM builder.process_launch_receipts receipt
  WHERE receipt.project_id=NEW.project_id AND receipt.process_launch_id=NEW.process_launch_id
    AND receipt.job_id=NEW.id AND receipt.parent_worker_process_instance_id=NEW.worker_process_instance_id
    AND receipt.worker_ownership_digest=NEW.worker_ownership_digest
    AND receipt.logical_worker_id=NEW.lease_owner AND receipt.claim_id=NEW.claim_idempotency_key
    AND receipt.lease_generation=NEW.lease_generation AND receipt.fencing_token=NEW.fencing_token
    AND receipt.job_version=NEW.job_version FOR SHARE;
  IF valid_binding IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Background job process launch binding is not authoritative' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER background_jobs_process_launch_guard BEFORE UPDATE OF process_launch_id ON builder.background_jobs
  FOR EACH ROW EXECUTE FUNCTION builder.enforce_background_job_process_launch();

CREATE FUNCTION builder.enforce_agent_runtime_process_launch() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE valid_worker boolean;valid_binding boolean;valid_reclaim boolean;
BEGIN
  IF (NEW.worker_process_instance_id IS NULL)<>(NEW.worker_ownership_digest IS NULL) THEN
    RAISE EXCEPTION 'Runtime worker process identity tuple is incomplete' USING ERRCODE='23514';
  END IF;

  IF OLD.worker_process_instance_id IS NOT NULL AND NEW.worker_process_instance_id IS NULL THEN
    RAISE EXCEPTION 'Runtime worker process identity cannot be cleared after authoritative claim binding' USING ERRCODE='23514';
  END IF;

  IF NEW.worker_process_instance_id IS NOT NULL THEN
    SELECT true INTO valid_worker FROM builder.background_jobs job
    JOIN builder.worker_process_instances worker
      ON worker.worker_process_instance_id=NEW.worker_process_instance_id
      AND worker.ownership_digest=NEW.worker_ownership_digest
      AND worker.logical_worker_id=job.lease_owner
    WHERE job.project_id=NEW.project_id AND job.agent_run_id=NEW.run_id
      AND job.worker_process_instance_id=NEW.worker_process_instance_id
      AND job.worker_ownership_digest=NEW.worker_ownership_digest
      AND job.claim_idempotency_key IS NOT NULL AND job.fencing_token IS NOT NULL
      AND job.lease_generation>0 AND job.lease_expires_at>clock_timestamp()
    FOR SHARE OF job,worker;
    IF valid_worker IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Runtime worker process identity is not bound to the authoritative claim' USING ERRCODE='23514';
    END IF;
  END IF;

  IF OLD.process_identity IS NOT NULL AND NEW.process_identity IS NULL THEN
    SELECT true INTO valid_reclaim FROM builder.process_launch_receipts receipt
    JOIN builder.background_jobs job ON job.project_id=receipt.project_id AND job.id=receipt.job_id
    WHERE receipt.project_id=NEW.project_id AND receipt.run_id=NEW.run_id
      AND receipt.process_launch_id=OLD.process_identity
      AND receipt.parent_worker_process_instance_id=OLD.worker_process_instance_id
      AND receipt.worker_ownership_digest=OLD.worker_ownership_digest
      AND receipt.receipt_digest=OLD.process_launch_receipt_digest
      AND receipt.binding_digest=OLD.process_launch_binding_digest
      AND receipt.process_id_digest=OLD.process_id_digest
      AND job.worker_process_instance_id=NEW.worker_process_instance_id
      AND job.worker_ownership_digest=NEW.worker_ownership_digest
      AND job.process_launch_id IS NULL AND job.claim_idempotency_key IS NOT NULL
      AND job.claim_idempotency_key IS DISTINCT FROM receipt.claim_id
      AND job.lease_generation>receipt.lease_generation AND job.fencing_token>receipt.fencing_token
      AND job.lease_expires_at>clock_timestamp()
    FOR SHARE OF receipt,job;
    IF valid_reclaim IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Runtime process launch can be cleared only by an authoritative fenced reclaim' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.process_identity IS NOT NULL AND NEW.process_identity IS DISTINCT FROM OLD.process_identity THEN
    RAISE EXCEPTION 'Runtime process launch binding must be cleared before replacement' USING ERRCODE='23514';
  END IF;

  IF NEW.process_identity IS NOT NULL THEN
    SELECT true INTO valid_binding FROM builder.process_launch_receipts receipt
    JOIN builder.background_jobs job ON job.project_id=receipt.project_id AND job.id=receipt.job_id
    WHERE receipt.project_id=NEW.project_id AND receipt.run_id=NEW.run_id
      AND receipt.process_launch_id=NEW.process_identity
      AND receipt.parent_worker_process_instance_id=NEW.worker_process_instance_id
      AND receipt.worker_ownership_digest=NEW.worker_ownership_digest
      AND receipt.receipt_digest=NEW.process_launch_receipt_digest
      AND receipt.binding_digest=NEW.process_launch_binding_digest
      AND receipt.process_id_digest=NEW.process_id_digest
      AND job.worker_process_instance_id=NEW.worker_process_instance_id
      AND job.worker_ownership_digest=NEW.worker_ownership_digest
      AND job.lease_owner=receipt.logical_worker_id AND job.claim_idempotency_key=receipt.claim_id
      AND job.lease_generation=receipt.lease_generation AND job.fencing_token=receipt.fencing_token
      AND job.job_version=receipt.job_version AND job.process_launch_id=receipt.process_launch_id
      AND job.lease_expires_at>clock_timestamp() FOR SHARE OF receipt,job;
    IF valid_binding IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Runtime process launch binding is not authoritative' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_runtime_runs_process_launch_guard BEFORE UPDATE OF worker_process_instance_id,worker_ownership_digest,process_identity,process_launch_receipt_digest,process_launch_binding_digest,process_id_digest ON builder.agent_runtime_runs
  FOR EACH ROW EXECUTE FUNCTION builder.enforce_agent_runtime_process_launch();

ALTER TABLE builder.codex_exec_runs
  ADD COLUMN worker_process_instance_id text,
  ADD COLUMN worker_ownership_digest text,
  ADD COLUMN process_launch_id text,
  ADD COLUMN process_launch_receipt_digest text,
  ADD COLUMN process_launch_binding_digest text,
  ADD COLUMN process_id_digest text,
  ADD CONSTRAINT codex_exec_runs_worker_process_fk
    FOREIGN KEY(worker_process_instance_id,worker_ownership_digest)
    REFERENCES builder.worker_process_instances(worker_process_instance_id,ownership_digest),
  ADD CONSTRAINT codex_exec_runs_worker_process_tuple_check CHECK (
    (worker_process_instance_id IS NULL AND worker_ownership_digest IS NULL)
    OR (worker_process_instance_id ~ '^wpi_[0-9a-f]{64}$' AND worker_ownership_digest ~ '^sha256:[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT codex_exec_runs_launch_tuple_check CHECK (
    (process_launch_id IS NULL AND process_launch_receipt_digest IS NULL AND process_launch_binding_digest IS NULL AND process_id_digest IS NULL)
    OR
    (process_launch_id ~ '^pli_[0-9a-f]{64}$' AND process_launch_receipt_digest ~ '^sha256:[0-9a-f]{64}$'
      AND process_launch_binding_digest ~ '^sha256:[0-9a-f]{64}$' AND process_id_digest ~ '^sha256:[0-9a-f]{64}$')
  );
ALTER TABLE builder.codex_exec_runs ADD CONSTRAINT codex_exec_runs_process_launch_fk
  FOREIGN KEY(project_id,process_launch_id) REFERENCES builder.process_launch_receipts(project_id,process_launch_id);

CREATE OR REPLACE FUNCTION builder.validate_codex_exec_run_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE valid_start boolean;
BEGIN
  SELECT true INTO valid_start
  FROM builder.background_jobs job
  JOIN builder.agent_runtime_runs runtime ON runtime.project_id=job.project_id AND runtime.run_id=job.agent_run_id
  JOIN builder.codex_exec_job_bindings binding ON binding.project_id=job.project_id AND binding.job_id=job.id
  JOIN builder.agent_assignments assignment ON assignment.project_id=binding.project_id AND assignment.assignment_id=binding.assignment_id
  JOIN builder.agent_registry_versions registry ON registry.agent_id=binding.agent_id AND registry.agent_key=binding.agent_key AND registry.version=binding.agent_version
  JOIN builder.project_workspaces workspace ON workspace.project_id=binding.project_id AND workspace.workspace_id=binding.workspace_id
  WHERE job.project_id=NEW.project_id AND job.id=NEW.job_id AND job.agent_run_id=NEW.run_id
    AND job.status='CLAIMED' AND job.cancel_requested_at IS NULL AND job.lease_expires_at>clock_timestamp()
    AND job.lease_owner=NEW.worker_id AND job.claim_idempotency_key=NEW.claim_id
    AND job.worker_process_instance_id=NEW.worker_process_instance_id AND job.worker_ownership_digest=NEW.worker_ownership_digest
    AND job.process_launch_id IS NULL AND NEW.process_launch_id IS NULL
    AND job.fencing_token=NEW.fencing_token AND job.lease_generation=NEW.lease_generation
    AND job.job_version IN (NEW.claimed_job_version,NEW.claimed_job_version+1)
    AND runtime.state='RUNNING' AND runtime.runtime_start_dispatched_at IS NOT NULL
    AND runtime.runtime_start_job_version=job.job_version AND runtime.runtime_started_at IS NULL
    AND runtime.worker_process_instance_id=NEW.worker_process_instance_id AND runtime.worker_ownership_digest=NEW.worker_ownership_digest
    AND runtime.result_id IS NULL AND runtime.process_identity IS NULL
    AND assignment.job_id=job.id AND assignment.assignment_status='ASSIGNED'
    AND registry.role='PLANNER' AND workspace.status='READY'
  FOR SHARE OF job,runtime,binding,assignment,registry,workspace;
  IF valid_start IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Codex exec run insert requires exact active worker process identity' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION builder.enforce_codex_exec_run_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE valid_transition boolean;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Codex exec runs cannot be deleted' USING ERRCODE='23514'; END IF;
  IF ROW(OLD.project_id,OLD.job_id,OLD.run_id,OLD.prompt_sha256,OLD.cli_version,OLD.worker_id,OLD.worker_process_instance_id,
         OLD.worker_ownership_digest,OLD.claim_id,OLD.lease_generation,OLD.fencing_token,OLD.claimed_job_version,OLD.started_at)
     IS DISTINCT FROM
     ROW(NEW.project_id,NEW.job_id,NEW.run_id,NEW.prompt_sha256,NEW.cli_version,NEW.worker_id,NEW.worker_process_instance_id,
         NEW.worker_ownership_digest,NEW.claim_id,NEW.lease_generation,NEW.fencing_token,NEW.claimed_job_version,NEW.started_at) THEN
    RAISE EXCEPTION 'Codex exec run start and worker-process binding is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.state='DISPATCHED' AND NEW.state='DISPATCHED' THEN
    IF OLD.process_launch_id IS NOT NULL OR NEW.process_launch_id IS NULL
       OR ROW(OLD.thread_id,OLD.model,OLD.usage,OLD.output,OLD.error_code,OLD.policy_event,OLD.completed_at,OLD.recovery_fencing_token)
          IS DISTINCT FROM ROW(NEW.thread_id,NEW.model,NEW.usage,NEW.output,NEW.error_code,NEW.policy_event,NEW.completed_at,NEW.recovery_fencing_token) THEN
      RAISE EXCEPTION 'Codex process launch binding transition is invalid' USING ERRCODE='23514';
    END IF;
    SELECT true INTO valid_transition FROM builder.process_launch_receipts receipt
    WHERE receipt.project_id=NEW.project_id AND receipt.job_id=NEW.job_id AND receipt.run_id=NEW.run_id
      AND receipt.process_launch_id=NEW.process_launch_id
      AND receipt.parent_worker_process_instance_id=NEW.worker_process_instance_id
      AND receipt.worker_ownership_digest=NEW.worker_ownership_digest
      AND receipt.receipt_digest=NEW.process_launch_receipt_digest
      AND receipt.binding_digest=NEW.process_launch_binding_digest
      AND receipt.process_id_digest=NEW.process_id_digest FOR SHARE;
    IF valid_transition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Codex process launch receipt mismatch' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.state<>'DISPATCHED' OR NEW.state NOT IN ('SUCCEEDED','FAILED','TIMED_OUT','CANCELLED','POLICY_VIOLATION','RECOVERY_REQUIRED')
     OR ROW(OLD.process_launch_id,OLD.process_launch_receipt_digest,OLD.process_launch_binding_digest,OLD.process_id_digest)
        IS DISTINCT FROM ROW(NEW.process_launch_id,NEW.process_launch_receipt_digest,NEW.process_launch_binding_digest,NEW.process_id_digest) THEN
    RAISE EXCEPTION 'Codex exec run transition is invalid or terminal' USING ERRCODE='23514';
  END IF;
  IF NEW.state='RECOVERY_REQUIRED' THEN
    SELECT true INTO valid_transition FROM builder.background_jobs job
    WHERE job.project_id=NEW.project_id AND job.id=NEW.job_id AND job.fencing_token=NEW.recovery_fencing_token
      AND job.fencing_token>OLD.fencing_token AND job.lease_generation>OLD.lease_generation
      AND job.lease_expires_at>clock_timestamp() FOR SHARE;
  ELSE
    SELECT true INTO valid_transition FROM builder.background_jobs job
    JOIN builder.agent_runtime_runs runtime ON runtime.project_id=job.project_id AND runtime.run_id=job.agent_run_id
    WHERE job.project_id=NEW.project_id AND job.id=NEW.job_id AND job.agent_run_id=NEW.run_id
      AND job.lease_owner=OLD.worker_id AND job.claim_idempotency_key=OLD.claim_id
      AND job.worker_process_instance_id=OLD.worker_process_instance_id AND job.worker_ownership_digest=OLD.worker_ownership_digest
      AND job.process_launch_id IS NOT DISTINCT FROM OLD.process_launch_id
      AND job.fencing_token=OLD.fencing_token AND job.lease_generation=OLD.lease_generation
      AND job.lease_expires_at>clock_timestamp() AND runtime.process_identity IS NOT DISTINCT FROM OLD.process_launch_id
      AND job.status IN ('CLAIMED','CANCELLING') FOR SHARE OF job,runtime;
  END IF;
  IF valid_transition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Codex terminal transition lost process identity authority' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

ALTER TABLE builder.agent_job_audit_events
  DROP CONSTRAINT agent_job_audit_events_event_type_check,
  ADD CONSTRAINT agent_job_audit_events_event_type_check CHECK(event_type IN (
    'ENQUEUED','CLAIMED','RECLAIMED','HEARTBEAT','PROGRESS','RETRY_SCHEDULED','RETRY_EXHAUSTED',
    'RUNTIME_START_DISPATCHED','PROCESS_LAUNCH_BOUND','PRESTART_CANCELLED',
    'CANCEL_REQUESTED','CANCEL_REPEATED','CANCEL_REJECTED','CANCEL_ATTEMPTED','CANCEL_ATTEMPT_FAILED','CANCEL_RETRY_SCHEDULED',
    'EVIDENCE_VERIFIED','EVIDENCE_REJECTED','CANCEL_CONFIRMED','CANCEL_STUCK','PROJECT_HOLD_CLEARED',
    'LATE_COMPLETION_DISCARDED','CANCELLED','COMPLETED','FAILED','SCHEMA_REJECTED','LEASE_LOST'
  ));

ALTER TABLE builder.background_jobs
  ALTER COLUMN worker_process_instance_id SET STORAGE PLAIN,
  ALTER COLUMN worker_ownership_digest SET STORAGE PLAIN,
  ALTER COLUMN process_launch_id SET STORAGE PLAIN;

GRANT SELECT,INSERT ON builder.worker_process_instances TO builder_runtime;
GRANT UPDATE(worker_process_instance_id,worker_ownership_digest,process_launch_id) ON builder.background_jobs TO builder_runtime;
GRANT UPDATE(worker_process_instance_id,worker_ownership_digest,process_identity,process_launch_receipt_digest,process_launch_binding_digest,process_id_digest)
  ON builder.agent_runtime_runs TO builder_runtime;
GRANT UPDATE(process_launch_id,process_launch_receipt_digest,process_launch_binding_digest,process_id_digest)
  ON builder.codex_exec_runs TO builder_runtime;

ALTER TABLE builder.process_launch_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.process_launch_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY project_isolation ON builder.process_launch_receipts
  USING(project_id=builder.current_project_id()) WITH CHECK(project_id=builder.current_project_id());
GRANT SELECT,INSERT ON builder.process_launch_receipts TO builder_runtime;

ALTER TABLE builder.worker_process_instances OWNER TO builder_schema_owner;
ALTER TABLE builder.process_launch_receipts OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_process_launch_receipt_insert() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.enforce_background_job_worker_process_identity() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.enforce_background_job_process_launch() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.enforce_agent_runtime_process_launch() OWNER TO builder_schema_owner;
