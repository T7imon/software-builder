import { createHash } from "node:crypto";
import type { ProjectId } from "@software-builder/core";
import type { BootstrapCapability, ProjectCapability } from "./types.js";
import type { PostgresDatabase } from "./index.js";

export const DEVELOPMENT_PROJECT_ID = "00000000-0000-4000-8000-000000000001" as ProjectId;
const milestoneId = "00000000-0000-4000-8000-000000000002";
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const envelope = (key: string, aggregateType: string, aggregateId: string, state: string) => ({ actorScope: "DEVELOPMENT_SEED", actorIdentityId: "synthetic-seed", idempotencyKey: key, requestDigest: digest(key), aggregateType, aggregateId, transition: "SEEDED", newState: state, reasonCode: "SYNTHETIC_DEVELOPMENT_SEED", policyVersion: "foundation-1", eventType: `${aggregateType}_SEEDED`, schemaVersion: 1 });

export async function seedDevelopmentData(db: PostgresDatabase, bootstrap: BootstrapCapability, project: ProjectCapability): Promise<void> {
  await db.projects.create(bootstrap,{ id: DEVELOPMENT_PROJECT_ID,status: "PLANNING" },envelope("seed-project-v1","PROJECT",DEVELOPMENT_PROJECT_ID,"PLANNING"));
  await db.milestones.append(project,envelope("seed-milestone-v1","MILESTONE",milestoneId,"ACTIVE"),{ id: milestoneId,plannerMilestoneId: "PERSISTENCE",ordinal: 1,status: "ACTIVE",acceptancePolicyId: "foundation-policy-1" });
  await db.artifacts.append(project,envelope("seed-artifact-v1","ARTIFACT","00000000-0000-4000-8000-000000000003","FINALIZED"),{ id: "00000000-0000-4000-8000-000000000003",artifactType: "ARCHITECTURE",schemaVersion: 1,revision: 1,contentDigest: digest("synthetic-development-artifact"),createdByRole: "ARCHITECT",status: "FINALIZED" });
}
