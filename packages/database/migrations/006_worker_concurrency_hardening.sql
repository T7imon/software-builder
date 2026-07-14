-- WORKER-CONCURRENCY-HARDENING-01. Auditable cancellation linearisation.

ALTER TABLE builder.agent_job_audit_events
  DROP CONSTRAINT agent_job_audit_events_event_type_check,
  ADD CONSTRAINT agent_job_audit_events_event_type_check CHECK(event_type IN (
    'ENQUEUED','CLAIMED','RECLAIMED','HEARTBEAT','PROGRESS','RETRY_SCHEDULED',
    'RETRY_EXHAUSTED','CANCEL_REQUESTED','CANCEL_REPEATED','CANCEL_REJECTED',
    'LATE_COMPLETION_DISCARDED','CANCELLED','COMPLETED','FAILED','SCHEMA_REJECTED','LEASE_LOST'
  ));
