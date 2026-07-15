-- AGENT-REGISTRY-IDENTITY-FIX-02. Canonical, immutable agent identity binding.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM builder.agent_registry_versions
    GROUP BY agent_key
    HAVING count(DISTINCT agent_id) > 1
  ) THEN
    RAISE EXCEPTION 'agent registry history contains one agent_key bound to multiple agent_id values'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM builder.agent_registry_versions
    GROUP BY agent_id
    HAVING count(DISTINCT agent_key) > 1
  ) THEN
    RAISE EXCEPTION 'agent registry history contains one agent_id bound to multiple agent_key values'
      USING ERRCODE = '23514';
  END IF;
END $$;

CREATE TABLE builder.agent_registry_identities (
  agent_key text NOT NULL CHECK (agent_key ~ '^[a-z][a-z0-9-]{0,63}$'),
  agent_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by text NOT NULL CHECK (created_by ~ '^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$'),
  CONSTRAINT agent_registry_identities_pkey PRIMARY KEY (agent_key),
  CONSTRAINT agent_registry_identities_agent_id_unique UNIQUE (agent_id),
  CONSTRAINT agent_registry_identities_key_id_unique UNIQUE (agent_key, agent_id)
);

INSERT INTO builder.agent_registry_identities(agent_key,agent_id,created_at,created_by)
SELECT DISTINCT ON (agent_key) agent_key,agent_id,created_at,created_by
FROM builder.agent_registry_versions
ORDER BY agent_key,version,created_at,id;

ALTER TABLE builder.agent_registry_versions
  ADD CONSTRAINT agent_registry_versions_identity_fk
  FOREIGN KEY (agent_key,agent_id)
  REFERENCES builder.agent_registry_identities(agent_key,agent_id);

CREATE TRIGGER agent_registry_identities_immutable
  BEFORE UPDATE OR DELETE ON builder.agent_registry_identities
  FOR EACH ROW EXECUTE FUNCTION builder.reject_mutation();

ALTER TABLE builder.agent_registry_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.agent_registry_identities FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_registry_identity_capability_context ON builder.agent_registry_identities
  USING (builder.current_project_id() IS NOT NULL)
  WITH CHECK (builder.current_project_id() IS NOT NULL);
GRANT SELECT, INSERT ON builder.agent_registry_identities TO builder_runtime;
ALTER TABLE builder.agent_registry_identities OWNER TO builder_schema_owner;
