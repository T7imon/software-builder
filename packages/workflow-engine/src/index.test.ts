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
  type ImmutableEvidenceReference,
  type LegalAssessmentInput,
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
const fixturesByEngine = new WeakMap<WorkflowEngine, ReturnType<typeof createInMemoryWorkflowFixture>>();

function make(now: () => Date = () => new Date(START)) {
  const fixture = createInMemoryWorkflowFixture({ now, attesters: ATTESTERS });
  const engine = new WorkflowEngine(fixture.repository);
  fixturesByEngine.set(engine, fixture);
  return { ...fixture, engine };
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
  const fixture = fixturesByEngine.get(engine);
  if (fixture) {
    await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "baseline"), "security");
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("baseline-legal", "PASS"));
  }
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
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    await engine.transition(command("DISCOVERY", 0));
    await trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "next-revision", { subjectRevisionDigest: NEXT_REVISION }), "security");
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
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    await expect(engine.transition(command("DISCOVERY", 0, {
      startJob: { type: "VERIFICATION_CONTROL" },
    }))).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    await trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "job-start"), "security");
    expect((await engine.transition(command("DISCOVERY", 0, {
      idempotencyKey: "valid-job",
      startJob: { type: "DISCOVERY_CONTROL" },
    }))).job?.status).toBe("PENDING");
  });
});

describe("authoritative Security, Legal, hold and customer-data policy", () => {
  it("rejects embedded Legal lifecycle semantics and keeps the Legal gate a pure attestation", async () => {
    const { engine, trustedGateIngestor } = make();
    await create(engine);
    expect(() => trustedGateIngestor.ingest(gate("LEGAL_REVIEW_PASSED", "unresolved", {
      status: "PASS", legalStatus: "LEGAL_UNRESOLVED" as unknown as NonNullable<GateEvidence["legalStatus"]>,
    }), "legal")).toThrow(expect.objectContaining({ code: "GATE_INVALID" }));
    expect(() => trustedGateIngestor.ingest(gate("LEGAL_REVIEW_PASSED", "injected-requirements", { legalRequirements: [] }), "legal")).toThrow(expect.objectContaining({ code: "GATE_INVALID" }));
    await trustedGateIngestor.ingest(gate("LEGAL_REVIEW_PASSED", "pure"), "legal");
    expect(await engine.getGateResult("project-1", "gate-LEGAL_REVIEW_PASSED-pure")).toMatchObject({ status: "PASS", subjectRevisionDigest: REVISION });
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
      }), adverseName === "LEGAL_REVIEW_PASSED" ? "legal" : "security");
      const staging = await ingest(trustedGateIngestor, ["RELEASE_APPROVED", "CUSTOMER_DATA_CLASSIFIED"], `stage-${adverseName}-${adverseStatus}`);
      await expect(engine.transition(command("STAGING", 8, { gateResultIds: staging }))).rejects.toMatchObject({ code: "GATE_REQUIRED" });
    }
  });

  it("requires role-matched, revision-bound and post-hold clearing evidence", async () => {
    let now = new Date(START);
    const fixture = createInMemoryWorkflowFixture({ now: () => new Date(now), attesters: ATTESTERS });
    const engine = new WorkflowEngine(fixture.repository);
    await create(engine);
    await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "legacy-clear"), "security");
    await engine.transition(command("DISCOVERY", 0));
    await engine.transition(command("BLOCKED", 1, {
      blockReasons: [{ code: "SEC-1", message: "Security hold", evidenceRef: "security-finding-1", holdType: "SECURITY", clearingAuthority: "SECURITY" }],
    }));
    now = new Date(START.getTime() + 2);
    const legacyRef = evidence("legacy-clearance-evidence", { evidenceType: "HOLD_CLEARANCE", classification: "VERIFIED_CLEARANCE", trustedIdentity: "security", finalizedAt: new Date(START.getTime() + 1), verifiedAt: new Date(START.getTime() + 1) });
    const base = {
      projectId: "project-1", holdCode: "SEC-1", subjectRevisionDigest: REVISION,
      scopeType: "PROJECT", scopeId: "project-1", sourceRecordType: "SYSTEM" as const, sourceRecordId: "security-finding-1",
      evidenceDigest: legacyRef.contentDigest, evidenceRef: legacyRef, verifiedAt: new Date(START.getTime() + 1),
    } as const;
    await fixture.trustedHoldClearanceIngestor.ingest({ ...base, id: "wrong-role", authorityId: "legal", clearingAuthority: "LEGAL" });
    await expect(engine.transition(command("DISCOVERY", 2, { holdClearanceIds: ["wrong-role"] }))).rejects.toMatchObject({ code: "GATE_INVALID" });
    await fixture.trustedHoldClearanceIngestor.ingest({ ...base, id: "security-clear", authorityId: "security", clearingAuthority: "SECURITY" });
    const resumed = await engine.transition(command("DISCOVERY", 2, { holdClearanceIds: ["security-clear"] }));
    expect(resumed.auditEvent.holdClearanceBindings).toEqual([expect.objectContaining({ id: "security-clear", authorityId: "security", evidenceDigest: legacyRef.contentDigest })]);
  });
});

function evidence(id: string, overrides: Partial<ImmutableEvidenceReference> = {}): ImmutableEvidenceReference {
  return {
    id, projectId: "project-1", scopeType: "PROJECT", scopeId: "project-1", revisionDigest: REVISION,
    contentDigest: createHash("sha256").update(id).digest("hex"), evidenceType: "LEGAL_RECORD",
    classification: "MINIMIZED_IMMUTABLE", finalizedAt: new Date(START.getTime() - 2),
    verifiedAt: new Date(START.getTime() - 1), trustedIdentity: "legal", ...overrides,
  };
}

function assessment(id: string, status: LegalAssessmentInput["status"], overrides: Partial<LegalAssessmentInput> = {}): LegalAssessmentInput {
  return {
    id, projectId: "project-1", scopeType: "PROJECT", scopeId: "project-1", revisionDigest: REVISION,
    status, factsDigest: createHash("sha256").update(`facts-${id}`).digest("hex"), assumptionsRef: `assumptions-${id}`,
    jurisdictions: ["DE", "EU"], legalDate: new Date(START.getTime() - 3), sourceSetId: `sources-${id}`,
    reviewerType: "LEGAL_DE_EU", evidence: evidence(`evidence-${id}`, { evidenceType: "LEGAL_ASSESSMENT", classification: "VERIFIED_LEGAL_ASSESSMENT" }), finalizedAt: new Date(START.getTime() - 1),
    ...overrides,
  };
}

