# WORKFLOW-PERSISTENCE-COMPLETION-01

Status: `PASSED - DEVELOPMENT ONLY`

This is the immutable task contract for the persistence completion milestone. It authorizes no production, deployment, GitHub, Codex SDK, Agent Registry, automatic execution, or customer-data operation.

## Scope

Extend the existing `packages/database` PostgreSQL layer and the existing `WorkflowRepository` contract with a persistent adapter. Keep `InMemoryWorkflowRepository` for fast unit tests. Reuse the existing migration runner, PostgreSQL roles, capability-issued RLS context, idempotency, audit, background-job, inbox, and outbox infrastructure. Migration `001_persistence_foundation.sql` remains unchanged.

Allowed components are `compose.yaml`, database documentation and milestone state, `packages/database`, `packages/workflow-engine`, migration/schema/integration/concurrency tests, and workspace manifests required for those dependencies. The web UI, Codex SDK, GitHub, Agent Registry, production, and deployment are excluded.

## Acceptance criteria

1. The local Compose service remains named `postgres`, uses PostgreSQL 18, has a PostgreSQL healthcheck, and provisions a synthetic `_test` database on a fresh volume.
2. Versioned additive migrations persist workflow aggregate state, revisions, existing tasks, jobs, leases/fences, holds, evidence, Legal assessments/requirements, Counsel cases/decisions, termination evidence, workflow audit details, inbox, and outbox data under project RLS.
3. `PersistentWorkflowRepository` implements the existing repository interface and exposes the trusted gate/clearance ingest boundaries required by the engine.
4. Commands use database CAS plus engine aggregate versions; actor/worker idempotency replays return the prior result and changed payloads fail.
5. State, immutable audit detail, job state, inbox receipt, and outbox event commit atomically. Failed commands leave no partial projection.
6. Worker claims have leases and project-monotonic fencing tokens. A stale owner/token cannot authorize, heartbeat, complete, or terminate work. Expired claims can be recovered with a strictly higher fence.
7. A fresh process can read and continue committed state. At least two OS processes prove CAS serialization and idempotent delivery against the same PostgreSQL database.
8. Database cleanup is restricted to the existing Loopback, `_test` suffix, migrator identity, maintenance lock, and closed-worker safeguards. Database tests never skip.
9. Database integration tests, Workflow Engine tests, root tests, lint, typecheck, build, `git diff --check`, restart test, and two-process concurrency test pass.

## Execution contract

Exactly one writer identity is used: the primary Executor. Planner and Architect are read-only before implementation; QA and Security are read-only after the implementation is fixed. At most one Executor repair pass is permitted after those reviews. Maximum execution budget: one local work session, capped at eight hours. Completion status is exactly `WORKFLOW PERSISTENCE BESTANDEN  DEVELOPMENT ONLY`; otherwise the result is `BLOCKED` with reproducible evidence. Production deployment remains `DISABLED`.

## Prior verification outcome

PostgreSQL was healthy and migrations 001 through 004 were applied. Database tests passed 13/13 without skips, Workflow Engine tests passed 71/71, and root tests passed 102/102. Lint, typecheck, build, restart recovery, multi-process CAS/idempotency, multi-process lease reclaim/fencing, and `git diff --check` passed. Security's final read-only review passed.

QA's final read-only review found one remaining high-severity blocker after the single permitted repair pass: an idempotent `AUTHORIZE` or `HEARTBEAT` replay can return its cached result after `leaseExpiresAt` has passed when no newer worker has reclaimed the job yet. Replay validation checks status, owner, claim key, and fencing token, but does not re-check active lease time. The milestone therefore must not receive the success status.

## Owner-authorized second repair contract

The Owner expressly authorizes one second and final, tightly scoped repair pass for the high-severity QA blocker above. This contract is immutable for the pass. Its maximum execution budget is one local work session capped at eight hours. Exactly one application-code writer identity is permitted: the assigned Executor. No further automatic repair pass is authorized.

Scope is limited to making idempotent `AUTHORIZE` and `HEARTBEAT` replays fail closed at and after lease expiry, preserving reclaim, lease generation, fencing, owner, job-state, cancellation, rollback, and PostgreSQL transaction/database-time semantics. In-memory and PostgreSQL behavior must match. Allowed application components are the existing replay/lease implementation and directly targeted tests in `packages/workflow-engine/src` and `packages/database/src`; documentation updates are limited to this file and `PROJECT_STATE.md`. Legal, Counsel, general compliance state, Codex SDK, Agent Registry, GitHub, UI, deployment, production, and unrelated architecture are excluded.

Acceptance requires targeted regression coverage immediately before, exactly at, and after lease expiry for both operations; replay after reclaim; stale worker, fence, and idempotency key rejection; restart and two-process boundary behavior; and atomic rollback on rejection. Before a stored replay result is returned, current lease time, owner, claim identity/generation, fence, job state, and reclaim/cancellation state must be revalidated. PostgreSQL must decide atomically in its intended transaction using authoritative database time. All checks listed in the Owner approval must pass without skips, followed by read-only QA, Reviewer, Security, and Legal reviews of the fixed stand; QA and Security are limited to lease expiry, replay, reclaim, idempotency, and fencing. Completion is `PASSED`, `BLOCKED`, or `DEFERRED_TO_LATER_GATE`; production deployment remains `DISABLED`.

## Final verification outcome

Status: `PASSED - DEVELOPMENT ONLY`. The checked application-code stand is HEAD `e504a88b278f6599cfef69655091e75daf63eec3` plus Executor diff `9da8cdfbf21c2013dc99096e575ec5b3f01d6f44`. Exactly one Executor wrote application code and tests; the stand was fixed before the read-only reviews. No further repair pass was used or remains authorized.

`AUTHORIZE` and `HEARTBEAT` replays now revalidate the current job, project snapshot, status, owner, claim identity/generation, fencing token, and active lease. `leaseExpiresAt <= now` is fail-closed. A rejected heartbeat replay neither extends nor revives a lease, and a rejected authorize replay permits no further work. Reclaim retains the existing higher-fence behavior, so stale workers, claim generations, fencing tokens, and idempotency keys remain invalid.

The PostgreSQL path uses database time and performs the decisive validation in the append transaction. It locks the workflow aggregate and expected storage version, locks the current background job, and requires the expected status, owner, claim key, fencing token, and `lease_expires_at > clock_timestamp()` before returning an unchanged replay or committing a mutation. Rejected replays leave snapshot, storage version, projection, job audit, and idempotency state unchanged.

Regression coverage includes `AUTHORIZE` and `HEARTBEAT` replays at -1 ms, exactly at expiry, and +1 ms; replay after valid reclaim; stale worker, stale fence, and reused old idempotency keys; process restart between original call and replay; two processes at the database expiry boundary; and atomic rollback on rejection. The PostgreSQL boundary test uses separate processes and authoritative database expiry, proves both replays fail with `JOB_NOT_ALLOWED`, then proves a reclaim receives a higher fence and only the new owner succeeds.

Required checks passed: PostgreSQL integration 13/13 without skips; Workflow Engine 78/78; root tests 109/109; process restart and multi-process CAS/idempotency/reclaim/fencing; the new lease-expiry replay regressions; package and root lint; package and root typecheck; package and root build; and `git diff --check`. QA, Reviewer, Security, and Legal DE each reported `PASS` for `DEVELOPMENT_ONLY` on the fixed stand. There are no open findings in this task scope.

Unchanged later release and production gates remain fail-closed and were not re-reviewed or satisfied by this milestone. This result is not a release-candidate or production approval. Production deployment remains `DISABLED`.
