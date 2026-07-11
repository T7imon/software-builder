# Builder Platform V1 Requirements

Status: `PROPOSED - ARCHITECTURE APPROVAL REQUIRED`

Authoritative inputs:

- `BUILDER_SPEC.md`
- `PROJECT_STATE.md`
- `AGENTS.md`
- Completed Planner package
- Reconciled Architect, Security, and Legal DE/EU reviews

Current gates remain unchanged:

| Gate | Value |
|---|---|
| Current milestone | `PLANNING` |
| Architecture approved | `NO` |
| Implementation enabled | `NO` |
| GitHub integration enabled | `NO` |
| Automatic project execution | `NO` |
| Production deployment | `DISABLED` |

This document authorizes no application implementation, workspace creation, GitHub action, agent execution, or deployment.

## 1. Product Definition

The Builder Platform converts one owner's software idea into a controlled project. It creates versioned planning artifacts, obtains Security and German/EU Legal review, records one initial project approval, provisions an isolated workspace, later provisions one dedicated GitHub repository, and coordinates Codex agents that implement exactly one task per workflow execution.

V1 supports only full-stack web applications containing a web frontend, server-side logic, and project-specific persistence.

Every changed revision must pass tests, typecheck, lint, build, QA review, Reviewer review, Security review, and Legal review. An initial implementation may be followed by no more than three automatic repair attempts. Legal and critical-security holds override all earlier approvals.

## 2. Actors

| Actor | Responsibility | Application-source access |
|---|---|---|
| Platform Owner | Sole V1 human administrator, idea submitter, initial approver, and manual-decision authority | No implicit source-write right |
| Root Orchestrator | Enforces sequence and gates; reconciles and persists documentation | Documentation only during `PLANNING` |
| Planner | Requirements, stories, milestones, acceptance criteria | None |
| Architect | System, data, workflow, isolation, and integration design | None during `PLANNING` |
| Security | Planning and per-revision security assessment | Read-only |
| Legal DE/EU | Planning and per-revision legal assessment | Read-only |
| Executor | Implements the one authorized task | Read-write under exclusive lease |
| QA Reviewer | Runs and evaluates quality gates | Read-only snapshot |
| QA Writer | May repair code only when explicitly assigned | Read-write under the same exclusive lease; cannot self-review |
| Reviewer | Correctness and maintainability review | Read-only |
| Qualified Counsel | Resolves a `CounselCase` outside agent authority | Legal evidence only |
| Workflow Engine | Owns authoritative state, gates, counters, and transitions | Domain state only |
| Workers | Execute typed, authorized asynchronous activities | Capability-specific |

Service identities are required for separation of duties and do not create a second platform owner.

## 3. Priority Definitions

- `P0`: binding V1 or release blocker.
- `P1`: required before the relevant milestone exits.
- `P2`: recommended extension; deferral needs a recorded owner decision.
- `TBD`: target cannot be approved until the linked decision is closed. No current V1 P0/P1 target remains TBD after D-001..D-032.

## 4. Functional Requirements

