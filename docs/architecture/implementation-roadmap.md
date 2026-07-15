# Builder Platform V1 Implementation Roadmap

Status: `WORKER_FAKE_RUNTIME_MVP - BLOCKED - DEVELOPMENT ONLY`

This roadmap sequences future work. `PROJECT_STATE.md` records the active local `WORKER_FAKE_RUNTIME_MVP` milestone. This scope-reset review changes documentation only and authorizes no application-code change. GitHub, automatic project execution, and production remain disabled.

## 1. Current Position

- Planner: complete.
- Architect: complete.
- Security successor review: complete with status `ACCEPTED_WITH_IMPLEMENTATION_GATES`.
- Legal DE/EU successor review: complete with status `PASS_WITH_REQUIREMENTS`; M-000 requirements accepted and later evidence assigned to fail-closed gates.
- Reconciliation: complete in the eight planning documents.
- Decision pass: owner questions answered and reversible MVP decisions recorded in section 7.
- Selected operating profile: private owner-only use, local Windows host, controlled OpenAI processing, dedicated private GitHub organization, local passkey authentication, encrypted EU cloud backup.
- The instruction to fix all named planning problems supersedes the earlier no-login choice. D-020 now uses Windows Hello plus a second independent FIDO2 authenticator.
- Hardware, provider-contract, conformance, restore, and operational tests remain fail-closed activation evidence. They are not unresolved architecture choices.
- M-000 planning content: complete and owner-approved.
- The historical foundation and local persistence work provide the base for the active `WORKER_FAKE_RUNTIME_MVP` component milestone.
- `WORKER_FAKE_RUNTIME_MVP` is the sole active milestone and is limited to synthetic data, `FakeAgentRuntime`, and one local worker by default.
- `REAL_RUNTIME_HARDENING` is required, unresolved, and fail closed before real Codex execution, agent-driven GitHub changes, Release Candidate, or Production.

## 2. Milestone Rules

1. Milestones execute linearly unless an owner-approved dependency update says otherwise.
2. Until the database-backed D-003 policy is implemented, the active-milestone lock remains platform-global.
3. Selected V1 behavior is one active milestone per project and bounded parallelism across projects, plus a global emergency stop.
4. A milestone exits only with immutable acceptance evidence.
5. Components are evaluated during development only against the scope, acceptance criteria, and gates of their current milestone. A component pass is not a production approval.
6. Security, Legal, and evidence holds prevent the exit or release stage to which they apply. A Security `BLOCK` blocks the current development milestone only when it concerns that milestone's scope or a binding gate of that milestone.
7. `NOT_VERIFIABLE_LOCALLY` does not block a development milestone when the missing proof is recorded with required evidence as a later fail-closed Production Gate. It remains unresolved for that later gate.
8. PostgreSQL integration, real worker identity, qualified-counsel verification, provider contracts, and deployment are evaluated only in their assigned milestones. Earlier isolated component tasks may record them as later gates but may not pull them into their current acceptance scope.
9. Implementation work is exactly one task per workflow and at most one source-writing agent per task.
10. Read-only QA, Reviewer, Security, and Legal reviews start only after implementation and writer handoff are complete; they may then run in parallel against the same fixed digest.
11. Reviews may not turn previously passed, unchanged areas into repair scope. New out-of-scope findings become separately scoped successor tasks with an assigned milestone and release stage.
12. After initial implementation, at most one automatic repair pass is permitted. A remaining failure produces a structured blocker and requires a manual decision; automatic loops are prohibited.
13. Every task records scope, testable acceptance criteria, allowed files or components, a maximum time budget, and an unambiguous final status.
14. `DEVELOPMENT_ONLY`, `RELEASE_CANDIDATE`, and `PRODUCTION` are separate approval stages. Legal `PASS_WITH_REQUIREMENTS` may permit `DEVELOPMENT_ONLY` when the requirements are assigned to later gates and do not prohibit the current isolated scope. `COUNSEL_REQUIRED` blocks production and the affected external or legal action, but not automatically an unrelated technically isolated implementation.
15. All deferred gates remain fail closed at their assigned stage. No milestone rule weakens Security, Legal, audit, data, privacy, secret, isolation, or compliance controls.
16. Production deployment remains `DISABLED`; no milestone or component result changes the permanent production prohibition.

## 3. Milestones

### M-000 Planning and Architecture Approval

Dependencies: none.

Scope:

- finalize requirements, user flows, system design, data model, state machine, roadmap, threat model, and Legal review;
- reconcile `SEC-B-001..007` and `LGL-B01..B10`;
- obtain owner decisions needed to make the architecture determinate;
- retain all runtime gates as disabled.

Entry criteria:

- authoritative state is `PLANNING`;
- no application implementation or generated-project workspace is active.

Exit criteria:

- all eight documents pass consistency checks;
- D-001, D-003, D-009, D-019, D-020, D-022, D-029, and every other architecture blocker are decided;
- Security acknowledges the reconciled design no longer has an unresolved architecture-critical gap;
- Legal requirements needed for architecture are represented and assigned;
- residual risks are accepted for planning scope only;
- the owner explicitly sets `Architecture approved: YES` in a separate authorized workflow.

This exit does not enable implementation, GitHub, automatic execution, or deployment.

### M-001 Control Plane, Identity, State, Legal/Privacy, and Audit Foundation

Dependencies: M-000 and explicit `Implementation enabled: YES`.

Scope:

- sole-owner authentication and recovery;
- workload identities and least-privilege ports;
- project registry and project-scoped authorization;
- relational state machines, constraints, outbox/inbox, idempotency, and holds;
- evidence finalization and independent signed audit checkpoints;
- Legal/Privacy inventory, retention, DSR, breach, provider, transfer, and AI records;
- capability gates and emergency disable.

