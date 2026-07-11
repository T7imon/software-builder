# Builder Platform V1 Threat Model

Review date: 2026-07-11

Security status: `ACCEPTED_WITH_IMPLEMENTATION_GATES`

This is a design review, not a certification or implementation test result. The owner has approved the architecture and the `FOUNDATION` milestone. GitHub, automatic execution, publication, and production remain disabled. Each later capability stays fail closed until its listed implementation and activation evidence passes; any unresolved critical finding blocks publication.

## 1. Executive Verdict

The modular control plane, explicit relational state machines, outbox/inbox, immutable revision binding, one-task workflows, fenced writer lease, and adapter-only provider access are sound foundations.

The initial architecture had seven blocking gaps. The successor review accepts the selected architecture after D-020 was changed to two-authenticator WebAuthn, D-019/D-022 gained PIV disaster recovery plus a concrete trusted immutable anchor, and the database design selected mandatory PostgreSQL `FORCE ROW LEVEL SECURITY`. No unresolved architecture-critical design gap remains. This is not implementation approval: every affected capability remains disabled until its milestone conformance and provider gates pass. Unproven isolation, reusable credentials in a hostile cell, failed audit/restore integrity, project-scope bypass, untrusted quality evidence, authentication failure, or any indirect production route remains fail-closed and publication-blocking.

## 2. Scope

In scope:

- Owner browser, Web UI, API/BFF, sessions, and approvals;
- identity, workload IAM, policy gates, workflow engine, SQL, outbox/inbox, queue, and workers;
- evidence, audit checkpoints, object storage, backups, and restore;
- Workspace Manager, hostile execution cells, source, build tools, dependencies, and caches;
- Agent Runtime, Codex SDK/CLI boundary, provider sessions, and egress;
- GitHub App, tokens, repositories, webhooks, settings, Actions/OIDC, and reconciliation;
- handoff/deployment adapter and direct/indirect production boundaries;
- Legal/Privacy controls where failure creates a security or data-protection risk.

Out of scope as an assurance claim:

- implementation correctness, because no application code exists;
- complete containment of a compromised hypervisor, KMS, cloud provider, or colluding privileged infrastructure administrators;
- proof that content scanners detect every secret or item of real customer data;
- production security, because production is prohibited in V1.

## 3. Security Assumptions

1. Source, ideas, prompts, model output, generated code, repositories, packages, build scripts, tool output, webhooks, and restored artifacts are hostile.
2. Builder domain state, not a model/provider, is the only gate, counter, and acceptance authority.
3. Security, Legal, Reviewer, and QA Reviewer are source read-only.
4. QA Writer is a distinct authorization mode, shares the exclusive writer lease, and cannot self-review.
5. Unknown or stale Security, Legal, identity, provider, or evidence state fails closed.
6. No route or credential to production exists.
7. Residual infrastructure/provider compromise risk is accepted only after explicit owner review; it never permits a false security claim.

## 4. Assets

| ID | Asset |
|---|---|
| A-01 | Owner identity, passkeys, recovery, sessions, approvals, and capability changes |
| A-02 | Ideas, planning artifacts, source, workspace, revisions, and private repository state |
| A-03 | Workflow state, gates, holds, repair counter, writer lease, and fence tokens |
| A-04 | Quality, review, Security, Legal, provenance, and counsel evidence |
| A-05 | GitHub App key/tokens, Codex capabilities/sessions, KMS keys, and broker policies |
| A-06 | Audit events, signed checkpoints, policy/configuration versions, and provider receipts |
| A-07 | Host, supervisor, control-plane, queue, database, and object-store integrity |
| A-08 | Cross-project isolation across every storage and execution path |
| A-09 | Synthetic-only and no-secret assurance |
| A-10 | Availability, model/provider budget, storage, and queue capacity |
| A-11 | Publication classification and permanent production boundary |

## 5. Adversaries

