DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'builder_schema_owner') THEN CREATE ROLE builder_schema_owner NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'builder_runtime') THEN CREATE ROLE builder_runtime NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'builder_queue_owner') THEN CREATE ROLE builder_queue_owner NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'builder_job_claimer') THEN CREATE ROLE builder_job_claimer NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'builder_audit_writer') THEN CREATE ROLE builder_audit_writer NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'builder_role_provisioner') THEN CREATE ROLE builder_role_provisioner NOLOGIN CREATEROLE NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'builder_context_issuer') THEN CREATE ROLE builder_context_issuer NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'builder_app_login') THEN CREATE ROLE builder_app_login LOGIN INHERIT NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'builder_claim_login') THEN CREATE ROLE builder_claim_login LOGIN INHERIT NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'builder_context_login') THEN CREATE ROLE builder_context_login LOGIN INHERIT NOBYPASSRLS; END IF;
END $$;
GRANT builder_schema_owner, builder_queue_owner, builder_audit_writer, builder_role_provisioner, builder_context_issuer TO CURRENT_USER WITH ADMIN OPTION;
GRANT builder_runtime TO builder_app_login;
GRANT builder_job_claimer TO builder_claim_login;
GRANT builder_context_issuer TO builder_context_login;
GRANT builder_app_login, builder_context_login, builder_claim_login TO builder_role_provisioner WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;

CREATE SCHEMA builder;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE DOMAIN builder.short_code AS text CHECK (VALUE ~ '^[A-Z0-9][A-Z0-9_.:-]{0,127}$');
CREATE DOMAIN builder.opaque_ref AS text CHECK (octet_length(VALUE) BETWEEN 1 AND 512 AND VALUE ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$');
CREATE DOMAIN builder.error_text AS text CHECK (octet_length(VALUE) BETWEEN 1 AND 2048 AND VALUE !~* '(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|npm_[a-z0-9]{20,}|pypi-[a-z0-9_-]{20,}|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|bearer\s+[a-z0-9._~+/-]{12,}|(api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\s*[:=]|aws[_-]?(access|secret)|[a-z][a-z0-9+.-]*://[^/@\s]+:[^/@\s]+@|BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY)');
CREATE TABLE public.schema_migrations (
  version text PRIMARY KEY,
  checksum_sha256 text NOT NULL CHECK(checksum_sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.schema_migrations OWNER TO builder_schema_owner;

CREATE TABLE builder.project_context_grants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),token_hash text UNIQUE NOT NULL CHECK(token_hash~'^[0-9a-f]{64}$'),project_id uuid NOT NULL,capability_id uuid UNIQUE NOT NULL,subject builder.opaque_ref NOT NULL,actor_scope builder.short_code NOT NULL,audience builder.short_code NOT NULL CHECK(audience='PERSISTENCE'),operation builder.short_code NOT NULL,target_login name NOT NULL DEFAULT 'builder_app_login' CHECK(target_login='builder_app_login'),expires_at timestamptz NOT NULL,consumed_at timestamptz,consumed_pid integer,consumed_txid bigint,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(consumed_at IS NULL OR (consumed_pid IS NOT NULL AND consumed_txid IS NOT NULL)));
CREATE FUNCTION builder.issue_project_context(p_project_id uuid,p_capability_id uuid,p_subject text,p_actor_scope text,p_audience text,p_operation text,p_expires_at timestamptz) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,builder AS $$
DECLARE v_token text:=encode(public.gen_random_bytes(32),'hex'); BEGIN IF session_user<>'builder_context_login' OR p_audience<>'persistence' OR p_subject!~'^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$' OR p_actor_scope!~'^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$' OR p_operation!~'^[a-z][a-z0-9_]*:(read|append|verify|create)$' OR p_expires_at<=clock_timestamp() OR p_expires_at>clock_timestamp()+interval '2 minutes' THEN RAISE EXCEPTION 'context grant denied' USING ERRCODE='42501'; END IF; INSERT INTO builder.project_context_grants(token_hash,project_id,capability_id,subject,actor_scope,audience,operation,expires_at) VALUES(encode(public.digest(v_token,'sha256'),'hex'),p_project_id,p_capability_id,p_subject,upper(p_actor_scope),upper(p_audience),upper(p_operation),p_expires_at); RETURN v_token; END $$;
CREATE FUNCTION builder.consume_project_context(p_token text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,builder AS $$
DECLARE v_hash text:=encode(public.digest(p_token,'sha256'),'hex'); v_project uuid; BEGIN IF session_user<>'builder_app_login' OR octet_length(p_token)<>64 THEN RAISE EXCEPTION 'context grant denied' USING ERRCODE='42501'; END IF; UPDATE builder.project_context_grants SET consumed_at=clock_timestamp(),consumed_pid=pg_backend_pid(),consumed_txid=txid_current() WHERE token_hash=v_hash AND target_login=session_user AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING project_id INTO v_project; IF v_project IS NULL THEN RAISE EXCEPTION 'context grant invalid/used/expired' USING ERRCODE='42501'; END IF; PERFORM set_config('builder.context_token_hash',v_hash,true); END $$;
CREATE FUNCTION builder.current_project_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,builder RETURN (SELECT project_id FROM builder.project_context_grants WHERE token_hash=current_setting('builder.context_token_hash',true) AND consumed_pid=pg_backend_pid() AND consumed_txid=txid_current() AND expires_at>clock_timestamp());

CREATE FUNCTION builder.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;

CREATE FUNCTION builder.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000'; END $$;

CREATE FUNCTION builder.provision_runtime_password(p_password text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF length(p_password) < 16 THEN RAISE EXCEPTION 'runtime password too short' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_auth_members membership JOIN pg_roles target ON target.oid=membership.roleid JOIN pg_roles member ON member.oid=membership.member WHERE target.rolname='builder_app_login' AND member.rolname=current_user AND membership.admin_option) THEN RAISE EXCEPTION 'runtime password provisioner lacks ADMIN permission' USING ERRCODE='42501'; END IF;
  EXECUTE format('ALTER ROLE builder_app_login PASSWORD %L',p_password);
END $$;
CREATE FUNCTION builder.provision_context_password(p_password text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN IF length(p_password)<16 THEN RAISE EXCEPTION 'context password too short' USING ERRCODE='22023'; END IF; EXECUTE format('ALTER ROLE builder_context_login PASSWORD %L',p_password); END $$;
CREATE FUNCTION builder.provision_claim_password(p_password text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN IF length(p_password)<16 THEN RAISE EXCEPTION 'claim password too short' USING ERRCODE='22023'; END IF; EXECUTE format('ALTER ROLE builder_claim_login PASSWORD %L',p_password); END $$;

CREATE TABLE builder.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_type text NOT NULL DEFAULT 'FULL_STACK_WEB' CHECK (project_type = 'FULL_STACK_WEB'),
  status text NOT NULL CHECK (status IN ('IDEA_VALIDATION','REJECTED','PLANNING','PLANNING_REVIEW','ON_HOLD','AWAITING_INITIAL_APPROVAL','APPROVED_UNPROVISIONED','WORKSPACE_PROVISIONING','WORKSPACE_READY','PROVISIONING_FAILED','REPOSITORY_PROVISIONING','REPOSITORY_READY','ACTIVE','PAUSED','STOPPED','ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, project_type)
);

CREATE TABLE builder.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, planner_m_id builder.opaque_ref NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal >= 0), status text NOT NULL CHECK(status IN ('PENDING','READY','ACTIVE','VERIFYING','COMPLETE','BLOCKED','CANCELLED')),
  acceptance_policy_id builder.opaque_ref NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,ordinal), FOREIGN KEY(project_id) REFERENCES builder.projects(id)
);
CREATE UNIQUE INDEX milestones_one_active_per_project ON builder.milestones(project_id) WHERE status IN ('ACTIVE','VERIFYING');

CREATE TABLE builder.project_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0), classification text NOT NULL CHECK (classification IN ('SYNTHETIC_ONLY','REJECTED','QUARANTINED')),
  content_object_ref text, status text NOT NULL CHECK (status IN ('DRAFT','SCREENED','ACCEPTED','REJECTED','QUARANTINED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), FOREIGN KEY(project_id) REFERENCES builder.projects(id) ON DELETE RESTRICT,
  CHECK (classification <> 'SYNTHETIC_ONLY' OR content_object_ref IS NOT NULL)
);

CREATE TABLE builder.product_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, schema_version integer NOT NULL CHECK(schema_version > 0),
  revision integer NOT NULL CHECK(revision > 0), content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'), object_ref text NOT NULL,
  status text NOT NULL CHECK(status IN ('DRAFT','FROZEN','APPROVED','SUPERSEDED')), supersedes_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,revision), FOREIGN KEY(project_id) REFERENCES builder.projects(id),
  FOREIGN KEY(project_id,supersedes_id) REFERENCES builder.product_specifications(project_id,id)
);

