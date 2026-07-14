-- PERSISTENT-CANCELLATION-SEMANTICS-01. Persistent cancellation attempts, evidence and bounded recovery.

ALTER TABLE builder.background_jobs
  ADD COLUMN cancel_attempt_count integer NOT NULL DEFAULT 0 CHECK(cancel_attempt_count BETWEEN 0 AND 20),
  ADD COLUMN cancel_max_attempts integer NOT NULL DEFAULT 3 CHECK(cancel_max_attempts BETWEEN 1 AND 20),
  ADD COLUMN cancel_last_attempt_at timestamptz,
  ADD COLUMN cancel_last_outcome text CHECK(cancel_last_outcome IS NULL OR cancel_last_outcome IN ('FAILED','TIMED_OUT','REJECTED','CONFIRMED')),
  ADD COLUMN cancel_last_error_code builder.short_code,
  ADD COLUMN cancel_confirmed_at timestamptz,
  ADD COLUMN cancel_confirmation_kind text CHECK(cancel_confirmation_kind IS NULL OR cancel_confirmation_kind IN ('RUNTIME_CANCEL_CONFIRMED','RUNTIME_STATUS_CANCELLED','RUNTIME_TERMINAL_OBSERVED','PROCESS_TERMINATED','RECOVERY_CONFIRMED'));

ALTER TABLE builder.background_jobs DROP CONSTRAINT background_jobs_status_check;
ALTER TABLE builder.background_jobs ADD CONSTRAINT background_jobs_status_check CHECK(status IN (
  'PENDING','CLAIMED','RUNNING','RETRY_SCHEDULED','SUCCEEDED','FAILED','CANCELLED','DEAD_LETTER','CANCELLING','CANCEL_STUCK','COMPLETED'
));

ALTER TABLE builder.background_jobs DROP CONSTRAINT background_jobs_cancelling_claim_check;
ALTER TABLE builder.background_jobs ADD CONSTRAINT background_jobs_cancelling_claim_check CHECK(
  status<>'CANCELLING' OR job_type<>'AGENT_RUNTIME' OR (
    cancel_requested_at IS NOT NULL AND (
      (lease_owner IS NULL AND claim_idempotency_key IS NULL AND lease_expires_at IS NULL) OR
      (lease_owner IS NOT NULL AND claim_idempotency_key IS NOT NULL AND fencing_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    )
  )
);

ALTER TABLE builder.background_jobs ADD CONSTRAINT background_jobs_cancel_confirmation_check CHECK(
  (cancel_confirmed_at IS NULL AND cancel_confirmation_kind IS NULL) OR
  (cancel_confirmed_at IS NOT NULL AND cancel_confirmation_kind IS NOT NULL AND cancel_requested_at IS NOT NULL)
);

ALTER TABLE builder.agent_job_audit_events
  DROP CONSTRAINT agent_job_audit_events_event_type_check,
  ADD CONSTRAINT agent_job_audit_events_event_type_check CHECK(event_type IN (
    'ENQUEUED','CLAIMED','RECLAIMED','HEARTBEAT','PROGRESS','RETRY_SCHEDULED',
    'RETRY_EXHAUSTED','CANCEL_REQUESTED','CANCEL_REPEATED','CANCEL_REJECTED',
    'CANCEL_ATTEMPTED','CANCEL_ATTEMPT_FAILED','CANCEL_CONFIRMED','CANCEL_STUCK',
    'LATE_COMPLETION_DISCARDED','CANCELLED','COMPLETED','FAILED','SCHEMA_REJECTED','LEASE_LOST'
  ));

GRANT UPDATE(cancel_attempt_count,cancel_max_attempts,cancel_last_attempt_at,cancel_last_outcome,cancel_last_error_code,cancel_confirmed_at,cancel_confirmation_kind)
  ON builder.background_jobs TO builder_runtime;