| ID | Adversary |
|---|---|
| ADV-01 | Unauthenticated Internet attacker |
| ADV-02 | Attacker with stolen owner session, authenticator, or recovery path |
| ADV-03 | Malicious idea author, repository, package, dependency, or maintainer |
| ADV-04 | Prompt-injected, misaligned, or compromised model/agent |
| ADV-05 | Compromised execution cell, worker, adapter, or workload identity |
| ADV-06 | Malicious or mistaken operator/infrastructure administrator |
| ADV-07 | Forged, replayed, reordered, or poisoned queue job/webhook |
| ADV-08 | Compromised or drifting external provider |
| ADV-09 | Resource/cost exhaustion attacker |

## 6. Trust Boundaries

| ID | Boundary |
|---|---|
| TB-SEC-01 | Browser to Owner UI/API |
| TB-SEC-02 | API to identity/session/policy |
| TB-SEC-03 | Control plane to SQL/evidence storage |
| TB-SEC-04 | Outbox/queue to typed workers |
| TB-SEC-05 | Workers to Workspace Manager |
| TB-SEC-06 | Trusted supervisor to hostile execution cell |
| TB-SEC-07 | Cell to destination-aware egress proxy/external network |
| TB-SEC-08 | Adapters to Secret Broker/KMS |
| TB-SEC-09 | Codex broker/adapter to OpenAI |
| TB-SEC-10 | GitHub adapter to GitHub |
| TB-SEC-11 | Handoff adapter to approved non-production/export target |
| TB-SEC-12 | Project A to project B across DB, FS, cache, log, credentials, jobs, and backups |
| TB-SEC-13 | Live stores to backup/restore plane |
| TB-SEC-14 | Mutable attempt to sealed evidence and CAS promotion |
| TB-SEC-15 | Writer snapshot to immutable read-only reviewers |

## 7. Principal Data Flows

1. Idea -> transient pre-persistence scan -> accepted minimized planning content.
2. Planner -> Architect -> parallel Security/Legal -> reconciled initial-approval evidence.
3. Authenticated command -> transaction/outbox -> authenticated ID-only queue -> worker authoritative reload.
4. Approved workspace -> fenced attempt -> sealed revision -> eight obligations -> CAS promotion.
5. Signed task manifest -> hostile cell -> narrow Codex capability -> bounded result.
6. Accepted digest -> brokered GitHub operation -> signed webhook/read-back -> reconciliation.
7. Evidence staging -> scan/redact/classify -> immutable object -> SQL reference -> signed audit checkpoint.
8. Metadata/provenance -> approved non-production/export handoff.
9. Encrypted backup -> quarantined restore -> integrity, deletion, gate, credential, and provider reconciliation.

## 8. Binding Security Requirements and Successor Status