CREATE TABLE builder.workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, name text NOT NULL, schema_version integer NOT NULL CHECK(schema_version > 0),
  revision integer NOT NULL CHECK(revision > 0), definition_digest text NOT NULL CHECK(definition_digest ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK(status IN ('DRAFT','ACTIVE','SUPERSEDED','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,name,revision), FOREIGN KEY(project_id) REFERENCES builder.projects(id)
);

CREATE TABLE builder.workflow_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, workflow_definition_id uuid, milestone_id uuid NOT NULL, name builder.short_code NOT NULL, ordinal integer NOT NULL CHECK(ordinal >= 0),
  status text NOT NULL CHECK(status IN ('PENDING','READY','ACTIVE','VERIFYING','COMPLETE','BLOCKED','CANCELLED')), version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,workflow_definition_id,ordinal), FOREIGN KEY(project_id) REFERENCES builder.projects(id),
  FOREIGN KEY(project_id,workflow_definition_id) REFERENCES builder.workflow_definitions(project_id,id)
  ,FOREIGN KEY(project_id,milestone_id) REFERENCES builder.milestones(project_id,id)
);

CREATE TABLE builder.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, milestone_id uuid NOT NULL, specification_version integer NOT NULL DEFAULT 1 CHECK(specification_version > 0),
  task_type builder.short_code NOT NULL, statement_ref builder.opaque_ref NOT NULL, acceptance_criteria_ref builder.opaque_ref NOT NULL,
  status text NOT NULL CHECK(status IN ('DRAFT','READY','INITIAL_RUNNING','EVALUATING','REPAIR_READY','REPAIR_RUNNING','ACCEPTED','STOPPED_REPAIR_LIMIT','STOPPED_LEGAL','STOPPED_SECURITY','CANCELLED')),
  repair_count integer NOT NULL DEFAULT 0 CHECK(repair_count BETWEEN 0 AND 3), version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), FOREIGN KEY(project_id) REFERENCES builder.projects(id), FOREIGN KEY(project_id,milestone_id) REFERENCES builder.milestones(project_id,id)
);

CREATE TABLE builder.task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, predecessor_task_id uuid NOT NULL, successor_task_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUPERSEDED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,predecessor_task_id,successor_task_id), CHECK(predecessor_task_id <> successor_task_id),
  FOREIGN KEY(project_id,predecessor_task_id) REFERENCES builder.tasks(project_id,id), FOREIGN KEY(project_id,successor_task_id) REFERENCES builder.tasks(project_id,id)
);

