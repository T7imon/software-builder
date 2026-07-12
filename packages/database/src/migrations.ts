import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const lockKey = "software-builder:migrations";
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
async function verifyMaintenanceIdentity(client:PoolClient):Promise<void>{const row=(await client.query<{current_user:string;runtime_member:boolean}>("SELECT current_user,pg_has_role(current_user,'builder_runtime','MEMBER') runtime_member")).rows[0];if(row?.current_user!=="builder_migrator"||row.runtime_member)throw new Error("Migration erfordert die separate builder_migrator-Identitaet.");}

async function verifyWorkersStopped(client: PoolClient): Promise<void> {
  const active = await client.query<{ count: string }>(`SELECT count(*) AS count FROM pg_stat_activity
    WHERE datname=current_database() AND pid<>pg_backend_pid()
      AND application_name IN ('software-builder-runtime','software-builder-context-issuer','software-builder-claim-exchange')`);
  if (Number(active.rows[0]?.count ?? 0) > 0) throw new Error("Wartung abgelehnt: Runtime-, Context- oder Claim-Verbindungen sind noch aktiv.");
}

async function acquireMaintenanceLock(client: PoolClient): Promise<void> {
  const locked = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",[lockKey]);
  if (!locked.rows[0]?.locked) throw new Error("Datenbankwartung ist bereits aktiv.");
}

async function appliedVersions(client: PoolClient): Promise<Map<string,string>> {
  try {
    await verifyMaintenanceIdentity(client);
    const result = await client.query<{ version: string; checksum_sha256: string }>("SELECT version,checksum_sha256 FROM public.schema_migrations");
    return new Map(result.rows.map((row) => [row.version,row.checksum_sha256]));
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return new Map();
    throw error;
  }
}

async function migrateLocked(client:PoolClient):Promise<string[]>{
  const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
  const applied:string[]=[]; const known=await appliedVersions(client);
  for(const file of files){const sql=await readFile(join(migrationDirectory,file),"utf8");const checksum=sha256(sql);const prior=known.get(file);if(prior){if(prior!==checksum)throw new Error(`Migration ${file} wurde nach Anwendung veraendert.`);continue;}await client.query("BEGIN");try{await client.query(sql);await client.query("INSERT INTO public.schema_migrations(version,checksum_sha256) VALUES ($1,$2)",[file,checksum]);await client.query("COMMIT");applied.push(file);}catch(error){await client.query("ROLLBACK");throw error;}}
  return applied;
}
export async function migrate(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    await verifyMaintenanceIdentity(client);
    await acquireMaintenanceLock(client);
    await verifyWorkersStopped(client);
    await client.query("SET lock_timeout='10s'");
    return await migrateLocked(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",[lockKey]).catch(() => undefined);
    client.release();
  }
}

export interface ResetAuthorization { readonly connectionString: string; readonly environment: "development"|"test"; }
export async function resetDatabase(pool: Pool, authorization: ResetAuthorization): Promise<void> {
  const url = new URL(authorization.connectionString);
  if (!["127.0.0.1","localhost","::1"].includes(url.hostname)) throw new Error("Reset ist nur ueber Loopback erlaubt.");
  const database = url.pathname.slice(1);
  if (!(database === "software_builder" && authorization.environment === "development") && !(database.endsWith("_test") && authorization.environment === "test")) throw new Error("Reset-Zieldatenbank ist nicht freigegeben.");
  const client = await pool.connect();
  try {
    await verifyMaintenanceIdentity(client);
    await acquireMaintenanceLock(client);
    await verifyWorkersStopped(client);
    await client.query("SET lock_timeout='10s'");
    const actual = await client.query<{ database: string }>("SELECT current_database() AS database");
    if (actual.rows[0]?.database !== database) throw new Error("Reset-Verbindung und aktuelle Datenbank weichen ab.");
    const active = await client.query<{ count: string }>("SELECT count(*) AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()");
    if (Number(active.rows[0]?.count ?? 0) > 0) throw new Error("Reset abgelehnt: weitere Datenbankverbindungen sind aktiv.");
    await client.query("DROP SCHEMA IF EXISTS builder CASCADE");
    await client.query("DROP TABLE IF EXISTS public.schema_migrations");
    await migrateLocked(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",[lockKey]).catch(() => undefined);
    client.release();
  }
}