| ID | Binding requirement | Successor architecture status | Remaining fail-closed evidence gate |
|---|---|---|---|
| SEC-B-001 | Select a microVM or independently justified equivalent hostile-code boundary. Forbid shared escape-sensitive resources, host/runtime sockets/devices, writable shared caches, metadata/control-plane routes, ambient host paths, and unbounded resources. | ACCEPTED: QEMU/WHPX full-VM adapter and prohibited resources are explicit. | M-004/M-006 hostile-guest, teardown, quota, patch and escape tests. |
| SEC-B-002 | Keep reusable OpenAI/Codex auth and sessions in a trusted broker outside the cell. Give the cell only short project/attempt/audience-bound authority or narrow RPC. | ACCEPTED: broker/capability boundary is explicit. | M-006 pinned-SDK and hostile-child credential conformance. |
| SEC-B-003 | Treat public repo, preview, package, release, export, CI/CD, Pages, webhook delivery, and OIDC as publication/production paths. | ACCEPTED: dedicated private organization and denied production/publication features are explicit. | M-005/M-008 provider baseline, permissions and drift tests. |
| SEC-B-004 | Protect evidence/audit with immutable versioning, dedicated append-only writer, ordered signed checkpoints in a separately controlled anchor, rollback/gap detection, trusted time, and restore verification. | ACCEPTED: 15-minute/high-risk checkpoints, signatures, RFC-3161 time, 12-month Compliance-mode Object Lock, separated identities, DPAPI/PIV recovery and quarantine are explicit. | M-001 provider evidence, wrap/rotation, timestamp, rollback, Object Lock and restore drills. |
| SEC-B-005 | Require phishing-resistant passkeys, two authenticators or controlled offline recovery, short secure sessions, CSRF defense, fresh high-risk reauth, and distinct workload identities. | ACCEPTED: Windows Hello plus independent FIDO2/PIV token, session bounds, CSRF and five-minute fresh auth are explicit. | M-001 bootstrap, loss/replacement, session, origin, CSRF and reauth tests. |
| SEC-B-006 | Enforce project context at API/domain/SQL/object/workspace/queue/log/backup layers. | ACCEPTED: `FORCE RLS`, `NOBYPASSRLS` runtime roles, separate owner/migration roles, narrow queue claim and project capabilities are explicit. | M-001 negative project-swap/context tests across every layer and restore. |
| SEC-B-007 | Use a Trusted Quality Supervisor and signed structured four-command manifest. Cell/model text cannot attest PASS; promotion is exact-digest CAS. | ACCEPTED: trust and attestation boundary is explicit. | M-007 manifest, signer, runner, digest-freshness and tamper tests. |

## 9. Threat Register

Ratings are pre-control likelihood/impact and overall severity. Residual risk assumes every listed control and validation passes.

