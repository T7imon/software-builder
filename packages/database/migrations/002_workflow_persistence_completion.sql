-- WORKFLOW-PERSISTENCE-COMPLETION-01: additive PostgreSQL persistence for the
-- existing workflow domain. Migration 001 remains the immutable foundation.

CREATE TABLE builder.workflow_aggregates (
  project_id uuid PRIMARY KEY REFERENCES builder.projects(id),
  phase text NOT NULL CHECK (phase IN ('DRAFT','DISCOVERY','SPECIFICATION','ARCHITECTURE','PRE_BUILD_REVIEW','AWAITING_PLAN_APPROVAL','IMPLEMENTATION','VERIFICATION','BLOCKED','RELEASE_CANDIDATE','STAGING','PRODUCTION','COMPLETED','FAILED','CANCELLED')),
  aggregate_version integer NOT NULL CHECK (aggregate_version >= 0),
  storage_version bigint NOT NULL DEFAULT 0 CHECK (storage_version >= 0),
  policy_version text NOT NULL,
  revision_digest text NOT NULL CHECK (revision_digest ~ '^[0-9a-f]{64}$'),
  state_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE builder.workflow_revisions (
  project_id uuid NOT NULL REFERENCES builder.projects(id), aggregate_version integer NOT NULL CHECK (aggregate_version >= 0),
  revision_digest text NOT NULL CHECK (revision_digest ~ '^[0-9a-f]{64}$'), phase text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,aggregate_version)
);

CREATE TABLE builder.workflow_evidence (
  project_id uuid NOT NULL REFERENCES builder.projects(id), evidence_id text NOT NULL, evidence_kind text NOT NULL,
  revision_digest text NOT NULL CHECK (revision_digest ~ '^[0-9a-f]{64}$'), content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,evidence_id)
);