CREATE FUNCTION builder.reject_task_dependency_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.project_id::text || ':task-dependencies', 0));
  IF NEW.status <> 'ACTIVE' THEN RETURN NEW; END IF;
  IF EXISTS (
    WITH RECURSIVE reachable(task_id) AS (
      SELECT NEW.successor_task_id
      UNION
      SELECT dependency.successor_task_id FROM builder.task_dependencies dependency
      JOIN reachable ON dependency.predecessor_task_id = reachable.task_id
      WHERE dependency.project_id = NEW.project_id AND dependency.status = 'ACTIVE' AND dependency.id <> NEW.id
    ) SELECT 1 FROM reachable WHERE task_id = NEW.predecessor_task_id
  ) THEN RAISE EXCEPTION 'task dependency cycle' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER task_dependencies_acyclic BEFORE INSERT OR UPDATE ON builder.task_dependencies
FOR EACH ROW EXECUTE FUNCTION builder.reject_task_dependency_cycle();

CREATE TABLE builder.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, workflow_definition_id uuid NOT NULL, task_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('REQUESTED','DENIED','AUTHORIZED','QUEUED','CLAIMED','RUNNING','INFRA_RETRY','INFRA_FAILED','CANCELLING','CANCELLED','CANCEL_STUCK','AWAITING_OBLIGATIONS','REPAIR_SCHEDULED','COMPLETED','STOPPED')),
  policy_snapshot_id builder.opaque_ref NOT NULL, requested_by builder.opaque_ref NOT NULL,
  idempotency_key builder.opaque_ref NOT NULL, retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count >= 0), error_message builder.error_text,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0), terminal_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,idempotency_key), FOREIGN KEY(project_id) REFERENCES builder.projects(id),
  FOREIGN KEY(project_id,workflow_definition_id) REFERENCES builder.workflow_definitions(project_id,id), FOREIGN KEY(project_id,task_id) REFERENCES builder.tasks(project_id,id)
);

CREATE TABLE builder.attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, task_id uuid NOT NULL, workflow_run_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('INITIAL','REPAIR')), ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 3),
  status text NOT NULL CHECK(status IN ('CREATED','WAITING_FOR_LEASE','RUNNING','OUTPUT_PENDING','SEALED','EVALUATING','SUCCEEDED','FAILED_REPAIRABLE','FAILED_TERMINAL','CANCELLED','INFRA_FAILED')),
  base_revision_digest text CHECK(base_revision_digest IS NULL OR base_revision_digest ~ '^[0-9a-f]{64}$'),
  output_revision_digest text CHECK(output_revision_digest IS NULL OR output_revision_digest ~ '^[0-9a-f]{64}$'),
  retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count >= 0), error_message builder.error_text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), terminal_at timestamptz,
  UNIQUE(project_id,id), UNIQUE(project_id,task_id,ordinal), FOREIGN KEY(project_id) REFERENCES builder.projects(id),
  FOREIGN KEY(project_id,task_id) REFERENCES builder.tasks(project_id,id), FOREIGN KEY(project_id,workflow_run_id) REFERENCES builder.workflow_runs(project_id,id),
  CHECK((kind='INITIAL' AND ordinal=0) OR (kind='REPAIR' AND ordinal BETWEEN 1 AND 3))
);

CREATE FUNCTION builder.validate_attempt_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_task_id uuid;
BEGIN
  SELECT task_id INTO v_task_id FROM builder.workflow_runs WHERE project_id=NEW.project_id AND id=NEW.workflow_run_id;
  IF v_task_id IS DISTINCT FROM NEW.task_id THEN RAISE EXCEPTION 'attempt task does not match workflow execution task' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attempts_exact_identity BEFORE INSERT OR UPDATE ON builder.attempts FOR EACH ROW EXECUTE FUNCTION builder.validate_attempt_identity();

CREATE TABLE builder.agent_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, role text NOT NULL CHECK(role IN ('PLANNER','ARCHITECT','SECURITY','LEGAL','EXECUTOR','QA','REVIEWER')),
  adapter_version text NOT NULL, policy_version text NOT NULL, status text NOT NULL CHECK(status IN ('DRAFT','ACTIVE','DISABLED','SUPERSEDED')), version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,role,version), FOREIGN KEY(project_id) REFERENCES builder.projects(id)
);

CREATE TABLE builder.agent_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, provider_thread_ref builder.opaque_ref,
  status text NOT NULL CHECK(status IN ('CREATED','ACTIVE','SUSPENDED','CLOSED','FAILED')), retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count >= 0), error_message builder.error_text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(provider_thread_ref), FOREIGN KEY(project_id) REFERENCES builder.projects(id)
);

CREATE TABLE builder.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, attempt_id uuid NOT NULL, agent_definition_id uuid NOT NULL, agent_thread_id uuid,
  role text NOT NULL CHECK(role IN ('PLANNER','ARCHITECT','SECURITY','LEGAL','EXECUTOR','QA','REVIEWER')),
  provider_profile_id uuid, adapter_version builder.opaque_ref NOT NULL, sdk_runtime_version builder.opaque_ref NOT NULL,
  model_policy_id builder.opaque_ref NOT NULL, provider_thread_ref builder.opaque_ref,
  status text NOT NULL CHECK(status IN ('CREATED','QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','INFRA_RETRY','INFRA_FAILED')),
  retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count >= 0), error_message builder.error_text, started_at timestamptz, terminal_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), FOREIGN KEY(project_id) REFERENCES builder.projects(id), FOREIGN KEY(project_id,attempt_id) REFERENCES builder.attempts(project_id,id),
  FOREIGN KEY(project_id,agent_definition_id) REFERENCES builder.agent_definitions(project_id,id), FOREIGN KEY(project_id,agent_thread_id) REFERENCES builder.agent_threads(project_id,id)
);