| ID | STRIDE | Threat | Pre-control | Key controls | Required validation | Residual |
|---|---|---|---|---|---|---|
| TM-001 | S/E | Owner spoofing, session theft, or recovery takeover | H / Critical / CRITICAL | SEC-B-005; passkeys; session rotation/revocation; fresh signed confirmation; rate limits | Phishing, fixation, replay, CSRF, recovery, stolen-session tests | MEDIUM |
| TM-002 | T/E/I | Stored XSS or CSRF through idea, Markdown, model output, SVG, or preview | H / High / CRITICAL | Context escaping; sanitized Markdown; raw active content off; CSP/Trusted Types; isolated preview origin; CSRF | Markdown/SVG/data URL/DOM XSS and cross-site mutation suite | LOW |
| TM-003 | T/E/I | Direct or indirect prompt injection drives data theft or unauthorized tools | H / Critical / CRITICAL | Model has no authority; signed narrow manifest; RO context; deny-default tools/egress; external gates | Injection in idea, code, comments, README, commit, package errors, encoded text | MEDIUM |
| TM-004 | T/E/D | Malicious repository, dependency, lifecycle/build script, or archive | H / Critical / CRITICAL | SEC-B-001; quarantine; lock/digest; allowlisted registries; no shared cache; SBOM/scans | Postinstall exfiltration, fork/log/archive bombs, path/link/device/mount attacks | MEDIUM |
| TM-005 | I/E | Codex/CLI credential, environment, auth-file, session-socket, or thread leakage | H / Critical / CRITICAL | SEC-B-002; minimal env; per-attempt home; no reusable cell secret; crash-dump off; redaction | Inspect env/argv/proc/home/keyring/socket/children/errors/cancellation | LOW-MEDIUM |
| TM-006 | E/T/I | Sandbox escape or host/control-plane compromise | M / Critical / CRITICAL | SEC-B-001; patched/attested microVM-equivalent; no privileged devices/routes; destroy cells | Current escape suite, capabilities, namespace, mount, socket, host-write canaries | MEDIUM |
| TM-007 | I/T/E | Cross-project data, job, cache, credential, log, evidence, or restore access | M / Critical / CRITICAL | SEC-B-006; opaque IDs; project capabilities; scoped rows/objects/keys; no shared dedupe/cache | ID swaps, forged jobs, paths/links, logs, objects, backups, key swaps | LOW |
| TM-008 | S/T/R/E | Queue forgery, replay, reorder, duplicate, or poison message | M / High / HIGH | Workload mTLS/IAM and ACL; envelope integrity/TTL/schema; inbox dedupe; expected version; DLQ | Tamper, forged producer, replay, reorder, duplicate, crash, poison tests | LOW |
| TM-009 | T/E | Stale writer or fence bypass corrupts/publishes wrong revision | M / Critical / CRITICAL | Unique lease; monotonic fence on mount/write/seal/promote; old-cell death proof; CAS | Partition, pause, clock skew, crash/reclaim, two claimants | LOW-MEDIUM |
| TM-010 | T/R | Stale, replayed, cell-fabricated, or restored-old evidence passes a gate | H / Critical / CRITICAL | SEC-B-004/007; trusted identity attestation; full digest/policy/toolchain binding | One-byte change; fake stdout/JSON/exit; stale policy/review; restore rollback | LOW |
| TM-011 | T/R | Repair-counter bypass creates a fourth attempt | M / High / HIGH | Serializable lock; DB `0..3`; unique ordinal; immutable audit; infra retry same attempt | Concurrent duplicates, crash around commit, restore, manual/new-scope paths | LOW |
| TM-012 | S/T/I/E | GitHub App, token, repository, or webhook abuse | M / Critical / CRITICAL | App not PAT; KMS key; minimum short token; numeric binding; HMAC webhook; drift checks | Stolen/expired token, cross-repo, replay/tamper webhook, timeout reconciliation | MEDIUM |
| TM-013 | I | Secret or real-customer-data leakage through intake, prompt, files, evidence, Git, logs, or provider | H / Critical / CRITICAL | Text-only bounded intake; layered DLP/secret scan; quarantine; synthetic fixtures; opaque refs; incident hold | Seeded dummy secret/PII split, encoded, archive, history, exception paths | MEDIUM |
| TM-014 | S/I/E | SSRF, unrestricted egress, redirects, or DNS rebinding | H / High / CRITICAL | Deny default; destination proxy; address/redirect revalidation; reject internal/metadata; TLS/size/time limits | Decimal/octal/IPv6/punycode, redirects, rebinding, metadata tests | LOW-MEDIUM |
| TM-015 | T/E | Compromised SDK, image, toolchain, registry, or dependency supply chain | M / Critical / CRITICAL | Immutable pins/lockfiles; signature/provenance; trusted mirrors; SBOM; update gate | Substituted image/package, typosquat, unsigned provenance, mirror compromise | MEDIUM |
| TM-016 | T/R | Audit/evidence deletion, rewrite, reordering, clock change, or rollback | M / Critical / CRITICAL | SEC-B-004; separated identities; signed external anchor; legal hold | Privileged edit/delete/reorder, clock rollback, checkpoint outage, snapshot rollback | LOW-MEDIUM |
| TM-017 | I/T | Backup leakage, corrupt restore, cross-project resurrection, or old credential restore | M / High / HIGH | Separate backup identity/keys; immutable versions; manifests; quarantine restore; tombstones | Project-isolated/PIT restore, corruption, old secrets/data, deletion propagation | MEDIUM |
| TM-018 | D | API, queue, model, cell, storage, log, or cost exhaustion | H / High / HIGH | Admission/rate limits; quotas/budgets; backpressure; bounded retry; circuit breaker; cancellation | Slowloris, fork/log/queue/archive bomb, provider outage/rate-limit tests | MEDIUM |
| TM-019 | T/E | Gate bypass or confused deputy through stale command, direct SQL, worker, adapter, or reconcile | M / Critical / CRITICAL | Single policy authority; command identity/version; constraints; port IAM; recheck at every phase | Every illegal state edge, stale policy, revoke between phases, direct-port denial | LOW |
| TM-020 | E/T/R | Reviewer writes, QA self-approval, or stale RO capability | M / High / HIGH | Digest-bound RO grants; QA writer mode/lease; identity conflict check; new revision on write | Complete role/action matrix; QA write then approve; RO mount mutation | LOW |
| TM-021 | T/E/D | Archive/evidence/parser attack, unsafe rendering, or Unicode/path collision | H / High / HIGH | Streaming bounded parser; canonical root; reject parent/link/device/FIFO/sparse; safe rendering | zip/tar bomb, traversal, Unicode collision, device node, oversized media | LOW-MEDIUM |
| TM-022 | S/T/R | Provider callback confusion, duplicate side effect, or unknown result inferred successful | M / High / HIGH | PREPARED operation; audience/project identity; timeout->UNKNOWN; signed callback; read-back | Dropped, delayed, duplicate, mismatched, partial-success provider responses | LOW |
| TM-023 | E/T/I | Secret Broker/KMS or privileged control-worker compromise | L / Critical / CRITICAL | Separate identities; project/operation/audience/TTL policy; no list/export; cells cannot route; rotation | Confused deputy, stolen worker, wrong project/audience, cancel revocation | MEDIUM |
| TM-024 | E/T/I | Direct or indirect production/publication bypass via repo workflow, OIDC, Pages, export, or target disguise | M / Critical / CRITICAL | SEC-B-003; central publication gate; reject production/unknown at schema/IAM/network; drift hold | Malicious workflow, OIDC assumption, visibility, release/package/Pages, disguised target | LOW after D-016 |
| TM-025 | T/E | Scan-to-promotion TOCTOU changes content after review | M / Critical / CRITICAL | Seal first; scan exact digest; signed decision; CAS promotion; adapter pushes immutable object | Mutation during scan/push; stale base/fence/digest | LOW |
| TM-026 | E/T/I | Compromised control service moves laterally across monolith capabilities | M / Critical / CRITICAL | Separate process/workload/IAM/network/DB grants; API no shell/credential mint; cell no control route | Stolen API/worker identity; east-west unauthorized port/grant attempts | MEDIUM |

