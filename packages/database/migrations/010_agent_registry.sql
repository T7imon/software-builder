CREATE TABLE builder.agent_registry_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  agent_key text NOT NULL CHECK (agent_key ~ '^[a-z][a-z0-9-]{0,63}$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 128),
  role text NOT NULL CHECK (role IN ('ORCHESTRATOR','PLANNER','ARCHITECT','EXECUTOR','QA','REVIEWER','SECURITY','LEGAL_DE_EU')),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 512),
  version integer NOT NULL CHECK (version > 0),
  revision integer NOT NULL CHECK (revision > 0 AND revision = version),
  status text NOT NULL CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  instructions text NOT NULL CHECK (length(btrim(instructions)) BETWEEN 1 AND 16384),
  allowed_capabilities text[] NOT NULL DEFAULT '{}',
  forbidden_capabilities text[] NOT NULL DEFAULT '{}',
  model_config jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by text NOT NULL CHECK (created_by ~ '^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$'),
  UNIQUE (agent_key, version),
  UNIQUE (agent_id, version),
  CHECK (model_config IS NULL OR (
    jsonb_typeof(model_config) = 'object'
    AND model_config - ARRAY['model','reasoningLevel','timeoutMs','maxAttempts'] = '{}'::jsonb
    AND (NOT model_config ? 'model' OR (jsonb_typeof(model_config->'model')='string' AND length(btrim(model_config->>'model')) BETWEEN 1 AND 128))
    AND (NOT model_config ? 'reasoningLevel' OR model_config->>'reasoningLevel' IN ('LOW','MEDIUM','HIGH'))
    AND (NOT model_config ? 'timeoutMs' OR (jsonb_typeof(model_config->'timeoutMs')='number' AND (model_config->>'timeoutMs')::numeric BETWEEN 100 AND 1800000 AND (model_config->>'timeoutMs')::numeric % 1 = 0))
    AND (NOT model_config ? 'maxAttempts' OR (jsonb_typeof(model_config->'maxAttempts')='number' AND (model_config->>'maxAttempts')::numeric BETWEEN 1 AND 10 AND (model_config->>'maxAttempts')::numeric % 1 = 0))
  )),
  CHECK (NOT (allowed_capabilities && forbidden_capabilities)),
  CHECK (instructions !~* '(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|npm_[a-z0-9]{20,}|pypi-[a-z0-9_-]{20,}|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|bearer\s+[a-z0-9._~+/-]{12,}|(api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\s*[:=]|aws[_-]?(access|secret)|[a-z][a-z0-9+.-]*://[^/@\s]+:[^/@\s]+@|BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY)'),
  CHECK (model_config IS NULL OR model_config::text !~* '(api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|bearer\\s+)')
);

CREATE UNIQUE INDEX agent_registry_one_active_per_key
  ON builder.agent_registry_versions(agent_key) WHERE status = 'ACTIVE';

CREATE FUNCTION builder.enforce_agent_registry_immutability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.id,OLD.agent_id,OLD.agent_key,OLD.display_name,OLD.role,OLD.description,OLD.version,OLD.revision,
         OLD.instructions,OLD.allowed_capabilities,OLD.forbidden_capabilities,OLD.model_config,OLD.created_at,OLD.created_by)
     IS DISTINCT FROM
     ROW(NEW.id,NEW.agent_id,NEW.agent_key,NEW.display_name,NEW.role,NEW.description,NEW.version,NEW.revision,
         NEW.instructions,NEW.allowed_capabilities,NEW.forbidden_capabilities,NEW.model_config,NEW.created_at,NEW.created_by)
  THEN RAISE EXCEPTION 'agent registry revisions are immutable' USING ERRCODE='23514'; END IF;
  IF NOT ((OLD.status='DRAFT' AND NEW.status='ACTIVE') OR (OLD.status='ACTIVE' AND NEW.status='RETIRED'))
  THEN RAISE EXCEPTION 'invalid agent registry status transition' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_registry_versions_immutable BEFORE UPDATE ON builder.agent_registry_versions
  FOR EACH ROW EXECUTE FUNCTION builder.enforce_agent_registry_immutability();

ALTER TABLE builder.agent_registry_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.agent_registry_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_registry_capability_context ON builder.agent_registry_versions
  USING (builder.current_project_id() IS NOT NULL)
  WITH CHECK (builder.current_project_id() IS NOT NULL);
GRANT SELECT, INSERT ON builder.agent_registry_versions TO builder_runtime;
GRANT UPDATE(status) ON builder.agent_registry_versions TO builder_runtime;
ALTER TABLE builder.agent_registry_versions OWNER TO builder_schema_owner;
ALTER FUNCTION builder.enforce_agent_registry_immutability() OWNER TO builder_schema_owner;
