export const AGENT_ROLES = [
  "planner",
  "architect",
  "executor",
  "qa_writer",
  "qa_reviewer",
  "reviewer",
  "security",
  "legal_de",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export interface AgentRoleDefinition {
  readonly role: AgentRole;
  readonly canWriteApplicationCode: boolean;
  /** QA Writers require an explicit workflow assignment before source writes are permitted. */
  readonly requiresExplicitWriteAssignment: boolean;
}

export const AGENT_ROLE_DEFINITIONS: readonly AgentRoleDefinition[] = [
  { role: "planner", canWriteApplicationCode: false, requiresExplicitWriteAssignment: false },
  { role: "architect", canWriteApplicationCode: false, requiresExplicitWriteAssignment: false },
  { role: "executor", canWriteApplicationCode: true, requiresExplicitWriteAssignment: false },
  { role: "qa_writer", canWriteApplicationCode: true, requiresExplicitWriteAssignment: true },
  { role: "qa_reviewer", canWriteApplicationCode: false, requiresExplicitWriteAssignment: false },
  { role: "reviewer", canWriteApplicationCode: false, requiresExplicitWriteAssignment: false },
  { role: "security", canWriteApplicationCode: false, requiresExplicitWriteAssignment: false },
  { role: "legal_de", canWriteApplicationCode: false, requiresExplicitWriteAssignment: false },
];

/** Registry boundary only. FOUNDATION registers no real agents. */
export interface AgentRegistryPort {
  listRoles(): Promise<readonly AgentRoleDefinition[]>;
  getRole(role: AgentRole): Promise<AgentRoleDefinition | null>;
}