## 10. Required Controls Before Relevant Milestones

| ID | Control |
|---|---|
| SEC-R-001 | Authenticated, replay-safe queue/inbox plus bounded poison-message quarantine/DLQ. |
| SEC-R-002 | Stack, dependency, registry, image, and toolchain allowlist with lock, SBOM, signature/provenance, and vulnerability policy. |
| SEC-R-003 | Fail-closed customer-data/secret screening and incident/revocation process. |
| SEC-R-004 | Destination-aware egress proxy and SSRF/DNS-rebinding test suite. |
| SEC-R-005 | Numeric CPU/memory/PID/disk/time/output/token/cost/API/queue limits and cancellation objectives. |
| SEC-R-006 | Encrypted, immutable, project-aware backup/restore/deletion policy and drills. |
| SEC-R-007 | Security severity rubric, `UNCLASSIFIED` blocking, critical remediation rules, and no owner waiver. |
| SEC-R-008 | Safe artifact rendering and isolated preview origin. |
| SEC-R-009 | GitHub token, webhook, repository-baseline, and settings-drift controls. |
| SEC-R-010 | Process-tree kill, credential/mount revoke, and `CANCEL_STUCK` hold. |
| SEC-R-011 | Dependency patching, vulnerability disclosure, and remediation process. |
| SEC-R-012 | Metadata-only observability allowlist, retention, and access audit. |
| SEC-R-013 | Incident-wide emergency disable tested at command, claim, dispatch, and reconciliation. |

## 11. Milestone Security Gates