function scopedAssessment(id: string, scopeType: string, scopeId: string, revisionDigest = REVISION): LegalAssessmentInput {
  return assessment(id, "PASS", { scopeType, scopeId, revisionDigest, evidence: evidence(`${id}-scoped-evidence`, { scopeType, scopeId, revisionDigest, evidenceType: "LEGAL_ASSESSMENT", classification: "VERIFIED_LEGAL_ASSESSMENT" }) });
}

describe("compliance state hardening domain", () => {
  it("fails closed and atomically creates no job without current SYNTHETIC_ONLY evidence", async () => {
    const { engine } = make();
    await engine.createProject("project-1", POLICY, REVISION);
    await expect(engine.transition(command("DISCOVERY", 0, { startJob: { type: "DISCOVERY_CONTROL" } }))).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    expect(await engine.getJobs("project-1")).toEqual([]);
    expect(await engine.getAuditEvents("project-1")).toEqual([]);
    expect(await engine.getProject("project-1")).toMatchObject({ phase: "DRAFT", version: 0 });
  });

  it("accepts exactly four immutable Legal statuses and represents unresolved separately", async () => {
    for (const status of ["PASS", "PASS_WITH_REQUIREMENTS", "BLOCK", "COUNSEL_REQUIRED"] as const) {
      const fixture = make(); await create(fixture.engine);
      await fixture.trustedLegalAssessmentIngestor.ingest(assessment(`assessment-${status}`, status, status === "PASS_WITH_REQUIREMENTS" ? { requirements: [{ id: "req", requirementRef: "DPA" }] } : {}));
      expect((await fixture.engine.getLegalAssessments("project-1")).find((item) => item.id === `assessment-${status}`)?.status).toBe(status);
    }
    const fixture = make(); await create(fixture.engine);
    await expect(fixture.trustedLegalAssessmentIngestor.ingest(assessment("bad", "LEGAL_UNRESOLVED" as unknown as "PASS"))).rejects.toMatchObject({ code: "GATE_INVALID" });
    expect((await fixture.engine.getProjectHolds("project-1")).some((hold) => hold.holdType === "LEGAL_UNRESOLVED_HOLD")).toBe(false);
    await fixture.trustedGateIngestor.ingest(gate("LEGAL_REVIEW_PASSED", "missing", { status: "NOT_EVALUATED" }), "legal");
    expect(await fixture.engine.getProjectHolds("project-1")).toEqual([expect.objectContaining({ holdType: "LEGAL_UNRESOLVED_HOLD", state: "OPEN" })]);
  });

  it("enforces the complete requirement lifecycle and only supersedes via a successor assessment", async () => {
    let now = new Date(START); const fixture = make(() => new Date(now)); await create(fixture.engine);
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("with-req", "PASS_WITH_REQUIREMENTS", { requirements: [{ id: "req-1", requirementRef: "DPA" }] }));
    expect(await fixture.engine.getLegalRequirements("project-1")).toEqual([expect.objectContaining({ state: "OPEN" })]);
    now = new Date(START.getTime() + 1);
    const submitted = { projectId: "project-1", requirementId: "req-1", assessmentId: "with-req", evidence: evidence("submission", { evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", trustedIdentity: "owner", finalizedAt: now, verifiedAt: now }), submittedAt: now };
    await fixture.trustedLegalRequirementIngestor.submit(submitted);
    await expect(fixture.trustedLegalRequirementIngestor.submit({ ...submitted, evidence: evidence("replay-payload", { evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", trustedIdentity: "owner" }) })).rejects.toMatchObject({ code: "GATE_INVALID" });
    now = new Date(START.getTime() + 2);
    await fixture.trustedLegalRequirementIngestor.decide({ projectId: "project-1", requirementId: "req-1", assessmentId: "with-req", decision: "VERIFIED", evidence: evidence("verification", { evidenceType: "LEGAL_REQUIREMENT_DECISION", classification: "VERIFIED_LEGAL_DECISION", finalizedAt: now, verifiedAt: now }), decidedAt: now });
    expect((await fixture.engine.getLegalRequirements("project-1"))[0]).toMatchObject({ state: "VERIFIED", verifiedBy: "legal" });
    await expect(fixture.trustedLegalRequirementIngestor.decide({ projectId: "project-1", requirementId: "req-1", assessmentId: "with-req", decision: "REJECTED", evidence: evidence("late-reject", { evidenceType: "LEGAL_REQUIREMENT_DECISION", classification: "VERIFIED_LEGAL_DECISION" }), decidedAt: new Date(START) })).rejects.toMatchObject({ code: "GATE_INVALID" });
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("successor", "PASS", { supersedesId: "with-req" }));
    expect((await fixture.engine.getLegalRequirements("project-1"))[0]).toMatchObject({ state: "SUPERSEDED", supersededByAssessmentId: "successor" });
  });

  it("requires qualified counsel, closes the case, and binds an immutable successor chain", async () => {
    let now = new Date(START); const fixture = make(() => new Date(now)); await create(fixture.engine);
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("needs-counsel", "COUNSEL_REQUIRED"));
    const counselCase = (await fixture.engine.getCounselCases("project-1"))[0]!;
    now = new Date(START.getTime() + 1); const decision = {
      id: "decision-1", projectId: "project-1", counselCaseId: counselCase.id, predecessorAssessmentId: "needs-counsel",
      qualifiedCounselIdentityRef: "qualified-counsel", scopeType: "PROJECT", scopeId: "project-1", decidedAt: now,
      evidence: evidence("encrypted-decision", { evidenceType: "COUNSEL_DECISION", classification: "ENCRYPTED_COUNSEL_DECISION", trustedIdentity: "qualified-counsel", finalizedAt: now, verifiedAt: now }),
    };
    await fixture.trustedCounselDecisionIngestor.ingest(decision);
    expect((await fixture.engine.getCounselCases("project-1"))[0]).toMatchObject({ state: "CLOSED", decisionId: "decision-1", encryptedDecisionEvidenceId: "encrypted-decision" });
    await expect(fixture.trustedLegalAssessmentIngestor.ingest(assessment("bad-successor", "PASS", { supersedesId: "needs-counsel" }))).rejects.toMatchObject({ code: "GATE_INVALID" });
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("counsel-successor", "PASS", { supersedesId: "needs-counsel", predecessorCounselCaseId: counselCase.id }));
    expect((await fixture.engine.getLegalAssessments("project-1")).find((item) => item.id === "counsel-successor")).toMatchObject({ supersedesId: "needs-counsel", predecessorCounselCaseId: counselCase.id });
  });

  it("keeps adverse project evidence effective across revisions and safely stops pending work", async () => {
    const fixture = make(); await create(fixture.engine);
    await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "initial"), "security");
    const started = await fixture.engine.transition(command("DISCOVERY", 0, { startJob: { type: "DISCOVERY_CONTROL" } }));
    await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "adverse-project", { status: "FAIL", customerDataClassification: "SUSPECTED_REAL" }), "security");
    expect((await fixture.engine.getJobs("project-1"))[0]).toMatchObject({ id: started.job?.id, status: "CANCELLED" });
    expect((await fixture.engine.getProjectHolds("project-1")).filter((hold) => hold.holdType === "PROHIBITED_DATA_HOLD").length).toBeGreaterThanOrEqual(1);
    await expect(fixture.engine.transition(command("SPECIFICATION", 1, { newRevisionDigest: NEXT_REVISION }))).rejects.toMatchObject({ code: "GATE_REQUIRED" });
  });

  it("requires hold-derived authority and complete single-use immutable clearing evidence in audit", async () => {
    let now = new Date(START);
    const fixture = createInMemoryWorkflowFixture({ now: () => new Date(now), attesters: ATTESTERS });
    const engine = new WorkflowEngine(fixture.repository); await create(engine);
    const adverse = gate("CUSTOMER_DATA_CLASSIFIED", "clear-adverse", { status: "FAIL", customerDataClassification: "SUSPECTED_REAL" });
    await fixture.trustedGateIngestor.ingest(adverse, "security");
    const hold = (await engine.getProjectHolds("project-1"))[0]!;
    now = new Date(START.getTime() + 2);
    await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "clear-positive", { evaluatedAt: new Date(START.getTime() + 1) }), "security");
    const clearingRef = evidence("clearing-reference", { finalizedAt: new Date(START.getTime() + 1), verifiedAt: new Date(START.getTime() + 1), evidenceType: "HOLD_CLEARANCE", classification: "VERIFIED_CLEARANCE", trustedIdentity: "security" });
    const base = {
      projectId: "project-1", holdCode: hold.id, scopeType: hold.scopeType, scopeId: hold.scopeId,
      sourceRecordType: hold.sourceRecordType, sourceRecordId: hold.sourceRecordId, subjectRevisionDigest: REVISION,
      evidenceDigest: clearingRef.contentDigest, evidenceRef: clearingRef, verifiedAt: new Date(START.getTime() + 1),
    } as const;
    await fixture.trustedHoldClearanceIngestor.ingest({ ...base, id: "wrong-authority", authorityId: "legal", clearingAuthority: "LEGAL" });
    await expect(engine.transition(command("DISCOVERY", 0, { holdClearanceIds: ["wrong-authority"] }))).rejects.toMatchObject({ code: "GATE_INVALID" });
    const wrongRevisionRef = evidence("wrong-revision-clearance", { revisionDigest: NEXT_REVISION, evidenceType: "HOLD_CLEARANCE", classification: "VERIFIED_CLEARANCE", trustedIdentity: "security", finalizedAt: new Date(START.getTime() + 1), verifiedAt: new Date(START.getTime() + 1) });
    await fixture.trustedHoldClearanceIngestor.ingest({ ...base, id: "wrong-revision", subjectRevisionDigest: NEXT_REVISION, evidenceDigest: wrongRevisionRef.contentDigest, evidenceRef: wrongRevisionRef, authorityId: "security", clearingAuthority: "SECURITY" });
    await expect(engine.transition(command("DISCOVERY", 0, { holdClearanceIds: ["wrong-revision"] }))).rejects.toMatchObject({ code: "GATE_INVALID" });
    await fixture.trustedHoldClearanceIngestor.ingest({ ...base, id: "valid-clearance", authorityId: "security", clearingAuthority: "SECURITY" });
    const result = await engine.transition(command("DISCOVERY", 0, { idempotencyKey: "cleared", holdClearanceIds: ["valid-clearance"] }));
    expect(result.auditEvent.holdClearanceBindings).toEqual([expect.objectContaining({ id: "valid-clearance", sourceRecordId: adverse.id, evidenceRef: expect.objectContaining({ id: "clearing-reference", contentDigest: clearingRef.contentDigest }) })]);
    result.auditEvent.holdClearanceBindings![0]!.evidenceRef!.verifiedAt.setTime(0);
    expect((await engine.getAuditEvents("project-1"))[0]?.holdClearanceBindings?.[0]?.evidenceRef?.verifiedAt).toEqual(new Date(START.getTime() + 1));
    await expect(engine.transition(command("SPECIFICATION", 1, { idempotencyKey: "replay-clear", holdClearanceIds: ["valid-clearance"] }))).rejects.toMatchObject({ code: "GATE_REQUIRED" });
  });

  it("rechecks transition and worker idempotency replays after later adverse evidence", async () => {
    const fixture = make(); await create(fixture.engine);
    await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "replay-initial"), "security");
    const request = command("DISCOVERY", 0, { idempotencyKey: "replayed-start", startJob: { type: "DISCOVERY_CONTROL" } });
    await fixture.engine.transition(request);
    await fixture.trustedGateIngestor.ingest(gate("SECURITY_REVIEW_PASSED", "replay-adverse", { status: "BLOCK" }), "security");
    await expect(fixture.engine.transition(request)).rejects.toMatchObject({ code: "GATE_INVALID" });
  });

  it("never authorizes a project operation with exact-scope synthetic evidence", async () => {
    const fixture = make();
    await fixture.engine.createProject("project-1", POLICY, REVISION);
    await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "task-only", { scopeType: "TASK", scopeId: "task-1" }), "security");
    await fixture.trustedLegalAssessmentIngestor.ingest(scopedAssessment("task-legal", "TASK", "task-1"));
    await expect(fixture.engine.transition(command("DISCOVERY", 0, { startJob: { type: "DISCOVERY_CONTROL" } }))).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    expect(await fixture.engine.getJobs("project-1")).toEqual([]);
  });

  it("applies exact-scope holds only to the exact operation across revisions and project holds to every scope", async () => {
    const fixture = make(); await create(fixture.engine);
    await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "task-adverse", { status: "FAIL", customerDataClassification: "SUSPECTED_REAL", scopeType: "TASK", scopeId: "task-1" }), "security");
    await fixture.engine.transition(command("DISCOVERY", 0));
    await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "task-next", { subjectRevisionDigest: NEXT_REVISION, scopeType: "TASK", scopeId: "task-1" }), "security");
    await fixture.trustedLegalAssessmentIngestor.ingest(scopedAssessment("task-next-legal", "TASK", "task-1", NEXT_REVISION));
    await expect(fixture.engine.transition(command("SPECIFICATION", 1, { newRevisionDigest: NEXT_REVISION, operationScope: { scopeType: "TASK", scopeId: "task-1" } }))).rejects.toMatchObject({ code: "GATE_REQUIRED" });

    const projectWide = make(); await create(projectWide.engine);
    await projectWide.trustedGateIngestor.ingest(gate("SECURITY_REVIEW_PASSED", "project-adverse", { status: "BLOCK" }), "security");
    await expect(projectWide.engine.transition(command("DISCOVERY", 0, { operationScope: { scopeType: "TASK", scopeId: "task-9" } }))).rejects.toMatchObject({ code: "GATE_REQUIRED" });
  });

  it("keeps LegalAssessment ingest atomic when successor requirements collide", async () => {
    const fixture = make(); await create(fixture.engine);
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("atomic-parent", "PASS_WITH_REQUIREMENTS", { requirements: [{ id: "atomic-req", requirementRef: "DPA" }] }));
    await expect(fixture.trustedLegalAssessmentIngestor.ingest(assessment("atomic-bad", "PASS_WITH_REQUIREMENTS", { supersedesId: "atomic-parent", requirements: [{ id: "atomic-req", requirementRef: "duplicate" }] }))).rejects.toMatchObject({ code: "GATE_ALREADY_EXISTS" });
    expect((await fixture.engine.getLegalAssessments("project-1")).some((item) => item.id === "atomic-bad")).toBe(false);
    const preserved = (await fixture.engine.getLegalRequirements("project-1")).find((item) => item.id === "atomic-req")!;
    expect(preserved.state).toBe("OPEN"); expect(preserved).not.toHaveProperty("supersededByAssessmentId");
  });

  it("rejects every forbidden requirement edge, records REJECTED, and blocks semantic evidence replay", async () => {
    let now = new Date(START); const fixture = make(() => new Date(now)); await create(fixture.engine);
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("edges", "PASS_WITH_REQUIREMENTS", { requirements: [{ id: "edge-1", requirementRef: "one" }, { id: "edge-2", requirementRef: "two" }] }));
    const decisionEvidence = (id: string) => evidence(id, { evidenceType: "LEGAL_REQUIREMENT_DECISION", classification: "VERIFIED_LEGAL_DECISION", finalizedAt: now, verifiedAt: now });
    await expect(fixture.trustedLegalRequirementIngestor.decide({ projectId: "project-1", requirementId: "edge-1", assessmentId: "edges", decision: "VERIFIED", evidence: decisionEvidence("premature"), decidedAt: START })).rejects.toMatchObject({ code: "GATE_INVALID" });
    now = new Date(START.getTime() + 1); const shared = evidence("shared-submission", { evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", trustedIdentity: "owner", finalizedAt: now, verifiedAt: now });
    await fixture.trustedLegalRequirementIngestor.submit({ projectId: "project-1", requirementId: "edge-1", assessmentId: "edges", evidence: shared, submittedAt: now });
    await expect(fixture.trustedLegalRequirementIngestor.submit({ projectId: "project-1", requirementId: "edge-2", assessmentId: "edges", evidence: { ...shared, id: "shared-new-id" }, submittedAt: now })).rejects.toMatchObject({ code: "GATE_ALREADY_EXISTS" });
    now = new Date(START.getTime() + 2); await fixture.trustedLegalRequirementIngestor.decide({ projectId: "project-1", requirementId: "edge-1", assessmentId: "edges", decision: "REJECTED", evidence: decisionEvidence("rejected"), decidedAt: now });
    expect((await fixture.engine.getLegalRequirements("project-1")).find((item) => item.id === "edge-1")).toMatchObject({ state: "REJECTED" });
    await expect(fixture.trustedLegalRequirementIngestor.decide({ projectId: "project-1", requirementId: "edge-1", assessmentId: "edges", decision: "REJECTED", evidence: decisionEvidence("repeat-rejected"), decidedAt: START })).rejects.toMatchObject({ code: "GATE_INVALID" });
    await expect(fixture.trustedLegalRequirementIngestor.submit({ projectId: "project-1", requirementId: "edge-1", assessmentId: "edges", evidence: evidence("after-reject", { evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", trustedIdentity: "owner" }), submittedAt: START })).rejects.toMatchObject({ code: "GATE_INVALID" });
    await expect(fixture.trustedLegalRequirementIngestor.submit({ projectId: "project-1", requirementId: "edge-2", assessmentId: "wrong-assessment", evidence: evidence("wrong-assessment-submit", { evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", trustedIdentity: "owner" }), submittedAt: START })).rejects.toMatchObject({ code: "GATE_INVALID" });
    await expect(fixture.trustedLegalRequirementIngestor.submit({ projectId: "other-project", requirementId: "edge-2", assessmentId: "edges", evidence: { ...shared, id: "wrong-project", projectId: "other-project", scopeId: "other-project" }, submittedAt: START })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    now = new Date(START.getTime() + 3); await fixture.trustedLegalRequirementIngestor.submit({ projectId: "project-1", requirementId: "edge-2", assessmentId: "edges", evidence: evidence("edge-2-submit", { evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", trustedIdentity: "owner", finalizedAt: now, verifiedAt: now }), submittedAt: now });
    now = new Date(START.getTime() + 4); await fixture.trustedLegalRequirementIngestor.decide({ projectId: "project-1", requirementId: "edge-2", assessmentId: "edges", decision: "VERIFIED", evidence: decisionEvidence("edge-2-verified"), decidedAt: now });
    await expect(fixture.trustedLegalRequirementIngestor.decide({ projectId: "project-1", requirementId: "edge-2", assessmentId: "edges", decision: "REJECTED", evidence: decisionEvidence("repeat-verified"), decidedAt: START })).rejects.toMatchObject({ code: "GATE_INVALID" });
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("edges-successor", "PASS", { supersedesId: "edges" }));
    await expect(fixture.trustedLegalRequirementIngestor.submit({ projectId: "project-1", requirementId: "edge-1", assessmentId: "edges", evidence: evidence("superseded-submit", { evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", trustedIdentity: "owner" }), submittedAt: START })).rejects.toMatchObject({ code: "GATE_INVALID" });
    await expect(fixture.trustedLegalRequirementIngestor.decide({ projectId: "project-1", requirementId: "edge-2", assessmentId: "edges", decision: "VERIFIED", evidence: decisionEvidence("superseded-decision"), decidedAt: START })).rejects.toMatchObject({ code: "GATE_INVALID" });
  });

  it("creates LEGAL_UNRESOLVED_HOLD for missing and equal-time conflicting domain Legal truth independent of order", async () => {
    for (const order of [["conflict-a", "conflict-b"], ["conflict-b", "conflict-a"]] as const) {
      const fixture = make(); await fixture.engine.createProject("project-1", POLICY, REVISION);
      await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", `synthetic-${order[0]}`), "security");
      for (const id of order) await fixture.trustedLegalAssessmentIngestor.ingest(assessment(id, "PASS", { factsDigest: createHash("sha256").update(id).digest("hex") }));
      await expect(fixture.engine.transition(command("DISCOVERY", 0, { startJob: { type: "DISCOVERY_CONTROL" } }))).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
      expect((await fixture.engine.getProjectHolds("project-1")).some((hold) => hold.holdType === "LEGAL_UNRESOLVED_HOLD")).toBe(true);
    }
    const missing = make(); await missing.engine.createProject("project-1", POLICY, REVISION);
    await missing.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "missing-domain"), "security");
    await expect(missing.engine.transition(command("DISCOVERY", 0, { startJob: { type: "DISCOVERY_CONTROL" } }))).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    expect(await missing.engine.getProjectHolds("project-1")).toEqual([expect.objectContaining({ holdType: "LEGAL_UNRESOLVED_HOLD" })]);
  });

  it("rejects wrong-purpose, wrong-revision and wrong-identity lifecycle evidence", async () => {
    const fixture = make(); await create(fixture.engine);
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("strict-evidence", "PASS_WITH_REQUIREMENTS", { requirements: [{ id: "strict-req", requirementRef: "strict" }] }));
    const baseSubmission = { projectId: "project-1", requirementId: "strict-req", assessmentId: "strict-evidence", submittedAt: START };
    for (const bad of [
      evidence("bad-type", { trustedIdentity: "owner" }),
      evidence("bad-revision", { evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", trustedIdentity: "owner", revisionDigest: NEXT_REVISION }),
      evidence("bad-identity", { evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", trustedIdentity: "attacker" }),
      evidence("stale-verification", { evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", trustedIdentity: "owner", verifiedAt: new Date(START.getTime() - 2) }),
      evidence("future-verification", { evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", trustedIdentity: "owner", finalizedAt: new Date(START.getTime() + 1), verifiedAt: new Date(START.getTime() + 1) }),
    ]) await expect(fixture.trustedLegalRequirementIngestor.submit({ ...baseSubmission, evidence: bad })).rejects.toMatchObject({ code: "GATE_INVALID" });
    expect((await fixture.engine.getLegalRequirements("project-1")).find((item) => item.id === "strict-req")).toMatchObject({ state: "OPEN" });
  });

  it("does not let generic Legal clearance bypass unresolved or open requirement predicates", async () => {
    let now = new Date(START);
    const fixture = createInMemoryWorkflowFixture({ now: () => new Date(now), attesters: ATTESTERS });
    const engine = new WorkflowEngine(fixture.repository); await engine.createProject("project-1", POLICY, REVISION);
    await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "unresolved-clear"), "security");
    await expect(engine.transition(command("DISCOVERY", 0, { startJob: { type: "DISCOVERY_CONTROL" } }))).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    const unresolved = (await engine.getProjectHolds("project-1"))[0]!; now = new Date(START.getTime() + 2);
    const unresolvedRef = evidence("unresolved-clear-ref", { evidenceType: "HOLD_CLEARANCE", classification: "VERIFIED_CLEARANCE", trustedIdentity: "legal", finalizedAt: new Date(START.getTime() + 1), verifiedAt: new Date(START.getTime() + 1) });
    await fixture.trustedHoldClearanceIngestor.ingest({ id: "unresolved-generic", projectId: "project-1", holdCode: unresolved.id, clearingAuthority: "LEGAL", authorityId: "legal", subjectRevisionDigest: REVISION, scopeType: unresolved.scopeType, scopeId: unresolved.scopeId, sourceRecordType: unresolved.sourceRecordType, sourceRecordId: unresolved.sourceRecordId, evidenceDigest: unresolvedRef.contentDigest, evidenceRef: unresolvedRef, verifiedAt: new Date(START.getTime() + 1) });
    await expect(engine.transition(command("DISCOVERY", 0, { holdClearanceIds: ["unresolved-generic"] }))).rejects.toMatchObject({ code: "GATE_INVALID" });
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("resolved-domain", "PASS"));
    await expect(engine.transition(command("DISCOVERY", 0, { idempotencyKey: "resolved", holdClearanceIds: ["unresolved-generic"] }))).resolves.toMatchObject({ project: { phase: "DISCOVERY" } });

    const requirements = createInMemoryWorkflowFixture({ now: () => new Date(now), attesters: ATTESTERS }); const requirementEngine = new WorkflowEngine(requirements.repository);
    await requirementEngine.createProject("project-1", POLICY, REVISION);
    await requirements.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "requirement-clear"), "security");
    await requirements.trustedLegalAssessmentIngestor.ingest(assessment("open-requirement", "PASS_WITH_REQUIREMENTS", { requirements: [{ id: "open-clear-req", requirementRef: "open" }] }));
    const requirementHold = (await requirementEngine.getProjectHolds("project-1"))[0]!;
    now = new Date(START.getTime() + 4);
    const requirementRef = evidence("requirement-clear-ref", { evidenceType: "HOLD_CLEARANCE", classification: "VERIFIED_CLEARANCE", trustedIdentity: "legal", finalizedAt: new Date(START.getTime() + 3), verifiedAt: new Date(START.getTime() + 3) });
    await requirements.trustedHoldClearanceIngestor.ingest({ id: "requirement-generic", projectId: "project-1", holdCode: requirementHold.id, clearingAuthority: "LEGAL", authorityId: "legal", subjectRevisionDigest: REVISION, scopeType: requirementHold.scopeType, scopeId: requirementHold.scopeId, sourceRecordType: requirementHold.sourceRecordType, sourceRecordId: requirementHold.sourceRecordId, evidenceDigest: requirementRef.contentDigest, evidenceRef: requirementRef, verifiedAt: new Date(START.getTime() + 3) });
    await expect(requirementEngine.transition(command("DISCOVERY", 0, { holdClearanceIds: ["requirement-generic"] }))).rejects.toMatchObject({ code: "GATE_INVALID" });
  });

  it("binds Counsel evidence identity/purpose/revision and snapshots mutable Legal input", async () => {
    const fixture = make(); await create(fixture.engine);
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("strict-counsel", "COUNSEL_REQUIRED"));
    const counselCase = (await fixture.engine.getCounselCases("project-1")).find((item) => item.assessmentId === "strict-counsel")!;
    const counselBase = { id: "strict-counsel-decision", projectId: "project-1", counselCaseId: counselCase.id, predecessorAssessmentId: "strict-counsel", qualifiedCounselIdentityRef: "qualified-counsel", scopeType: "PROJECT", scopeId: "project-1", decidedAt: START };
    await expect(fixture.trustedCounselDecisionIngestor.ingest({ ...counselBase, evidence: evidence("counsel-wrong-revision", { revisionDigest: NEXT_REVISION, evidenceType: "COUNSEL_DECISION", classification: "ENCRYPTED_COUNSEL_DECISION", trustedIdentity: "qualified-counsel" }) })).rejects.toMatchObject({ code: "GATE_INVALID" });
    await expect(fixture.trustedCounselDecisionIngestor.ingest({ ...counselBase, evidence: evidence("counsel-wrong-identity", { evidenceType: "COUNSEL_DECISION", classification: "ENCRYPTED_COUNSEL_DECISION", trustedIdentity: "legal" }) })).rejects.toMatchObject({ code: "GATE_INVALID" });

    const mutable = assessment("snapshot-legal", "PASS") as LegalAssessmentInput & { status: LegalAssessmentInput["status"] };
    const pending = fixture.trustedLegalAssessmentIngestor.ingest(mutable); mutable.status = "BLOCK"; mutable.evidence.verifiedAt.setTime(0); await pending;
    expect((await fixture.engine.getLegalAssessments("project-1")).find((item) => item.id === "snapshot-legal")).toMatchObject({ status: "PASS", evidence: { verifiedAt: new Date(START.getTime() - 1) } });
    await expect(fixture.trustedLegalAssessmentIngestor.ingest({ ...assessment("null-status", "PASS"), status: null } as unknown as LegalAssessmentInput)).rejects.toMatchObject({ code: "GATE_INVALID" });
  });

  it("rejects semantic clearing-evidence replay under different IDs", async () => {
    let now = new Date(START); const fixture = createInMemoryWorkflowFixture({ now: () => new Date(now), attesters: ATTESTERS }); const engine = new WorkflowEngine(fixture.repository);
    await engine.createProject("project-1", POLICY, REVISION);
    await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "replay-base"), "security");
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("replay-legal", "PASS"));
    await fixture.trustedGateIngestor.ingest(gate("SECURITY_REVIEW_PASSED", "replay-security", { status: "BLOCK" }), "security");
    await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "replay-data", { status: "FAIL", customerDataClassification: "SUSPECTED_REAL" }), "security");
    const holds = await engine.getProjectHolds("project-1"); now = new Date(START.getTime() + 2);
    const shared = evidence("shared-clearance", { evidenceType: "HOLD_CLEARANCE", classification: "VERIFIED_CLEARANCE", trustedIdentity: "security", finalizedAt: new Date(START.getTime() + 1), verifiedAt: new Date(START.getTime() + 1) });
    const ids: string[] = [];
    for (const [index, hold] of holds.entries()) {
      const id = `semantic-clear-${index}`; ids.push(id);
      const replayRef = { ...shared, id: `shared-clearance-${index}` };
      await fixture.trustedHoldClearanceIngestor.ingest({ id, projectId: "project-1", holdCode: hold.id, clearingAuthority: "SECURITY", authorityId: "security", subjectRevisionDigest: REVISION, scopeType: hold.scopeType, scopeId: hold.scopeId, sourceRecordType: hold.sourceRecordType, sourceRecordId: hold.sourceRecordId, evidenceDigest: replayRef.contentDigest, evidenceRef: replayRef, verifiedAt: new Date(START.getTime() + 1) });
    }
    await expect(engine.transition(command("DISCOVERY", 0, { holdClearanceIds: ids }))).rejects.toMatchObject({ code: "GATE_INVALID" });
  });

  it("opens unresolved for an already-expired positive Legal review and rejects gate-counsel bypass", async () => {
    const fixture = make(); await create(fixture.engine);
    await fixture.trustedGateIngestor.ingest(gate("LEGAL_REVIEW_PASSED", "expired-positive", { validUntil: new Date(START.getTime() - 1) }), "legal");
    expect((await fixture.engine.getProjectHolds("project-1")).some((hold) => hold.holdType === "LEGAL_UNRESOLVED_HOLD")).toBe(true);
    const beforeCases = (await fixture.engine.getCounselCases("project-1")).length;
    expect(() => fixture.trustedGateIngestor.ingest(gate("LEGAL_REVIEW_PASSED", "fake-counsel", { status: "BLOCK", legalStatus: "COUNSEL_REQUIRED" }), "legal")).toThrow(expect.objectContaining({ code: "GATE_INVALID" }));
    expect(await fixture.engine.getCounselCases("project-1")).toHaveLength(beforeCases);
    expect((await fixture.engine.getProjectHolds("project-1")).some((hold) => hold.holdType === "COUNSEL_REQUIRED_HOLD")).toBe(false);
  });

  it("rejects semantic Gate replay under a new ID and persists equal-time conflicts independent of ingest order", async () => {
    const replay = make(); await create(replay.engine);
    const original = gate("SECURITY_REVIEW_PASSED", "semantic-original"); await replay.trustedGateIngestor.ingest(original, "security");
    await expect(replay.trustedGateIngestor.ingest({ ...original, id: "semantic-new-id" }, "security")).rejects.toMatchObject({ code: "GATE_ALREADY_EXISTS" });

    const holdIds: string[][] = [];
    for (const order of ["PASS_FIRST", "BLOCK_FIRST"] as const) {
      const fixture = make(); await create(fixture.engine);
      const pass = gate("SECURITY_REVIEW_PASSED", "equal-pass", { status: "PASS" });
      const block = gate("SECURITY_REVIEW_PASSED", "equal-block", { status: "BLOCK" });
      for (const item of order === "PASS_FIRST" ? [pass, block] : [block, pass]) await fixture.trustedGateIngestor.ingest(item, "security");
      const holds = (await fixture.engine.getProjectHolds("project-1")).filter((hold) => hold.holdType === "SECURITY_ADVERSE_HOLD").map((hold) => hold.id).sort(); holdIds.push(holds);
      await expect(fixture.engine.transition(command("DISCOVERY", 0))).rejects.toMatchObject({ code: "GATE_REQUIRED" });
    }
    expect(holdIds[0]).toEqual(holdIds[1]);
  });

  it("allows exactly one immediate successor and rejects forks before mutation", async () => {
    const fixture = make(); await create(fixture.engine);
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("fork-parent", "PASS"));
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("fork-first", "PASS", { supersedesId: "fork-parent" }));
    await expect(fixture.trustedLegalAssessmentIngestor.ingest(assessment("fork-second", "PASS", { supersedesId: "fork-parent" }))).rejects.toMatchObject({ code: "GATE_ALREADY_EXISTS" });
    expect((await fixture.engine.getLegalAssessments("project-1")).filter((item) => item.supersedesId === "fork-parent")).toHaveLength(1);
    expect((await fixture.engine.getLegalAssessments("project-1")).some((item) => item.id === "fork-second")).toBe(false);
  });

  it("completes Counsel case, qualified decision, effective successor, Legal clearance and continuation", async () => {
    let now = new Date(START); const fixture = createInMemoryWorkflowFixture({ now: () => new Date(now), attesters: ATTESTERS }); const engine = new WorkflowEngine(fixture.repository);
    await engine.createProject("project-1", POLICY, REVISION); await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", "counsel-flow"), "security");
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("flow-counsel", "COUNSEL_REQUIRED")); const counselCase = (await engine.getCounselCases("project-1"))[0]!; const hold = (await engine.getProjectHolds("project-1"))[0]!;
    now = new Date(START.getTime() + 2);
    await fixture.trustedCounselDecisionIngestor.ingest({ id: "flow-decision", projectId: "project-1", counselCaseId: counselCase.id, predecessorAssessmentId: "flow-counsel", qualifiedCounselIdentityRef: "qualified-counsel", scopeType: "PROJECT", scopeId: "project-1", decidedAt: new Date(START.getTime() + 1), evidence: evidence("flow-decision-evidence", { evidenceType: "COUNSEL_DECISION", classification: "ENCRYPTED_COUNSEL_DECISION", trustedIdentity: "qualified-counsel", finalizedAt: new Date(START.getTime() + 1), verifiedAt: new Date(START.getTime() + 1) }) });
    now = new Date(START.getTime() + 3);
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("flow-successor", "PASS", { supersedesId: "flow-counsel", predecessorCounselCaseId: counselCase.id, finalizedAt: new Date(START.getTime() + 2), evidence: evidence("flow-successor-evidence", { evidenceType: "LEGAL_ASSESSMENT", classification: "VERIFIED_LEGAL_ASSESSMENT", finalizedAt: new Date(START.getTime() + 2), verifiedAt: new Date(START.getTime() + 2) }) }));
    now = new Date(START.getTime() + 5); const clearanceRef = evidence("flow-clearance", { evidenceType: "HOLD_CLEARANCE", classification: "VERIFIED_CLEARANCE", trustedIdentity: "legal", finalizedAt: new Date(START.getTime() + 4), verifiedAt: new Date(START.getTime() + 4) });
    await fixture.trustedHoldClearanceIngestor.ingest({ id: "flow-clear", projectId: "project-1", holdCode: hold.id, clearingAuthority: "LEGAL", authorityId: "legal", subjectRevisionDigest: REVISION, scopeType: hold.scopeType, scopeId: hold.scopeId, sourceRecordType: hold.sourceRecordType, sourceRecordId: hold.sourceRecordId, evidenceDigest: clearanceRef.contentDigest, evidenceRef: clearanceRef, verifiedAt: new Date(START.getTime() + 4) });
    await expect(engine.transition(command("DISCOVERY", 0, { holdClearanceIds: ["flow-clear"] }))).resolves.toMatchObject({ project: { phase: "DISCOVERY" } });
    expect((await engine.getProjectHolds("project-1"))[0]).toMatchObject({ holdType: "COUNSEL_REQUIRED_HOLD", state: "CLEARED", clearingEvidence: { id: "flow-clear" } });
  });

  it("opens persistent unresolved and safely stops claimed and pending jobs when Legal review expires after ingest", async () => {
    for (const claimed of [true, false]) {
      let now = new Date(START); const fixture = createInMemoryWorkflowFixture({ now: () => new Date(now), attesters: ATTESTERS }); const engine = new WorkflowEngine(fixture.repository);
      await engine.createProject("project-1", POLICY, REVISION); await fixture.trustedGateIngestor.ingest(gate("CUSTOMER_DATA_CLASSIFIED", `runtime-${claimed}`), "security");
      await fixture.trustedLegalAssessmentIngestor.ingest(assessment(`runtime-legal-${claimed}`, "PASS"));
      await fixture.trustedGateIngestor.ingest(gate("LEGAL_REVIEW_PASSED", `runtime-review-${claimed}`, { validUntil: new Date(START.getTime() + 1) }), "legal");
      const started = await engine.transition(command("DISCOVERY", 0, { idempotencyKey: `runtime-start-${claimed}`, startJob: { type: "DISCOVERY_CONTROL" } }));
      const claimRequest = { jobId: started.job!.id, projectId: "project-1", expectedAggregateVersion: 1, expectedRevisionDigest: REVISION, workerId: "worker-1", idempotencyKey: `runtime-claim-${claimed}`, leaseDurationMs: 60_000 };
      if (claimed) await engine.claimJob(claimRequest);
      now = new Date(START.getTime() + 2);
      if (claimed) await expect(engine.authorizeJobWork({ jobId: started.job!.id, projectId: "project-1", expectedAggregateVersion: 1, expectedRevisionDigest: REVISION, workerId: "worker-1", claimIdempotencyKey: claimRequest.idempotencyKey, idempotencyKey: "expired-authorize" })).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
      else await expect(engine.transition(command("SPECIFICATION", 1, { idempotencyKey: "expired-transition" }))).rejects.toMatchObject({ code: "GATE_INVALID" });
      expect((await engine.getProjectHolds("project-1")).some((hold) => hold.holdType === "LEGAL_UNRESOLVED_HOLD" && hold.state === "OPEN")).toBe(true);
      expect((await engine.getJobs("project-1"))[0]?.status).toBe(claimed ? "CANCELLING" : "CANCELLED");
    }
  });

  it("enforces and immutably persists Requirement submission and decision chronology", async () => {
    let now = new Date(START); const fixture = make(() => new Date(now)); await create(fixture.engine);
    await fixture.trustedLegalAssessmentIngestor.ingest(assessment("chronology", "PASS_WITH_REQUIREMENTS", { requirements: [{ id: "chronology-req", requirementRef: "chronology" }] }));
    const submissionEvidence = (id: string, at: Date) => evidence(id, { evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", trustedIdentity: "owner", finalizedAt: at, verifiedAt: at });
    await expect(fixture.trustedLegalRequirementIngestor.submit({ projectId: "project-1", requirementId: "chronology-req", assessmentId: "chronology", evidence: submissionEvidence("backdated-submission", new Date(START.getTime() - 1)), submittedAt: new Date(START.getTime() - 1) })).rejects.toMatchObject({ code: "GATE_INVALID" });
    now = new Date(START.getTime() + 1); await fixture.trustedLegalRequirementIngestor.submit({ projectId: "project-1", requirementId: "chronology-req", assessmentId: "chronology", evidence: submissionEvidence("valid-submission", now), submittedAt: now });
    const stored = (await fixture.engine.getLegalRequirements("project-1")).find((item) => item.id === "chronology-req")!;
    expect(stored).toMatchObject({ submittedAt: now, submittedBy: "owner", submissionIngestedAt: now, state: "EVIDENCE_SUBMITTED" }); stored.submittedAt!.setTime(0); stored.submissionIngestedAt!.setTime(0);
    expect((await fixture.engine.getLegalRequirements("project-1")).find((item) => item.id === "chronology-req")).toMatchObject({ submittedAt: now, submittedBy: "owner", submissionIngestedAt: now });
    const decisionAt = new Date(START.getTime() + 1);
    await expect(fixture.trustedLegalRequirementIngestor.decide({ projectId: "project-1", requirementId: "chronology-req", assessmentId: "chronology", decision: "VERIFIED", evidence: evidence("equal-decision", { evidenceType: "LEGAL_REQUIREMENT_DECISION", classification: "VERIFIED_LEGAL_DECISION", finalizedAt: decisionAt, verifiedAt: decisionAt }), decidedAt: decisionAt })).rejects.toMatchObject({ code: "GATE_INVALID" });
    now = new Date(START.getTime() + 2); await fixture.trustedLegalRequirementIngestor.decide({ projectId: "project-1", requirementId: "chronology-req", assessmentId: "chronology", decision: "VERIFIED", evidence: evidence("valid-decision", { evidenceType: "LEGAL_REQUIREMENT_DECISION", classification: "VERIFIED_LEGAL_DECISION", finalizedAt: now, verifiedAt: now }), decidedAt: now });
    expect((await fixture.engine.getLegalRequirements("project-1")).find((item) => item.id === "chronology-req")).toMatchObject({ state: "VERIFIED", verifiedAt: now, decisionIngestedAt: now });
  });

  it("rejects backdated Counsel decisions and legalDate after finalization", async () => {
    const fixture = make(); await create(fixture.engine); await fixture.trustedLegalAssessmentIngestor.ingest(assessment("backdated-counsel", "COUNSEL_REQUIRED")); const counselCase = (await fixture.engine.getCounselCases("project-1")).find((item) => item.assessmentId === "backdated-counsel")!;
    await expect(fixture.trustedCounselDecisionIngestor.ingest({ id: "backdated-decision", projectId: "project-1", counselCaseId: counselCase.id, predecessorAssessmentId: "backdated-counsel", qualifiedCounselIdentityRef: "qualified-counsel", scopeType: "PROJECT", scopeId: "project-1", decidedAt: START, evidence: evidence("backdated-counsel-evidence", { evidenceType: "COUNSEL_DECISION", classification: "ENCRYPTED_COUNSEL_DECISION", trustedIdentity: "qualified-counsel", finalizedAt: START, verifiedAt: START }) })).rejects.toMatchObject({ code: "GATE_INVALID" });
    await expect(fixture.trustedLegalAssessmentIngestor.ingest(assessment("bad-legal-date", "PASS", { legalDate: START, finalizedAt: new Date(START.getTime() - 1) }))).rejects.toMatchObject({ code: "GATE_INVALID" });
  });
});
