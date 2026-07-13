import { describe, expect, it } from "vitest";

import {
  WorkflowEngine,
  createInMemoryWorkflowFixture,
  type ClaimJobRequest,
  type ProjectPhase,
  type TransitionRequest,
  type WorkerIdentityVerifier,
} from "./index.js";

const REVISION = "a".repeat(64);
const POLICY = "policy-1";
const NOW = new Date("2026-07-12T12:00:00.000Z");

function make(workerIdentityVerifier?: WorkerIdentityVerifier) {
  const fixture = createInMemoryWorkflowFixture({ now: () => new Date(NOW), attesters: { security: "SECURITY" }, ...(workerIdentityVerifier ? { workerIdentityVerifier } : {}) });
  return { ...fixture, engine: new WorkflowEngine(fixture.repository) };
}

function command(
  targetPhase: ProjectPhase,
  version: number,
  key: string,
  extra: Partial<TransitionRequest> = {},
): TransitionRequest {
  return {
    projectId: "project-1",
    targetPhase,
    expectedVersion: version,
    expectedRevisionDigest: REVISION,
    policyVersion: POLICY,
    actorId: "owner",
    reason: "integration",
    idempotencyKey: key,
    ...extra,
  };
}

function claim(jobId: string, extra: Partial<ClaimJobRequest> = {}): ClaimJobRequest {
  return {
    jobId,
    projectId: "project-1",
    expectedAggregateVersion: 1,
    expectedRevisionDigest: REVISION,
    workerId: "worker-1",
    idempotencyKey: "claim-1",
    leaseDurationMs: 60_000,
    ...extra,
  };
}

async function createJob(engine: WorkflowEngine, ingestor: ReturnType<typeof make>["trustedGateIngestor"]) {
  await engine.createProject("project-1", POLICY, REVISION);
  await ingestor.ingest({
    id: "customer-data", projectId: "project-1", name: "CUSTOMER_DATA_CLASSIFIED", status: "PASS",
    policyVersion: POLICY, subjectRevisionDigest: REVISION, evidenceDigest: "c".repeat(64),
    evaluatedAt: new Date(NOW.getTime() - 1), validUntil: new Date(NOW.getTime() + 60_000),
    customerDataClassification: "SYNTHETIC_ONLY",
  }, "security");
  return engine.transition(command("DISCOVERY", 0, "start", { startJob: { type: "DISCOVERY_CONTROL" } }));
}

function termination(fixture: ReturnType<typeof make>, jobId: string) {
  return fixture.trustedTerminationProofIssuer.issue({
    id: `termination-${jobId}`, projectId: "project-1", jobId, workerId: "worker-1",
    processEndedAt: new Date(NOW), mountRevokedAt: new Date(NOW), credentialsRevokedAt: new Date(NOW),
  });
}

