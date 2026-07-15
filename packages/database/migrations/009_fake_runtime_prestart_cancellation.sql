-- FAKE-RUNTIME-PRESTART-CANCELLATION-01. Development-only local FakeRuntime start/cancel linearisation.

ALTER TABLE builder.outbox_events
  DROP CONSTRAINT outbox_events_status_check,
  ADD CONSTRAINT outbox_events_status_check CHECK(status IN (
    'PENDING','DISPATCHING','DISPATCHED','SUPERSEDED','FAILED','DEAD_LETTER'
  )),
  ADD COLUMN dispatch_started_at timestamptz,
  ADD COLUMN superseded_at timestamptz,
  ADD COLUMN superseded_by_cancellation_request_id uuid,
  ADD CONSTRAINT outbox_events_superseded_by_cancellation_fk
    FOREIGN KEY(project_id,superseded_by_cancellation_request_id)
    REFERENCES builder.agent_job_cancellation_requests(project_id,request_id),
  ADD CONSTRAINT outbox_events_superseded_state_check CHECK(
    (status='SUPERSEDED' AND superseded_at IS NOT NULL AND superseded_by_cancellation_request_id IS NOT NULL AND dispatched_at IS NULL)
    OR
    (status<>'SUPERSEDED' AND superseded_at IS NULL AND superseded_by_cancellation_request_id IS NULL)
  );

ALTER TABLE builder.agent_runtime_runs
  ADD COLUMN runtime_start_dispatched_at timestamptz,
  ADD COLUMN runtime_started_at timestamptz,
  ADD COLUMN runtime_start_job_version bigint CHECK(runtime_start_job_version IS NULL OR runtime_start_job_version>0),
  ADD COLUMN workload_id text,
  ADD COLUMN process_identity text;

ALTER TABLE builder.agent_job_audit_events
  DROP CONSTRAINT agent_job_audit_events_event_type_check,
  ADD CONSTRAINT agent_job_audit_events_event_type_check CHECK(event_type IN (
    'ENQUEUED','CLAIMED','RECLAIMED','HEARTBEAT','PROGRESS','RETRY_SCHEDULED','RETRY_EXHAUSTED',
    'RUNTIME_START_DISPATCHED','PRESTART_CANCELLED',
    'CANCEL_REQUESTED','CANCEL_REPEATED','CANCEL_REJECTED','CANCEL_ATTEMPTED','CANCEL_ATTEMPT_FAILED','CANCEL_RETRY_SCHEDULED',
    'EVIDENCE_VERIFIED','EVIDENCE_REJECTED','CANCEL_CONFIRMED','CANCEL_STUCK','PROJECT_HOLD_CLEARED',
    'LATE_COMPLETION_DISCARDED','CANCELLED','COMPLETED','FAILED','SCHEMA_REJECTED','LEASE_LOST'
  ));

GRANT UPDATE(status,dispatch_started_at,dispatched_at,superseded_at,superseded_by_cancellation_request_id,updated_at)
  ON builder.outbox_events TO builder_runtime;
GRANT UPDATE(runtime_start_dispatched_at,runtime_started_at,runtime_start_job_version,workload_id,process_identity)
  ON builder.agent_runtime_runs TO builder_runtime;
