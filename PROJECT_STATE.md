Current milestone: CODEX_RUNTIME_ADAPTER_MVP
Architecture approved: YES
Implementation enabled: YES
GitHub integration enabled: NO
Automatic project execution: NO
Production deployment: DISABLED
Release level: DEVELOPMENT_ONLY
Milestone status: BLOCKED - DEVELOPMENT ONLY
Codex Runtime Adapter: CODEX-EXEC-RUNTIME-ADAPTER-MVP-02 - BLOCKED - DEVELOPMENT ONLY
Codex Runtime Adapter predecessor: CODEX-RUNTIME-ADAPTER-MVP-01 remains historical BLOCKED; its SDK inheritance finding was accepted and the SDK-only restriction was superseded by the explicit MVP-02 owner decision
Codex Runtime Adapter authorization: explicit owner-scoped codex exec read-only PLANNER exception in a verified synthetic persistent workspace; no write role, GitHub, automatic project execution, release candidate, deployment or production
Codex Runtime Adapter implementation: pinned local @openai/codex 0.144.4; verified package bin via process.execPath/spawn shell=false; dedicated BUILDER_CODEX_HOME; ignore-user-config and ignore-rules; ephemeral JSONL; read-only sandbox; approval never; web and inherited integration surfaces disabled; strict structured output; persistent exactly-once and RECOVERY_REQUIRED ledger
Codex Runtime Adapter evidence: targeted Runtime 29/29, Provider/JSONL 9/9, final Worker 42/42, Workspace 13/13, Registry/Assignment 9/9, Orchestrators 9/9, serial PostgreSQL 152/152 without skips, final serial Root 389/389, Lint, Typecheck, Build and git diff --check passed
Codex Runtime Adapter blocker: the single opt-in smoke harness invocation failed before Codex process start with INVALID_CLAIM because codex-runtime.real-smoke.ts uses leaseMs 300000 while AgentJobRepository permits at most 120000; real Codex processes/turns executed: 0; no retry performed
Codex Runtime Adapter repair budget: 1/1 consumed for running external-runtime cancellation abort ordering; re-review passed; another automatic code repair or smoke retry is forbidden and requires a new owner task contract
Codex Runtime Adapter reviews: QA BLOCKED; Reviewer BLOCK; Security static implementation PASS but DEVELOPMENT_ONLY BLOCK due missing real smoke evidence; Legal NOT_APPLICABLE
Codex Runtime Adapter deferred gates: system Managed Policy or equivalent provider isolation, enforced MCP boundary, process-tree termination, real attestation/status, multiprocess reconciliation, Completion-ID hardening, real worker/process identity, credential revocation, provider/release/legal/owner gates remain fail-closed; Production deployment DISABLED
Cancellation contract: CANCELLATION-CONTRACT-DECISION-01 - APPROVED - DEVELOPMENT ONLY (target architecture; local FakeRuntime pre-start cancellation implemented; no Real-Runtime authorization)
Cancellation contract normative SHA-256: 58e44fe0a3638d25bdf34dc5aff8551872796486c343904923cb4f41150a4b9f
Worker Fake Runtime MVP scope reset: WORKER-FAKE-RUNTIME-MVP-SCOPE-RESET-01 - PASSED_WITH_DEFERRED_HARDENING - DEVELOPMENT ONLY
Fake Runtime pre-start cancellation: FAKE-RUNTIME-PRESTART-CANCELLATION-01 - PASSED - DEVELOPMENT ONLY
Real Runtime Hardening: REQUIRED - DEFERRED_TO_LATER_GATE - FAIL CLOSED
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
Project Workspace deferred gates: real Codex adapter, REAL_RUNTIME_HARDENING, hostile-local-process atomic no-follow/ACL or fenced mount isolation, pinned Git toolchain provenance, GitHub, release candidate, deployment and production remain fail-closed
Project Workspace exact status: PROJECT WORKSPACE MVP BESTANDEN  DEVELOPMENT ONLY
