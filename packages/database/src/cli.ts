import { Pool } from "pg";
import { HmacCapabilityAuthority, PostgresDatabase, PostgresProjectContextIssuer } from "./index.js";
import { migrate, resetDatabase } from "./migrations.js";
import { DEVELOPMENT_PROJECT_ID, seedDevelopmentData } from "./seed.js";

const command = process.argv[2];
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.DATABASE_URL;
const contextUrl = process.env.CONTEXT_DATABASE_URL;

if (command === "seed") {
  if (!runtimeUrl || !contextUrl) throw new Error("DATABASE_URL und CONTEXT_DATABASE_URL muessen getrennt gesetzt sein.");
  const authority = new HmacCapabilityAuthority();
  const issuer=await PostgresProjectContextIssuer.connect(contextUrl);
  const db = await PostgresDatabase.connectRuntime(runtimeUrl,issuer,authority,authority);
  try { await seedDevelopmentData(db,authority.issueBootstrap("synthetic-seed","DEVELOPMENT_SEED"),authority.issueProject(DEVELOPMENT_PROJECT_ID,{subject:"synthetic-seed",actorScope:"DEVELOPMENT_SEED",allowedRoles:["DEVELOPMENT_SEED"],allowedOperations:["milestone:append","artifact:append"]})); console.log("Synthetische Seed-Daten angelegt."); }
  finally { await db.close(); }
} else {
  if (!migrationUrl) throw new Error("DATABASE_MIGRATION_URL muss fuer Wartungsbefehle gesetzt sein.");
  if(process.env.ALLOW_DATABASE_MAINTENANCE!=="YES") throw new Error("Wartung abgelehnt: ALLOW_DATABASE_MAINTENANCE=YES fehlt.");
  const maintenanceDatabase = new URL(migrationUrl).pathname.slice(1);
  if(process.env.DATABASE_MAINTENANCE_CONFIRM!==`local-only:${maintenanceDatabase}`) throw new Error("Wartung abgelehnt: DATABASE_MAINTENANCE_CONFIRM stimmt nicht mit der lokalen Zieldatenbank ueberein.");
  const pool = new Pool({ connectionString: migrationUrl,application_name: "software-builder-migration" });
  try {
    if (command === "migrate") console.log(`Migrationen angewendet: ${(await migrate(pool)).length}`);
    else if (command === "reset") {
      if (process.env.ALLOW_DATABASE_RESET !== "YES") throw new Error("Reset abgelehnt: ALLOW_DATABASE_RESET=YES muss explizit gesetzt sein.");
      await resetDatabase(pool,{ connectionString: migrationUrl,environment: process.env.NODE_ENV === "test" ? "test" : "development" }); console.log("Datenbank zurueckgesetzt und migriert.");
    } else if (command === "provision-runtime") {
      const password = process.env.RUNTIME_DATABASE_PASSWORD;
      if (!password || password.length < 16) throw new Error("RUNTIME_DATABASE_PASSWORD muss mindestens 16 Zeichen haben.");
      await pool.query("SELECT builder.provision_runtime_password($1)",[password]);
      const contextPassword=process.env.CONTEXT_DATABASE_PASSWORD;
      if(!contextPassword || contextPassword.length<16) throw new Error("CONTEXT_DATABASE_PASSWORD muss mindestens 16 Zeichen haben.");
      await pool.query("SELECT builder.provision_context_password($1)",[contextPassword]);
      const claimPassword=process.env.CLAIM_DATABASE_PASSWORD;
      if(!claimPassword || claimPassword.length<16) throw new Error("CLAIM_DATABASE_PASSWORD muss mindestens 16 Zeichen haben.");
      await pool.query("SELECT builder.provision_claim_password($1)",[claimPassword]);
      console.log("Separate Runtime- und Context-Issuer-LOGIN-Rollen provisioniert.");
    } else throw new Error(`Unbekannter Datenbankbefehl: ${command ?? "<leer>"}`);
  } finally { await pool.end(); }
}