CREATE FUNCTION builder.validate_agent_run_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_role text; v_adapter_version text; v_thread_ref text;
BEGIN
  SELECT role,adapter_version INTO v_role,v_adapter_version FROM builder.agent_definitions
    WHERE project_id=NEW.project_id AND id=NEW.agent_definition_id;
  IF v_role IS DISTINCT FROM NEW.role OR v_adapter_version IS DISTINCT FROM NEW.adapter_version THEN
    RAISE EXCEPTION 'agent run identity does not match agent definition' USING ERRCODE='23514';
  END IF;
  IF NEW.agent_thread_id IS NOT NULL THEN
    SELECT provider_thread_ref INTO v_thread_ref FROM builder.agent_threads WHERE project_id=NEW.project_id AND id=NEW.agent_thread_id;
    IF v_thread_ref IS DISTINCT FROM NEW.provider_thread_ref THEN
      RAISE EXCEPTION 'agent run provider thread does not match agent thread' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_runs_exact_identity BEFORE INSERT OR UPDATE ON builder.agent_runs FOR EACH ROW EXECUTE FUNCTION builder.validate_agent_run_identity();

CREATE TABLE builder.artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, artifact_type text NOT NULL CHECK(artifact_type IN ('PROJECT_BRIEF','SPECIFICATION','ARCHITECTURE','ROADMAP','TASK_SET','REVISION','EVIDENCE')),
  schema_version integer NOT NULL CHECK(schema_version > 0), revision integer NOT NULL CHECK(revision > 0), content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
  object_ref text, created_by_role text NOT NULL, status text NOT NULL CHECK(status IN ('DRAFT','FINALIZED','SUPERSEDED')), supersedes_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,artifact_type,revision), UNIQUE(project_id,content_digest), FOREIGN KEY(project_id) REFERENCES builder.projects(id),
  FOREIGN KEY(project_id,supersedes_id) REFERENCES builder.artifacts(project_id,id)
);

CREATE TABLE builder.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, subject_type text NOT NULL, subject_id uuid NOT NULL,
  decision text NOT NULL CHECK(decision IN ('PASS','PASS_WITH_REQUIREMENTS','BLOCK','COUNSEL_REQUIRED','APPROVED','REJECTED','STOP')),
  rationale_ref text, evidence_ref text, supersedes_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), FOREIGN KEY(project_id) REFERENCES builder.projects(id), FOREIGN KEY(project_id,supersedes_id) REFERENCES builder.decisions(project_id,id)
);

CREATE TABLE builder.findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, subject_type text NOT NULL, subject_id uuid NOT NULL, fingerprint text NOT NULL,
  severity text NOT NULL CHECK(severity IN ('UNCLASSIFIED','LOW','MEDIUM','HIGH','CRITICAL')),
  status text NOT NULL CHECK(status IN ('UNCLASSIFIED','OPEN','REMEDIATION_SUBMITTED','VERIFIED_CLOSED','FALSE_POSITIVE','RECLASSIFIED')),
  evidence_ref text, supersedes_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,fingerprint,id), FOREIGN KEY(project_id) REFERENCES builder.projects(id), FOREIGN KEY(project_id,supersedes_id) REFERENCES builder.findings(project_id,id)
);

CREATE TABLE builder.gate_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, gate_name text NOT NULL, subject_type text NOT NULL, subject_id uuid NOT NULL,
  result text NOT NULL CHECK(result IN ('PASS','FAIL','BLOCK','NOT_EVALUATED','STALE')), policy_version text NOT NULL, evidence_ref text, supersedes_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), FOREIGN KEY(project_id) REFERENCES builder.projects(id), FOREIGN KEY(project_id,supersedes_id) REFERENCES builder.gate_results(project_id,id)
);

CREATE TABLE builder.repository_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, provider_profile_id uuid, external_owner_id text, external_repository_id text,
  visibility text NOT NULL DEFAULT 'PRIVATE' CHECK(visibility = 'PRIVATE'), configuration_digest text,
  status text NOT NULL CHECK(status IN ('UNBOUND','PROVISIONING','BASELINE_VERIFYING','READY','DRIFTED','HELD','ARCHIVED')),
  gate_result_id uuid, idempotency_key builder.opaque_ref NOT NULL, retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count >= 0), error_message builder.error_text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,idempotency_key), UNIQUE(provider_profile_id,external_owner_id,external_repository_id), FOREIGN KEY(project_id) REFERENCES builder.projects(id),
  FOREIGN KEY(project_id,gate_result_id) REFERENCES builder.gate_results(project_id,id), CHECK(status <> 'READY' OR gate_result_id IS NOT NULL),
  CHECK ((provider_profile_id IS NULL AND external_owner_id IS NULL AND external_repository_id IS NULL) OR (provider_profile_id IS NOT NULL AND external_owner_id IS NOT NULL AND external_repository_id IS NOT NULL)),
  CHECK (status IN ('UNBOUND','PROVISIONING') OR external_repository_id IS NOT NULL)
);
CREATE UNIQUE INDEX repository_connections_one_active ON builder.repository_connections(project_id) WHERE status IN ('PROVISIONING','BASELINE_VERIFYING','READY');

