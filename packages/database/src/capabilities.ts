import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import type { ProjectId } from "@software-builder/core";
import type { BootstrapCapability, BootstrapCapabilityVerifier, CapabilityRequirement, ProjectCapability, ProjectCapabilityVerifier, VerifiedProjectCapability } from "./types.js";

const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (key: Uint8Array, body: string): string => createHmac("sha256", key).update(body).digest("base64url");
const claimValue = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/;
const operationValue = /^[a-z][a-z0-9_]*:(?:read|append|verify|create)$/;

function assertClaim(value: string, name: string): void {
  if (!claimValue.test(value)) throw new Error(`${name} ist kein gueltiger Capability-Claim.`);
}

export class HmacCapabilityAuthority implements ProjectCapabilityVerifier, BootstrapCapabilityVerifier {
  constructor(private readonly key: Uint8Array = randomBytes(32), private readonly now: () => Date = () => new Date()) {
    if (key.byteLength < 32) throw new Error("Capability-Schluessel muss mindestens 256 Bit haben.");
  }
  issueProject(projectId: ProjectId, claims: { subject: string; actorScope: string; audience?: "persistence"; allowedOperations: readonly string[]; allowedRoles:readonly string[] }, lifetimeMs = 60_000): ProjectCapability {
    assertClaim(projectId, "projectId"); assertClaim(claims.subject, "subject"); assertClaim(claims.actorScope, "actorScope");
    if (claims.audience !== undefined && claims.audience !== "persistence") throw new Error("Capability-Audience ungueltig.");
    if (claims.allowedOperations.length === 0 || !claims.allowedOperations.every((value) => operationValue.test(value))) throw new Error("Capability-Aktionen ungueltig.");
    if (claims.allowedRoles.length === 0 || !claims.allowedRoles.every((value) => claimValue.test(value)) || !claims.allowedRoles.includes(claims.actorScope)) throw new Error("Capability-Rollen ungueltig.");
    if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 120_000) throw new Error("Capability-Laufzeit ungueltig.");
    const payload = encode({ kind: "project", projectId, subject: claims.subject, actorScope: claims.actorScope, audience: claims.audience ?? "persistence", allowedOperations: claims.allowedOperations, allowedRoles:claims.allowedRoles, expiresAt: this.now().getTime() + lifetimeMs, capabilityId: randomUUID() });
    return `${payload}.${sign(this.key, payload)}` as ProjectCapability;
  }
  issueBootstrap(subject: string, actorScope: string, lifetimeMs = 60_000): BootstrapCapability {
    assertClaim(subject, "subject"); assertClaim(actorScope, "actorScope");
    if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 120_000) throw new Error("Capability-Laufzeit ungueltig.");
    const payload = encode({ kind: "bootstrap", subject, actorScope, audience: "persistence", operation: "project:create", expiresAt: this.now().getTime() + lifetimeMs, capabilityId: randomUUID() });
    return `${payload}.${sign(this.key, payload)}` as BootstrapCapability;
  }
  private parse(capability: string): Record<string, unknown> {
    const [payload, signature, extra] = capability.split(".");
    if (!payload || !signature || extra) throw new Error("Capability ungueltig.");
    const expected = Buffer.from(sign(this.key, payload));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Capability ungueltig.");
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= this.now().getTime() || typeof parsed.capabilityId !== "string") throw new Error("Capability abgelaufen oder ungueltig.");
    return parsed;
  }
  async verifyBootstrap(capability: BootstrapCapability, subject: string, actorScope: string): Promise<void> {
    assertClaim(subject, "subject"); assertClaim(actorScope, "actorScope");
    const parsed=this.parse(capability);
    if(parsed.kind!=="bootstrap" || parsed.audience!=="persistence" || parsed.operation!=="project:create" || parsed.subject!==subject || parsed.actorScope!==actorScope) throw new Error("BootstrapCapability ungueltig.");
  }
  async verifyProject(capability: ProjectCapability, requirement: CapabilityRequirement): Promise<VerifiedProjectCapability> {
    if (requirement.audience !== "persistence" || !operationValue.test(requirement.operation)) throw new Error("Capability-Anforderung ungueltig.");
    const parsed=this.parse(capability);
    if(parsed.kind!=="project" || typeof parsed.projectId!=="string" || !claimValue.test(parsed.projectId) || typeof parsed.subject!=="string" || !claimValue.test(parsed.subject) || typeof parsed.actorScope!=="string" || !claimValue.test(parsed.actorScope) || parsed.audience!==requirement.audience || !Array.isArray(parsed.allowedOperations) || parsed.allowedOperations.length===0 || !parsed.allowedOperations.every(v=>typeof v==="string"&&operationValue.test(v)) || !parsed.allowedOperations.includes(requirement.operation) || !Array.isArray(parsed.allowedRoles) || parsed.allowedRoles.length===0 || !parsed.allowedRoles.every(v=>typeof v==="string"&&claimValue.test(v)) || !parsed.allowedRoles.includes(parsed.actorScope)) throw new Error("ProjectCapability fuer Kind/Subject/Operation/Audience/Rolle ungueltig.");
    return {kind:"project",projectId:parsed.projectId as ProjectId,expiresAt:new Date(parsed.expiresAt as number),capabilityId:parsed.capabilityId as string,subject:parsed.subject,actorScope:parsed.actorScope,audience:"persistence",operation:requirement.operation,allowedOperations:parsed.allowedOperations as string[],allowedRoles:parsed.allowedRoles as string[]};
  }
}

export class PostgresClaimCapabilityExchange {
  private constructor(private readonly pool:Pool,private readonly authority:HmacCapabilityAuthority){}
  static async connect(connectionString:string,authority:HmacCapabilityAuthority):Promise<PostgresClaimCapabilityExchange>{const pool=new Pool({connectionString,application_name:"software-builder-claim-exchange"});const row=(await pool.query<{current_user:string;member:boolean}>("SELECT current_user,pg_has_role(current_user,'builder_job_claimer','MEMBER') member")).rows[0];if(row?.current_user!=="builder_claim_login"||!row.member){await pool.end();throw new Error("CLAIM_DATABASE_URL ist keine Job-Claimer-Identitaet.");}return new PostgresClaimCapabilityExchange(pool,authority);}
  async exchangeControlRead(jobId:string,claimToken:string):Promise<ProjectCapability>{const row=(await this.pool.query<{project_id:string}>("SELECT builder.authorize_job_claim($1,$2) project_id",[jobId,claimToken])).rows[0];if(!row?.project_id)throw new Error("Job claim nicht autorisiert.");return this.authority.issueProject(row.project_id as ProjectId,{subject:"builder_claim_login",actorScope:"CONTROL_WORKER",allowedRoles:["CONTROL_WORKER"],allowedOperations:["project:read"],audience:"persistence"},30_000);}
  async close():Promise<void>{await this.pool.end();}
}