| ID | Pri. | Requirement |
|---|---:|---|
| FR-001 | P0 | The sole owner can submit a software idea and desired outcomes as a distinct Builder project. |
| FR-002 | P0 | Each project has versioned specification, architecture, roadmap, and independently actionable tasks. |
| FR-003 | P0 | Planning order is Planner, then Architect using the completed Planner result, then Security and Legal DE/EU in parallel using the completed architecture. |
| FR-004 | P0 | Planner, Architect, Security, and Legal outputs are durable before initial approval is available. |
| FR-005 | P0 | A project proceeding beyond planning receives exactly one immutable, auditable initial approval from the owner. |
| FR-006 | P0 | Before initial approval, no executable project folder, local project repository, or application code may exist. |
| FR-007 | P0 | After valid initial approval, an authorized operation provisions one dedicated isolated workspace. |
| FR-008 | P0 | At a later authorized stage, one distinct GitHub repository is provisioned and bound to exactly one project. |
| FR-009 | P0 | Every workflow execution references exactly one non-null actionable task; zero-task and multi-task requests are rejected. |
| FR-010 | P0 | Codex may implement only the task and project scope in the signed current manifest. |
| FR-011 | P0 | At most one active source-writing lease exists per project. |
| FR-012 | P0 | Only Executor and explicitly authorized QA Writer may modify application source. Security, Legal, Reviewer, and QA Reviewer are read-only. |
| FR-013 | P0 | Tests, typecheck, lint, and build run after every initial implementation and repair, with immutable trusted evidence. |
| FR-014 | P0 | QA, Reviewer, Security, and Legal review every changed revision. |
| FR-015 | P0 | A revision is accepted only when all four quality checks and all four reviews pass for the same immutable digest, or the workflow records an explicit stop. |
| FR-016 | P0 | A failed task receives no more than three automatic repair attempts after its initial implementation. |
| FR-017 | P0 | After the third unsuccessful repair, the task stops and requires a documented manual decision; no counter reset creates a fourth repair. |
| FR-018 | P0 | Legal status accepts exactly `PASS`, `PASS_WITH_REQUIREMENTS`, `BLOCK`, or `COUNSEL_REQUIRED`; missing, stale, conflicting, or unknown data fails closed. |
| FR-019 | P0 | `PASS_WITH_REQUIREMENTS` is effective only after every requirement is verified; `BLOCK` stops continuation and publication; `COUNSEL_REQUIRED` stops publication and, conservatively, automated continuation until successor Legal assessment. |
| FR-020 | P0 | Any unresolved critical or unclassified security finding stops publication; clearing it requires remediation evidence and repeat Security review of the resulting digest. |
| FR-021 | P0 | No approval or manual decision overrides a later Legal or critical-security hold. |
| FR-022 | P0 | V1 accepts only full-stack web applications and rejects mobile-only, desktop-only, and unsupported project types. |
| FR-023 | P0 | V1 has exactly one active platform owner and no human multi-owner, tenant, membership, or role-administration feature. |
| FR-024 | P0 | Real customer data is prohibited in ideas, attachments, repositories, fixtures, workspaces, prompts, tests, evidence, reviews, and logs; suspected content is rejected or quarantined. |
| FR-025 | P0 | Secret values never enter files, prompts, queue messages, evidence, source control, or logs; agents never receive production credentials. |
| FR-026 | P0 | V1 provides no automatic production publication, production deployment, direct production mutation, production credential, or indirect CI/OIDC production route. |
| FR-027 | P0 | Only one milestone is active per project. During M-000 the conservative lock remains platform-global; the future runtime also has a platform-global emergency stop. |
| FR-028 | P0 | Planning, approvals, transitions, task attempts, repair counters, quality, reviews, holds, external operations, and manual decisions are attributable and auditable. |
| FR-029 | P0 | Project data, state, files, jobs, caches, contexts, credentials, evidence, logs, backups, and repositories are organizationally and technically isolated. |
| FR-030 | P0 | While the Builder remains `PLANNING` with architecture and implementation disabled, no application code is implemented or modified. |
| FR-031 | P0 | A disabled capability is unreachable through UI, API, queue, worker, retry, reconciliation, adapter, IAM, and network paths. |

## 5. Reconciled Security Requirements

These requirements close design gaps identified by the Security review. They are normative; implementation evidence remains future milestone work.

| ID | Requirement |
|---|---|
| SEC-B-001 | Use a microVM or independently justified equivalent isolation boundary for hostile execution. Forbid host/runtime sockets, host devices, shared writable caches, metadata/control-plane routes, ambient host paths, and unbounded resources. |
| SEC-B-002 | Reusable Codex/OpenAI authentication and session material stays in a trusted broker outside the hostile cell. The cell receives only a short, project/attempt/audience-bound capability or narrow RPC. If the pinned SDK cannot satisfy hostile-child conformance tests, execution remains disabled. |
| SEC-B-003 | The publication boundary includes repositories, packages, releases, Pages/previews, exports, CI/CD, webhooks, and cloud OIDC. Generated repositories inherit no production secret, environment, deploy key, production webhook, or cloud trust. |
| SEC-B-004 | Audit and evidence use immutable/versioned retention, a dedicated append-only writer, ordered signed checkpoints anchored in a separately administered store, rollback/gap detection, trusted time, and restore verification. |
| SEC-B-005 | The owner uses phishing-resistant WebAuthn/passkeys, two authenticators or controlled offline recovery, short sessions, CSRF defenses, and fresh reauthentication for high-risk actions. Every service has a distinct workload identity. |
| SEC-B-006 | Every API, domain, SQL, object, workspace, queue, log, and backup operation enforces project context. PostgreSQL project tables use `FORCE ROW LEVEL SECURITY`, non-owner `NOBYPASSRLS` runtime roles, a separate schema/migration owner, and project-bound capabilities. |
| SEC-B-007 | A trusted supervisor invokes a signed, versioned four-command manifest without unsafe interpolation and attests exit status, resources, toolchain, image, policy, and digest. Cell/model text is never PASS evidence. |

## 6. Reconciled Legal Requirements

Legal review status is `PASS_WITH_REQUIREMENTS` for architecture planning only.

