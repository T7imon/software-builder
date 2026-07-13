-- WORKFLOW-PERSISTENCE-COMPLETION-01: lease authorization and project-bound evidence integrity.

ALTER TABLE builder.job_audit_events
  DROP CONSTRAINT job_audit_events_event_type_check,
  ADD CONSTRAINT job_audit_events_event_type_check
    CHECK(event_type IN ('CLAIMED','AUTHORIZED','HEARTBEAT','COMPLETED','CANCELLING','CANCELLED'));

ALTER TABLE builder.termination_evidence
  ADD CONSTRAINT termination_evidence_project_job_fk
  FOREIGN KEY(project_id,job_id) REFERENCES builder.background_jobs(project_id,id);

ALTER TABLE builder.job_audit_events
  ADD CONSTRAINT job_audit_events_project_job_fk
  FOREIGN KEY(project_id,job_id) REFERENCES builder.background_jobs(project_id,id);
