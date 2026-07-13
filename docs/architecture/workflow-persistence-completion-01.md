# WORKFLOW-PERSISTENCE-COMPLETION-01

Status: `BLOCKED - DEVELOPMENT ONLY`

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

## Verification outcome

PostgreSQL was healthy and migrations 001 through 004 were applied. Database tests passed 13/13 without skips, Workflow Engine tests passed 71/71, and root tests passed 102/102. Lint, typecheck, build, restart recovery, multi-process CAS/idempotency, multi-process lease reclaim/fencing, and `git diff --check` passed. Security's final read-only review passed.

QA's final read-only review found one remaining high-severity blocker after the single permitted repair pass: an idempotent `AUTHORIZE` or `HEARTBEAT` replay can return its cached result after `leaseExpiresAt` has passed when no newer worker has reclaimed the job yet. Replay validation checks status, owner, claim key, and fencing token, but does not re-check active lease time. The milestone therefore must not receive the success status.