CREATE FUNCTION builder.validate_repository_ready_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gate_result text; gate_name text;
BEGIN
  IF NEW.status <> 'READY' THEN RETURN NEW; END IF;
  SELECT result,gate_results.gate_name INTO gate_result,gate_name FROM builder.gate_results
    WHERE project_id=NEW.project_id AND id=NEW.gate_result_id;
  IF gate_result <> 'PASS' OR gate_name <> 'GITHUB' THEN RAISE EXCEPTION 'repository READY requires passing GITHUB gate' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER repository_ready_gate BEFORE INSERT OR UPDATE ON builder.repository_connections FOR EACH ROW EXECUTE FUNCTION builder.validate_repository_ready_gate();

CREATE TABLE builder.deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, artifact_id uuid NOT NULL,
  action_class text NOT NULL DEFAULT 'INTERNAL_CONTROLLED' CHECK(action_class = 'INTERNAL_CONTROLLED'),
  target_class text NOT NULL CHECK(target_class = 'LOCAL'),
  status text NOT NULL CHECK(status IN ('PREPARED','EXECUTING','SUCCEEDED','FAILED','UNKNOWN','RECONCILING','MANUAL_HOLD')),
  idempotency_key builder.opaque_ref NOT NULL, retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count >= 0), error_message builder.error_text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,idempotency_key), FOREIGN KEY(project_id) REFERENCES builder.projects(id), FOREIGN KEY(project_id,artifact_id) REFERENCES builder.artifacts(project_id,id)
);

CREATE TABLE builder.idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, actor_scope text NOT NULL, idempotency_key text NOT NULL, aggregate_type builder.short_code NOT NULL, aggregate_id uuid NOT NULL,
  request_digest text NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'), result_ref text, status text NOT NULL CHECK(status IN ('STARTED','COMPLETED','FAILED')), expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,actor_scope,idempotency_key), FOREIGN KEY(project_id) REFERENCES builder.projects(id)
);

CREATE TABLE builder.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, aggregate_type text NOT NULL, aggregate_id uuid NOT NULL,
  aggregate_sequence bigint NOT NULL CHECK(aggregate_sequence > 0), actor_pseudonym text NOT NULL CHECK(actor_pseudonym ~ '^[0-9a-f]{64}$'), transition builder.short_code NOT NULL,
  prior_state text, new_state text NOT NULL, reason_code text NOT NULL, policy_version text NOT NULL, evidence_refs text[] NOT NULL DEFAULT '{}',
  idempotency_key text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), previous_event_hash text, canonical_payload jsonb NOT NULL, canonical_version integer NOT NULL DEFAULT 1 CHECK(canonical_version=1), event_hash text NOT NULL CHECK(event_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,aggregate_type,aggregate_id,aggregate_sequence), UNIQUE(project_id,idempotency_key),
  FOREIGN KEY(project_id) REFERENCES builder.projects(id)
);

CREATE TABLE builder.actor_identity_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, actor_pseudonym text NOT NULL CHECK(actor_pseudonym ~ '^[0-9a-f]{64}$'),
  actor_identity_ref builder.opaque_ref NOT NULL, retention_until timestamptz NOT NULL, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ERASURE_PENDING','ERASED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,actor_pseudonym), FOREIGN KEY(project_id) REFERENCES builder.projects(id)
);

CREATE TABLE builder.audit_checkpoints(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL,sequence_start bigint NOT NULL CHECK(sequence_start>0),sequence_end bigint NOT NULL CHECK(sequence_end>=sequence_start),event_count integer NOT NULL CHECK(event_count=sequence_end-sequence_start+1),merkle_or_chain_root text NOT NULL CHECK(merkle_or_chain_root~'^[0-9a-f]{64}$'),signed_by builder.opaque_ref NOT NULL,signature builder.opaque_ref NOT NULL,trusted_timestamp_ref builder.opaque_ref NOT NULL,external_anchor_ref builder.opaque_ref NOT NULL,verification_state text NOT NULL CHECK(verification_state IN ('PENDING','ANCHORED','VERIFIED','GAP_DETECTED','INVALID')),verified_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(project_id,id),UNIQUE(project_id,sequence_end),UNIQUE(trusted_timestamp_ref),UNIQUE(external_anchor_ref),FOREIGN KEY(project_id) REFERENCES builder.projects(id));

