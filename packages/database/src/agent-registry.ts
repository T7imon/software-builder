import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { ProjectCapability } from "./types.js";

export const agentRoles = ["ORCHESTRATOR","PLANNER","ARCHITECT","EXECUTOR","QA","REVIEWER","SECURITY","LEGAL_DE_EU"] as const;
export const agentStatuses = ["DRAFT","ACTIVE","RETIRED"] as const;
export type AgentRole = (typeof agentRoles)[number];
export type AgentStatus = (typeof agentStatuses)[number];
export type ReasoningLevel = "LOW" | "MEDIUM" | "HIGH";

export interface AgentModelConfiguration {
  readonly model?: string;
  readonly reasoningLevel?: ReasoningLevel;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

export interface AgentDefinitionVersion {
  readonly id: string;
  readonly agentId: string;
  readonly agentKey: string;
  readonly displayName: string;
  readonly role: AgentRole;
  readonly description: string;
  readonly version: number;
  readonly revision: number;
  readonly status: AgentStatus;
  readonly instructions: string;
  readonly allowedCapabilities: readonly string[];
  readonly forbiddenCapabilities: readonly string[];
  readonly modelConfiguration?: Readonly<AgentModelConfiguration>;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface AgentVersionContent {
  readonly displayName: string;
  readonly role: AgentRole;
  readonly description: string;
  readonly version: number;
  readonly instructions: string;
  readonly allowedCapabilities: readonly string[];
  readonly forbiddenCapabilities: readonly string[];
  readonly modelConfiguration?: Readonly<AgentModelConfiguration>;
  readonly createdBy: string;
}
export interface CreateAgentDefinitionInput extends AgentVersionContent { readonly agentId?: string; readonly agentKey: string; }
export interface CreateAgentVersionInput extends AgentVersionContent { readonly agentId?: string; readonly agentKey: string; }
export interface AgentRegistryFilter { readonly role?: AgentRole; readonly status?: AgentStatus; }

export interface AgentRegistryRepository {
  createDefinition(capability: ProjectCapability,input:CreateAgentDefinitionInput):Promise<AgentDefinitionVersion>;
  createVersion(capability: ProjectCapability,input:CreateAgentVersionInput):Promise<AgentDefinitionVersion>;
  getVersion(capability:ProjectCapability,agentKey:string,version:number):Promise<AgentDefinitionVersion|undefined>;
  getActive(capability:ProjectCapability,agentKey:string):Promise<AgentDefinitionVersion|undefined>;
  list(capability:ProjectCapability,filter?:AgentRegistryFilter):Promise<readonly AgentDefinitionVersion[]>;
  activate(capability:ProjectCapability,agentKey:string,version:number):Promise<AgentDefinitionVersion>;
  retireActive(capability:ProjectCapability,agentKey:string):Promise<AgentDefinitionVersion>;
}

const secretMaterial=/(?:sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{16,}|xox[baprs]-[a-z0-9-]{16,}|npm_[a-z0-9]{20,}|pypi-[a-z0-9_-]{20,}|akia[0-9a-z]{16}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|bearer\s+[a-z0-9._~+/-]{12,}|(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\s*[:=]|aws[_-]?(?:access|secret)|[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@|-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----)/i;
const secretField=/(?:api.?key|access.?token|refresh.?token|client.?secret|password|passwd|private.?key|credential|secret)/i;
const capabilityPattern=/^[a-z][a-z0-9_.:-]{0,127}$/;
const keyPattern=/^[a-z][a-z0-9-]{0,63}$/;
const actorPattern=/^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/;

function assertText(value:unknown,label:string,max:number):asserts value is string {
  if(typeof value!=="string"||value.trim().length===0||value.length>max)throw new Error(`${label} ist leer oder ungueltig.`);
  if(secretMaterial.test(value))throw new Error(`${label} enthaelt mutmassliches Secret-Material.`);
}
function validateModel(value:unknown):void {
  if(value===undefined)return;
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("modelConfiguration ist ungueltig.");
  const record=value as Record<string,unknown>; const allowed=new Set(["model","reasoningLevel","timeoutMs","maxAttempts"]);
  for(const [key,item] of Object.entries(record)){
    if(!allowed.has(key)||secretField.test(key))throw new Error(`modelConfiguration.${key} ist nicht erlaubt.`);
    if(typeof item==="string"&&secretMaterial.test(item))throw new Error(`modelConfiguration.${key} enthaelt mutmassliches Secret-Material.`);
  }
  if(record.model!==undefined)assertText(record.model,"modelConfiguration.model",128);
  if(record.reasoningLevel!==undefined&&!(["LOW","MEDIUM","HIGH"] as unknown[]).includes(record.reasoningLevel))throw new Error("reasoningLevel ist ungueltig.");
  if(record.timeoutMs!==undefined&&(!Number.isInteger(record.timeoutMs)||Number(record.timeoutMs)<100||Number(record.timeoutMs)>1_800_000))throw new Error("timeoutMs ist ungueltig.");
  if(record.maxAttempts!==undefined&&(!Number.isInteger(record.maxAttempts)||Number(record.maxAttempts)<1||Number(record.maxAttempts)>10))throw new Error("maxAttempts ist ungueltig.");
}
function validateContent(input:AgentVersionContent & {agentKey:string;agentId?:string}):void {
  if(!keyPattern.test(input.agentKey))throw new Error("agentKey ist ungueltig.");
  if(input.agentId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.agentId))throw new Error("agentId ist ungueltig.");
  if(!(agentRoles as readonly unknown[]).includes(input.role))throw new Error("Agentenrolle ist ungueltig.");
  if(!Number.isInteger(input.version)||input.version<1)throw new Error("version ist ungueltig.");
  assertText(input.displayName,"displayName",128); assertText(input.description,"description",512); assertText(input.instructions,"instructions",16_384);
  if(!actorPattern.test(input.createdBy)||secretMaterial.test(input.createdBy))throw new Error("createdBy ist ungueltig.");
  for(const [label,values] of [["allowedCapabilities",input.allowedCapabilities],["forbiddenCapabilities",input.forbiddenCapabilities]] as const){
    if(!Array.isArray(values)||new Set(values).size!==values.length||values.some(value=>typeof value!=="string"||!capabilityPattern.test(value)||secretMaterial.test(value)))throw new Error(`${label} ist ungueltig.`);
  }
  if(input.allowedCapabilities.some(value=>input.forbiddenCapabilities.includes(value)))throw new Error("Capabilities duerfen nicht zugleich erlaubt und verboten sein.");
  validateModel(input.modelConfiguration);
}
function validateLookup(agentKey:string,version?:number):void { if(!keyPattern.test(agentKey))throw new Error("agentKey ist ungueltig."); if(version!==undefined&&(!Number.isInteger(version)||version<1))throw new Error("version ist ungueltig."); }

export class AgentRegistryService {
  constructor(private readonly repository:AgentRegistryRepository){}
  createDefinition(capability:ProjectCapability,input:CreateAgentDefinitionInput){validateContent(input);if(input.version!==1)throw new Error("Neue Agentendefinitionen muessen mit Version 1 beginnen.");return this.repository.createDefinition(capability,input);}
  createVersion(capability:ProjectCapability,input:CreateAgentVersionInput){validateContent(input);return this.repository.createVersion(capability,input);}
  getVersion(capability:ProjectCapability,agentKey:string,version:number){validateLookup(agentKey,version);return this.repository.getVersion(capability,agentKey,version);}
  getActive(capability:ProjectCapability,agentKey:string){validateLookup(agentKey);return this.repository.getActive(capability,agentKey);}
  list(capability:ProjectCapability,filter:AgentRegistryFilter={}){if(filter.role!==undefined&&!(agentRoles as readonly unknown[]).includes(filter.role))throw new Error("Agentenrolle ist ungueltig.");if(filter.status!==undefined&&!(agentStatuses as readonly unknown[]).includes(filter.status))throw new Error("Agentenstatus ist ungueltig.");return this.repository.list(capability,filter);}
  activate(capability:ProjectCapability,agentKey:string,version:number){validateLookup(agentKey,version);return this.repository.activate(capability,agentKey,version);}
  retireActive(capability:ProjectCapability,agentKey:string){validateLookup(agentKey);return this.repository.retireActive(capability,agentKey);}
}

interface RegistryRow extends QueryResultRow { id:string;agent_id:string;agent_key:string;display_name:string;role:AgentRole;description:string;version:number;revision:number;status:AgentStatus;instructions:string;allowed_capabilities:string[];forbidden_capabilities:string[];model_config:AgentModelConfiguration|null;created_at:Date;created_by:string; }
export interface AgentRegistrySession { query<R extends QueryResultRow=QueryResultRow>(sql:string,values?:readonly unknown[]):Promise<{rows:R[];rowCount:number|null}>; }
export type AgentRegistryTransaction=<T>(capability:ProjectCapability,operation:string,action:(session:AgentRegistrySession)=>Promise<T>)=>Promise<T>;
const mapRow=(row:RegistryRow):AgentDefinitionVersion=>({id:row.id,agentId:row.agent_id,agentKey:row.agent_key,displayName:row.display_name,role:row.role,description:row.description,version:row.version,revision:row.revision,status:row.status,instructions:row.instructions,allowedCapabilities:row.allowed_capabilities,forbiddenCapabilities:row.forbidden_capabilities,...(row.model_config?{modelConfiguration:row.model_config}:{}),createdAt:row.created_at,createdBy:row.created_by});
const columns="id,agent_id,agent_key,display_name,role,description,version,revision,status,instructions,allowed_capabilities,forbidden_capabilities,model_config,created_at,created_by";
const values=(input:AgentVersionContent & {agentKey:string},agentId:string)=>[agentId,input.agentKey,input.displayName,input.role,input.description,input.version,input.version,input.instructions,[...input.allowedCapabilities],[...input.forbiddenCapabilities],input.modelConfiguration??null,input.createdBy];
const identityConflict=(error:unknown):Error|undefined=>{
  const postgresError=error as {code?:string;constraint?:string};
  if(postgresError.code!=="23505")return undefined;
  if(postgresError.constraint==="agent_registry_identities_pkey")return new Error("AGENT_IDENTITY_KEY_CONFLICT: agentKey ist bereits an eine agentId gebunden.");
  if(postgresError.constraint==="agent_registry_identities_agent_id_unique")return new Error("AGENT_IDENTITY_ID_CONFLICT: agentId ist bereits an einen agentKey gebunden.");
  return new Error("AGENT_IDENTITY_CONFLICT: agentKey oder agentId ist bereits gebunden.");
};

export class PostgresAgentRegistryRepository implements AgentRegistryRepository {
  constructor(private readonly transaction:AgentRegistryTransaction){}
  createDefinition(capability:ProjectCapability,input:CreateAgentDefinitionInput){return this.transaction(capability,"agent_registry:append",async session=>{if(input.version!==1)throw new Error("Neue Agentendefinitionen muessen mit Version 1 beginnen.");const agentId=input.agentId??randomUUID();try{await session.query("INSERT INTO builder.agent_registry_identities(agent_key,agent_id,created_by) VALUES($1,$2,$3)",[input.agentKey,agentId,input.createdBy]);}catch(error){throw identityConflict(error)??error;}const row=(await session.query<RegistryRow>(`INSERT INTO builder.agent_registry_versions(agent_id,agent_key,display_name,role,description,version,revision,status,instructions,allowed_capabilities,forbidden_capabilities,model_config,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,$10,$11,$12) RETURNING ${columns}`,values(input,agentId))).rows[0]!;return mapRow(row);});}
  createVersion(capability:ProjectCapability,input:CreateAgentVersionInput){return this.transaction(capability,"agent_registry:append",async session=>{await session.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`agent-registry:${input.agentKey}`]);const prior=(await session.query<{agent_id:string;role:AgentRole}>("SELECT canonical.agent_id,registry.role FROM builder.agent_registry_identities canonical JOIN builder.agent_registry_versions registry ON registry.agent_key=canonical.agent_key AND registry.agent_id=canonical.agent_id WHERE canonical.agent_key=$1 ORDER BY registry.version LIMIT 1",[input.agentKey])).rows[0];if(!prior)throw new Error("Agentendefinition ist unbekannt.");if(input.agentId!==undefined&&input.agentId.toLowerCase()!==prior.agent_id.toLowerCase())throw new Error("AGENT_IDENTITY_MISMATCH: agentId weicht von der kanonischen Identitaet ab.");if(prior.role!==input.role)throw new Error("Die Rolle eines agentKey ist unveraenderlich.");const row=(await session.query<RegistryRow>(`INSERT INTO builder.agent_registry_versions(agent_id,agent_key,display_name,role,description,version,revision,status,instructions,allowed_capabilities,forbidden_capabilities,model_config,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,$10,$11,$12) RETURNING ${columns}`,values(input,prior.agent_id))).rows[0]!;return mapRow(row);});}
  getVersion(capability:ProjectCapability,agentKey:string,version:number){return this.transaction(capability,"agent_registry:read",async session=>{const row=(await session.query<RegistryRow>(`SELECT ${columns} FROM builder.agent_registry_versions WHERE agent_key=$1 AND version=$2`,[agentKey,version])).rows[0];return row?mapRow(row):undefined;});}
  getActive(capability:ProjectCapability,agentKey:string){return this.transaction(capability,"agent_registry:read",async session=>{const row=(await session.query<RegistryRow>(`SELECT ${columns} FROM builder.agent_registry_versions WHERE agent_key=$1 AND status='ACTIVE'`,[agentKey])).rows[0];return row?mapRow(row):undefined;});}
  list(capability:ProjectCapability,filter:AgentRegistryFilter={}){return this.transaction(capability,"agent_registry:read",async session=>{const conditions:string[]=[];const parameters:unknown[]=[];if(filter.role){parameters.push(filter.role);conditions.push(`role=$${parameters.length}`);}if(filter.status){parameters.push(filter.status);conditions.push(`status=$${parameters.length}`);}const result=await session.query<RegistryRow>(`SELECT ${columns} FROM builder.agent_registry_versions${conditions.length?` WHERE ${conditions.join(" AND ")}`:""} ORDER BY agent_key,version`,parameters);return result.rows.map(mapRow);});}
  activate(capability:ProjectCapability,agentKey:string,version:number){return this.transaction(capability,"agent_registry:append",async session=>{await session.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`agent-registry:${agentKey}`]);const target=(await session.query<RegistryRow>(`SELECT ${columns} FROM builder.agent_registry_versions WHERE agent_key=$1 AND version=$2 FOR UPDATE`,[agentKey,version])).rows[0];if(!target)throw new Error("Agentenversion ist unbekannt.");if(target.status==="RETIRED")throw new Error("RETIRED-Versionen duerfen nicht reaktiviert werden.");if(target.status==="ACTIVE")return mapRow(target);await session.query("UPDATE builder.agent_registry_versions SET status='RETIRED' WHERE agent_key=$1 AND status='ACTIVE'",[agentKey]);const activated=(await session.query<RegistryRow>(`UPDATE builder.agent_registry_versions SET status='ACTIVE' WHERE agent_key=$1 AND version=$2 AND status='DRAFT' RETURNING ${columns}`,[agentKey,version])).rows[0];if(!activated)throw new Error("Aktivierung ist fehlgeschlagen.");return mapRow(activated);});}
  retireActive(capability:ProjectCapability,agentKey:string){return this.transaction(capability,"agent_registry:append",async session=>{await session.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`agent-registry:${agentKey}`]);const retired=(await session.query<RegistryRow>(`UPDATE builder.agent_registry_versions SET status='RETIRED' WHERE agent_key=$1 AND status='ACTIVE' RETURNING ${columns}`,[agentKey])).rows[0];if(!retired)throw new Error("Keine aktive Agentenversion vorhanden.");return mapRow(retired);});}
}

