# COMPLIANCE-STATE-HARDENING

Status: `ARCHITECTURE APPROVED - SECURITY PASS_WITH_REQUIREMENTS - LEGAL DE/EU PASS_WITH_REQUIREMENTS`

This document records the approved implementation contract for the isolated
`COMPLIANCE-STATE-HARDENING` sub-milestone. It does not enable GitHub,
automatic project execution, publication, deployment, or production. The
authoritative project state remains `PROJECT_STATE.md`.

## Scope

The sub-milestone changes only the in-memory compliance, Legal, hold, and
evidence logic in the Workflow Engine and its unit and integration tests.
PostgreSQL persistence, SQL/RLS, object storage, provider adapters, GitHub,
deployment, production integration, and legal advice are excluded.

The missing PostgreSQL repository adapter remains a required follow-up task.

## Planner acceptance conditions

1. Job creation is atomic and fail closed without current, trusted,
   policy-, project-, scope-, and revision-bound `SYNTHETIC_ONLY` evidence.
2. Every continuing transition, promotion-equivalent transition, claim,
   authorization, heartbeat, and completion rechecks current compliance.
   Safe transitions to `BLOCKED`, `FAILED`, and `CANCELLED`, verified
   termination, and evidence preservation remain possible.
3. Final `LegalAssessment` status is exactly `PASS`,
   `PASS_WITH_REQUIREMENTS`, `BLOCK`, or `COUNSEL_REQUIRED`.
   `LEGAL_UNRESOLVED_HOLD` is a separate hold, never a fifth status.
4. Legal requirements follow exactly
   `OPEN -> EVIDENCE_SUBMITTED -> VERIFIED | REJECTED`.
   `SUPERSEDED` is available only atomically through a valid successor
   assessment.
5. `COUNSEL_REQUIRED` creates exactly one referenced `CounselCase` and hold.
   Only a verified qualified counsel decision with an immutable encrypted
   evidence reference may close the case. Legal then creates an immutable
   successor assessment; the predecessor is never changed.
6. Negative data-classification, Security, or Legal evidence creates a
   persistent source-bound project/scope hold that applies across revisions.
   A new revision, later positive evidence, owner action, or manual resume
   does not clear it.
7. Clearing authority is derived from the hold type and source record. A
   clearance binds a unique hold ID, project, scope, source, authority role
   and identity, verified/ingested times, and a complete immutable evidence
   reference. Clearance and evidence references are single-use per hold.
8. The audit hash payload stores the complete verifiable clearance binding,
   not only IDs. It stores no proof secret, customer data, or counsel text.
9. Changed-payload ID reuse, semantic replay under a new ID, cross-project or
   cross-scope binding, future/stale evidence, idempotency misuse, and async
   input mutation are rejected.

## Architecture decisions

- Scope semantics are deliberately minimal: `PROJECT` applies to all scopes
  and revisions in the project; every other scope uses exact equality of
  `scopeType + scopeId`. No additional hierarchy is introduced.
- `CounselCase.state` is exactly `OPEN | CLOSED`.
- `PROHIBITED_DATA_HOLD` clearing authority is `SECURITY`, matching the
  canonical Security attester for customer-data classification. This does not
  clear DSR, breach, retention, or Legal-hold obligations.
- Compliance holds are persistent overlays with at least these discriminators:
  `LEGAL_UNRESOLVED_HOLD`, `LEGAL_BLOCK_HOLD`,
  `LEGAL_REQUIREMENT_HOLD`, `COUNSEL_REQUIRED_HOLD`,
  `SECURITY_ADVERSE_HOLD`, and `PROHIBITED_DATA_HOLD`.
- Trusted ingest boundaries are separate for gate/data/Security evidence,
  Legal assessments, requirement submission and Legal decisions, qualified
  counsel decisions, and hold clearances. Test proofs remain closure-private.
- A central evaluator runs inside the project lock before any continuing
  mutation. Equal-priority conflicting evidence fails closed; map insertion
  order is never an authority rule.
- Negative evidence atomically creates exactly one source-bound hold and
  safely stops work: pending jobs become `CANCELLED`, claimed jobs become
  `CANCELLING`. No absence of heartbeat is treated as proof of termination.
