-- PostgreSQL's ARE engine rejects counted repetitions above 255. Length is
-- already bounded independently, so keep the character allowlist unbounded.
ALTER DOMAIN builder.opaque_ref DROP CONSTRAINT opaque_ref_check;
ALTER DOMAIN builder.opaque_ref ADD CONSTRAINT opaque_ref_check
  CHECK (octet_length(VALUE) BETWEEN 1 AND 512 AND VALUE ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$');

-- append_audit_event is SECURITY DEFINER under builder_audit_writer and calls
-- this function after PUBLIC execute has been revoked by the foundation.
GRANT EXECUTE ON FUNCTION builder.current_project_id() TO builder_audit_writer;
GRANT UPDATE ON builder.audit_events TO builder_audit_writer;

-- A signed capability may authorize several operation-bound transactions;
-- each issued context token remains one-time through consumed_at/pid/txid.
ALTER TABLE builder.project_context_grants DROP CONSTRAINT project_context_grants_capability_id_key;
CREATE INDEX project_context_grants_capability_id_idx ON builder.project_context_grants(capability_id);
