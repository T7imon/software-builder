Current milestone: REAL_RUNTIME_HARDENING
Architecture approved: YES
Implementation enabled: YES
GitHub integration enabled: NO
Automatic project execution: NO
Production deployment: DISABLED
Release level: DEVELOPMENT_ONLY
Milestone status: READY FOR FIRST BOUNDED TASK - DEVELOPMENT ONLY
Next bounded task: COMPLETION-ID-HARDENING-01
Real Runtime Hardening task order: COMPLETION-ID-HARDENING-01 -> REAL-WORKER-PROCESS-IDENTITY-01 -> REAL-RUNTIME-TERMINATION-EVIDENCE-01 -> REAL-RUNTIME-RECONCILIATION-01 -> PROVIDER-CREDENTIAL-REVOCATION-01 -> REAL-RUNTIME-HARDENING-CLOSEOUT-01
Real Runtime Hardening gate: current milestone is not passed; all unresolved Real-Runtime gates remain fail-closed and its eventual technical closeout alone will not enable GitHub, automatic project execution, RELEASE_CANDIDATE or PRODUCTION
Prospective repair policy: for every new task, normal bounded editing and check iterations before the first final review snapshot do not consume a repair; after that snapshot is fixed and closeout reviews begin, at most one automatic repair pass is permitted
Codex Runtime Adapter: CODEX-HOME-RUN-ISOLATION-07 - PASSED - DEVELOPMENT ONLY
Codex Runtime Adapter closeout: CODEX-RUNTIME-ADAPTER-MVP-FINAL-CLOSEOUT-08 - PASSED - DEVELOPMENT ONLY
Codex Runtime Adapter predecessor: CODEX-RUNTIME-SMOKE-LEASE-FIX-03 remains historical BLOCKED; CODEX-EXEC-RUNTIME-ADAPTER-MVP-02 and CODEX-RUNTIME-ADAPTER-MVP-01 remain historical BLOCKED
Codex Runtime Adapter authorization: explicit owner-scoped codex exec read-only PLANNER exception in a verified synthetic persistent workspace; no write role, GitHub, automatic project execution, release candidate, deployment or production
Codex Runtime Adapter implementation: pinned local @openai/codex 0.132.0; verified package bin via process.execPath/spawn shell=false; stable validated BUILDER_CODEX_HOME used only as credential source; unique physical per-run TEMP root with separate HOME and CODEX_HOME; optional receipt-bound auth.json-only provisioning; ignore-user-config and ignore-rules; ephemeral JSONL; read-only sandbox; approval never; web and inherited integration surfaces disabled; strict structured output; persistent exactly-once and RECOVERY_REQUIRED ledger
Codex Runtime Adapter CLI enforcement: the application continues to enforce exactly CODEX_CLI_VERSION; active @openai/codex is 0.132.0 as a temporary DEVELOPMENT_ONLY Windows compatibility pin for the confirmed SpawnChild/CreateProcessAsUserW problem in tested newer Windows versions; migration 017 permits only 0.132.0 and 0.144.4 in the historical ledger, and 0.144.4 is not the active CLI
Codex Home Run Isolation evidence: final six-file snapshot SHA-256 a1c4b7362a43e1c130d56914e5b3ee77efa0f94dbda2e864b8e9aa6a05cf1c85; Agent Runtime 82/82 and Worker 42/42 with CODEX_REAL_SMOKE_TEST=0; Agent Runtime, Worker and Root Typecheck/Lint/Build; git diff --check; QA, Reviewer and Security PASS; Legal NOT_APPLICABLE
Codex Home Run Isolation historical repair budget under its then-authorized task contract: 3/3 consumed by the same writer identity; final task-scope findings NONE; no real Codex process, model turn, smoke, real credential read or external BUILDER_CODEX_HOME access; this historical evidence does not set the prospective repair policy
Codex Home Run Isolation exact status: CODEX HOME RUN ISOLATION BESTANDEN  DEVELOPMENT ONLY
Codex Runtime Adapter overall status: PASSED - DEVELOPMENT ONLY
Codex Runtime Adapter final real-smoke evidence: SMOKE_EXIT=0; exactly one successful read-only PLANNER Codex process and turn; structured output validated and persisted; workspace and Git state unchanged; no MCP, Web or forbidden-integration policy event
Codex Runtime Adapter final gates: PostgreSQL integration 152/152 without skips; Agent Runtime 82/82; Worker 42/42; Root tests, Lint, Typecheck, Build and git diff --check passed
Codex Runtime Adapter prior evidence: targeted Runtime 29/29, Provider/JSONL 9/9, final Worker 42/42, Workspace 13/13, Registry/Assignment 9/9, Orchestrators 9/9, serial PostgreSQL 152/152 without skips, final serial Root 389/389, Lint, Typecheck, Build and git diff --check passed for MVP-02
Codex Runtime Adapter historical smoke blocker: the CODEX-RUNTIME-SMOKE-LEASE-FIX-03 invocation failed fail-closed in beforeAll on local test-database authentication before temporary workspace, test body, CountingLauncher or Codex start; Codex processes 0, real turns 0, retries 0; its real-smoke evidence remains NOT_EVALUATED
Codex Runtime Adapter historical pre-start evidence: earlier failed harness invocations ended before any Codex process because local configuration or schema prerequisites were not met; they remain unchanged historical evidence and are not reclassified by the later successful smoke
Codex Runtime Adapter smoke budget: no smoke was authorized or executed by CODEX-HOME-RUN-ISOLATION-07; any later real smoke requires a new explicit owner task contract and must use the isolated run-home lifecycle
Codex Runtime Adapter deferred gates: system Managed Policy or equivalent provider isolation, enforced MCP boundary, process-tree termination, real attestation/status, multiprocess reconciliation, Completion-ID hardening, real worker/process identity, credential revocation, provider/release/legal/owner gates remain fail-closed; Production deployment DISABLED
Codex Runtime Adapter exact status: CODEX EXEC RUNTIME ADAPTER MVP BESTANDEN  DEVELOPMENT ONLY
Cancellation contract: CANCELLATION-CONTRACT-DECISION-01 - APPROVED - DEVELOPMENT ONLY (target architecture; local FakeRuntime pre-start cancellation implemented; no Real-Runtime authorization)
Cancellation contract normative SHA-256: 58e44fe0a3638d25bdf34dc5aff8551872796486c343904923cb4f41150a4b9f
Worker Fake Runtime MVP scope reset: WORKER-FAKE-RUNTIME-MVP-SCOPE-RESET-01 - PASSED_WITH_DEFERRED_HARDENING - DEVELOPMENT ONLY
Fake Runtime pre-start cancellation: FAKE-RUNTIME-PRESTART-CANCELLATION-01 - PASSED - DEVELOPMENT ONLY
Real Runtime Hardening: CURRENT - READY FOR FIRST BOUNDED TASK - DEVELOPMENT ONLY - NOT YET PASSED - FAIL CLOSED
Real Runtime Hardening prior scheduling status in the merged pre-reconciliation snapshot: REQUIRED - DEFERRED_TO_LATER_GATE - FAIL CLOSED; retained as history while its unresolved gates remain binding
Cancellation contract implementation: target architecture remains approved; full Real-Runtime implementation is assigned to REAL_RUNTIME_HARDENING and is not passed
Agent Registry: AGENT-REGISTRY-TUPLE-TYPECHECK-CLOSEOUT-03 - PASSED - DEVELOPMENT ONLY
Agent Registry evidence: tuple Typecheck closeout complete; Unit 7/7, PostgreSQL 12/12 without skips, serial Root suite 231/231, Database and Root Typecheck, Lint, Build, git diff --check, QA, Reviewer and Security passed; Legal NOT_APPLICABLE
Agent Assignment: AGENT-ASSIGNMENT-01 - PASSED - DEVELOPMENT ONLY
Planning Orchestrator: ORCHESTRATOR-PLANNING-MVP-01 - PASSED - DEVELOPMENT ONLY
Planning Orchestrator flow: PLANNER -> ARCHITECT -> SECURITY + LEGAL_DE_EU -> WAITING_FOR_OWNER_APPROVAL -> APPROVE/REJECT
Planning Orchestrator evidence: Unit 4/4, PostgreSQL/Capability/RLS 16/16 without skips, Registry 19/19, Assignment 14/14, Workflow Engine 82/82, Worker/Fake Runtime 54/54, serial Root suite 267/267, Lint, Typecheck, Build, git diff --check, QA, Reviewer, Security and Legal-DE/EU passed
Planning Orchestrator repair budget: 1/1 consumed; final scope findings: NONE
Planning run target: READY_FOR_IMPLEMENTATION requires immutable Owner APPROVE after successful ARCHITECT, SECURITY and LEGAL_DE_EU results; no EXECUTOR job is created
Planning data profile: synthetic DEVELOPMENT_ONLY results and minimized requirement references; LEGAL_DE_EU is not legal advice or counsel approval
Planning Orchestrator exact status: ORCHESTRATOR PLANNING MVP BESTANDEN  DEVELOPMENT ONLY
Implementation Orchestrator: ORCHESTRATOR-IMPLEMENTATION-MVP-02 - PASSED - DEVELOPMENT ONLY
Implementation Orchestrator flow: READY_FOR_IMPLEMENTATION + Owner APPROVE -> IMPLEMENTING / EXECUTOR -> IMPLEMENTATION_REVIEW / QA + REVIEWER + SECURITY + LEGAL_DE_EU -> READY_FOR_DELIVERY, CHANGES_REQUESTED oder BLOCKED
Implementation Orchestrator evidence: Unit 5/5, PostgreSQL/Capability/RLS 16/16 without skips, Planning 20/20, Registry 19/19, Assignment 14/14, Workflow Engine 87/87, Worker/Fake Runtime 54/54, serial Root suite 289/289, Lint, Typecheck, Build, git diff --check, QA, Reviewer, Security and Legal-DE/EU passed
Implementation Orchestrator repair budget: 1/1 consumed for UUID replay canonicalization; final scope findings: NONE
Implementation run target: READY_FOR_DELIVERY requires one immutable successful synthetic Executor result and four terminal reviews bound to that same result; deterministic priority is BLOCKED before CHANGES_REQUESTED before READY_FOR_DELIVERY
Implementation data profile: synthetic DEVELOPMENT_ONLY artifacts, digests and minimized requirement references; no target-project writes, Codex/OpenAI process, Git/GitHub action, customer data, counsel approval or production claim
Implementation deferred gates: REAL_RUNTIME_HARDENING, Completion-ID-Hardening, real worker/process identity, provider and credential controls, real-runtime workspace hardening, GitHub, release candidate and production remain fail-closed
Implementation Orchestrator exact status: ORCHESTRATOR IMPLEMENTATION MVP BESTANDEN  DEVELOPMENT ONLY
Project Workspace: PROJECT-WORKSPACE-MVP-01 - PASSED - DEVELOPMENT ONLY
Project Workspace structure: BUILDER_WORKSPACE_ROOT/<canonical-project-uuid>/revision-<full-sha256> with bound minimal metadata and an isolated local non-bare Git repository
Project Workspace persistence: PostgreSQL migration 015; one immutable registration per project/revision; CREATING, READY, FAILED and terminal ARCHIVED; project RLS and exact owner-approved planning revision required
Project Workspace safety: fail-closed absolute/traversal/drive/UNC/reserved-path validation, path.relative containment, realpath/lstat Symlink/Junction checks, no foreign-folder adoption, fixed execFile Git boundary without hooks, remotes or network
Project Workspace concurrency and recovery: PostgreSQL session advisory lock linearizes Create, Reconcile and Archive across managers; restart, CREATING/FAILED recovery and READY re-verification passed without duplicates or READY partial state
Project Workspace evidence: Workspace Unit 26/26, filesystem 3/3, PostgreSQL/schema 16/16 without skips, local Git 3/3, Planning 20/20, Implementation 21/21, Registry/Assignment 33/33, Worker/Fake Runtime 54/54, serial Root suite 327/327, Lint, Typecheck, Build and git diff --check passed
Project Workspace reviews: QA PASS; Reviewer PASS; Security PASS - DEVELOPMENT_ONLY; Legal NOT_APPLICABLE; final current-scope findings NONE
Project Workspace repair budget: 0/1 consumed; application freeze verified across 20 allowed files
Project Workspace historical deferred gates at its closeout: real Codex adapter, REAL_RUNTIME_HARDENING, hostile-local-process atomic no-follow/ACL or fenced mount isolation, pinned Git toolchain provenance, GitHub, release candidate, deployment and production were fail-closed
Project Workspace current successor gates: the read-only Codex Runtime Adapter MVP is now passed DEVELOPMENT_ONLY; REAL_RUNTIME_HARDENING, writing runtime activation, hostile-local-process isolation, pinned Git provenance, GitHub, release candidate, deployment and production remain fail-closed
Project Workspace exact status: PROJECT WORKSPACE MVP BESTANDEN  DEVELOPMENT ONLY