describe("repository transaction integration", () => {
  it("serializes competing CAS transitions across engine instances", async () => {
    const { repository, engine } = make();
    const other = new WorkflowEngine(repository);
    await engine.createProject("project-1", POLICY, REVISION);
    const results = await Promise.allSettled([
      engine.transition(command("DISCOVERY", 0, "a")),
      other.transition(command("FAILED", 0, "b")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT" } });
    expect(await engine.getAuditEvents("project-1")).toHaveLength(1);
  });

  it("deduplicates concurrent transition delivery atomically", async () => {
    const { engine } = make();
    await engine.createProject("project-1", POLICY, REVISION);
    const request = command("DISCOVERY", 0, "same", { startJob: { type: "DISCOVERY_CONTROL" } });
    const [first, second] = await Promise.all([engine.transition(request), engine.transition(request)]);
    expect([first.duplicate, second.duplicate].sort()).toEqual([false, true]);
    expect(await engine.getJobs("project-1")).toHaveLength(1);
    expect(await engine.getAuditEvents("project-1")).toHaveLength(1);
    expect(first.auditEvent.jobBinding).toEqual({
      id: first.job?.id,
      type: "DISCOVERY_CONTROL",
      status: "PENDING",
      revisionDigest: REVISION,
      aggregateVersion: 1,
    });
  });

  it("claims atomically and replays the same worker claim idempotently", async () => {
    const { engine, trustedGateIngestor } = make();
    const started = await createJob(engine, trustedGateIngestor);
    const request = claim(started.job!.id);
    const first = await engine.claimJob(request);
    const replay = await engine.claimJob(request);
    expect(replay).toEqual(first);
    expect(await engine.getJobEvents("project-1")).toHaveLength(1);

    const competing = await Promise.allSettled([
      engine.claimJob({ ...request, workerId: "worker-2", idempotencyKey: "claim-2" }),
      engine.claimJob({ ...request, workerId: "worker-3", idempotencyKey: "claim-3" }),
    ]);
    expect(competing.every((result) => result.status === "rejected")).toBe(true);
  });

  it("deduplicates heartbeat and completion without extending twice or appending duplicate audit", async () => {
    const { engine, trustedGateIngestor } = make();
    const started = await createJob(engine, trustedGateIngestor);
    const request = claim(started.job!.id);
    await engine.claimJob(request);
    const owned = {
      jobId: request.jobId,
      projectId: request.projectId,
      expectedAggregateVersion: request.expectedAggregateVersion,
      expectedRevisionDigest: request.expectedRevisionDigest,
      workerId: request.workerId,
      claimIdempotencyKey: request.idempotencyKey,
      idempotencyKey: "heartbeat-1",
    };
    const heartbeat = await engine.heartbeatJob({ ...owned, extendLeaseByMs: 30_000 });
    expect(await engine.heartbeatJob({ ...owned, extendLeaseByMs: 30_000 })).toEqual(heartbeat);
    const completed = await engine.completeJob({ ...owned, idempotencyKey: "complete-1" });
    expect(await engine.completeJob({ ...owned, idempotencyKey: "complete-1" })).toEqual(completed);
    const events = await engine.getJobEvents("project-1");
    expect(events.map((event) => event.type)).toEqual(["CLAIMED", "HEARTBEAT", "COMPLETED"]);
    expect(events[1]?.previousHash).toBe(events[0]?.eventHash);
    expect(events[2]?.previousHash).toBe(events[1]?.eventHash);
  });

  it("blocks a follow-up job until a claimed writer confirms termination", async () => {
    const fixture = make();
    const { engine, trustedGateIngestor } = fixture;
    const started = await createJob(engine, trustedGateIngestor);
    const request = claim(started.job!.id);
    await engine.claimJob(request);
    await expect(engine.transition(command("SPECIFICATION", 1, "next-with-job", {
      startJob: { type: "SPECIFICATION_CONTROL" },
    }))).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    await engine.transition(command("SPECIFICATION", 1, "next"));
    expect((await engine.getJobs("project-1"))[0]?.status).toBe("CANCELLING");
    const confirmation = {
      jobId: request.jobId,
      projectId: request.projectId,
      expectedAggregateVersion: request.expectedAggregateVersion,
      expectedRevisionDigest: request.expectedRevisionDigest,
      workerId: request.workerId,
      claimIdempotencyKey: request.idempotencyKey,
      idempotencyKey: "termination-1",
    };
    await engine.confirmJobTermination({ ...confirmation, terminationEvidence: termination(fixture, request.jobId) });
    expect((await engine.getJobs("project-1"))[0]?.status).toBe("CANCELLED");
  });

  it("deep-snapshots claim input before waiting for the project lock", async () => {
    const { engine, trustedGateIngestor } = make();
    const started = await createJob(engine, trustedGateIngestor);
    const mutable = claim(started.job!.id) as ClaimJobRequest & { workerId: string; idempotencyKey: string };
    const pending = engine.claimJob(mutable);
    mutable.workerId = "attacker";
    mutable.idempotencyKey = "mutated";
    const claimed = await pending;
    expect(claimed).toMatchObject({ leaseOwner: "worker-1", claimIdempotencyKey: "claim-1" });
  });

  it("requires worker re-authorization and revokes claimed jobs on phase change", async () => {
    const operations: string[] = [];
    const fixture = make({ async verify(workerId, _projectId, operation) { operations.push(operation); return { id: workerId }; } });
    const { engine, trustedGateIngestor } = fixture;
    const started = await createJob(engine, trustedGateIngestor);
    const request = claim(started.job!.id);
    await engine.claimJob(request);
    const owned = {
      jobId: request.jobId,
      projectId: request.projectId,
      expectedAggregateVersion: request.expectedAggregateVersion,
      expectedRevisionDigest: request.expectedRevisionDigest,
      workerId: request.workerId,
      claimIdempotencyKey: request.idempotencyKey,
      idempotencyKey: "owned-1",
    };
    await expect(engine.authorizeJobWork(owned)).resolves.toMatchObject({ status: "CLAIMED" });
    await engine.transition(command("CANCELLED", 1, "cancel"));
    expect((await engine.getJobs("project-1"))[0]?.status).toBe("CANCELLING");
    expect(await engine.claimJob(request)).toMatchObject({ status: "CANCELLING" });
    await expect(engine.authorizeJobWork(owned)).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    await expect(engine.heartbeatJob({ ...owned, extendLeaseByMs: 60_000 })).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    await expect(engine.completeJob(owned)).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    const confirmation = { ...owned, idempotencyKey: "confirm-1", terminationEvidence: termination(fixture, request.jobId) };
    await expect(engine.confirmJobTermination({
      ...confirmation,
      terminationEvidence: { ...confirmation.terminationEvidence, mountRevokedAt: new Date(NOW.getTime() - 1) },
    })).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    const confirmed = await engine.confirmJobTermination(confirmation);
    expect(confirmed.status).toBe("CANCELLED");
    expect(await engine.confirmJobTermination(confirmation)).toEqual(confirmed);
    expect(await engine.claimJob(request)).toMatchObject({ status: "CANCELLED" });
    expect((await engine.getJobEvents("project-1")).at(-1)).toMatchObject({
      type: "CANCELLED", terminationEvidenceId: `termination-${request.jobId}`,
    });
    expect(operations).toContain("TERMINATE");
  });

  it("invokes the injected WorkerIdentityVerifier for every work authorization operation", async () => {
    const operations: string[] = [];
    const fixture = createInMemoryWorkflowFixture({
      now: () => new Date(NOW), attesters: { security: "SECURITY" },
      workerIdentityVerifier: {
        async verify(workerId, _projectId, operation) {
          operations.push(operation);
          return workerId === "worker-1" ? { id: workerId } : null;
        },
      },
    });
    const engine = new WorkflowEngine(fixture.repository);
    const started = await createJob(engine, fixture.trustedGateIngestor);
    const request = claim(started.job!.id);
    await engine.claimJob(request);
    const owned = {
      jobId: request.jobId, projectId: request.projectId, expectedAggregateVersion: 1,
      expectedRevisionDigest: REVISION, workerId: request.workerId,
      claimIdempotencyKey: request.idempotencyKey, idempotencyKey: "authorize",
    };
    await engine.authorizeJobWork(owned);
    await engine.heartbeatJob({ ...owned, idempotencyKey: "heartbeat", extendLeaseByMs: 1_000 });
    await engine.completeJob({ ...owned, idempotencyKey: "complete" });
    expect(operations).toEqual(["CLAIM", "AUTHORIZE", "HEARTBEAT", "COMPLETE"]);
    await expect(engine.claimJob({ ...request, workerId: "spoofed", idempotencyKey: "spoof" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks claims when later adverse Security evidence exists", async () => {
    const fixture = make();
    const started = await createJob(fixture.engine, fixture.trustedGateIngestor);
    await fixture.trustedGateIngestor.ingest({
      id: "security-block", projectId: "project-1", name: "SECURITY_REVIEW_PASSED", status: "BLOCK",
      policyVersion: POLICY, subjectRevisionDigest: REVISION, evidenceDigest: "f".repeat(64),
      evaluatedAt: new Date(NOW), validUntil: new Date(NOW.getTime() + 60_000),
    }, "security");
    await expect(fixture.engine.claimJob(claim(started.job!.id))).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
  });

  it("does not let cancellation replays revive or start jobs", async () => {
    const { engine } = make();
    await engine.createProject("project-1", POLICY, REVISION);
    const start = command("DISCOVERY", 0, "start", { startJob: { type: "DISCOVERY_CONTROL" } });
    const first = await engine.transition(start);
    await engine.transition(command("CANCELLED", 1, "cancel"));
    const replay = await engine.transition(start);
    expect(replay).toMatchObject({ duplicate: true, job: { id: first.job?.id, status: "CANCELLED" } });
    await expect(engine.claimJob(claim(first.job!.id))).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    await expect(engine.transition(command("DISCOVERY", 2, "after-cancel", {
      startJob: { type: "DISCOVERY_CONTROL" },
    }))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(await engine.getJobs("project-1")).toHaveLength(1);
  });

  it("leaves project, audit and jobs untouched on rejection", async () => {
    const { engine } = make();
    await engine.createProject("project-1", POLICY, REVISION);
    await expect(engine.transition(command("DISCOVERY", 0, "bad", {
      expectedRevisionDigest: "b".repeat(64),
      startJob: { type: "DISCOVERY_CONTROL" },
    }))).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(await engine.getProject("project-1")).toMatchObject({ phase: "DRAFT", version: 0 });
    expect(await engine.getAuditEvents("project-1")).toEqual([]);
    expect(await engine.getJobs("project-1")).toEqual([]);
  });
});