Exit criteria:

- disabled capabilities are unreachable through every interface;
- one-owner, one-approval, one-task, one-writer, repair-range, Legal-enum, and production-denial constraints pass;
- WebAuthn/fresh-auth/CSRF/recovery tests pass;
- API/domain/SQL/object project-boundary negative tests pass;
- audit rollback/gap/restore tests pass;
- DSR, deletion, breach, legal-hold, and provider-expiry flows are evidenced;
- Security/Legal requirements for M-001 are closed.

Requirements: FR-023, FR-027..031; NFR-002, NFR-007, NFR-008, NFR-011, NFR-012; SEC-B-004..006; LGL-B01, B02, B05, B06, B10.

### M-002 Idea Intake and Planning Pipeline

Dependencies: M-001.

Scope:

- bounded full-stack-web intake;
- pre-persistence secret/customer-data screening;
- immutable planning baselines and structured artifacts;
- Planner-to-Architect ordering and atomic task definitions;
- supported stack profile and accessibility baseline.

Exit criteria:

- supported ideas create all four artifacts without executable workspace;
- unsupported types and prohibited data are rejected/quarantined;
- no raw rejected content appears in logs/evidence;
- successor baseline invalidates earlier reviews;
- planning traceability and UI rendering/XSS tests pass.

Requirements: FR-001..004, FR-009, FR-022, FR-024; LGL-B04; D-005..007, D-030.

### M-003 Planning Reviews and Initial Approval Gate

Dependencies: M-002.

Scope:

- parallel Security and Legal planning reviews;
- exact Legal status, requirement ledger, Security severity, holds, counsel, publication taxonomy;
- one fresh-authenticated initial owner approval;
- notifications and current-review enforcement.

Exit criteria:

- Security and Legal consume the same completed architecture digest;
- all planning blockers/requirements have evidence and authorized closure;
- exact status and later-hold precedence tests pass;
- approval is impossible before prerequisites and impossible a second time;
- counsel, unknown jurisdiction, and release-profile triggers work;
- owner cannot waive a binding hold.

Requirements: FR-004..006, FR-018..021; LGL-B01, B07, B09, B10; SEC-R-007; D-014..016, D-025, D-026, D-028, D-032.

### M-004 Project Workspace Isolation

Dependencies: M-003 and valid project initial approval.

Scope:

- microVM or approved equivalent boundary;
- Workspace Manager, opaque paths, project storage, attempt snapshots, fencing, cleanup/quarantine;
- quotas, deny-default egress, safe archives, encrypted storage, deletion behavior.

Exit criteria:

- no workspace exists before approval;
- cross-project hostile tests have zero unauthorized success;
- host socket/device/metadata/control-plane/cache/path/archive escape tests fail closed;
- prior cell death is required before writer reuse;
- customer-data and seeded-secret tests pass;
- archive/deletion/restore behavior matches Legal policy.

Requirements: FR-006, FR-007, FR-025, FR-029; NFR-001, NFR-004, NFR-019; SEC-B-001, SEC-B-006; D-009, D-019, D-027.

### M-005 Dedicated GitHub Integration

Dependencies: M-004 and explicit `GitHub integration enabled: YES` only after milestone prerequisites. Agent-driven or automatic GitHub changes additionally require completed `REAL_RUNTIME_HARDENING`; private GitHub infrastructure planning alone does not enable agent writes.

Scope:

- provider/DPA/transfer gate;
- dedicated GitHub App/account/organization;
- one private repository per project;
- token brokerage, webhooks, idempotent provisioning, configuration baseline, drift holds;
- license/SBOM/provenance gate.

Exit criteria:

- provider and transfer evidence is effective;
- duplicate/timeout create operations cannot create a second repository;
- tokens are repository/permission scoped and inaccessible to agents;
- webhook signature/replay/binding tests pass;
- Actions, Pages, releases, packages, OIDC, production environments/secrets/webhooks are absent or denied;
- visibility/settings drift blocks pushes;
- accepted content digest is the exact pushed digest.

Requirements: FR-008, FR-025, FR-026, FR-029, FR-031; SEC-B-003; LGL-B03, LGL-B08; D-010, D-016, D-023.

### M-006 Single-Task Codex Execution

Dependencies: M-005 unless D-010 approves a different lifecycle, completed `REAL_RUNTIME_HARDENING`, and a separately approved `AGENT_RUNTIME=codex` gate; explicit `Automatic project execution: YES` only after all technical, Security, Legal, provider, and owner readiness gates pass.

Scope:

- pinned Codex adapter and provider conformance;
- external-processing Legal gate;
- trusted credential broker outside hostile cell;
- signed one-task manifest, role capabilities, exclusive writer, cancellation, budgets, egress;
- session/project isolation.

Exit criteria:

- zero-task and multi-task requests are denied;
- hostile child processes cannot access reusable provider authentication, session files/sockets, ambient environment, or other projects;
- no `full_access` or equivalent broad grant is used;
- one active writer and fencing survive partition/crash tests;
- cancellation kills the process tree and revokes mounts/credentials, or creates a blocking stuck state;
- prompt injection and egress red-team suite passes the approved threshold;
- exact provider product, DPA, transfer, retention, region, and AI role evidence is current.

Requirements: FR-009..012, FR-024, FR-025, FR-029, FR-031; SEC-B-001, B002; LGL-B03, B07; D-008, D-013, D-022, D-029.

### WORKER_FAKE_RUNTIME_MVP - Local Worker and Fake Pipelines

Dependencies: approved architecture, persistent local job storage, and explicit `Implementation enabled: YES` for separately contracted development tasks.

Scope:

- local `AgentRuntime` port and deterministic `FakeAgentRuntime` for success, error, timeout, and confirmed cancellation;
- persistent job claim, lease, generation, fencing, retry limit, and restart recovery;
- atomic pre-start cancellation based on provable persistent job/outbox state;
- fail-closed `CANCEL_STUCK` or blocked gate for every unclear cancellation/runtime outcome;
- synthetic data and one local worker by default;
- local Agent Registry and Fake-Pipeline development may follow through separate tasks.

Exit criteria:

- all eleven criteria in `worker-fake-runtime-mvp-scope-reset-01.md` pass on the current stable stand;
- all current tests, PostgreSQL integration without skips, lint, typecheck, build, and `git diff --check` pass;
- QA, Reviewer, Security, and Legal DE complete their scoped read-only reviews on the same fixed stand;
- GitHub remains `NO`, automatic project execution remains `NO`, and Production deployment remains `DISABLED`.

This milestone is only `DEVELOPMENT_ONLY`. It neither satisfies nor waives any Real-Runtime, Release-Candidate, or Production gate.

### REAL_RUNTIME_HARDENING - Mandatory Real Runtime Gate

Dependencies: completed local Fake-Pipeline/Registry development and a separately authorized immutable task contract.

Required unresolved scope:

- real `RuntimeTerminationEvidence` and cryptographic or provider-bound termination attestation;
- complete `WORKLOAD_NOT_CREATED` attestation from a real external runtime;
- distributed, multiprocess-capable final reconciliation;
- actual runtime-status query against Codex;
- crash handling between external runtime query and Evidence commit;
- complete AT-15/16/17/19/22 Production evidence;
- Completion-ID hardening;
- real worker and process identity;
- provider and credential revocation.

Exit criteria:

- every listed item is evidenced and approved at its assigned gate; no item is inferred from FakeRuntime results;
- the approved `CANCELLATION-CONTRACT-DECISION-01` target architecture is fully implemented for the real runtime;
- Security, Legal, provider, GitHub, release, and explicit owner gates independently pass where applicable.

Status: `REQUIRED - DEFERRED_TO_LATER_GATE - FAIL CLOSED`. Completion is mandatory before `AGENT_RUNTIME=codex`, writing real Codex executors, automatic GitHub changes, `RELEASE_CANDIDATE`, or `PRODUCTION`, but is not alone sufficient to activate any of them.

### M-007 Quality, Four Reviews, and Repair Limit

Dependencies: M-006.

Scope:

- signed Toolchain Manifest and Trusted Quality Supervisor;
- tests, typecheck, lint, build;
- QA, Reviewer, Security, Legal obligations;
- revision freshness, Security/Legal gates, provenance/SBOM;
- one-repair transaction, structured blocker, and manual stop.

Exit criteria:

- cell/model output cannot fabricate PASS;
- all eight obligations bind the exact current digest;
- one-byte changes invalidate all eight;
- QA Writer cannot self-review;
- concurrency/crash/restore cannot create repair ordinal 2;
- critical, unclassified, `BLOCK`, `COUNSEL_REQUIRED`, unmet requirement, and stale evidence fail closed at every release stage to which they apply;
- after one failed automatic repair a structured blocker is required and only D-017 manual options are available.

Requirements: FR-013..021, FR-028; NFR-008..010, NFR-012; SEC-B-007; LGL-B08, B10; D-012..017, D-031.

### M-008 V1 Release Readiness and Non-production Handoff

Dependencies: M-007.

Scope:

- metadata/package handoff boundary;
- complete Security/Legal/recovery/operational evidence;
- publication classification and release Legal Profile;
- proof of no direct or indirect production path.

Exit criteria:

- GAC-001..018 pass;
- all `SEC-B` and applicable `LGL-B` requirements pass;
- target is classified and never `PRODUCTION` or `UNKNOWN`;
- repository/workflow/OIDC/network/credential tests prove no production route;
- CRA, product liability, B2B/B2C, DDG/TDDDG, BFSG, IP/OSS, jurisdiction, provider, and counsel gates are resolved for the action;
- backup/restore and incident drills meet approved objectives;
- remaining non-blocking deferrals are owner-recorded.

Requirements: FR-022..029; all binding NFRs; SEC-B-003..007; LGL-B03, B05..B10; D-016, D-019, D-021, D-024, D-028.

## 4. Security Acceptance by Milestone

| Milestone | Required Security evidence |
|---|---|
| M-000 | Threat model accepted; `SEC-B-001..007` normative; isolation, auth, audit, authorization, quality, and indirect-production decisions assigned and closed where architecture-blocking |
| M-001 | Passkey/recovery/fresh-auth, workload IAM, project authorization, DB constraints, signed audit checkpoint, rollback/restore, emergency-disable tests |
| M-002 | Input DLP/secret controls, safe rendering/CSP/origin, bounded parser and prohibited-data tests |
| M-003 | Severity rubric, unclassified/critical holds, no owner waiver, exact gate and later-stop tests |
| M-004 | Hostile isolation, egress/SSRF, resource, cache, traversal/archive, encryption, cleanup, cross-project suite |
| M-005 | GitHub App/token/webhook, dedicated-org baseline, settings drift, indirect production, digest-push tests |
| M-006 | Codex credential/session/environment hostile-child conformance, prompt injection, tool/egress, budgets, cancellation tests |
| M-007 | Trusted runner attestation, stale evidence, QA independence, repair chaos, Security remediation tests |
| M-008 | Full threat suite, restore/red-team exercise, no production route, all critical findings verified closed |

Security architecture status is `ACCEPTED_WITH_IMPLEMENTATION_GATES`. Each milestone still fails closed until its listed security evidence passes.

## 5. Legal Acceptance by Milestone