CREATE FUNCTION builder.append_audit_event(p_project_id uuid,p_aggregate_type text,p_aggregate_id uuid,p_actor_identity_ref text,p_transition text,p_prior_state text,p_new_state text,p_reason_code text,p_policy_version text,p_idempotency_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,builder AS $$
DECLARE v_id uuid := gen_random_uuid(); v_sequence bigint; v_previous_hash text; v_actor_pseudonym text; v_event_hash text; v_occurred_at timestamptz:=clock_timestamp(); v_canonical jsonb;
BEGIN
  IF builder.current_project_id() IS DISTINCT FROM p_project_id AND NOT (session_user='builder_claim_login' AND p_aggregate_type='BACKGROUND_JOB' AND EXISTS(SELECT 1 FROM builder.background_jobs WHERE project_id=p_project_id AND id=p_aggregate_id AND claimed_by=session_user AND status='CLAIMED')) THEN RAISE EXCEPTION 'audit project context mismatch' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || p_aggregate_type || ':' || p_aggregate_id::text,0));
  SELECT aggregate_sequence,event_hash INTO v_sequence,v_previous_hash FROM builder.audit_events
    WHERE project_id=p_project_id AND aggregate_type=p_aggregate_type AND aggregate_id=p_aggregate_id ORDER BY aggregate_sequence DESC LIMIT 1 FOR UPDATE;
  v_sequence := coalesce(v_sequence,0)+1;
  v_actor_pseudonym := encode(public.digest(p_actor_identity_ref,'sha256'),'hex');
  v_canonical:=jsonb_build_object('id',v_id,'projectId',p_project_id,'aggregateType',p_aggregate_type,'aggregateId',p_aggregate_id,'sequence',v_sequence,'actor',v_actor_pseudonym,'transition',p_transition,'priorState',p_prior_state,'newState',p_new_state,'reasonCode',p_reason_code,'policyVersion',p_policy_version,'idempotencyKey',p_idempotency_key,'evidenceRefs',jsonb_build_array(),'occurredAt',v_occurred_at,'previousHash',v_previous_hash);
  v_event_hash := encode(public.digest(v_canonical::text,'sha256'),'hex');
  INSERT INTO builder.actor_identity_mappings(project_id,actor_pseudonym,actor_identity_ref,retention_until)
    VALUES(p_project_id,v_actor_pseudonym,p_actor_identity_ref,clock_timestamp()+interval '12 months') ON CONFLICT(project_id,actor_pseudonym) DO NOTHING;
  INSERT INTO builder.audit_events(id,project_id,aggregate_type,aggregate_id,aggregate_sequence,actor_pseudonym,transition,prior_state,new_state,reason_code,policy_version,idempotency_key,occurred_at,previous_event_hash,canonical_payload,event_hash)
    VALUES(v_id,p_project_id,p_aggregate_type,p_aggregate_id,v_sequence,v_actor_pseudonym,p_transition,p_prior_state,p_new_state,p_reason_code,p_policy_version,p_idempotency_key,v_occurred_at,v_previous_hash,v_canonical,v_event_hash);
  RETURN v_id;
END $$;

CREATE FUNCTION builder.verify_audit_chain(p_project_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF builder.current_project_id() IS DISTINCT FROM p_project_id THEN RAISE EXCEPTION 'audit verification context mismatch' USING ERRCODE='42501'; END IF;
  RETURN NOT EXISTS(SELECT 1 FROM (SELECT event.*,lag(event_hash) OVER(PARTITION BY aggregate_type,aggregate_id ORDER BY aggregate_sequence) expected_previous,row_number() OVER(PARTITION BY aggregate_type,aggregate_id ORDER BY aggregate_sequence) expected_sequence FROM builder.audit_events event WHERE project_id=p_project_id) chained WHERE aggregate_sequence<>expected_sequence OR previous_event_hash IS DISTINCT FROM expected_previous OR canonical_version<>1 OR canonical_payload<>jsonb_build_object('id',id,'projectId',project_id,'aggregateType',aggregate_type,'aggregateId',aggregate_id,'sequence',aggregate_sequence,'actor',actor_pseudonym,'transition',transition,'priorState',prior_state,'newState',new_state,'reasonCode',reason_code,'policyVersion',policy_version,'idempotencyKey',idempotency_key,'evidenceRefs',to_jsonb(evidence_refs),'occurredAt',occurred_at,'previousHash',previous_event_hash) OR event_hash<>encode(public.digest(canonical_payload::text,'sha256'),'hex'));
END $$;

CREATE TABLE builder.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, job_type text NOT NULL, aggregate_type text NOT NULL, aggregate_id uuid NOT NULL,
  schema_version integer NOT NULL CHECK(schema_version > 0), policy_version text NOT NULL, idempotency_key text NOT NULL,
  expected_aggregate_version integer NOT NULL CHECK(expected_aggregate_version > 0), trace_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('PENDING','CLAIMED','RUNNING','RETRY_SCHEDULED','SUCCEEDED','FAILED','CANCELLED','DEAD_LETTER')),
  retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count >= 0), max_retries integer NOT NULL DEFAULT 3 CHECK(max_retries BETWEEN 0 AND 20),
  error_message builder.error_text, available_at timestamptz NOT NULL DEFAULT clock_timestamp(), claimed_at timestamptz, claimed_by builder.opaque_ref, terminal_at timestamptz,
  claimed_capability_hash text CHECK(claimed_capability_hash IS NULL OR claimed_capability_hash ~ '^[0-9a-f]{64}$'), capability_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(project_id,idempotency_key), FOREIGN KEY(project_id) REFERENCES builder.projects(id)
);
CREATE INDEX background_jobs_claim_idx ON builder.background_jobs(status,available_at,created_at) WHERE status IN ('PENDING','RETRY_SCHEDULED');