CREATE TABLE builder.legal_assessments (
  project_id uuid NOT NULL REFERENCES builder.projects(id), assessment_id text NOT NULL, status text NOT NULL CHECK(status IN ('PASS','PASS_WITH_REQUIREMENTS','BLOCK','COUNSEL_REQUIRED')),
  revision_digest text NOT NULL CHECK(revision_digest ~ '^[0-9a-f]{64}$'), payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,assessment_id)
);
CREATE TABLE builder.legal_requirements (
  project_id uuid NOT NULL REFERENCES builder.projects(id), requirement_id text NOT NULL, assessment_id text NOT NULL,
  state text NOT NULL CHECK(state IN ('OPEN','EVIDENCE_SUBMITTED','VERIFIED','REJECTED','SUPERSEDED')), payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,requirement_id), FOREIGN KEY(project_id,assessment_id) REFERENCES builder.legal_assessments(project_id,assessment_id)
);
CREATE TABLE builder.counsel_cases (
  project_id uuid NOT NULL REFERENCES builder.projects(id), counsel_case_id text NOT NULL, assessment_id text NOT NULL,
  state text NOT NULL CHECK(state IN ('OPEN','CLOSED')), payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,counsel_case_id), FOREIGN KEY(project_id,assessment_id) REFERENCES builder.legal_assessments(project_id,assessment_id)
);
CREATE TABLE builder.counsel_decisions (
  project_id uuid NOT NULL REFERENCES builder.projects(id), decision_id text NOT NULL, counsel_case_id text NOT NULL, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,decision_id),
  FOREIGN KEY(project_id,counsel_case_id) REFERENCES builder.counsel_cases(project_id,counsel_case_id)
);
CREATE TABLE builder.project_holds (
  project_id uuid NOT NULL REFERENCES builder.projects(id), hold_id text NOT NULL, hold_type text NOT NULL,
  state text NOT NULL CHECK(state IN ('OPEN','CLEARED')), payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,hold_id)
);
CREATE TABLE builder.hold_clearances (
  project_id uuid NOT NULL REFERENCES builder.projects(id), clearance_id text NOT NULL, hold_id text NOT NULL, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,clearance_id),
  FOREIGN KEY(project_id,hold_id) REFERENCES builder.project_holds(project_id,hold_id)
);
CREATE TABLE builder.termination_evidence (
  project_id uuid NOT NULL REFERENCES builder.projects(id), evidence_id text NOT NULL, job_id uuid NOT NULL,
  payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,evidence_id)
);
CREATE TABLE builder.job_audit_events (
  project_id uuid NOT NULL REFERENCES builder.projects(id), event_id text NOT NULL, job_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('CLAIMED','HEARTBEAT','COMPLETED','CANCELLING','CANCELLED')),
  previous_hash text, event_hash text NOT NULL CHECK(event_hash ~ '^[0-9a-f]{64}$'), payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,event_id)
);
CREATE TABLE builder.workflow_transition_details (
  project_id uuid NOT NULL REFERENCES builder.projects(id), event_id text NOT NULL, audit_event_id uuid NOT NULL,
  aggregate_version integer NOT NULL CHECK(aggregate_version > 0), payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,event_id),
  FOREIGN KEY(project_id,audit_event_id) REFERENCES builder.audit_events(project_id,id)
);
CREATE TABLE builder.workflow_fence_counters (
  project_id uuid PRIMARY KEY REFERENCES builder.projects(id), last_fencing_token bigint NOT NULL DEFAULT 0 CHECK(last_fencing_token >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE builder.background_jobs DROP CONSTRAINT background_jobs_status_check;
ALTER TABLE builder.background_jobs ADD CONSTRAINT background_jobs_status_check CHECK(status IN ('PENDING','CLAIMED','RUNNING','RETRY_SCHEDULED','SUCCEEDED','FAILED','CANCELLED','DEAD_LETTER','CANCELLING','COMPLETED'));
ALTER TABLE builder.background_jobs
  ADD COLUMN phase text,
  ADD COLUMN revision_digest text CHECK(revision_digest IS NULL OR revision_digest ~ '^[0-9a-f]{64}$'),
  ADD COLUMN operation_scope jsonb,
  ADD COLUMN lease_owner text,
  ADD COLUMN claim_idempotency_key text,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN fencing_token bigint CHECK(fencing_token IS NULL OR fencing_token > 0),
  ADD COLUMN workflow_payload jsonb;
CREATE UNIQUE INDEX background_jobs_project_fence_unique ON builder.background_jobs(project_id,fencing_token) WHERE fencing_token IS NOT NULL;
INSERT INTO builder.worker_job_type_permissions(worker_type,job_type) VALUES
  ('CONTROL','DISCOVERY_CONTROL'),('CONTROL','SPECIFICATION_CONTROL'),('CONTROL','ARCHITECTURE_CONTROL'),
  ('CONTROL','PRE_BUILD_REVIEW_CONTROL'),('CONTROL','IMPLEMENTATION_CONTROL'),('CONTROL','VERIFICATION_CONTROL')
ON CONFLICT DO NOTHING;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['workflow_aggregates','workflow_revisions','workflow_evidence','legal_assessments','legal_requirements','counsel_cases','counsel_decisions','project_holds','hold_clearances','termination_evidence','job_audit_events','workflow_transition_details','workflow_fence_counters']
  LOOP
    EXECUTE format('ALTER TABLE builder.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE builder.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY project_isolation ON builder.%I USING (project_id=builder.current_project_id()) WITH CHECK (project_id=builder.current_project_id())',table_name);
    EXECUTE format('GRANT SELECT,INSERT ON builder.%I TO builder_runtime',table_name);
  END LOOP;
END $$;

GRANT UPDATE(phase,aggregate_version,storage_version,policy_version,revision_digest,state_snapshot,updated_at) ON builder.workflow_aggregates TO builder_runtime;
GRANT UPDATE(state,payload,updated_at) ON builder.legal_requirements,builder.counsel_cases,builder.project_holds TO builder_runtime;
GRANT UPDATE(last_fencing_token,updated_at) ON builder.workflow_fence_counters TO builder_runtime;
GRANT UPDATE(status,claimed_at,claimed_by,terminal_at,phase,revision_digest,operation_scope,lease_owner,claim_idempotency_key,lease_expires_at,fencing_token,workflow_payload,updated_at) ON builder.background_jobs TO builder_runtime;

CREATE TRIGGER workflow_aggregates_touch BEFORE UPDATE ON builder.workflow_aggregates FOR EACH ROW EXECUTE FUNCTION builder.touch_updated_at();
CREATE TRIGGER legal_requirements_touch BEFORE UPDATE ON builder.legal_requirements FOR EACH ROW EXECUTE FUNCTION builder.touch_updated_at();
CREATE TRIGGER counsel_cases_touch BEFORE UPDATE ON builder.counsel_cases FOR EACH ROW EXECUTE FUNCTION builder.touch_updated_at();
CREATE TRIGGER project_holds_touch BEFORE UPDATE ON builder.project_holds FOR EACH ROW EXECUTE FUNCTION builder.touch_updated_at();
CREATE TRIGGER fence_counters_touch BEFORE UPDATE ON builder.workflow_fence_counters FOR EACH ROW EXECUTE FUNCTION builder.touch_updated_at();
CREATE TRIGGER workflow_revisions_immutable BEFORE UPDATE OR DELETE ON builder.workflow_revisions FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER workflow_evidence_immutable BEFORE UPDATE OR DELETE ON builder.workflow_evidence FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER legal_assessments_immutable BEFORE UPDATE OR DELETE ON builder.legal_assessments FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER counsel_decisions_immutable BEFORE UPDATE OR DELETE ON builder.counsel_decisions FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER hold_clearances_immutable BEFORE UPDATE OR DELETE ON builder.hold_clearances FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER termination_evidence_immutable BEFORE UPDATE OR DELETE ON builder.termination_evidence FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER job_audit_events_immutable BEFORE UPDATE OR DELETE ON builder.job_audit_events FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER workflow_transition_details_immutable BEFORE UPDATE OR DELETE ON builder.workflow_transition_details FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
