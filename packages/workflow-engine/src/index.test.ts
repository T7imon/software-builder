import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ALLOWED_TRANSITIONS,
  GATE_ATTESTER_ROLES,
  InMemoryWorkflowRepository,
  JOB_TYPES,
  PHASE_JOB_TYPES,
  PROJECT_PHASES,
  REQUIRED_GATES,
  WorkflowEngine,
  createInMemoryWorkflowFixture,
  isTransitionAllowed,
  type AttesterRole,
  type GateEvidence,
  type GateName,
  type JobType,
  type ProjectPhase,
  type TransitionRequest,
} from "./index.js";

const START = new Date("2026-07-12T12:00:00.000Z");
const POLICY = "policy-1";
const REVISION = "a".repeat(64);
const NEXT_REVISION = "b".repeat(64);
const ATTESTERS: Readonly<Record<string, AttesterRole>> = {
  architect: "ARCHITECT",
  owner: "OWNER",
  automation: "AUTOMATION",
  qa: "QA",
  reviewer: "REVIEWER",
  security: "SECURITY",
  legal: "LEGAL",
  release: "RELEASE_MANAGER",
};

function make(now: () => Date = () => new Date(START)) {
  const fixture = createInMemoryWorkflowFixture({ now, attesters: ATTESTERS });
  return { ...fixture, engine: new WorkflowEngine(fixture.repository) };
}

function command(
  targetPhase: ProjectPhase,
  expectedVersion: number,
  extra: Partial<TransitionRequest> = {},
): TransitionRequest {
  return {
    projectId: "project-1",
    targetPhase,
    expectedVersion,
    expectedRevisionDigest: REVISION,
    policyVersion: POLICY,
    actorId: "owner-1",
    reason: `to ${targetPhase}`,
    idempotencyKey: `${targetPhase}-${expectedVersion}`,
    ...extra,
  };
}

function gate(
  name: GateName,
  suffix = "default",
  overrides: Partial<GateEvidence> = {},
): GateEvidence {
  return {
    id: `gate-${name}-${suffix}`,
    projectId: "project-1",
    name,
    status: "PASS",
    policyVersion: POLICY,
    subjectRevisionDigest: REVISION,
    evidenceDigest: createHash("sha256").update(`evidence-${name}-${suffix}`).digest("hex"),
    evaluatedAt: new Date(START.getTime() - 1_000),
    validUntil: new Date(START.getTime() + 60_000),
    ...(name === "LEGAL_REVIEW_PASSED" ? { legalStatus: "PASS" as const, legalRequirements: [] } : {}),
    ...(name === "CUSTOMER_DATA_CLASSIFIED" ? { customerDataClassification: "SYNTHETIC_ONLY" as const } : {}),
    ...overrides,
  };
}

function attesterFor(name: GateName): string {
  const role = GATE_ATTESTER_ROLES[name];
  const entry = Object.entries(ATTESTERS).find(([, candidate]) => candidate === role);
  if (!entry) throw new Error(`No fixture attester for ${name}`);
  return entry[0];
}

async function create(engine: WorkflowEngine) {
  await engine.createProject("project-1", POLICY, REVISION);
}

async function advance(engine: WorkflowEngine, phases: readonly ProjectPhase[]) {
  for (const [index, phase] of phases.entries()) await engine.transition(command(phase, index));
}

async function ingest(
  ingestor: ReturnType<typeof make>["trustedGateIngestor"],
  names: readonly GateName[],
  suffix = "default",
  overrides: Partial<GateEvidence> = {},
) {
  const evidence = names.map((name) => gate(name, suffix, overrides));
  for (const item of evidence) await ingestor.ingest(item, attesterFor(item.name));
  return evidence.map((item) => item.id);
}

const QUALITY_GATES = REQUIRED_GATES["VERIFICATION->RELEASE_CANDIDATE"]!;
const IMPLEMENTATION_GATES = ["ARCHITECTURE_APPROVED", "PLAN_APPROVED", "CUSTOMER_DATA_CLASSIFIED"] as const;