| Milestone | Required Legal evidence |
|---|---|
| M-000 | LGL-B01/B02/B05/B10 represented; all Legal decisions and counsel triggers assigned |
| M-001 | Legal entity/controller roles, processing inventory, notices, retention, DSR, breach, DPIA screen, encryption/access minimization |
| M-002 | Synthetic-only intake and transient screening; no raw rejected content in logs |
| M-003 | Exact current Legal assessment, verified requirements, counsel and jurisdiction gates before approval |
| M-004 | Deletion, key separation, isolation, prohibited-data/secret tests |
| M-005 | GitHub product/DPA/transfer/ownership plus private, license, provenance, and SBOM policy |
| M-006 | OpenAI/Codex product/DPA/transfer/retention/region plus AI role, literacy, transparency, and minimization |
| M-007 | Current per-revision Legal assessment, four reviews, provenance/SBOM, no self-clear |
| M-008 | Publication class, recipients, CRA/product/B2C/BFSG/jurisdiction/counsel gates; production still impossible |

Legal status is `PASS_WITH_REQUIREMENTS` for the approved architecture. Each applicable milestone and external-processing gate remains ineffective until its evidence ledger is verified.

## 6. Original Decision Register

This table preserves the original questions and ownership. The current decision status and the selected MVP treatment are authoritative in section 7. A technical or owner decision does not constitute Security/Legal reapproval or enable implementation.

| ID | Decision | Recommended/interim baseline | Owner(s) | Blocks |
|---|---|---|---|---|
| D-001 | Relationship and authority of Builder architecture, implementation, global capability, and per-project initial-approval gates; runtime source of truth | Distinct gates; one runtime authority after audited migration; `PROJECT_STATE.md` authoritative now | Owner, Architect | M-000 |
| D-002 | Material planning changes after initial approval | Freeze approved baseline; successor change case and explicit reauthorization or new project, never second initial approval | Owner, Legal, Security | M-003 |
| D-003 | Platform-global vs per-project milestone serialization | Interim platform-global; recommend one active milestone/project with bounded cross-project concurrency | Owner, Architect | M-000/M-001 |
| D-004 | Whether writer lease covers QA | One fixed writer identity per task; QA Reviewer remains RO; a writer change requires a new task | Architect, QA, Security | M-001 |
| D-005 | Supported frontend/backend/database/package/test/build stack matrix | Small explicit matrix with signed toolchain profiles; reject unknown stacks | Owner, Architect | M-002 |
| D-006 | Intake schema, size, attachments, customer-data definition/detection, quarantine, deletion | Text-only bounded intake, no attachments, pre-persistence scan | Product, Security, Legal | M-002 |
| D-007 | Planning artifact schemas, versioning, storage, rendering, and change control | Structured versioned canonical artifacts plus rendered Markdown and immutable digests | Product, Architect, Legal | M-002 |
| D-008 | Exact Codex SDK/runtime/model, tools, network, dependency, timeout, cancellation, identity, and budget policy | Pinned server-side adapter, deny-default environment/tools/network, bounded manifest; no automatic execution until conformance passes | Architect, Security, Legal | M-006 |
| D-009 | Isolation primitive, layout, quotas, lifecycle, cleanup, archive, deletion, assurance | MicroVM or independently justified equivalent; explicit quotas and hostile test program | Architect, Security | M-004; architecture blocker |
| D-010 | GitHub owner/org, product/tariff, App permissions, visibility, names, branch policy, creation trigger | Dedicated account/org, GitHub App, private default, minimum token, protected branch, risky features disabled | Owner, Architect, Security, Legal | M-005 |
| D-011 | Authoritative identity boundaries for project, milestone, task, workflow, attempt, repair, revision, and change | Adopt entities/ordinals/digests in data model, pending owner/QA ratification | Product, Architect, QA | M-001 |
| D-012 | Discovery and semantics of test/typecheck/lint/build; missing/nondeterministic command; attestation signer | Signed structured four-command Toolchain Manifest; unsupported/missing command fails closed | Architect, QA, Security | M-007 |
| D-013 | Repair actor, QA write mode, task boundary, review independence | Executor normally repairs; QA Writer must be the task's fixed writer or work in a new task and cannot QA-review own revision | Owner, Architect, QA | M-006/M-007 |
| D-014 | Security severity rubric, classifier/downgrade/false-positive authority, remediation evidence and incident mapping | Unclassified blocks; critical not owner-waivable; Security-only evidence path | Security, Owner, Legal | M-003 |
| D-015 | Evidence/authority for Legal requirements, counsel, status successor, confidentiality, and implementation during counsel | Legal verifies; qualified counsel evidence encrypted; successor assessment; interim automation hold | Legal, Owner | M-003 |
| D-016 | Definitions of continuation, acceptance, external processing, publication/release, preview, private push, export, handoff, production | Use taxonomy in state-machine doc; ambiguous/unknown denied | Owner, Legal, Security | M-003/M-005/M-008 |
| D-017 | Historical manual options after three failed repairs; the former repair limit is superseded prospectively by the owner-mandated single automatic repair pass in sections 2 and 7 | Never reset counter; abandon, new scoped task, or reviewed external remediation | Owner, Product, QA | M-007 |
| D-018 | Database/queue/workflow products, transaction boundaries, delivery, idempotency, leases, retry/cancel limits | Relational state machines, outbox/inbox, at-least-once, fencing, reconciliation | Architect | M-001 |
| D-019 | Data classification, region, residency, retention, deletion, backup, audit anchor/WORM, keys, RPO/RTO | Minimized project-scoped encryption in approved EU region; independently anchored audit; numeric policy TBD | Owner, Legal, Security, Architect | M-001; architecture blocker |
| D-020 | Owner bootstrap, passkeys/MFA, recovery, session, account rotation, emergency lockout | Phishing-resistant passkeys, two authenticators or controlled offline recovery, fresh high-risk auth | Owner, Security | M-001; architecture blocker |
| D-021 | Availability, latency, planning duration, capacity, artifact/log size, quotas, cancellation, backup, RPO/RTO targets | No numeric commitment until workload/budget selected; hard per-task bounds still mandatory | Owner, Architect | M-001 |
| D-022 | Secret broker/KMS, workload IAM, encryption, Codex credential proxy, rotation, redaction, incident response | Dedicated KMS/broker, opaque refs, short audience-bound capabilities outside hostile cell, distinct identities | Architect, Security | M-001/M-006; architecture blocker |
| D-023 | Package sources, imports, lifecycle scripts, license allowlist, SBOM format, vulnerability thresholds, generated-code provenance | Allowlisted proxy registries, locks/digests, provenance, signed SBOM, license/vulnerability gates | Architect, Security, Legal | M-005/M-006 |
| D-024 | V1 handoff/deployment scope and destinations | Metadata/package export only; no hosted preview by default; never production/unknown | Owner, Architect, Security, Legal | M-008 |
| D-025 | Owner notification channels, acknowledgement, timeouts, escalations, evidence of delivery | Durable in-product inbox; no timeout implies approval; exact channels/SLO TBD | Product, Owner, Legal | M-003/M-007 |
| D-026 | Legal disclaimer, automated Legal scope, mandatory-counsel rules | Automated review is not legal advice; adopt counsel triggers in Legal review; qualified wording TBD | Legal, Owner | M-003 |
| D-027 | Cancel, abandon, archive, export, delete, backup/provider erasure, tombstones, legal holds | Archive first; no automatic external deletion; record-specific policy and verified erasure | Product, Legal, Security | M-004 |
| D-028 | Operating legal entity, markets, B2B/B2C, supported jurisdictions, regulated domains, employment use | Germany/EU planning scope; uncertainty or listed sensitive domains -> `COUNSEL_REQUIRED` | Legal, Owner | M-003 |
| D-029 | Whether source/artifacts may reach OpenAI/Codex; exact product, contract, DPA, region, retention, subprocessors, transfers, minimization | No external byte until product-specific provider/transfer gate is effective | Owner, Legal, Security | M-000/M-006; architecture blocker |
| D-030 | Accessibility, browser, viewport, language/localization and BFSG profile | WCAG 2.2 AA responsive baseline; exact browsers/languages/BFSG scope TBD | Product, Owner, Legal | M-002 |
| D-031 | Review ordering/parallelism, independence, digest/policy binding, invalidation, requirement verifier | Four parallel RO reviews on same digest; all rerun after source change; QA writer cannot self-review | Architect, QA, Security, Legal | M-007 |
| D-032 | Effect of planning `BLOCK`, `COUNSEL_REQUIRED`, critical/unclassified findings on approval/workspace/execution and permitted remediation | Conservative hold on approval/workspace/automation; only explicitly scoped read-only or remediation work | Owner, Legal, Security | M-003 |

