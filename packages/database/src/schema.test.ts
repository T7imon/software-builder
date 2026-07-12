import { readFileSync } from "node:fs";
import { dirname,join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe,expect,it } from "vitest";
import type { ProjectId } from "@software-builder/core";
import { HmacCapabilityAuthority } from "./capabilities.js";
import { validatePersistenceInput } from "./index.js";
import { projectStatuses,taskStatuses } from "./types.js";
const sql=readFileSync(join(dirname(fileURLToPath(import.meta.url)),"..","migrations","001_persistence_foundation.sql"),"utf8");

describe("Persistence-Schema",()=>{
  it("bildet alle Datenbereiche sowie Milestone und Attempt ab",()=>{
    for(const table of ["projects","project_briefs","product_specifications","workflow_definitions","workflow_runs","workflow_stages","milestones","tasks","task_dependencies","attempts","agent_definitions","agent_runs","agent_threads","artifacts","decisions","findings","gate_results","repository_connections","deployments","audit_events","background_jobs","outbox_events","inbox_events"]) expect(sql).toContain(`CREATE TABLE builder.${table}`);
  });
  it("haertet Rollen, Claims, Audit, Migration und Architekturinvarianten",()=>{
    expect(sql).toContain("builder_app_login LOGIN"); expect(sql).toContain("GRANT builder_runtime TO builder_app_login");
    expect(sql).toContain("builder_context_login LOGIN"); expect(sql).toContain("issue_project_context"); expect(sql).toContain("consume_project_context"); expect(sql).toContain("consumed_txid=txid_current()");
    expect(sql).toContain("capability_id uuid UNIQUE NOT NULL"); expect(sql).toContain("operation builder.short_code NOT NULL"); expect(sql).toContain("session_user<>'builder_app_login'");
    expect(sql).toContain("WITH ADMIN TRUE, INHERIT FALSE, SET FALSE"); expect(sql).toContain("provision_context_password");
    expect(sql).not.toContain("set_config('builder.project_id'");
    expect(sql).not.toContain("GRANT builder_runtime TO CURRENT_USER"); expect(sql).toContain("append_audit_event"); expect(sql).toContain("session_user");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED"); expect(sql).toContain("FORCE ROW LEVEL SECURITY"); expect(sql).toContain("task dependency cycle");
    expect(sql).toContain("authorize_job_claim"); expect(sql).toContain("milestones_one_active_per_project");
    expect(sql).toContain("repository_connections_one_active"); expect(sql).toContain("UNIQUE(provider_profile_id,external_owner_id,external_repository_id)"); expect(sql).toContain("CREATE TABLE builder.audit_checkpoints"); expect(sql).toContain("trusted_timestamp_ref"); expect(sql).toContain("external_anchor_ref"); expect(sql).toContain("verify_audit_chain"); expect(sql).toContain("canonical_payload"); expect(sql).toContain("jsonb_build_object('id',v_id");
    expect(sql).toContain("aggregate_type builder.short_code NOT NULL, aggregate_id uuid NOT NULL"); expect(sql).toContain("runtime password provisioner lacks ADMIN permission");
    expect(sql).not.toContain("SELECT, INSERT, UPDATE, DELETE ON builder.%I TO builder_runtime");
    expect(sql).toContain("kind='INITIAL' AND ordinal=0"); expect(sql).toContain("target_class = 'LOCAL'"); expect(sql).not.toMatch(/redis|rabbitmq|secret_value|api_key/i);
  });
  it("bewahrt die genehmigten fachlichen Identitaeten",()=>{
    expect(sql).toContain("planner_m_id"); expect(sql).toContain("attempts_exact_identity"); expect(sql).toContain("agent_runs_exact_identity");
    expect(sql).toContain("base_revision_digest"); expect(sql).toContain("output_revision_digest");
    for(const field of ["provider_profile_id","adapter_version","sdk_runtime_version","model_policy_id","provider_thread_ref"]) expect(sql).toContain(field);
    expect(sql).toMatch(/workflow_runs[\s\S]*task_id uuid NOT NULL/);
  });
  it("validiert opaque Capabilities, Ablauf und Signatur",async()=>{
    let now=new Date("2026-01-01T00:00:00Z"); const authority=new HmacCapabilityAuthority(new Uint8Array(32).fill(7),()=>now); const id="00000000-0000-4000-8000-000000000001" as ProjectId;
    const capability=authority.issueProject(id,{subject:"test-actor",actorScope:"TEST",allowedRoles:["TEST"],allowedOperations:["task:read"]},1000); expect((await authority.verifyProject(capability,{audience:"persistence",operation:"task:read"})).projectId).toBe(id);
    await expect(authority.verifyBootstrap(capability as never,"test-actor","TEST")).rejects.toThrow(/BootstrapCapability/);
    await expect(authority.verifyProject(`${capability}x` as never,{audience:"persistence",operation:"task:read"})).rejects.toThrow(/ungueltig/);
    await expect(authority.verifyProject(capability,{audience:"persistence",operation:"task:append"})).rejects.toThrow(/Operation/);
    expect(()=>authority.issueProject(id,{subject:"",actorScope:"TEST",allowedRoles:["TEST"],allowedOperations:["task:read"]})).toThrow(/subject/);
    expect(()=>authority.issueProject(id,{subject:"test-actor",actorScope:"TEST",allowedRoles:["TEST"],allowedOperations:["task:*"]})).toThrow(/Aktionen/);
    expect(()=>authority.issueProject(id,{subject:"test-actor",actorScope:"TEST",allowedRoles:["OTHER"],allowedOperations:["task:read"]},1000)).toThrow(/Rollen/);
    now=new Date("2026-01-01T00:00:02Z"); await expect(authority.verifyProject(capability,{audience:"persistence",operation:"task:read"})).rejects.toThrow(/abgelaufen/);
  });
  it("exportiert eindeutige Statusmengen",()=>{ expect(new Set(projectStatuses).size).toBe(projectStatuses.length); expect(new Set(taskStatuses).size).toBe(taskStatuses.length); });
  it("weist Secret-Material und ungebundenen Freitext an der Repository-Grenze ab",()=>{ for(const secret of ["api_key=should-never-persist","ghp_abcdefghijklmnopqrstuvwxyz123456","glpat-abcdefghijklmnopqrstuvwxyz","xoxb-12345678901234567890","npm_abcdefghijklmnopqrstuvwxyz","AKIAABCDEFGHIJKLMNOP","Bearer abcdefghijklmnop","eyJabc.def.ghi","https://user:credential@example.test","AWS_SECRET_ACCESS_KEY=value","-----BEGIN RSA PRIVATE KEY-----"]) expect(()=>validatePersistenceInput({errorMessage:secret})).toThrow(/Secret/); expect(()=>validatePersistenceInput({clientSecret:"placeholder"})).toThrow(/Secret-Feld/); expect(()=>validatePersistenceInput("x".repeat(2049))).toThrow(/2048/); });
});