describe("explicit immutable transition rules", () => {
  it("covers every source/target pair and keeps PRODUCTION unreachable", () => {
    const expected: Record<ProjectPhase, readonly ProjectPhase[]> = {
      DRAFT: ["DISCOVERY", "FAILED", "CANCELLED"],
      DISCOVERY: ["SPECIFICATION", "BLOCKED", "FAILED", "CANCELLED"],
      SPECIFICATION: ["ARCHITECTURE", "BLOCKED", "FAILED", "CANCELLED"],
      ARCHITECTURE: ["PRE_BUILD_REVIEW", "BLOCKED", "FAILED", "CANCELLED"],
      PRE_BUILD_REVIEW: ["AWAITING_PLAN_APPROVAL", "BLOCKED", "FAILED", "CANCELLED"],
      AWAITING_PLAN_APPROVAL: ["IMPLEMENTATION", "BLOCKED", "FAILED", "CANCELLED"],
      IMPLEMENTATION: ["VERIFICATION", "BLOCKED", "FAILED", "CANCELLED"],
      VERIFICATION: ["IMPLEMENTATION", "RELEASE_CANDIDATE", "BLOCKED", "FAILED", "CANCELLED"],
      BLOCKED: ["DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW", "AWAITING_PLAN_APPROVAL", "IMPLEMENTATION", "VERIFICATION", "RELEASE_CANDIDATE", "STAGING", "FAILED", "CANCELLED"],
      RELEASE_CANDIDATE: ["STAGING", "BLOCKED", "FAILED", "CANCELLED"],
      STAGING: ["COMPLETED", "BLOCKED", "FAILED", "CANCELLED"],
      PRODUCTION: [],
      COMPLETED: [],
      FAILED: [],
      CANCELLED: [],
    };

    expect(ALLOWED_TRANSITIONS).toEqual(expected);
    for (const source of PROJECT_PHASES) {
      for (const target of PROJECT_PHASES) {
        expect(isTransitionAllowed(source, target), `${source}->${target}`).toBe(expected[source].includes(target));
      }
    }
    expect(Object.values(expected).flat()).not.toContain("PRODUCTION");
  });

  it("cannot alter internal invariants through exported rule objects", async () => {
    expect(() => (ALLOWED_TRANSITIONS.DRAFT as ProjectPhase[]).push("PRODUCTION")).toThrow(TypeError);
    expect(() => (REQUIRED_GATES["AWAITING_PLAN_APPROVAL->IMPLEMENTATION"] as GateName[]).splice(0)).toThrow(TypeError);
    expect(() => (PROJECT_PHASES as unknown as ProjectPhase[]).push("PRODUCTION")).toThrow(TypeError);

    const { engine } = make();
    await create(engine);
    await expect(engine.transition(command("PRODUCTION", 0))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("rejects imported non-DRAFT aggregates", async () => {
    const { repository } = make();
    expect(() => repository.create({
      projectId: "evil",
      phase: "PRODUCTION",
      version: 1,
      policyVersion: POLICY,
      revisionDigest: REVISION,
      blockReasons: [],
    })).toThrow(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });
});

describe("verified, role-bound and revision-bound gates", () => {
  it("rejects future evaluations at ingest and stores immutable ingestion time", async () => {
    let now = new Date(START);
    const { engine, trustedGateIngestor } = make(() => new Date(now));
    await create(engine);
    await expect(trustedGateIngestor.ingest(gate("ARCHITECTURE_APPROVED", "future", {
      evaluatedAt: new Date(START.getTime() + 1),
    }), "architect")).rejects.toMatchObject({ code: "GATE_INVALID" });

    const evidence = gate("ARCHITECTURE_APPROVED", "stored");
    await trustedGateIngestor.ingest(evidence, "architect");
    now = new Date(START.getTime() + 10_000);
    evidence.evaluatedAt.setTime(0);
    const stored = await engine.getGateResult("project-1", evidence.id);
    expect(stored?.ingestedAt).toEqual(START);
    stored!.ingestedAt.setTime(0);
    expect((await engine.getGateResult("project-1", evidence.id))?.ingestedAt).toEqual(START);
  });

  it("requires the newest authoritative result for every effective gate", async () => {
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    await advance(engine, ["DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW", "AWAITING_PLAN_APPROVAL"]);
    const old = await ingest(trustedGateIngestor, IMPLEMENTATION_GATES, "old", {
      evaluatedAt: new Date(START.getTime() - 2_000),
    });
    await trustedGateIngestor.ingest(gate("PLAN_APPROVED", "new-fail", {
      status: "FAIL",
      evaluatedAt: new Date(START.getTime() - 1_000),
    }), "owner");
    await expect(engine.transition(command("IMPLEMENTATION", 5, { gateResultIds: old }))).rejects.toMatchObject({ code: "GATE_INVALID" });
  });
  it("does not expose gate registration on WorkflowEngine", () => {
    const { engine } = make();
    expect("registerGateResult" in engine).toBe(false);
  });

  it("rejects forged proofs and trusted identities with the wrong role", async () => {
    const { repository, trustedGateIngestor, engine } = make();
    await create(engine);
    const architecture = gate("ARCHITECTURE_APPROVED");

    await expect(repository.ingestGateAttestation({
      ...architecture,
      attesterId: "architect",
      proof: "caller-controlled-proof",
    })).rejects.toMatchObject({ code: "GATE_INVALID" });
    await expect(trustedGateIngestor.ingest(architecture, "owner")).rejects.toMatchObject({ code: "GATE_INVALID" });
  });

  it("requires the exact persisted gate set", async () => {
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    await advance(engine, ["DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW", "AWAITING_PLAN_APPROVAL"]);
    const ids = await ingest(trustedGateIngestor, IMPLEMENTATION_GATES);

    await expect(engine.transition(command("IMPLEMENTATION", 5, { gateResultIds: [ids[0]!, ids[1]!, "unknown"] }))).rejects.toMatchObject({ code: "GATE_INVALID" });
    await expect(engine.transition(command("IMPLEMENTATION", 5, { gateResultIds: [ids[0]!] }))).rejects.toMatchObject({ code: "GATE_REQUIRED" });
    expect(() => engine.transition(command("IMPLEMENTATION", 5, { gateResultIds: [ids[0]!, ids[0]!] }))).toThrow(expect.objectContaining({ code: "GATE_INVALID" }));
    expect((await engine.transition(command("IMPLEMENTATION", 5, { gateResultIds: ids }))).project.phase).toBe("IMPLEMENTATION");
  });

  it("binds protected transitions to the target revision", async () => {
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    await advance(engine, ["DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW", "AWAITING_PLAN_APPROVAL"]);
    const oldIds = await ingest(trustedGateIngestor, IMPLEMENTATION_GATES, "old");

    await expect(engine.transition(command("IMPLEMENTATION", 5, {
      gateResultIds: oldIds,
      newRevisionDigest: NEXT_REVISION,
    }))).rejects.toMatchObject({ code: "GATE_INVALID" });

    const newIds = await ingest(trustedGateIngestor, IMPLEMENTATION_GATES, "new", {
      subjectRevisionDigest: NEXT_REVISION,
    });
    const result = await engine.transition(command("IMPLEMENTATION", 5, {
      gateResultIds: newIds,
      newRevisionDigest: NEXT_REVISION,
    }));
    expect(result.project.revisionDigest).toBe(NEXT_REVISION);
    expect(result.auditEvent.gateBindings.every((binding) => binding.subjectRevisionDigest === NEXT_REVISION)).toBe(true);
  });

  it("requires successful tests and all four reviews for RELEASE_CANDIDATE", async () => {
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    await advance(engine, ["DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW", "AWAITING_PLAN_APPROVAL"]);
    const approvals = await ingest(trustedGateIngestor, IMPLEMENTATION_GATES);
    await engine.transition(command("IMPLEMENTATION", 5, { gateResultIds: approvals }));
    await engine.transition(command("VERIFICATION", 6));
    const ids = await ingest(trustedGateIngestor, QUALITY_GATES, "quality");

    await expect(engine.transition(command("RELEASE_CANDIDATE", 7, { gateResultIds: ids.slice(0, -1) }))).rejects.toMatchObject({ code: "GATE_REQUIRED" });
    const result = await engine.transition(command("RELEASE_CANDIDATE", 7, { gateResultIds: ids }));
    expect(result.auditEvent.gateBindings).toHaveLength(9);
  });

  it("requires architecture and plan approvals when returning from VERIFICATION to IMPLEMENTATION", async () => {
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    await advance(engine, ["DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW", "AWAITING_PLAN_APPROVAL"]);
    const approvals = await ingest(trustedGateIngestor, IMPLEMENTATION_GATES);
    await engine.transition(command("IMPLEMENTATION", 5, { gateResultIds: approvals }));
    await engine.transition(command("VERIFICATION", 6));
    await expect(engine.transition(command("IMPLEMENTATION", 7))).rejects.toMatchObject({ code: "GATE_REQUIRED" });
    expect((await engine.transition(command("IMPLEMENTATION", 7, { gateResultIds: approvals }))).project.phase).toBe("IMPLEMENTATION");
  });

  it("freezes the verified revision through RC, BLOCKED, STAGING and COMPLETED", async () => {
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    await advance(engine, ["DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW", "AWAITING_PLAN_APPROVAL"]);
    const approvals = await ingest(trustedGateIngestor, IMPLEMENTATION_GATES);
    await engine.transition(command("IMPLEMENTATION", 5, { gateResultIds: approvals }));
    await engine.transition(command("VERIFICATION", 6));
    const untestedSwitch = await ingest(trustedGateIngestor, QUALITY_GATES, "next", { subjectRevisionDigest: NEXT_REVISION });
    await expect(engine.transition(command("RELEASE_CANDIDATE", 7, {
      gateResultIds: untestedSwitch,
      newRevisionDigest: NEXT_REVISION,
    }))).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const quality = await ingest(trustedGateIngestor, QUALITY_GATES, "quality");
    const rc = await engine.transition(command("RELEASE_CANDIDATE", 7, { gateResultIds: quality }));
    expect(rc.project.frozenRevisionDigest).toBe(REVISION);
    await expect(engine.transition(command("BLOCKED", 8, {
      newRevisionDigest: NEXT_REVISION,
      blockReasons: [{ code: "HOLD", message: "release hold" }],
    }))).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(engine.transition(command("STAGING", 8, { newRevisionDigest: NEXT_REVISION }))).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  });
});

describe("actor authorization", () => {
  it("rejects unauthorized and identity-spoofed actors inside the command transaction", async () => {
    const fixture = createInMemoryWorkflowFixture({ attesters: {}, actors: { executor: ["EXECUTOR"] } });
    const engine = new WorkflowEngine(fixture.repository);
    await engine.createProject("project-1", POLICY, REVISION);
    await expect(engine.transition(command("DISCOVERY", 0, { actorId: "executor" }))).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const repository = new InMemoryWorkflowRepository({
      evidenceVerifier: { async verify() { return null; } },
      actorAuthorizationVerifier: { async verify() { return { id: "owner", roles: ["OWNER"] }; } },
      workerIdentityVerifier: { async verify() { return null; } },
      terminationProofVerifier: { async verify() { return null; } },
      holdClearanceVerifier: { async verify() { return null; } },
    });
    const spoofed = new WorkflowEngine(repository);
    await spoofed.createProject("project-1", POLICY, REVISION);
    await expect(spoofed.transition(command("DISCOVERY", 0, { actorId: "attacker" }))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("BLOCKED and temporal gate validity", () => {
  it("requires concrete reasons and resumes only its origin", async () => {
    const { engine } = make();
    await create(engine);
    await engine.transition(command("DISCOVERY", 0));
    await expect(engine.transition(command("BLOCKED", 1))).rejects.toMatchObject({ code: "BLOCK_REASONS_REQUIRED" });
    await engine.transition(command("BLOCKED", 1, {
      blockReasons: [{ code: "DEPENDENCY", message: "Mirror unavailable", evidenceRef: "incident-1" }],
    }));
    await expect(engine.transition(command("SPECIFICATION", 2))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect((await engine.transition(command("DISCOVERY", 2))).project.blockReasons).toEqual([]);
  });

  it("accepts resume gates only when evaluated strictly after the block audit", async () => {
    let now = new Date(START);
    const { engine, trustedGateIngestor } = make(() => new Date(now));
    await create(engine);
    await advance(engine, ["DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW", "AWAITING_PLAN_APPROVAL"]);
    const initial = await ingest(trustedGateIngestor, IMPLEMENTATION_GATES, "initial");
    await engine.transition(command("IMPLEMENTATION", 5, { gateResultIds: initial }));
    await engine.transition(command("BLOCKED", 6, { blockReasons: [{ code: "HOLD", message: "Security hold" }] }));

    const simultaneous = await ingest(trustedGateIngestor, IMPLEMENTATION_GATES, "simultaneous", {
      evaluatedAt: new Date(START),
    });
    now = new Date(START.getTime() + 2);
    await expect(engine.transition(command("IMPLEMENTATION", 7, { gateResultIds: simultaneous }))).rejects.toMatchObject({ code: "GATE_INVALID" });

    const fresh = await ingest(trustedGateIngestor, IMPLEMENTATION_GATES, "fresh", {
      evaluatedAt: new Date(START.getTime() + 1),
    });
    expect((await engine.transition(command("IMPLEMENTATION", 7, { gateResultIds: fresh }))).project.phase).toBe("IMPLEMENTATION");
  });

  it("rejects a gate whose validity ends exactly now", async () => {
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    await advance(engine, ["DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW", "AWAITING_PLAN_APPROVAL"]);
    const ids = await ingest(trustedGateIngestor, IMPLEMENTATION_GATES, "expires-now", {
      validUntil: new Date(START),
    });
    await expect(engine.transition(command("IMPLEMENTATION", 5, { gateResultIds: ids }))).rejects.toMatchObject({ code: "GATE_INVALID" });
  });
});

describe("snapshots, idempotency and audit", () => {
  it("rejects runtime null/object values instead of coercing them to strings", async () => {
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    expect(() => engine.transition({ ...command("DISCOVERY", 0), actorId: null } as unknown as TransitionRequest)).toThrow(expect.objectContaining({ code: "INVALID_REQUEST" }));
    expect(() => engine.transition({ ...command("DISCOVERY", 0), startJob: null } as unknown as TransitionRequest)).toThrow(expect.objectContaining({ code: "INVALID_REQUEST" }));
    expect(() => trustedGateIngestor.ingest({ ...gate("PLAN_APPROVED"), evaluatedAt: "2026-01-01" } as unknown as GateEvidence, "owner")).toThrow(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });
  it("deep-snapshots mutable transition input synchronously", async () => {
    const { engine } = make();
    await create(engine);
    const mutable = command("DISCOVERY", 0, { blockReasons: [] }) as {
      targetPhase: ProjectPhase;
      reason: string;
      blockReasons: { code: string; message: string }[];
    } & TransitionRequest;
    const pending = engine.transition(mutable);
    mutable.targetPhase = "CANCELLED";
    mutable.reason = "mutated";
    mutable.blockReasons.push({ code: "MUTATED", message: "late mutation" });

    const result = await pending;
    expect(result.project.phase).toBe("DISCOVERY");
    expect(result.auditEvent.reason).toBe("to DISCOVERY");
  });

  it("snapshots gate dates before verifier awaits", async () => {
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    const mutable = gate("PLAN_APPROVED");
    const originalExpiry = mutable.validUntil.getTime();
    const pending = trustedGateIngestor.ingest(mutable, "owner");
    mutable.validUntil.setTime(0);
    await pending;
    expect((await engine.getGateResult("project-1", mutable.id))?.validUntil.getTime()).toBe(originalExpiry);
  });

  it("uses actor-scoped structured idempotency and detects conflicting reuse", async () => {
    const { engine } = make();
    await create(engine);
    const original = command("DISCOVERY", 0, { idempotencyKey: "same" });
    const first = await engine.transition(original);
    expect((await engine.transition(original)).duplicate).toBe(true);
    await expect(engine.transition({ ...original, targetPhase: "FAILED" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(engine.transition({ ...original, actorId: "other" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(first.auditEvent.id).toBe("project-1:transition:1");
  });

  it("creates one append-only hash-chained AuditEvent per transition", async () => {
    const { engine } = make();
    await create(engine);
    await engine.transition(command("DISCOVERY", 0));
    await engine.transition(command("SPECIFICATION", 1, { newRevisionDigest: NEXT_REVISION }));
    const events = await engine.getAuditEvents("project-1");
    expect(events).toHaveLength(2);
    expect(events[0]?.previousHash).toBeNull();
    expect(events[1]?.previousHash).toBe(events[0]?.eventHash);
    expect(events[1]).toMatchObject({ previousRevisionDigest: REVISION, newRevisionDigest: NEXT_REVISION });
    const copy = events.map((event) => ({ ...event }));
    copy[0]!.reason = "tamper";
    expect((await engine.getAuditEvents("project-1"))[0]?.reason).toBe("to DISCOVERY");
  });
});

describe("closed job types and phase allowlist", () => {
  it("contains no deployment job and rejects unknown runtime job types", async () => {
    expect(JOB_TYPES.some((type) => type.includes("DEPLOY"))).toBe(false);
    expect(Object.values(PHASE_JOB_TYPES).flat().some((type) => type.includes("DEPLOY"))).toBe(false);
    expect(() => (JOB_TYPES as unknown as JobType[]).push("DEPLOY" as JobType)).toThrow(TypeError);

    const { engine } = make();
    await create(engine);
    expect(() => engine.transition(command("DISCOVERY", 0, {
      startJob: { type: "DEPLOY" as JobType },
    }))).toThrow(expect.objectContaining({ code: "JOB_NOT_ALLOWED" }));
  });

  it("permits a job only in its explicitly allowed target phase", async () => {
    const { engine } = make();
    await create(engine);
    await expect(engine.transition(command("DISCOVERY", 0, {
      startJob: { type: "VERIFICATION_CONTROL" },
    }))).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    expect((await engine.transition(command("DISCOVERY", 0, {
      idempotencyKey: "valid-job",
      startJob: { type: "DISCOVERY_CONTROL" },
    }))).job?.status).toBe("PENDING");
  });
});

describe("authoritative Security, Legal, hold and customer-data policy", () => {
  it("implements fail-closed Legal statuses and revision-bound requirements", async () => {
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    expect(() => trustedGateIngestor.ingest(gate("LEGAL_REVIEW_PASSED", "unresolved", {
      status: "PASS", legalStatus: "LEGAL_UNRESOLVED",
    }), "legal")).toThrow(expect.objectContaining({ code: "GATE_INVALID" }));
    expect(() => trustedGateIngestor.ingest(gate("LEGAL_REVIEW_PASSED", "unverified", {
      legalStatus: "PASS_WITH_REQUIREMENTS",
      legalRequirements: [{ id: "dpa", status: "UNVERIFIED", subjectRevisionDigest: REVISION, evidenceDigest: "d".repeat(64) }],
    }), "legal")).toThrow(expect.objectContaining({ code: "GATE_INVALID" }));
    await trustedGateIngestor.ingest(gate("LEGAL_REVIEW_PASSED", "requirements", {
      legalStatus: "PASS_WITH_REQUIREMENTS",
      legalRequirements: [{ id: "dpa", status: "VERIFIED", subjectRevisionDigest: REVISION, evidenceDigest: "d".repeat(64) }],
    }), "legal");
    expect(await engine.getGateResult("project-1", "gate-LEGAL_REVIEW_PASSED-requirements")).toMatchObject({
      legalStatus: "PASS_WITH_REQUIREMENTS", legalRequirements: [{ id: "dpa", status: "VERIFIED" }],
    });
  });

  it("enforces the authoritative SYNTHETIC_ONLY classification at implementation", async () => {
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    await advance(engine, ["DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW", "AWAITING_PLAN_APPROVAL"]);
    const ids = await ingest(trustedGateIngestor, ["ARCHITECTURE_APPROVED", "PLAN_APPROVED"]);
    for (const classification of ["SUSPECTED_REAL", "CONFIRMED_REAL", "UNKNOWN"] as const) {
      await trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", classification, {
        status: "FAIL", customerDataClassification: classification,
      }), "security");
    }
    await expect(engine.transition(command("IMPLEMENTATION", 5, {
      gateResultIds: [...ids, "gate-CUSTOMER_DATA_CLASSIFIED-UNKNOWN"],
    }))).rejects.toMatchObject({ code: "GATE_INVALID" });
  });

  it("lets later adverse Security or Legal evidence globally block RC to STAGING", async () => {
    for (const [adverseName, adverseStatus] of (["SECURITY_REVIEW_PASSED", "LEGAL_REVIEW_PASSED"] as const).flatMap((name) => (["FAIL", "BLOCK", "STALE", "NOT_EVALUATED"] as const).map((status) => [name, status] as const))) {
      const { engine, trustedGateIngestor } = make();
      await create(engine);
      await advance(engine, ["DISCOVERY", "SPECIFICATION", "ARCHITECTURE", "PRE_BUILD_REVIEW", "AWAITING_PLAN_APPROVAL"]);
      await engine.transition(command("IMPLEMENTATION", 5, { gateResultIds: await ingest(trustedGateIngestor, IMPLEMENTATION_GATES, `impl-${adverseName}-${adverseStatus}`) }));
      await engine.transition(command("VERIFICATION", 6));
      await engine.transition(command("RELEASE_CANDIDATE", 7, { gateResultIds: await ingest(trustedGateIngestor, QUALITY_GATES, `rc-${adverseName}-${adverseStatus}`) }));
      await trustedGateIngestor.ingest(gate(adverseName, `adverse-${adverseName}-${adverseStatus}`, {
        status: adverseStatus,
        ...(adverseName === "LEGAL_REVIEW_PASSED" ? { legalStatus: "COUNSEL_REQUIRED" as const, legalRequirements: [] } : {}),
      }), adverseName === "LEGAL_REVIEW_PASSED" ? "legal" : "security");
      const staging = await ingest(trustedGateIngestor, ["RELEASE_APPROVED", "CUSTOMER_DATA_CLASSIFIED"], `stage-${adverseName}-${adverseStatus}`);
      await expect(engine.transition(command("STAGING", 8, { gateResultIds: staging }))).rejects.toMatchObject({ code: "GATE_INVALID" });
    }
  });

  it("requires role-matched, revision-bound and post-hold clearing evidence", async () => {
    let now = new Date(START);
    const fixture = createInMemoryWorkflowFixture({ now: () => new Date(now), attesters: ATTESTERS });
    const engine = new WorkflowEngine(fixture.repository);
    await create(engine);
    await engine.transition(command("DISCOVERY", 0));
    await engine.transition(command("BLOCKED", 1, {
      blockReasons: [{ code: "SEC-1", message: "Security hold", holdType: "SECURITY", clearingAuthority: "SECURITY" }],
    }));
    now = new Date(START.getTime() + 2);
    const base = {
      projectId: "project-1", holdCode: "SEC-1", subjectRevisionDigest: REVISION,
      evidenceDigest: "e".repeat(64), verifiedAt: new Date(START.getTime() + 1),
    } as const;
    await fixture.trustedHoldClearanceIngestor.ingest({ ...base, id: "wrong-role", authorityId: "legal", clearingAuthority: "LEGAL" });
    await expect(engine.transition(command("DISCOVERY", 2, { holdClearanceIds: ["wrong-role"] }))).rejects.toMatchObject({ code: "GATE_INVALID" });
    await fixture.trustedHoldClearanceIngestor.ingest({ ...base, id: "security-clear", authorityId: "security", clearingAuthority: "SECURITY" });
    const resumed = await engine.transition(command("DISCOVERY", 2, { holdClearanceIds: ["security-clear"] }));
    expect(resumed.auditEvent.holdClearanceBindings).toEqual(["security-clear"]);
  });
});