## 7. MVP Decision Records

Status meanings:

- `TECHNICAL-DECIDED`: reversible MVP decision selected by the Orchestrator.
- `CONDITIONAL`: design selected, but a named hardware, provider, Security, or Legal gate still blocks use.
- `OWNER-DECIDED`: selected by the Platform Owner.
- `SUPERSEDED`: an earlier choice was replaced by a later owner instruction and is retained only in decision history.

None of these records is a Security or Legal successor review, an architecture approval, or implementation permission.

| ID | Status and MVP decision | Reason | Disadvantages | Later migration |
|---|---|---|---|---|
| D-001 | `TECHNICAL-DECIDED`: Keep separate Builder architecture, implementation, GitHub, automatic-execution, and permanently disabled production gates plus one immutable initial approval per generated project. `PROJECT_STATE.md` remains authoritative through M-000; after M-001 the database becomes authoritative and the file is a generated read-only mirror. | Separates planning, implementation, provider, and project authority and removes dual runtime truth. | More explicit gates and transition evidence. | Add new versioned gates through the policy registry; migrate the file with an audited one-time import. |
| D-002 | `TECHNICAL-DECIDED`: Freeze the initially approved baseline. A material change creates a successor baseline, hold, fresh Security/Legal reviews, and a `CHANGE_APPROVAL`; it never creates a second initial approval. | Preserves the one-initial-approval rule and prevents silent scope change. | More review cycles after material changes. | A future policy may classify low-risk changes, but may not reuse stale evidence. |
| D-003 | `TECHNICAL-DECIDED`: One active milestone per project plus a platform-global emergency stop. During M-000 the conservative platform-global milestone lock remains. | Allows safe future project concurrency without concurrent work inside one project. | Global capacity and fairness controls are still needed. | Replace the lock backend without changing milestone semantics; add quotas when multiple projects run. |
| D-004 | `TECHNICAL-DECIDED`: Each task binds exactly one permitted writer identity, which may be Executor or an explicitly assigned QA Writer. QA Reviewer remains read-only. Changing the writer requires closing the current task and creating a new task with a new immutable contract. | Prevents revision races, mid-task identity changes, and review invalidation. | A different repair actor requires a separately scoped successor task. | The lease service can later support branches, but one fixed writer per task and canonical serialization remain invariant. |
| D-005 | `TECHNICAL-DECIDED`: One V1 stack profile: TypeScript, Next.js full-stack web application, PostgreSQL, pnpm, TypeScript compiler, ESLint, Vitest, Playwright, and a production build. Unknown stacks are rejected. | One signed toolchain is simpler to secure, test, and support. | Excludes other languages/frameworks and couples V1 projects to one profile. | Add versioned `StackProfile` adapters and migration templates without changing workflow gates. |
| D-006 | `TECHNICAL-DECIDED`: Text-only idea input, maximum 20,000 characters, no attachments. Scan in transient memory before persistence; reject or quarantine suspected secrets/customer data without logging raw input. | Small attack surface and clear synthetic-data boundary. | No screenshots, archives, or design attachments. False positives need owner correction. | Add typed attachment profiles later with isolated parsers and separate Legal/Security approval. |
| D-007 | `TECHNICAL-DECIDED`: Canonical artifacts use versioned JSON Schema; Markdown is a rendered view. Every revision is append-only and SHA-256 content-addressed. | Enables schema validation, stable digests, and human-readable documents. | Schema migrations and dual representation add work. | Add new schema versions and deterministic migrators; retain old renderers for audit. |
| D-008 | `CONDITIONAL`: Use the pinned server-side TypeScript Codex SDK selected at M-006. Prefer cell-local SDK/CLI with an attempt-bound proxy capability, minimal environment, deny-default tools/egress, 30-minute task timeout, and no unsafe fallback. Exact version and model are recorded per run after conformance testing. | Matches the TypeScript control plane while keeping provider behavior behind an adapter. | SDK/runtime behavior and proxy compatibility remain version-sensitive; automatic execution stays disabled until proven. | Swap SDK/model through `AgentProviderPort`; migrate sessions only when conformance proves compatibility. |
| D-009 | `CONDITIONAL`: The local Windows host uses QEMU full Linux VMs with Windows Hypervisor Platform acceleration, one disposable differencing disk per attempt, no host share, clipboard, device passthrough, or control-plane route. WSL and ordinary containers are not security fallbacks. | The observed Windows Home edition does not provide the intended Hyper-V management baseline; QEMU/WHPX supplies an exchangeable full-VM boundary. | Heavier and slower than microVMs; WHPX and CPU virtualization must pass a prerequisite test. | `WorkspaceBackend` permits later migration to Hyper-V, Firecracker, cloud microVMs, or another independently reviewed backend. |
| D-010 | `OWNER-DECIDED, CONDITIONAL`: Use a dedicated private GitHub organization and GitHub App. Repositories are private; Actions, Pages, Releases, Packages, OIDC, environments, deploy keys, and production webhooks are disabled. | Separates Builder projects from personal repositories and indirect production paths. | Additional organization/App administration and provider Legal evidence. | Change provider/account through `GitHubPort`; transfer repositories only through an audited owner action. |
| D-011 | `TECHNICAL-DECIDED`: Adopt the project, baseline, milestone, task, workflow, attempt, repair, revision, obligation, assessment, hold, and external-operation identities in `data-model.md`; initial ordinal is 0 and the sole automatic repair ordinal is 1. | Removes ambiguity from counters, evidence, and references. | More entities than a simple job table. | Add backward-compatible schema versions and explicit data migrations. |
| D-012 | `TECHNICAL-DECIDED`: A structured signed Toolchain Manifest contains argv arrays, working-directory handles, time/resource limits, and the four required commands. A separate Trusted Quality Supervisor attests results with an Ed25519 signing key protected by the local secret broker. | Prevents shell interpolation and cell-fabricated PASS evidence. | Requires key lifecycle and trusted runner maintenance. | Rotate signing keys and add new manifest versions; later move attestation to hardware/KMS. |
| D-013 | `TECHNICAL-DECIDED`: The task's fixed Writer performs its sole automatic repair. QA may write only when assigned as that task's Writer from the start or in a newly contracted successor task; a writer transfer inside the task is forbidden, and that QA identity cannot review its own revision. | Clear independence with a controlled repair path and one writer identity per task. | Changing the repair actor requires closing or blocking the current task and opening a separately scoped task. | Add separate human QA identities later without changing the fixed-writer or self-review denials. |
| D-014 | `CONDITIONAL`: Use CVSS v4 as a scoring aid plus Builder impact overrides. Boundary escape, cross-project access, reusable credential disclosure, audit forgery, or production-path creation is always critical. Unclassified blocks; only Security may reclassify with evidence. | Consistent scoring while preserving platform-specific catastrophic cases. | CVSS needs expertise and does not capture every business impact. | Version the severity policy and remap open findings through a reviewed migration. |
| D-015 | `CONDITIONAL`: Legal verifies `PASS_WITH_REQUIREMENTS`. Qualified human counsel evidence is separately encrypted; counsel closes only `CounselCase`, then Legal issues a successor assessment. `COUNSEL_REQUIRED` holds production and the affected external or legal action; an unrelated technically isolated `DEVELOPMENT_ONLY` task may continue within its documented milestone scope. | Preserves confidentiality and prevents an agent from acting as counsel while allowing isolated development that does not perform the held action. | Manual cost and delay; exact counsel qualification/evidence process remains Legal-gated. | Integrate a future counsel workflow/provider behind the same case and successor-assessment model. |
| D-016 | `TECHNICAL-DECIDED`: Adopt the state-machine taxonomy: controlled internal use, approved external processing, publication/release, production, and unknown. Private GitHub push is external processing; public repo, shared preview, package, customer handoff, or release is publication; production and unknown are denied. | Makes every outbound action classifiable and fail closed. | Some future workflows need a Legal classification before use. | Add versioned action classes; unknown remains denied. |
| D-017 | `TECHNICAL-DECIDED`: After one failed automatic repair the workflow creates a structured blocker. The owner may abandon the task, create a new scoped task/baseline, or import a manual remediation as a new revision. The old counter is never reset and all applicable obligations rerun. | Prevents disguised additional automatic repairs while preserving recovery choices. | Manual recovery takes longer and can require replanning. | Add approved manual-remediation sources later; history remains immutable. |
| D-018 | `TECHNICAL-DECIDED`: Use PostgreSQL 18 for domain state, outbox, inbox, idempotency, leases, and the MVP job queue with ordered `FOR UPDATE SKIP LOCKED` claims. Do not add Redis/RabbitMQ in V1. Store large encrypted objects in a local content-addressed store. | One transactional system is the simplest reliable MVP and avoids queue/database split-brain. | Database handles both state and queue load; Windows operation needs care. | Keep `JobQueuePort` and object-store ports; migrate jobs to a broker and objects to S3 without changing domain transitions. |
| D-019 | `OWNER-DECIDED, CONDITIONAL`: Primary data stays on the local Windows machine with application-level envelope encryption. Daily encrypted restic snapshots go to an S3-compatible EU-region provider, expire after 30 days, and target RPO 24 hours/RTO 8 hours. The random repository key has an online DPAPI wrap and a disaster-recovery wrap to the non-exportable PIV encryption key of the independent hardware token; recovery requires token, PIN, physical presence, fresh owner bootstrap, and audited rewrapping. Signed hash-chained checkpoints are emitted every 15 minutes and before/after high-risk transitions, receive an RFC-3161 timestamp, and enter a dedicated versioned S3 bucket under 12-month Compliance-mode Object Lock. The runtime has append-only object-create permission; restore/read and retention-administration identities are offline and separate. Only minimized metadata enters the anchor and erasable identity mapping stays separate. | Removes dependence on the lost Windows installation, supplies trusted time and a separately controlled immutable audit anchor, and satisfies the selected local RPO/RTO design. | Requires a PIV-capable FIDO2 token, external timestamp and storage providers, careful PIN/token custody, additional identities, and provider/DPA/transfer gates. | `BackupPort`, `AuditAnchorPort`, `TimestampPort`, and key-wrap metadata are versioned; later migrate to TPM/HSM/KMS by rewrapping repository keys and dual-writing checkpoints during a verified transition. |
| D-020 | `OWNER-DECIDED`: Require local WebAuthn authentication over the loopback-only Builder origin. Enrol Windows Hello as the primary platform passkey and one independent FIDO2 hardware key before any high-risk gate can be enabled. Sessions expire after 15 minutes idle and 8 hours absolute. Initial approval, gate/provider/GitHub changes, export, deletion, recovery, emergency re-enable, and credential changes require a successful WebAuthn assertion no more than five minutes old. Recovery requires the second authenticator; there are no passwords, recovery questions, emailed links, or stored recovery codes. | Satisfies phishing-resistant owner authentication without a remote identity provider and closes the direct `SEC-B-005` conflict. | Requires purchase and safe storage of a hardware key; loss of both authenticators requires a documented local break-glass rebuild and cannot preserve an authenticated session. | Add another WebAuthn authenticator or a reviewed enterprise IdP later; stable owner, session, and audit identities remain unchanged. |
| D-021 | `TECHNICAL-DECIDED`: MVP targets: one active project writer, up to four read-only review jobs, UI/API p95 under 2 seconds when idle/local, job dispatch under 5 seconds, cooperative cancel p95 10 seconds, forced cancel p95 60 seconds, 30-minute agent attempt, 5 GiB project, 100 MiB artifact, 50 MiB retained log per run, RPO 24 hours, RTO 8 hours. | Concrete bounds make tests, budgets, and local capacity planning possible. | May be too small for large projects and depends on host hardware. | Version quota/SLO profiles and raise them after measured capacity tests. |
| D-022 | `CONDITIONAL`: Use a trusted Windows service with DPAPI-protected online master-key wraps and a local ACL-restricted named-pipe `SecretBrokerPort`. Per-project data keys, the backup repository key, and signing keys use explicit versioned wrap records; the backup key additionally has the D-019 PIV disaster-recovery wrap. Workloads receive only short project/attempt/audience capabilities, explicit environment allowlists, and immediate revocation. No production secret class exists. | Uses the local OS trust boundary for normal operation without making device loss destroy backup recovery and keeps secrets out of DB plaintext, files, agent prompts, VM images, and logs. | Host compromise can reach the online broker; PIV recovery and wrap rotation require careful testing and token custody. | Move the port to TPM-backed keys, Vault, or cloud KMS and rewrap data keys without rewriting encrypted content. |
| D-023 | `TECHNICAL-DECIDED`: Permit only the official npm registry through the egress proxy for the V1 stack. Require pnpm lockfile and integrity, disable lifecycle scripts by default, generate CycloneDX JSON SBOM, allow MIT/Apache-2.0/BSD/ISC by default, send copyleft/unknown licenses to Legal, block critical vulnerabilities and require Security disposition for high findings. | Narrow, testable supply-chain policy for one stack. | Some packages need lifecycle scripts; license and vulnerability false positives create work. | Add signed registry mirrors, package exceptions, formats, and policy versions through `SupplyChainPolicy`. |
| D-024 | `TECHNICAL-DECIDED`: V1 offers no hosted preview or deployment. It may create a local or owner-selected encrypted export bundle containing an accepted digest, checksums, provenance, SBOM, and variable names without values. | Safest interpretation of private internal use and the production prohibition. | No convenient preview or live handoff. | Add a non-production adapter only after a new Security/Legal gate; production remains out of V1. |
| D-025 | `TECHNICAL-DECIDED`: Use a durable in-app inbox plus Windows toast notifications. No email/Slack in V1. Approval never occurs by timeout. Security/Legal holds, provider expiry, stuck cancellation, and repair-limit stops remain visible until acknowledged. | Local, simple, and avoids another processor. | Notifications are unavailable when the PC is off and have no remote escalation. | Add versioned notification adapters and delivery receipts later. |
| D-026 | `CONDITIONAL`: Use the disclaimer and mandatory counsel triggers in `legal-review-de.md`; automated Legal output is never legal advice. Exact public wording and counsel identity require qualified Legal approval before external release. | Preserves conservative scope without inventing legal authority. | External release cannot proceed until wording and counsel process are approved. | Version disclaimer/source sets and replace the counsel adapter without changing Legal statuses. |
| D-027 | `TECHNICAL-DECIDED`: Cancellation quarantines partial output for 24 hours, then deletes it if no incident hold exists. Project deletion uses a 7-day local soft-delete, then crypto-erases local content; backups expire within 30 days; minimized audit evidence remains 12 months. GitHub repositories are archived or deleted only by a separate fresh owner action. | Gives short recovery windows while honoring the selected retention baseline and avoiding accidental external deletion. | Data persists temporarily after delete; crypto-erasure and provider expiry need tests. | Change versioned retention policies prospectively; migrate old records only with Legal approval. |
| D-028 | `OWNER-DECIDED`: Builder V1 is a private internal tool used only by the owner in Germany/EU. It is not sold, offered to customers, used by employees, or used for B2C. Regulated or out-of-scope project ideas still trigger counsel. | Minimizes actors, contracts, and Legal scope for V1. | No collaboration, customer access, or commercial service. | A commercial/multi-user version requires a new product baseline, threat model, Legal review, and architecture milestone. |
| D-029 | `OWNER-DECIDED, CONDITIONAL`: Project code may reach OpenAI/Codex only after a product-specific provider gate verifies contract/DPA, subprocessors, transfers, retention and feature behavior. Use EU processing and ZDR/MAM where the selected Codex path supports them, disable training/feedback opt-in, and send only minimized synthetic project context. | Enables the core Codex feature with the strongest available controls. | EU/ZDR availability may exclude SDK features; provider terms and behavior can change. | Swap provider/product through `AgentProviderPort`; expiry immediately disables dispatch. |
| D-030 | `TECHNICAL-DECIDED`: German is the primary UI language; stable internal IDs and schemas remain English. Target WCAG 2.2 AA, latest two stable Edge and Chrome versions, desktop width 1280px and responsive usability down to 768px. No native mobile app. | Fits the owner and local Windows use while retaining accessible web design. | Firefox/Safari and full mobile workflows are not release targets. | Add localization catalogs, browsers, and viewports as versioned support profiles. |
| D-031 | `TECHNICAL-DECIDED`: Run trusted quality checks after implementation and writer handoff. If the revision remains eligible, run QA, Reviewer, Security, and Legal in parallel on the same read-only digest. Any in-scope source, manifest, policy, or material evidence change invalidates affected results. Reviews do not reopen passed unchanged areas; new out-of-scope findings become successor tasks. | Preserves independence and freshness while bounding repair scope. | Parallel reviews consume resources and may produce separately tracked findings needing reconciliation. | Add staged review policies later; digest binding and no self-review remain invariant. |
| D-032 | `TECHNICAL-DECIDED`: Planning `BLOCK`, `COUNSEL_REQUIRED`, critical/unclassified Security, or unresolved evidence prevents the approval or action whose scope it affects. `COUNSEL_REQUIRED` always blocks production and the affected external or legal action; Security `BLOCK` blocks a development milestone when it concerns that milestone's scope or binding gate. Only scoped `DEVELOPMENT_ONLY` implementation, read-only analysis, counsel work, or narrowly authorized remediation may continue, and all later release gates remain fail closed. | Preserves binding holds without treating unrelated isolated development as production or publication. | Scope classification must be explicit and audited. | Add versioned scoped-remediation policies only after Security/Legal approval; no owner waiver for binding holds. |

