import { describe, expect, it } from "vitest";

import {
  WorkflowEngine,
  createInMemoryWorkflowFixture,
  type ClaimJobRequest,
  type LegalAssessmentInput,
  type ProjectPhase,
  type TransitionRequest,
  type WorkerIdentityVerifier,
} from "./index.js";

const REVISION = "a".repeat(64);
const POLICY = "policy-1";
const NOW = new Date("2026-07-12T12:00:00.000Z");
const makeByEngine = new WeakMap<WorkflowEngine, ReturnType<typeof createInMemoryWorkflowFixture>>();

function make(workerIdentityVerifier?: WorkerIdentityVerifier, now:()=>Date=()=>new Date(NOW)) {
  const fixture = createInMemoryWorkflowFixture({ now, attesters: { security: "SECURITY", legal: "LEGAL" }, ...(workerIdentityVerifier ? { workerIdentityVerifier } : {}) });
  const engine = new WorkflowEngine(fixture.repository); makeByEngine.set(engine, fixture);
  return { ...fixture, engine };
}

function legalAssessment(id: string): LegalAssessmentInput {
  const finalizedAt = new Date(NOW.getTime() - 1);
  return {
    id, projectId: "project-1", scopeType: "PROJECT", scopeId: "project-1", revisionDigest: REVISION, status: "PASS",
    factsDigest: "7".repeat(64), assumptionsRef: "integration-assumptions", jurisdictions: ["DE", "EU"], legalDate: finalizedAt,
    sourceSetId: "integration-sources", reviewerType: "LEGAL_DE_EU", finalizedAt,
    evidence: { id: `${id}-evidence`, projectId: "project-1", scopeType: "PROJECT", scopeId: "project-1", revisionDigest: REVISION,
      contentDigest: "6".repeat(64), evidenceType: "LEGAL_ASSESSMENT", classification: "VERIFIED_LEGAL_ASSESSMENT",
      finalizedAt, verifiedAt: finalizedAt, trustedIdentity: "legal" },
  };
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

async function createJob(engine: WorkflowEngine, ingestor: ReturnType<typeof make>["trustedGateIngestor"], legalIngestor = makeByEngine.get(engine)?.trustedLegalAssessmentIngestor) {
  await engine.createProject("project-1", POLICY, REVISION);
  await ingestor.ingest({
    id: "customer-data", projectId: "project-1", name: "CUSTOMER_DATA_CLASSIFIED", status: "PASS",
    policyVersion: POLICY, subjectRevisionDigest: REVISION, evidenceDigest: "c".repeat(64),
    evaluatedAt: new Date(NOW.getTime() - 1), validUntil: new Date(NOW.getTime() + 60_000),
    customerDataClassification: "SYNTHETIC_ONLY",
  }, "security");
  if (!legalIngestor) throw new Error("legal ingestor missing");
  await legalIngestor.ingest(legalAssessment("job-legal"));
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
    const { repository, engine, trustedGateIngestor } = make();
    const other = new WorkflowEngine(repository);
    await engine.createProject("project-1", POLICY, REVISION);
    await trustedGateIngestor.ingest({
      id: "customer-data-cas", projectId: "project-1", name: "CUSTOMER_DATA_CLASSIFIED", status: "PASS", policyVersion: POLICY,
      subjectRevisionDigest: REVISION, evidenceDigest: "9".repeat(64), evaluatedAt: new Date(NOW.getTime() - 1), validUntil: new Date(NOW.getTime() + 60_000), customerDataClassification: "SYNTHETIC_ONLY",
    }, "security");
    const results = await Promise.allSettled([
      engine.transition(command("DISCOVERY", 0, "a")),
      other.transition(command("FAILED", 0, "b")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT" } });
    expect(await engine.getAuditEvents("project-1")).toHaveLength(1);
  });

  it("deduplicates concurrent transition delivery atomically", async () => {
    const { engine, trustedGateIngestor, trustedLegalAssessmentIngestor } = make();
    await engine.createProject("project-1", POLICY, REVISION);
    await trustedGateIngestor.ingest({
      id: "customer-data-concurrent", projectId: "project-1", name: "CUSTOMER_DATA_CLASSIFIED", status: "PASS", policyVersion: POLICY,
      subjectRevisionDigest: REVISION, evidenceDigest: "d".repeat(64), evaluatedAt: new Date(NOW.getTime() - 1), validUntil: new Date(NOW.getTime() + 60_000), customerDataClassification: "SYNTHETIC_ONLY",
    }, "security");
    await trustedLegalAssessmentIngestor.ingest(legalAssessment("concurrent-legal"));
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
      operationScope: { scopeType: "PROJECT", scopeId: "project-1" },
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

  it("fences a stale worker after lease recovery with a monotonically higher token",async()=>{
    let current=new Date(NOW);const {engine,trustedGateIngestor}=make(undefined,()=>new Date(current));
    const started=await createJob(engine,trustedGateIngestor);const firstRequest=claim(started.job!.id,{leaseDurationMs:1_000});
    const first=await engine.claimJob(firstRequest);expect(first.fencingToken).toBe(1);
    const staleHeartbeat={jobId:first.id,projectId:first.projectId,expectedAggregateVersion:first.aggregateVersion,expectedRevisionDigest:first.revisionDigest,workerId:"worker-1",claimIdempotencyKey:firstRequest.idempotencyKey,idempotencyKey:"stale-heartbeat-replay",fencingToken:first.fencingToken!,extendLeaseByMs:1_000};
    await engine.heartbeatJob(staleHeartbeat);
    current=new Date(NOW.getTime()+2_000);
    const secondRequest={...firstRequest,workerId:"worker-2",idempotencyKey:"claim-recovery",leaseDurationMs:1_000};
    const second=await engine.claimJob(secondRequest);expect(second.fencingToken).toBeGreaterThan(first.fencingToken!);
    await expect(engine.heartbeatJob(staleHeartbeat)).rejects.toMatchObject({code:"JOB_NOT_ALLOWED"});
    await expect(engine.heartbeatJob({jobId:first.id,projectId:first.projectId,expectedAggregateVersion:first.aggregateVersion,expectedRevisionDigest:first.revisionDigest,workerId:"worker-1",claimIdempotencyKey:firstRequest.idempotencyKey,idempotencyKey:"stale-heartbeat",fencingToken:first.fencingToken!,extendLeaseByMs:1_000})).rejects.toMatchObject({code:"JOB_NOT_ALLOWED"});
    await expect(engine.heartbeatJob({jobId:second.id,projectId:second.projectId,expectedAggregateVersion:second.aggregateVersion,expectedRevisionDigest:second.revisionDigest,workerId:"worker-2",claimIdempotencyKey:secondRequest.idempotencyKey,idempotencyKey:"fresh-heartbeat",fencingToken:second.fencingToken!,extendLeaseByMs:1_000})).resolves.toMatchObject({fencingToken:second.fencingToken});
  });

  it.each([
    ["AUTHORIZE", -1, true], ["AUTHORIZE", 0, false], ["AUTHORIZE", 1, false],
    ["HEARTBEAT", -1, true], ["HEARTBEAT", 0, false], ["HEARTBEAT", 1, false],
  ] as const)("revalidates %s replay at lease boundary offset %d",async(operation,offset,allowed)=>{
    let current=new Date(NOW);const fixture=make(undefined,()=>new Date(current));
    const started=await createJob(fixture.engine,fixture.trustedGateIngestor);
    const claimRequest=claim(started.job!.id,{leaseDurationMs:1_000,idempotencyKey:`boundary-claim-${operation}-${offset}`});
    const claimed=await fixture.engine.claimJob(claimRequest);
    const owned={jobId:claimed.id,projectId:claimed.projectId,expectedAggregateVersion:claimed.aggregateVersion,expectedRevisionDigest:claimed.revisionDigest,workerId:claimRequest.workerId,claimIdempotencyKey:claimRequest.idempotencyKey,idempotencyKey:`boundary-${operation}-${offset}`,fencingToken:claimed.fencingToken!};
    const first=operation==="AUTHORIZE"?await fixture.engine.authorizeJobWork(owned):await fixture.engine.heartbeatJob({...owned,extendLeaseByMs:1_000});
    const eventCount=(await fixture.engine.getJobEvents("project-1")).length;
    current=new Date(first.leaseExpiresAt!.getTime()+offset);
    const replay=operation==="AUTHORIZE"?fixture.engine.authorizeJobWork(owned):fixture.engine.heartbeatJob({...owned,extendLeaseByMs:1_000});
    if(allowed)await expect(replay).resolves.toEqual(first);
    else await expect(replay).rejects.toMatchObject({code:"JOB_NOT_ALLOWED"});
    expect(await fixture.engine.getJobEvents("project-1")).toHaveLength(eventCount);
    expect((await fixture.engine.getJobs("project-1"))[0]?.leaseExpiresAt).toEqual(first.leaseExpiresAt);
  });

  it("requires reclaim and rejects old worker, fence and idempotency keys after expiry",async()=>{
    let current=new Date(NOW);const fixture=make(undefined,()=>new Date(current));
    const started=await createJob(fixture.engine,fixture.trustedGateIngestor);
    const firstClaim=claim(started.job!.id,{leaseDurationMs:1_000,idempotencyKey:"expiry-generation-1"});
    const first=await fixture.engine.claimJob(firstClaim);
    const oldAuthorize={jobId:first.id,projectId:first.projectId,expectedAggregateVersion:first.aggregateVersion,expectedRevisionDigest:first.revisionDigest,workerId:firstClaim.workerId,claimIdempotencyKey:firstClaim.idempotencyKey,idempotencyKey:"old-authorize-key",fencingToken:first.fencingToken!};
    const oldHeartbeat={...oldAuthorize,idempotencyKey:"old-heartbeat-key",extendLeaseByMs:1_000};
    await fixture.engine.authorizeJobWork(oldAuthorize);await fixture.engine.heartbeatJob(oldHeartbeat);
    current=new Date(first.leaseExpiresAt!.getTime()+1);
    await expect(fixture.engine.authorizeJobWork(oldAuthorize)).rejects.toMatchObject({code:"JOB_NOT_ALLOWED"});
    await expect(fixture.engine.heartbeatJob(oldHeartbeat)).rejects.toMatchObject({code:"JOB_NOT_ALLOWED"});
    const secondClaim={...firstClaim,workerId:"worker-2",idempotencyKey:"expiry-generation-2"};
    const second=await fixture.engine.claimJob(secondClaim);expect(second.fencingToken).toBeGreaterThan(first.fencingToken!);
    await expect(fixture.engine.authorizeJobWork(oldAuthorize)).rejects.toMatchObject({code:"JOB_NOT_ALLOWED"});
    await expect(fixture.engine.heartbeatJob(oldHeartbeat)).rejects.toMatchObject({code:"JOB_NOT_ALLOWED"});
    await expect(fixture.engine.authorizeJobWork({...oldAuthorize,workerId:"worker-2",claimIdempotencyKey:secondClaim.idempotencyKey})).rejects.toMatchObject({code:"JOB_NOT_ALLOWED"});
    await expect(fixture.engine.authorizeJobWork({...oldAuthorize,workerId:"worker-2",claimIdempotencyKey:secondClaim.idempotencyKey,fencingToken:second.fencingToken!,idempotencyKey:"generation-2-authorize"})).resolves.toMatchObject({fencingToken:second.fencingToken});
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
      now: () => new Date(NOW), attesters: { security: "SECURITY", legal: "LEGAL" },
      workerIdentityVerifier: {
        async verify(workerId, _projectId, operation) {
          operations.push(operation);
          return workerId === "worker-1" ? { id: workerId } : null;
        },
      },
    });
    const engine = new WorkflowEngine(fixture.repository);
    const started = await createJob(engine, fixture.trustedGateIngestor, fixture.trustedLegalAssessmentIngestor);
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

  it("atomically moves a claimed job to CANCELLING when adverse evidence arrives", async () => {
    const fixture = make();
    const started = await createJob(fixture.engine, fixture.trustedGateIngestor);
    const claimed = claim(started.job!.id);
    await fixture.engine.claimJob(claimed);
    await fixture.trustedGateIngestor.ingest({
      id: "customer-data-late-adverse", projectId: "project-1", name: "CUSTOMER_DATA_CLASSIFIED", status: "FAIL",
      policyVersion: POLICY, subjectRevisionDigest: REVISION, evidenceDigest: "8".repeat(64),
      evaluatedAt: new Date(NOW), validUntil: new Date(NOW.getTime() + 60_000), customerDataClassification: "SUSPECTED_REAL",
    }, "security");
    expect((await fixture.engine.getJobs("project-1"))[0]).toMatchObject({ status: "CANCELLING", leaseOwner: "worker-1" });
    await expect(fixture.engine.claimJob(claimed)).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
    await expect(fixture.engine.authorizeJobWork({
      jobId: claimed.jobId, projectId: claimed.projectId, expectedAggregateVersion: claimed.expectedAggregateVersion,
      expectedRevisionDigest: claimed.expectedRevisionDigest, workerId: claimed.workerId,
      claimIdempotencyKey: claimed.idempotencyKey, idempotencyKey: "after-adverse",
    })).rejects.toMatchObject({ code: "JOB_NOT_ALLOWED" });
  });

  it("does not let cancellation replays revive or start jobs", async () => {
    const { engine, trustedGateIngestor, trustedLegalAssessmentIngestor } = make();
    await engine.createProject("project-1", POLICY, REVISION);
    await trustedGateIngestor.ingest({
      id: "customer-data-cancel", projectId: "project-1", name: "CUSTOMER_DATA_CLASSIFIED", status: "PASS", policyVersion: POLICY,
      subjectRevisionDigest: REVISION, evidenceDigest: "e".repeat(64), evaluatedAt: new Date(NOW.getTime() - 1), validUntil: new Date(NOW.getTime() + 60_000), customerDataClassification: "SYNTHETIC_ONLY",
    }, "security");
    await trustedLegalAssessmentIngestor.ingest(legalAssessment("cancel-legal"));
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

  it("completes Requirement submission, Legal verification, hold clearance and continuation end to end", async () => {
    let now = new Date(NOW); const fixture = createInMemoryWorkflowFixture({ now: () => new Date(now), attesters: { security: "SECURITY", legal: "LEGAL" } }); const engine = new WorkflowEngine(fixture.repository);
    await engine.createProject("project-1", POLICY, REVISION);
    await fixture.trustedGateIngestor.ingest({ id: "e2e-data", projectId: "project-1", name: "CUSTOMER_DATA_CLASSIFIED", status: "PASS", policyVersion: POLICY, subjectRevisionDigest: REVISION, evidenceDigest: "1".repeat(64), evaluatedAt: new Date(NOW.getTime() - 1), validUntil: new Date(NOW.getTime() + 60_000), customerDataClassification: "SYNTHETIC_ONLY" }, "security");
    await fixture.trustedLegalAssessmentIngestor.ingest({ ...legalAssessment("e2e-requirement-assessment"), status: "PASS_WITH_REQUIREMENTS", requirements: [{ id: "e2e-requirement", requirementRef: "DPA" }] });
    now = new Date(NOW.getTime() + 1); const submittedAt = new Date(now);
    await fixture.trustedLegalRequirementIngestor.submit({ projectId: "project-1", requirementId: "e2e-requirement", assessmentId: "e2e-requirement-assessment", submittedAt, evidence: { id: "e2e-submission", projectId: "project-1", scopeType: "PROJECT", scopeId: "project-1", revisionDigest: REVISION, contentDigest: "2".repeat(64), evidenceType: "LEGAL_REQUIREMENT_SUBMISSION", classification: "MINIMIZED_IMMUTABLE", finalizedAt: submittedAt, verifiedAt: submittedAt, trustedIdentity: "owner" } });
    now = new Date(NOW.getTime() + 2); const decidedAt = new Date(now);
    await fixture.trustedLegalRequirementIngestor.decide({ projectId: "project-1", requirementId: "e2e-requirement", assessmentId: "e2e-requirement-assessment", decision: "VERIFIED", decidedAt, evidence: { id: "e2e-decision", projectId: "project-1", scopeType: "PROJECT", scopeId: "project-1", revisionDigest: REVISION, contentDigest: "3".repeat(64), evidenceType: "LEGAL_REQUIREMENT_DECISION", classification: "VERIFIED_LEGAL_DECISION", finalizedAt: decidedAt, verifiedAt: decidedAt, trustedIdentity: "legal" } });
    const hold = (await engine.getProjectHolds("project-1"))[0]!; now = new Date(NOW.getTime() + 4); const verifiedAt = new Date(NOW.getTime() + 3);
    const clearanceRef = { id: "e2e-clearance-ref", projectId: "project-1", scopeType: "PROJECT", scopeId: "project-1", revisionDigest: REVISION, contentDigest: "4".repeat(64), evidenceType: "HOLD_CLEARANCE", classification: "VERIFIED_CLEARANCE", finalizedAt: verifiedAt, verifiedAt, trustedIdentity: "legal" } as const;
    await fixture.trustedHoldClearanceIngestor.ingest({ id: "e2e-clearance", projectId: "project-1", holdCode: hold.id, clearingAuthority: "LEGAL", authorityId: "legal", subjectRevisionDigest: REVISION, scopeType: hold.scopeType, scopeId: hold.scopeId, sourceRecordType: hold.sourceRecordType, sourceRecordId: hold.sourceRecordId, evidenceDigest: clearanceRef.contentDigest, evidenceRef: clearanceRef, verifiedAt });
    await expect(engine.transition(command("DISCOVERY", 0, "e2e-continue", { holdClearanceIds: ["e2e-clearance"] }))).resolves.toMatchObject({ project: { phase: "DISCOVERY" } });
    expect((await engine.getProjectHolds("project-1"))[0]).toMatchObject({ state: "CLEARED" });
  });
});