CREATE TABLE builder.worker_identities (
  login_role name PRIMARY KEY, worker_type text NOT NULL CHECK(worker_type IN ('CONTROL','EXECUTION','REVIEW','QUALITY','RECONCILIATION','AUDIT','PRIVACY','NOTIFICATION')),
  status text NOT NULL CHECK(status IN ('ACTIVE','DISABLED')), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE builder.worker_job_type_permissions (
  worker_type text NOT NULL, job_type text NOT NULL, PRIMARY KEY(worker_type,job_type),
  CHECK(worker_type IN ('CONTROL','EXECUTION','REVIEW','QUALITY','RECONCILIATION','AUDIT','PRIVACY','NOTIFICATION'))
);
INSERT INTO builder.worker_identities(login_role,worker_type,status) VALUES ('builder_claim_login','CONTROL','ACTIVE');
INSERT INTO builder.worker_job_type_permissions(worker_type,job_type) VALUES ('CONTROL','CONTROL'),('RECONCILIATION','RECONCILIATION'),('AUDIT','AUDIT'),('PRIVACY','PRIVACY'),('NOTIFICATION','NOTIFICATION'),('QUALITY','QUALITY'),('REVIEW','REVIEW'),('EXECUTION','EXECUTION');

CREATE FUNCTION builder.claim_background_job()
RETURNS TABLE(id uuid, project_id uuid, job_type text, aggregate_type text, aggregate_id uuid, retry_count integer, project_capability text, capability_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, builder AS $$
DECLARE v_worker_type text; v_capability text; v_job builder.background_jobs%ROWTYPE; v_prior_status text;
BEGIN
  SELECT worker_type INTO v_worker_type FROM builder.worker_identities WHERE login_role=session_user AND status='ACTIVE';
  IF v_worker_type IS NULL THEN RAISE EXCEPTION 'unmapped worker login' USING ERRCODE='42501'; END IF;
  v_capability := encode(public.gen_random_bytes(32),'base64');
  WITH candidate AS (
      SELECT job.id FROM builder.background_jobs job
      JOIN builder.worker_job_type_permissions permission ON permission.worker_type=v_worker_type AND permission.job_type=job.job_type
      WHERE job.status IN ('PENDING','RETRY_SCHEDULED') AND job.available_at <= clock_timestamp()
      ORDER BY job.available_at, job.created_at, job.id FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE builder.background_jobs job SET status='CLAIMED',claimed_at=clock_timestamp(),claimed_by=session_user,
      claimed_capability_hash=encode(public.digest(v_capability,'sha256'),'hex'),capability_expires_at=clock_timestamp()+interval '60 seconds'
    FROM candidate WHERE job.id = candidate.id
    RETURNING job.* INTO v_job;
  IF v_job.id IS NULL THEN RETURN; END IF;
  v_prior_status := CASE WHEN v_job.retry_count > 0 THEN 'RETRY_SCHEDULED' ELSE 'PENDING' END;
  PERFORM builder.append_audit_event(v_job.project_id,'BACKGROUND_JOB',v_job.id,session_user::text,'JOB_CLAIMED',v_prior_status,'CLAIMED','QUEUE_CLAIM','1',v_job.id::text);
  RETURN QUERY SELECT v_job.id,v_job.project_id,v_job.job_type,v_job.aggregate_type,v_job.aggregate_id,v_job.retry_count,v_capability,v_job.capability_expires_at;
END $$;

CREATE FUNCTION builder.authorize_job_claim(p_job_id uuid,p_capability text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,builder AS $$
DECLARE v_project_id uuid;
BEGIN
  IF octet_length(p_capability) < 32 OR octet_length(p_capability) > 256 THEN
    RAISE EXCEPTION 'invalid claim capability' USING ERRCODE='42501';
  END IF;
  UPDATE builder.background_jobs job SET claimed_capability_hash=NULL
    WHERE job.id=p_job_id AND job.status='CLAIMED' AND job.claimed_by=session_user
      AND job.capability_expires_at > clock_timestamp()
      AND job.claimed_capability_hash=encode(public.digest(p_capability,'sha256'),'hex') RETURNING job.project_id INTO v_project_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'unauthorized or expired claim' USING ERRCODE='42501'; END IF;
  RETURN v_project_id;
END $$;

CREATE TABLE builder.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, message_id uuid NOT NULL DEFAULT gen_random_uuid(), event_type text NOT NULL,
  aggregate_type text NOT NULL, aggregate_id uuid NOT NULL, schema_version integer NOT NULL CHECK(schema_version > 0), policy_version text NOT NULL,
  idempotency_key text NOT NULL, status text NOT NULL CHECK(status IN ('PENDING','DISPATCHED','FAILED','DEAD_LETTER')),
  retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count >= 0), max_retries integer NOT NULL DEFAULT 3 CHECK(max_retries BETWEEN 0 AND 20), error_message builder.error_text, available_at timestamptz NOT NULL DEFAULT clock_timestamp(), dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(message_id), UNIQUE(project_id,idempotency_key), FOREIGN KEY(project_id) REFERENCES builder.projects(id)
);

CREATE TABLE builder.inbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, consumer_identity text NOT NULL, message_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('RECEIVED','PROCESSING','PROCESSED','FAILED')),
  retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count >= 0), error_message builder.error_text, processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,id), UNIQUE(consumer_identity,message_id), FOREIGN KEY(project_id) REFERENCES builder.projects(id)
);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['projects','milestones','project_briefs','product_specifications','workflow_definitions','workflow_stages','tasks','task_dependencies','workflow_runs','attempts','agent_definitions','agent_threads','agent_runs','artifacts','decisions','findings','gate_results','repository_connections','deployments','idempotency_records','audit_events','audit_checkpoints','actor_identity_mappings','background_jobs','outbox_events','inbox_events']
  LOOP
    EXECUTE format('ALTER TABLE builder.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE builder.%I FORCE ROW LEVEL SECURITY', table_name);
    IF table_name = 'projects' THEN
      EXECUTE format('CREATE POLICY project_isolation ON builder.%I USING (id = builder.current_project_id()) WITH CHECK (id = builder.current_project_id())', table_name);
    ELSE
      EXECUTE format('CREATE POLICY project_isolation ON builder.%I USING (project_id = builder.current_project_id()) WITH CHECK (project_id = builder.current_project_id())', table_name);
    END IF;
    IF table_name IN ('audit_events','audit_checkpoints') THEN
      EXECUTE format('GRANT SELECT ON builder.%I TO builder_runtime',table_name);
    ELSIF table_name <> 'actor_identity_mappings' THEN
      EXECUTE format('GRANT SELECT, INSERT ON builder.%I TO builder_runtime', table_name);
    END IF;
    IF table_name NOT IN ('audit_events','decisions','findings','gate_results','artifacts','product_specifications') THEN
      EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON builder.%I FOR EACH ROW EXECUTE FUNCTION builder.touch_updated_at()', table_name);
    END IF;
  END LOOP;