## 8. Remaining Gate Order

1. Continue only local Agent Registry and Fake-Pipeline work through separately contracted `DEVELOPMENT_ONLY` tasks after `WORKER_FAKE_RUNTIME_MVP` passes; this documentation review implements no code.
2. Complete `REAL_RUNTIME_HARDENING` before any real Runtime/Codex activation or agent-driven GitHub change. Its deferred items remain unresolved and fail closed.
3. Provider-specific OpenAI, GitHub, backup, timestamp, and Object-Lock evidence is required before those separate external-processing gates can become `YES`; a failed or missing check leaves that capability disabled.
4. Hardware, VM, SDK, restore, authorization, authentication, and hostile-child conformance tests remain milestone acceptance evidence and fail closed without reopening the selected architecture unless an adapter proves infeasible.
5. GitHub, automatic execution, external publication, Release Candidate, and production remain disabled until all of their own explicit technical, Security, Legal, provider, and owner gates pass.

## 9. Architecture Approval Checklist

- [x] Owner recorded `Architecture approved: YES` and `Implementation enabled: YES`; `WORKER_FAKE_RUNTIME_MVP` is the sole active local development milestone.
- [x] All D-001..D-032 have a documented MVP treatment, reason, disadvantage, and migration path.
- [x] D-020 specifies phishing-resistant WebAuthn, two authenticators, short sessions, CSRF controls, and fresh high-risk reauthentication.
- [x] QEMU/WHPX, DPAPI/PIV recovery, exact audit-anchor, and exact project-authorization designs are documented; their conformance tests remain milestone gates.
- [x] OpenAI, GitHub, backup, timestamp, and Object-Lock adapters fail closed until product-specific Legal/Security evidence is effective; evidence completion is an activation gate, not an architecture choice.
- [x] Security successor verdict is `ACCEPTED_WITH_IMPLEMENTATION_GATES`.
- [x] Legal successor verdict is `PASS_WITH_REQUIREMENTS`; M-000 is accepted and later evidence gates are assigned.
- [x] The eight documents pass cross-reference and terminology checks.
- [x] `PROJECT_STATE.md` records `WORKER_FAKE_RUNTIME_MVP`; GitHub and automatic execution remain `NO`, production remains `DISABLED`.
- [x] This review changes documentation only and does not implement application code.