| ID | Requirement |
|---|---|
| LGL-B01 | Model exact Legal statuses, `LEGAL_UNRESOLVED_HOLD`, publication taxonomy, successor assessments, and non-waivable holds in data and state transitions. |
| LGL-B02 | Model the legal entity, controller/processor roles, processing inventory, purposes, legal bases, data categories, recipients, and Article 30 records. |
| LGL-B03 | Before the first external byte, require a provider gate containing product-specific contract/DPA coverage, subprocessors, regions, retention, training use, transfer mechanism/TIA, deletion, and incident commitments. |
| LGL-B04 | Classify project content and reject real customer data, including pseudonymized exports, tickets, screenshots, logs, or production copies; transient screening content is not logged and is promptly deleted. |
| LGL-B05 | Define record-specific retention, deletion, backup expiry, legal holds, provider erasure, and testable deletion. Immutable evidence contains minimized or pseudonymized metadata rather than unnecessary raw personal data. |
| LGL-B06 | Provide data-subject-request and personal-data-breach workflows, including the awareness time, 72-hour assessment, communication decision, and breach register. |
| LGL-B07 | Maintain an AI-system register, provider/deployer role analysis, AI literacy evidence, prohibited-practice screen, transparency/provenance rules, and per-project high-risk screen. |
| LGL-B08 | Require file, model, template, and dependency provenance; OSS policy; notices; rights-chain review; lockfiles; SBOM; and license/similarity findings before repository push or release. |
| LGL-B09 | Require a per-project release legal profile for CRA, product liability, B2B/B2C, DDG/TDDDG, BFSG, regulated domains, and target jurisdictions. Unknown scope yields `COUNSEL_REQUIRED`. |
| LGL-B10 | Bind each Legal assessment to scope, facts, assumptions, jurisdiction, legal date, sources, reviewer type, and artifact digest. Only qualified counsel may close a `CounselCase`; Legal then issues a successor assessment. |

## 7. Non-Functional Requirements

### Binding Targets

| ID | Requirement and target |
|---|---|
| NFR-001 | Release security tests show zero unauthorized cross-project filesystem, API, job, artifact, log, credential, cache, or backup access. |
| NFR-002 | 100% of source writes are attributable to an authorized writer, project, task, workflow, attempt, fence token, and resulting revision. |
| NFR-003 | The maximum observed active source-writer lease and RW mount count per project is one, including crash, partition, and retry tests. |
| NFR-004 | Seeded-secret scans of persisted files, prompts, evidence, Git history, and logs report zero unredacted values before milestone exit. |
| NFR-005 | Tests prove no agent, adapter, repository, workflow, IAM role, OIDC trust, or route can mutate production. |
| NFR-006 | All examples, fixtures, automated tests, and demonstrations use synthetic data only. |
| NFR-007 | 100% of gate-relevant transitions record actor, project/task scope, previous/new state, reason, policy version, time, and evidence references. |
| NFR-008 | Missing, malformed, stale, conflicting, unavailable, or unknown authorization, quality, Legal, Security, or evidence data denies progression. |
| NFR-009 | Duplicate delivery, concurrent commands, restart, rollback, or recovery cannot cause a fourth automatic repair. |
| NFR-010 | Every implementation and repair has immutable trusted evidence for four checks and four reviews bound to the exact revision digest. |
| NFR-011 | Disabled capabilities remain unreachable at command acceptance, claim, dispatch, external operation, webhook, retry, and reconciliation. |
| NFR-012 | Every accepted task traces to its planning baseline, task version, attempts, manifests, evidence, four reviews, holds, and final revision. |

### Selected Measurable Targets

| ID | Proposed target | Decision |
|---|---|---|
| NFR-013 | All commands and side effects are idempotent; duplicates create no extra project, workspace, repository, run, review, or approval. | D-018 |
| NFR-014 | Durable recovery resumes from committed state without repeating external effects; backup target RPO is 24 hours and RTO is 8 hours after provider and restore gates pass. | D-018, D-019, D-021 |
| NFR-015 | Local idle UI/API p95 is under 2 seconds; job dispatch is under 5 seconds; one writer and up to four read-only reviews may run per project; attempts last at most 30 minutes; project, artifact, and retained-run-log limits are 5 GiB, 100 MiB, and 50 MiB. | D-021 |
| NFR-016 | Logs/traces carry correlation metadata only and exclude source, prompts, tool output, Legal advice, secrets, and personal data by default. | D-019, D-022 |
| NFR-017 | Sensitive metadata is encrypted in transit and at rest using approved key ownership and rotation. | D-019, D-022 |
| NFR-018 | The web UI targets WCAG 2.2 AA with an approved browser, viewport, and language matrix. | D-030 |
| NFR-019 | Execution cells enforce explicit CPU, memory, PID, disk, duration, output, token, cost, and egress limits. | D-009, D-021 |
| NFR-020 | Dependencies and toolchains are allowlisted, locked, scanned, and accompanied by provenance and SBOM evidence. | D-005, D-023 |
| NFR-021 | Primary data stays locally encrypted; approved EU backup snapshots run daily, expire after 30 days, retain minimized audit evidence for 12 months, and use a separately controlled immutable audit anchor. Provider activation still requires current Security/Legal evidence. | D-019, D-027 |
| NFR-022 | Deployment adapters share a typed contract but cannot address production in V1. | D-024 |