END $$;

CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON builder.audit_events FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER decisions_immutable BEFORE UPDATE OR DELETE ON builder.decisions FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER findings_immutable BEFORE UPDATE OR DELETE ON builder.findings FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER gate_results_immutable BEFORE UPDATE OR DELETE ON builder.gate_results FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER artifacts_immutable BEFORE UPDATE OR DELETE ON builder.artifacts FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();
CREATE TRIGGER specifications_immutable BEFORE UPDATE OR DELETE ON builder.product_specifications FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();

GRANT USAGE ON SCHEMA builder TO builder_runtime;
GRANT EXECUTE ON FUNCTION builder.current_project_id() TO builder_runtime;
GRANT UPDATE(status,result_ref,updated_at) ON builder.idempotency_records TO builder_runtime;
GRANT SELECT, UPDATE ON builder.background_jobs TO builder_queue_owner;
GRANT SELECT ON builder.worker_identities,builder.worker_job_type_permissions TO builder_queue_owner;
GRANT SELECT,INSERT ON builder.audit_events,builder.actor_identity_mappings TO builder_audit_writer;
GRANT USAGE,CREATE ON SCHEMA builder TO builder_queue_owner,builder_audit_writer,builder_role_provisioner;
ALTER FUNCTION builder.provision_runtime_password(text) OWNER TO builder_role_provisioner;
REVOKE ALL ON FUNCTION builder.provision_runtime_password(text) FROM PUBLIC;
ALTER FUNCTION builder.provision_context_password(text) OWNER TO builder_role_provisioner;
REVOKE ALL ON FUNCTION builder.provision_context_password(text) FROM PUBLIC;
ALTER FUNCTION builder.provision_claim_password(text) OWNER TO builder_role_provisioner;
REVOKE ALL ON FUNCTION builder.provision_claim_password(text) FROM PUBLIC;
ALTER FUNCTION builder.append_audit_event(uuid,text,uuid,text,text,text,text,text,text,text) OWNER TO builder_audit_writer;
REVOKE ALL ON FUNCTION builder.append_audit_event(uuid,text,uuid,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.append_audit_event(uuid,text,uuid,text,text,text,text,text,text,text) TO builder_runtime,builder_queue_owner;
REVOKE ALL ON FUNCTION builder.verify_audit_chain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.verify_audit_chain(uuid) TO builder_runtime;
ALTER FUNCTION builder.claim_background_job() OWNER TO builder_queue_owner;
REVOKE ALL ON FUNCTION builder.claim_background_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.claim_background_job() TO builder_job_claimer;
ALTER FUNCTION builder.authorize_job_claim(uuid,text) OWNER TO builder_queue_owner;
REVOKE ALL ON FUNCTION builder.authorize_job_claim(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.authorize_job_claim(uuid,text) TO builder_job_claimer;
GRANT USAGE ON SCHEMA builder TO builder_job_claimer,builder_queue_owner,builder_audit_writer;
GRANT USAGE ON SCHEMA builder TO builder_context_issuer;
GRANT INSERT(token_hash,project_id,capability_id,subject,actor_scope,audience,operation,expires_at) ON builder.project_context_grants TO builder_context_issuer;
ALTER FUNCTION builder.issue_project_context(uuid,uuid,text,text,text,text,timestamptz) OWNER TO builder_context_issuer;
REVOKE ALL ON FUNCTION builder.issue_project_context(uuid,uuid,text,text,text,text,timestamptz),builder.consume_project_context(text),builder.current_project_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.issue_project_context(uuid,uuid,text,text,text,text,timestamptz) TO builder_context_issuer;
GRANT EXECUTE ON FUNCTION builder.consume_project_context(text),builder.current_project_id() TO builder_runtime;
GRANT SELECT ON builder.background_jobs TO builder_audit_writer;
REVOKE CREATE ON SCHEMA builder FROM builder_queue_owner,builder_audit_writer,builder_role_provisioner;
REVOKE ALL ON public.schema_migrations FROM builder_runtime;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['projects','milestones','project_briefs','product_specifications','workflow_definitions','workflow_stages','tasks','task_dependencies','workflow_runs','attempts','agent_definitions','agent_threads','agent_runs','artifacts','decisions','findings','gate_results','repository_connections','deployments','idempotency_records','audit_events','audit_checkpoints','actor_identity_mappings','background_jobs','outbox_events','inbox_events']
  LOOP EXECUTE format('ALTER TABLE builder.%I OWNER TO builder_schema_owner', table_name); END LOOP;
END $$;
ALTER TABLE builder.worker_identities OWNER TO builder_schema_owner;
ALTER TABLE builder.worker_job_type_permissions OWNER TO builder_schema_owner;
ALTER TABLE builder.project_context_grants OWNER TO builder_schema_owner;
ALTER DOMAIN builder.short_code OWNER TO builder_schema_owner;
ALTER DOMAIN builder.opaque_ref OWNER TO builder_schema_owner;
ALTER DOMAIN builder.error_text OWNER TO builder_schema_owner;
ALTER FUNCTION builder.touch_updated_at() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.reject_mutation() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.reject_task_dependency_cycle() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_attempt_identity() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_agent_run_identity() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.validate_repository_ready_gate() OWNER TO builder_schema_owner;
ALTER FUNCTION builder.verify_audit_chain(uuid) OWNER TO builder_schema_owner;
ALTER FUNCTION builder.consume_project_context(text) OWNER TO builder_schema_owner;
ALTER FUNCTION builder.current_project_id() OWNER TO builder_schema_owner;
ALTER SCHEMA builder OWNER TO builder_schema_owner;