export const DEVELOPMENT_AGENT_SEEDS:readonly CreateAgentDefinitionInput[]=[
  {agentKey:"orchestrator",displayName:"Orchestrator",role:"ORCHESTRATOR",description:"Koordiniert den kontrollierten Development-Workflow.",version:1,instructions:"Steuere genau einen Task und einen Meilenstein; respektiere alle Gates.",allowedCapabilities:["workflow.coordinate"],forbiddenCapabilities:["production.deploy","github.write","agent.execute.real"],createdBy:"synthetic-development-seed"},
  {agentKey:"planner",displayName:"Planner",role:"PLANNER",description:"Plant Anforderungen und Akzeptanzkriterien.",version:1,instructions:"Erstelle pruefbare, klar abgegrenzte Anforderungen fuer den aktuellen Task.",allowedCapabilities:["documentation.analyze"],forbiddenCapabilities:["source.write","production.deploy"],createdBy:"synthetic-development-seed"},
  {agentKey:"architect",displayName:"Architect",role:"ARCHITECT",description:"Entwirft die technische Zielstruktur.",version:1,instructions:"Entwirf innerhalb der freigegebenen Architektur und dokumentiere Entscheidungen.",allowedCapabilities:["architecture.analyze"],forbiddenCapabilities:["source.write","production.deploy"],createdBy:"synthetic-development-seed"},
  {agentKey:"executor",displayName:"Executor",role:"EXECUTOR",description:"Implementiert genau den autorisierten Task.",version:1,instructions:"Aendere nur erlaubte Dateien und verifiziere die Akzeptanzkriterien lokal.",allowedCapabilities:["source.write.scoped"],forbiddenCapabilities:["github.write","production.deploy","agent.execute.real"],createdBy:"synthetic-development-seed"},
  {agentKey:"qa",displayName:"QA",role:"QA",description:"Prueft die Implementierung gegen den Task-Vertrag.",version:1,instructions:"Fuehre die vorgeschriebenen Checks auf dem fixierten Stand aus.",allowedCapabilities:["quality.read"],forbiddenCapabilities:["source.write","production.deploy"],createdBy:"synthetic-development-seed"},
  {agentKey:"reviewer",displayName:"Reviewer",role:"REVIEWER",description:"Prueft Korrektheit und Wartbarkeit.",version:1,instructions:"Pruefe nur Task-Scope und Akzeptanzkriterien auf dem fixierten Stand.",allowedCapabilities:["source.review"],forbiddenCapabilities:["source.write","production.deploy"],createdBy:"synthetic-development-seed"},
  {agentKey:"security",displayName:"Security",role:"SECURITY",description:"Prueft bindende Sicherheitsanforderungen.",version:1,instructions:"Bewerte Sicherheitsrisiken im aktuellen Scope und arbeite fail-closed.",allowedCapabilities:["security.review"],forbiddenCapabilities:["source.write","production.deploy"],createdBy:"synthetic-development-seed"},
  {agentKey:"legal-de-eu",displayName:"Legal DE/EU",role:"LEGAL_DE_EU",description:"Technische Rolle fuer DE/EU-Legal-Reviews; keine anwaltliche Freigabe.",version:1,instructions:"Pruefe Datenminimierung und Rollenbezeichnung; erteile keine anwaltliche Freigabe.",allowedCapabilities:["legal.review.technical"],forbiddenCapabilities:["legal.counsel.decision","source.write","production.deploy"],createdBy:"synthetic-development-seed"}
];
export async function seedDevelopmentAgentRegistry(service:AgentRegistryService,capability:ProjectCapability):Promise<void>{for(const seed of DEVELOPMENT_AGENT_SEEDS){const existing=await service.getVersion(capability,seed.agentKey,seed.version);if(!existing)await service.createDefinition(capability,seed);}}