## 8. Global Acceptance Criteria

| ID | Criterion |
|---|---|
| GAC-001 | A supported idea completes planning in the mandated role order and produces all required versioned artifacts. |
| GAC-002 | No executable project folder, local project repository, or application source exists before initial approval. |
| GAC-003 | An approved project receives one isolated workspace and, only when enabled, one dedicated repository. |
| GAC-004 | Hostile tests show zero cross-project access across every supported storage and execution path. |
| GAC-005 | Every workflow has one task and every project has at most one active source writer. |
| GAC-006 | Unauthorized role writes and QA self-review are denied. |
| GAC-007 | Tests, typecheck, lint, and build pass with trusted evidence before acceptance. |
| GAC-008 | The same revision digest has current QA, Reviewer, Security, and Legal decisions. |
| GAC-009 | A fourth repair cannot start under concurrency, duplicate, crash, restore, or manual-decision scenarios. |
| GAC-010 | Only the four Legal statuses are accepted and their exact requirement/hold semantics are enforced. |
| GAC-011 | `COUNSEL_REQUIRED` and `BLOCK` create the documented non-waivable holds. |
| GAC-012 | Critical and unclassified Security findings prevent publication until verified closure. |
| GAC-013 | Later Legal or Security stops override all prior approvals. |
| GAC-014 | Mobile-only, desktop-only, and unsupported stack requests are rejected. |
| GAC-015 | No persisted or transmitted content contains real customer data or an unredacted seeded secret. |
| GAC-016 | No production credential, route, CI/OIDC trust, automatic deployment, or direct/indirect mutation path exists. |
| GAC-017 | An auditor can reconstruct every gate and side effect for an exact project, task, revision, and attempt and detect rollback/gaps. |
| GAC-018 | All P0, `SEC-B`, and `LGL-B` requirements pass; blocking decisions are closed; any allowed deferral is owner-recorded. |

## 9. Explicit V1 Exclusions

- Mobile applications.
- Desktop applications.
- More than one platform owner.
- Human membership, team, tenant, and custom-role administration.
- Concurrent source writers or concurrent task execution within one project.
- Multiple tasks in one workflow execution.
- Automatic or direct production publication/deployment.
- Production credentials, routes, environments, OIDC trusts, or repository secrets.
- Real customer data.
- Owner waiver of Legal or critical-security stops.
- A fourth automatic repair.
- Application-source writes by Security, Legal, or Reviewer.

## 10. Working Assumptions

1. Builder architecture approval and each generated project's initial approval are different gates.
2. The initial implementation is ordinal `0`; repairs are ordinals `1`, `2`, and `3`.
3. Every source change creates a new digest and all eight obligations anew.
4. Planning artifacts may exist before approval, but an executable generated-project directory may not.
5. Ambiguous distribution is publication and is denied until classified.
6. Unknown or conflicting gate evidence fails closed.
7. GitHub, automatic execution, and deployment design do not enable their current gates.
8. Security successor status is `ACCEPTED_WITH_IMPLEMENTATION_GATES`; failed or missing milestone evidence keeps the affected capability disabled.
9. Legal successor status is `PASS_WITH_REQUIREMENTS`; M-000 architecture requirements are accepted and later provider/implementation/release evidence remains mandatory.

## 11. Requirement Traceability

- Product flows and story acceptance: `docs/product/user-flows.md`.
- Component and boundary realization: `docs/architecture/system-design.md`.
- Entity and constraint realization: `docs/architecture/data-model.md`.
- Transition and guard realization: `docs/architecture/workflow-state-machine.md`.
- Milestones and open decisions: `docs/architecture/implementation-roadmap.md`.
- Security threats and gates: `docs/security/threat-model.md`.
- German/EU Legal ledger: `docs/compliance/legal-review-de.md`.