| Milestone | Security gate |
|---|---|
| M-000 | All `SEC-B` requirements are normative; D-009/D-019/D-020/D-022 and indirect-production decisions are closed; successor Security review accepts the architecture. |
| M-001 | Owner/workload identity, project authorization, gate constraints, signed audit anchor, rollback/restore, and emergency-disable tests pass. |
| M-002 | Intake screening, XSS/CSRF/safe-rendering, bounded parser, and prohibited-data tests pass. |
| M-003 | Severity rubric, unclassified/critical holds, later-stop precedence, and no-waiver tests pass. |
| M-004 | MicroVM-equivalent isolation, cross-project, escape, egress/SSRF, quotas, path/archive/cache, cleanup, and restore tests pass. |
| M-005 | GitHub App/token/webhook/idempotency/baseline/drift and indirect-production tests pass. |
| M-006 | Pinned Codex hostile-child credential/session/environment, prompt-injection, tool/egress, budget, and cancellation conformance passes. |
| M-007 | Trusted runner, digest freshness, role independence, repair chaos, and remediation closure tests pass. |
| M-008 | Full adversarial suite and restore/red-team exercise pass; all critical findings are verified closed; no production route exists. |

## 12. Successor Decision

Security reviewed the selected D-001..D-032 baseline and the final corrections to D-019, D-020, D-022, database authorization, and audit integrity. All seven binding architecture requirements now have a concrete V1 design. Hardware availability, exact provider contracts, pinned SDK behavior, hostile-guest tests, restore drills, and negative authorization tests are implementation or activation evidence gates. Missing or failed evidence keeps only the affected capability disabled and does not silently authorize a fallback.

Verdict: `ACCEPTED_WITH_IMPLEMENTATION_GATES`. This permits a separate owner decision on architecture approval. It does not permit implementation, GitHub, automatic execution, external processing, export, publication, or production.

## 13. Residual Risks

- A zero-day in the hypervisor/kernel, provider, KMS, or trusted supervisor can defeat isolation.
- The sole owner remains a high-value single point of compromise despite passkeys and recovery controls.
- Prompt injection cannot be eliminated; safety relies on capability denial and external gates.
- DLP/secret/license scanners cannot prove absence of all prohibited data or infringement.
- A short-lived GitHub/Codex capability can be abused during its valid window if the broker or authorized worker is compromised.
- Colluding privileged infrastructure administrators can challenge audit assurance; independent anchors reduce but do not eliminate this risk.
- Denial-of-service and provider cost risk remains after quotas.
- Provider behavior, SDK semantics, package ecosystems, and repository settings can change after review; monitoring and expiry holds are required.

No residual risk permits publication with an unresolved critical finding.

## 14. Recommendations

- Prefer microVMs over same-kernel containers for generated code.
- Use a dedicated GitHub account/organization with no production integration.
- Use hardware-backed passkeys and independent offline recovery.
- Anchor signed audit checkpoints in an independently administered immutable service.
- Adopt signed SBOM/provenance and a continuous hostile-cell/prompt-injection suite.
- Use synthetic canary test values, never real secrets or customer data, to validate leakage controls.
- Enforce hard per-task provider spend limits and anomaly alerts.

## 15. Authoritative Security References

- [NIST SP 800-190, Application Container Security Guide](https://csrc.nist.gov/pubs/sp/800/190/final) describes container-specific risks and mitigation needs; it supports treating ordinary containers/directories as insufficient without a justified security profile.
- [NIST SP 800-218, Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final) provides secure-development practices relevant to provenance, dependency control, testing, and vulnerability response.
- [OWASP Prompt Injection](https://owasp.org/www-community/attacks/PromptInjection) identifies prompt injection as capable of changing model intent and causing leakage or unintended action; Builder therefore grants the model no gate authority.
- [OpenAI Codex SDK](https://developers.openai.com/codex/sdk) and the official [TypeScript SDK source](https://github.com/openai/codex/tree/main/sdk/typescript) define the integration surface. They do not replace the external execution boundary or Builder gate logic.
- [GitHub App installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation) documents repository/permission-limited installation tokens and their expiration behavior.
- [GitHub webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) requires signature validation and recommends secure secret storage and constant-time comparison.

## 16. Completion Statement

The successor Security review is complete for the proposed planning architecture. Its verdict is `ACCEPTED_WITH_IMPLEMENTATION_GATES`. No architecture-critical Security decision remains open; every later test/provider requirement fails closed and must be evidenced at its named milestone before the related capability can be enabled.