- Worker and transition idempotency replays recheck current holds. They never
  revive or re-authorize earlier successful work after adverse evidence.
- Legal clearing is hold-specific. Generic clearance cannot bypass a Legal
  block, unresolved state, rejected requirement, or counsel chain. A counsel
  hold additionally requires Case -> Decision -> Successor -> Predecessor
  integrity before Legal may clear it.

## Required domain records

- Immutable `LegalAssessment` with project/scope/revision, facts,
  assumptions, jurisdictions, legal date, sources, reviewer, evidence,
  predecessor, finalization, ingestion, and verified Legal identity.
- `LegalRequirement` with assessment and scope bindings plus submission and
  Legal verification/rejection evidence.
- `CounselCase` and immutable `CounselDecision` with qualified identity and
  encrypted decision-evidence references, but no counsel text.
- Persistent `ProjectHold` with source record, source evidence, derived
  authority, state, opening, and clearing metadata.
- Immutable evidence references containing project, scope, revision, content
  digest, evidence type/classification, finalization, verification, and
  trusted identity metadata.
- Read-only query APIs for assessments, requirements, counsel cases, holds,
  and structured audit bindings.

## Required tests

Tests must cover all four Legal statuses; rejected fifth/null/malformed
statuses; `LEGAL_UNRESOLVED_HOLD`; every allowed and forbidden requirement
edge; CounselCase/decision/successor integrity; missing and stale Legal
evidence; job creation without synthetic evidence; later negative evidence;
project- and exact-scope adverse evidence across revisions; safe stopping of
pending and claimed jobs; false or missing clearing authority/evidence;
cross-project, cross-scope, source, hold, and evidence mismatch; future time;
payload and semantic replay; reordered equal-time conflicting evidence;
idempotency replay after a hold; immutable deep-copy audit behavior; and
TOCTOU mutation attempts.

## Planning decisions

- Planner: requirements reconciled; no canonical contradiction or blocker.
- Architect: `Architecture approved: YES`; no in-scope blocker.
- Security planning review: `PASS_WITH_REQUIREMENTS`; the requirements in
  this document are binding implementation and test gates.
- Legal DE/EU planning review: `PASS_WITH_REQUIREMENTS`; this is not legal
  advice or a production/release approval. Material decisions that cannot be
  verified locally remain `COUNSEL_REQUIRED`; `NOT_VERIFIABLE_LOCALLY` is a
  reason/verification result and never a Legal status.

## Implementation outcome

Final status: `COMPLIANCE-STATE-HARDENING NICHT BESTANDEN`

The Executor completed the initial implementation and all three permitted
automatic repair attempts. No further automatic repair is authorized under
`AGENTS.md`.

Final local verification results:

- package lint: passed (with the existing non-blocking Next pages-directory
  notice);
- root lint: passed;
- package typecheck: passed;
- root typecheck: passed;
- Workflow Engine tests: 63 passed;
- full test suite: 87 passed, 3 skipped;
- package build: passed;
- root build: passed;
- `git diff --check`: passed (line-ending warnings only).

Final independent votes:

- QA: `FAIL`;
- general Reviewer: `PASS`;
- Security: `BLOCK`;
- Legal DE/EU: `BLOCK`.

Blocking findings:

1. A Counsel successor assessment can be finalized and evidenced before the
   CounselCase opens, before the qualified decision, and before the case
   closes, then be ingested later and used to clear the
   `COUNSEL_REQUIRED_HOLD`. Successor chronology is not bound to predecessor
   ingestion, case opening/closure, or decision/ingestion times. The same
   structural gap may affect block and requirement successors.
2. When previously positive Security or `SYNTHETIC_ONLY` evidence expires
   during a claimed job, reauthorization fails closed but does not atomically
   open the corresponding hold and move the job to `CANCELLING`. Refusing a
   heartbeat is not proof of termination.

Required manual follow-up must begin as a new, explicitly authorized task. It
must add strict successor chronology guards and runtime safe-stop handling for
expired Security and customer-data evidence, with regression tests for the
reproduced paths. PostgreSQL persistence remains a separate later task.

This outcome grants no production, deployment, publication, GitHub, automatic
execution, or overall Workflow Engine approval.
