# REAL-WORKER-PROCESS-IDENTITY-01

## Unveraenderlicher Arbeitsvertrag

- Task: `REAL-WORKER-PROCESS-IDENTITY-01`
- Meilenstein: `REAL_RUNTIME_HARDENING`
- Branch: `feature/real-worker-process-identity`
- Basis-HEAD: `d70a3e2776983e939ea5995cddc1f3f9ad6e93aa`
- Startzeit: `2026-07-18T14:33:26.565+02:00`
- Deadline: `2026-07-18T18:33:26.565+02:00`
- Maximales Zeitbudget: `240 Minuten`
- Freigabestufe: `DEVELOPMENT_ONLY`
- Einzige Anwendungscode-Writer-Identitaet: `REAL-WORKER-PROCESS-IDENTITY-01-EXECUTOR`
- Post-Review-Reparaturbudget: `1/1 verbraucht`
- Zulaessige Abschlussstatus: `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`, `SCOPE_EXPANSION_REQUIRED`
- Exakter Erfolgsstatus: `REAL WORKER PROCESS IDENTITY BESTANDEN  DEVELOPMENT ONLY`

Dieser Vertrag wurde nach Abschluss der vollstaendigen Read-only-Scope-Closure und vor der ersten Anwendungscode-Aenderung eingefroren. Normale Implementierungs-, Test- und Debug-Iterationen vor dem ersten finalen Review-Snapshot gehoeren zur Erstimplementierung und verbrauchen keinen Post-Review-Reparaturdurchlauf. Nach einem gruenen Gate-Lauf wird der erste finale Implementierungs-Snapshot fixiert und die Writer-Identitaet beendet. Danach ist hoechstens ein Reparaturdurchlauf durch dieselbe Writer-Identitaet zulaessig.

## Voraussetzungen und Schutzgrenzen

- Der Branch wurde exakt als `feature/real-worker-process-identity` verifiziert.
- `COMPLETION-ID-HARDENING-02 - PASSED - DEVELOPMENT ONLY` ist in `PROJECT_STATE.md` und der Completion-Hardening-Dokumentation bestaetigt.
- `Architecture approved: YES` und `Implementation enabled: YES` sind dokumentiert.
- Die vorbestehende unversionierte Datei `d` wird nicht gelesen, veraendert, verschoben, geloescht oder gestaged.
- Keine Commits, Pushes, Pull Requests, Merges oder Deployments.
- Keine Netzwerkzugriffe, echten Codex-Prozesse, Modellturns, echten Kundendaten oder Produktionszugriffe.
- Keine Secrets, Nonces, Proof-Secrets, Auth-Inhalte, Prompts, Umgebungswerte, Kommandozeilen oder Zugangsdaten werden persistiert oder ausgegeben.
- Keine Dependency-, `package.json`-, `package-lock.json`- oder Codex-CLI-Pin-Aenderung.
- Production deployment bleibt `DISABLED`; die Freigabe bleibt ausschliesslich `DEVELOPMENT_ONLY`.

## Scope und Akzeptanzvertrag

Der Task implementiert ausschliesslich echte lokale Worker-Prozessinstanz-Identitaet und die Bindung eines tatsaechlich gestarteten harmlosen Runtime-Child-Prozesses an eine separate kollisionsresistente Launch-Identity. Ein logischer Worker-Name bleibt reine Bezeichnung. Jeder Worker-Neustart und jeder Child-Start erzeugt eine neue Identitaet; PID-Reuse darf keine Identitaet wiederverwenden. `FakeAgentRuntime` darf weder Worker- noch Process-Identity erzeugen, liefern oder bestaetigen.

Verbindlich sind AC1 bis AC12 aus der Owner-Autorisierung: strikte Typen und Validierung, einmalige CSPRNG-Boot-Identitaet, atomare unveraenderliche Registrierung, vollstaendige Claim-/Job-/Run-/Assignment-/Lease-/Fence-/Version-/Launch-Bindung, erneute autoritative Pruefung in allen Mutationspfaden, Restart/Reclaim-Fail-Closed-Verhalten, echte lokale Multiprocess-Evidenz, atomarer Rollback, ChildProcess-gebundenes Launch-Receipt, datensparsames Audit, keine FakeRuntime-Identitaet und vollstaendige Regression.

Ausgeschlossen bleiben `REAL-RUNTIME-TERMINATION-EVIDENCE-01`, `WORKLOAD_NOT_CREATED`-Evidence, Prozessbaum-Kill, jede Beendigungsbehauptung, externe Runtime-Statusabfrage, finale verteilte Reconciliation, Provider-Credential-/Mount-Revocation, echter Codex-Smoke oder Modellturn, GitHub-Schreibzugriffe, automatische Projektausfuehrung, `RELEASE_CANDIDATE`, Production und Closeout.

## Phase A: vollstaendige Read-only-Scope-Closure

Phase A wurde durch den Root-Orchestrator sowie getrennte read-only Architect-, Security- und Test-/Callsite-Inventuren ausgefuehrt. Vor Abschluss dieser Inventur wurde kein Anwendungscode geschrieben.

### Ist-Architektur und Sicherheitsluecke

- `apps/worker/src/index.ts` ist der Node-Worker-Startpunkt. Agent-Worker-Testmodi uebergeben derzeit nur einen frei waehlbaren logischen Worker-String.
- `BackgroundWorker`/`worker-loop.ts` erzeugt Claims aus logischem `workerId` und Claim-String. Es existiert keine Prozessinstanz-Identitaet.
- `AgentJobGuard` und `lockOwned` binden derzeit nur Job, logischen Worker, Claim und Fence. Start, LoadClaim, Heartbeat, Progress, Retry, Completion, Cancellation und Recovery besitzen keinen echten Prozessnachweis.
- Completion Identity v2 bindet Projekt, Job, Task, Attempt, Run, Rolle, logischen Worker, Claim, Fence, Lease Generation, Job Version und Assignment, aber keine Worker-Prozessinstanz oder Process-Launch-Identity.
- Codex-Runtime-Guard und persistentes Codex-Ledger binden den bisherigen Claim-Tupel, aber keine echte Worker-/Child-Prozessidentitaet.
- `CodexChildProcess` und `CodexProcessLauncher.start` geben weder einen PID-gebundenen Launch-Nachweis noch eine sichere Launch-Identity zurueck. `SpawnedCodexChild` kapselt den realen ChildProcess derzeit ohne Receipt.
- Migration 009 besitzt nullable freie Textfelder `workload_id`/`process_identity`; diese sind kein striktes Identitaetsmodell. Migration 016 schuetzt Codex-Job-/Run-Bindings, enthaelt aber keine Worker-Instance-/Launch-Bindung.

### Produktions- und direkte Caller-Inventur

Worker-Start, Loop und Verarbeitung:

- `apps/worker/src/index.ts`: Prozessstart, Konfiguration, Repository-/Runtime-Erzeugung, lokale Agent-Worker-/Crash-/Cancel-/Outbox-Harnesses.
- `apps/worker/src/worker-loop.ts`: `claimNext`, `loadClaim`, `heartbeat`, Processor-Aufruf.
- `apps/worker/src/job-processor.ts`: `authorizeRuntimeStart`, `loadClaim`, Progress/Retry/Complete/Fail sowie saemtliche Cancellation-, Cancel-Confirmation- und Recovery-Mutationen.
- `apps/worker/src/postgres-runtime-store.ts`: Runtime-Snapshot und Progress unter dem Job-Guard.
- `apps/worker/src/codex-runtime-context.ts`: Assignment-/Workspace-/Codex-Guard-Aufloesung.
- `apps/worker/src/runtime-factory.ts`: Fake-/Codex-Runtime-Erzeugung.
- `apps/worker/src/codex-runtime.real-smoke.ts`: statischer direkter Caller fuer Repository, Runtime, Provider und Launcher; der reale Smoke wird in diesem Task nicht ausgefuehrt.

Datenbank und Bindings:

- `packages/database/src/agent-job-repository.ts`: Claim, LoadClaim, Heartbeat, Start, Progress, Retry, Completion, Failure, Cancellation, Cancel-Failure, Reconciliation, Evidence-Verifikation, `CANCEL_STUCK`, Cancel-Confirmation und Runtime-Snapshot.
- `packages/database/src/completion-identity.ts`: kanonische Completion-/Cancel-Completion-Bindung und -Validierung.
- `packages/database/src/codex-runtime-repository.ts`: Codex-Job-Bindung, Startreservierung, Completion/Failure und persistentes Run-Ledger.
- `packages/database/src/index.ts`: oeffentliche Exporte.
- `packages/database/src/migrations.ts`: fortlaufende additive Migrationserkennung; vorhandene Migrationen reichen lueckenlos von 001 bis 017.

Agent Runtime und Launcher:

- `packages/agent-runtime/src/codex-provider.ts`: `CodexProcessSpec`, `CodexChildProcess`, `CodexProcessLauncher`, `SpawnedCodexChild`, `NodeCodexProcessLauncher`, Provider-Start/Warten/Cleanup.
- `packages/agent-runtime/src/codex-runtime.ts`: Codex-Guard, Context, Persistenzvertrag, Start-/Complete-/Fail-Koordination.
- `packages/agent-runtime/src/runtime.ts`: allgemeiner Runtime-Vertrag; nur bei zwingendem Identity-Binding-Bedarf.
- `packages/agent-runtime/src/fake-runtime.ts`: bleibt Ergebnislogik, niemals Identitaetsquelle oder -bestaetiger.
- `packages/agent-runtime/src/index.ts`: oeffentliche Exporte.

Direkte Test- und Harness-Caller:

- Worker: `job-processor.test.ts`, `runtime-factory.test.ts`, `codex-runtime-context.test.ts`, `config.test.ts`, `health.test.ts` und der statisch zu kompilierende `codex-runtime.real-smoke.ts`.
- Agent Runtime: `codex-provider.test.ts`, `codex-runtime.test.ts`, `runtime.test.ts`, `termination-evidence.test.ts` als unveraenderte Regression sowie neue Identity-/Receipt-Tests.
- Database: `completion-identity.test.ts`, `schema.test.ts`, `database.integration.test.ts`, `codex-runtime-repository.integration.test.ts`, `agent-assignment.integration.test.ts`, `implementation-orchestrator-repository.integration.test.ts`, `planning-orchestrator-repository.integration.test.ts`, `project-workspace-repository.integration.test.ts` und neue dedizierte Identity-/Multiprocess-Integration.
- Root-/Workspace-Skripte wurden inventarisiert; sie werden nur ausgefuehrt und nicht veraendert.

### Migrationen und Exporte

- Die einzige neue Migration ist exakt `packages/database/migrations/018_real_worker_process_identity.sql`.
- Bestehende Migrationen 001 bis 017 bleiben unveraendert.
- Neue Worker-/Process-Identity-/Receipt-Typen werden ueber `packages/agent-runtime/src/index.ts` exportiert.
- Neue Datenbanktypen/-repositories werden ueber `packages/database/src/index.ts` exportiert.
- Registrierung, Claim-Bindung und Launch-Bindung werden atomar und unveraenderlich mit Foreign Keys, Unique-/Check-Constraints und fail-closed Triggern geschuetzt.

## Eingefrorener erlaubter Dateiscope

Die folgenden Komponenten sind nach der Phase-A-Inventur fuer erforderliche Aenderungen freigegeben. Diese Liste ist absichtlich vollstaendig fuer alle direkten Caller und Regressionen und darf nach dem Einfrieren nicht erweitert werden:

- `apps/worker/src/**`, beschraenkt auf Worker-Boot-/Prozessidentitaet, Worker-Konfiguration/Loop, Claim-/Heartbeat-/Processor-/Runtime-Store-/Codex-Binding, lokale harmlose Multiprocess-Harnesses und zugehoerige Tests.
- `packages/database/src/**`, beschraenkt auf Worker-/Launch-Registrierung, Agent-Job-/Codex-/Completion-Bindings, Exporte, Schema- und direkte Caller-/Integrations-/Rollback-/Multiprocess-Tests.
- `packages/database/migrations/018_real_worker_process_identity.sql` als einzige neue additive Migration.
- `packages/agent-runtime/src/**`, ausschliesslich Worker-/Prozessidentitaets-Typen, Launcher-Receipt, Bindings, Exporte und zugehoerige Tests.
- `docs/architecture/real-worker-process-identity-01.md`.
- `PROJECT_STATE.md`.
- `docs/architecture/implementation-roadmap.md` ausschliesslich fuer den aktuellen Task-Status; Reihenfolge und Gates bleiben unveraendert.

Voraussichtlich zwingende Produktionsdateien sind `apps/worker/src/index.ts`, `worker-loop.ts`, `job-processor.ts`, `postgres-runtime-store.ts`, `codex-runtime-context.ts`, `runtime-factory.ts`, `codex-runtime.real-smoke.ts`, neue Worker-Identity-/Harness-Dateien, `packages/database/src/agent-job-repository.ts`, `codex-runtime-repository.ts`, `completion-identity.ts`, `index.ts`, neue Identity-Repository-/Typdateien, `packages/agent-runtime/src/codex-provider.ts`, `codex-runtime.ts`, `index.ts` und neue strikte Identity-/Receipt-Typdateien. Die oben genannten direkten Testcaller sind ebenfalls bereits eingeschlossen.

## Verbindliches Ziel-Design

1. Der echte Node-Worker erzeugt beim Boot exakt einmal eine CSPRNG-basierte, strikt typisierte Worker-Instance-Identity und unabhaengiges processlokales Ownership-Material. Nur eine ausdrueckliche Test-Schnittstelle darf deterministische Werte injizieren.
2. Persistiert werden nur opaque sichere IDs, Digests, Policy-/Runtime-Versionen und notwendige Zeitangaben. Rohes Ownership-Material bleibt processlokal und wird weder geloggt noch persistiert.
3. Die Datenbank registriert jede Worker-Prozessinstanz atomar und immutable. Ein Neustart mit gleichem logischem Namen ist eine neue Instanz.
4. Der Claim bindet atomar logische Worker-Bezeichnung, Worker-Instanz, Claim, Job/Run, Assignment, Lease Generation, Fence, Job Version und die jeweils relevante Process-Launch-Bindung.
5. Alle Agent-Job- und Codex-Mutationen pruefen die vollstaendige autoritative Bindung vor der ersten Mutation; missing, stale, swapped oder malformed wird fail-closed abgelehnt.
6. Der echte Launcher erzeugt pro tatsaechlichem Child-Start eine separate CSPRNG-Launch-Identity. Das Receipt wird aus dem realen ChildProcess-Start/PID-Ergebnis sowie dem vollstaendigen Parent-/Projekt-/Job-/Task-/Attempt-/Run-/Assignment-/Claim-/Generation-/Fence-/Version-Kontext domain- und versionsgetrennt abgeleitet. PID ist nie die Identitaet und muss nicht als Hostdetail persistiert werden.
7. Ein gebundenes Launch-Receipt wird atomar in den Job-/Run-/Codex-Kontext uebernommen. Ab diesem Zeitpunkt scheitern fehlende oder alte Process-Launch-Identitaeten. Unklare Child-Beendigung erzeugt weder Todesbehauptung noch Termination Evidence.
8. `FakeAgentRuntime` bleibt ausserhalb der Identitaets-Trust-Boundary.

## Verbindliche Test- und Gate-Matrix

- Unit: strikte opaque Typen, Exact-Key-Validierung, malformed/missing/PID-only/arbitrary/reused Identity, Boot-once, explizite deterministische Test-Factory, Receipt-Domain/Version/Binding, FakeRuntime-Negativnachweis.
- PostgreSQL: immutable Registrierung, atomare Claim-/Launch-Bindung, jede Mutations-Guard-Kombination, Restart/Reclaim, Direct-SQL-/Trigger-Negativtests, auditierte datensparsame Metadaten.
- Multiprocess: mindestens zwei tatsaechlich getrennte harmlose lokale Node-Prozesse, parallele Boots, gleiche logische Bezeichnung nach Restart, stale old-process rejection, Claim-/Process-Identity-Swap, fehlende/manipulierte Receipts, PID-Reuse-Simulation, Crash/Reclaim, konkurrierende Heartbeats und exakt 30/30 deterministische Race-Runden ohne Retry. Kein echter Codex-Prozess oder Modellturn.
- Rollback: Vorher-/Nachher-Snapshots von Job, Run, Result, Assignment, Inbox, Outbox, Audit, Evidence sowie den neuen Worker-/Launch-Tabellen muessen bei jeder Abweichung identisch bleiben.
- Regression: Completion-ID-Hardening, Cancellation/Pre-start-Races, Lease/Fencing, Codex-Home-Isolation, Agent Registry, Assignment, Orchestratoren und Workspace-Isolation.
- Pflichtumgebung: `AGENT_RUNTIME=fake`, `CODEX_REAL_SMOKE_TEST=0`, gesetzte `TEST_DATABASE_URL`, keine parallelen Datenbank-Reset-Suiten.
- Pflichtgates: gezielte Identity-Units; echte harmlose Multiprocess-Tests; Worker-, Agent-Runtime- und Database-Tests; serielle PostgreSQL-Integration und serielle Root-Suite jeweils mit 0 Skips; Typecheck/Lint/Build fuer Worker, Agent Runtime, Database und Root; `git diff --check`.

## Abschluss- und Review-Regel

Erst nach vollstaendig gruenen Gates werden Dateimanifest und SHA-256-Implementierungs-Snapshot fixiert und der Writer beendet. QA, Reviewer, Security und Legal pruefen read-only denselben Snapshot. Ein echter In-Scope-Blocker erlaubt maximal einen Reparaturdurchlauf durch `REAL-WORKER-PROCESS-IDENTITY-01-EXECUTOR`; danach werden alle Gates und alle vier Reviews einmal auf einem neuen Snapshot wiederholt. Eine weitere Schleife ist verboten.

## Laufender Status

- Vertragsstatus: `FROZEN`
- Continuity nach unerwarteter Conversation-Unterbrechung: `WIEDERHERGESTELLT`; kein neuer Task, kein neuer Vertrag, kein neuer Writer und kein Reparaturverbrauch durch die Unterbrechung.
- Implementierung: `COMPLETED` durch die einzige Writer-Identitaet `REAL-WORKER-PROCESS-IDENTITY-01-EXECUTOR`.
- Erster finaler 29-Dateien-Implementierungs-Snapshot: `89f251aae72fdf3c82a310be0ed969095d87486d48e07c75c5ad3d4c8ad3ef16`.
- Erste Reviews: QA `BLOCK`, Reviewer `BLOCK`, Security `BLOCK`, Legal `PASS_WITH_REQUIREMENTS` ohne weiteren Scope-Blocker.
- Gemeinsames erstes Finding: Der produktive `BackgroundWorker` leitete die Claim-ID nur aus logischem Worker-Namen und einem bei jedem Prozessstart erneut bei eins beginnenden Ordinal ab. Der Restart/Reclaim mit gleichem logischem Namen konnte deshalb keine neue Claim-ID erzeugen.
- Post-Review-Reparatur: `1/1 verbraucht`, durch denselben Writer und ausschliesslich in sechs bereits im ersten Snapshot enthaltenen Dateien.
- Finaler 29-Dateien-Implementierungs-Snapshot: `d950c3f73a7ccd1e4a595410892ecbc19215d23ffe3581f532623d7ddc81e80f`.
- Writer-Zugriff: `ENDED`; nach Fixierung des finalen Snapshots erfolgten keine Anwendungscode-Aenderungen.
- Finale Reviews auf demselben Snapshot: QA `PASS`, Reviewer `PASS`, Security `PASS`, Legal `PASS_WITH_REQUIREMENTS` ohne aktuellen Scope-Blocker.
- Abschlussstatus: `PASSED - DEVELOPMENT ONLY`.
- Exakter Erfolgsstatus: `REAL WORKER PROCESS IDENTITY BESTANDEN  DEVELOPMENT ONLY`.

## Implementiertes Worker- und Process-Identity-Design

- `WorkerProcessBootIdentity.create()` erzeugt pro echtem Node-Worker-Boot genau einmal eine CSPRNG-basierte `wpi_<64hex>`-Instanz-ID und ein unabhaengiges prozesslokales Ownership-Proof. Die Identitaet ist eingefroren und innerhalb des Boots unveraenderlich. Deterministische Werte sind nur ueber die ausdrueckliche Test-Schnittstelle zulaessig.
- Persistiert werden Worker-Instance-ID, proof-gebundener Ownership-Digest, Policy-/Runtime-Versionen und notwendige Zeitpunkte. Ownership-Proof, rohe Nonces, PID, Environment, argv, Prompts, Auth-Inhalte und Benutzerpfade werden weder persistiert noch geloggt.
- Produktive Claim-IDs sind strikt validierte `wcl_<64hex>`-Werte. Sie werden domain-separiert aus der CSPRNG-basierten Worker-Process-Instance-ID und einem positiven, monotonen Safe-Integer-Ordinal abgeleitet. Derselbe logische Worker-Name erzeugt nach einem Restart deshalb eine andere erste Claim-ID.
- Jeder tatsaechlich gestartete Runtime-Child erhaelt eine separate CSPRNG-basierte `pli_<64hex>`-Launch-ID und ein unabhaengiges prozesslokales Launch-Proof. Das Receipt entsteht erst nach erfolgreichem realem `ChildProcess`-/PID-Start und bindet den Parent-Worker sowie den vollstaendigen Projekt-/Job-/Run-/Claim-Kontext.
- Der PID-Digest ist an das unabhaengige Launch-Proof gebunden; PID-Reuse kann weder Worker- noch Launch-Identity wiederverwenden. Die rohe PID bleibt prozesslokal.
- `FakeAgentRuntime` liefert oder bestaetigt keine Worker-/Process-Identity. Sie bleibt ausschliesslich deterministische Ergebnislogik fuer bestehende Tests.
- Unklare Child-Beendigung wird nicht als tot oder terminiert bewertet. Es entsteht weder `WORKLOAD_NOT_CREATED`- noch Termination Evidence.

## Migration und Datenbank-Constraints

- Einzige neue additive Migration: `packages/database/migrations/018_real_worker_process_identity.sql`; bestehende Migrationen 001 bis 017 blieben unveraendert.
- `builder.worker_process_instances` registriert jede Worker-Prozessinstanz append-only und unveraenderlich mit logischem Worker-Namen, sicherer Instance-ID, Ownership-Digest, Policy-/Runtime-Version und notwendigen Zeitpunkten.
- `builder.runtime_process_launch_receipts` registriert Launch-Receipts append-only mit opaque Launch-ID und sicheren Binding-/Receipt-/PID-Digests. Proofs, rohe PID, argv, Environment, Prompts und Auth-Inhalte werden nicht gespeichert.
- Neue Foreign Keys, Unique-/Check-Constraints, RLS-Regeln und Guard-Trigger binden Jobs, Runtime-Runs und Codex-Ledger an existierende Worker-/Launch-Registrierungen und verhindern unvollstaendige, vertauschte, geloeschte oder direkt manipulierte Identity-Tupel.
- Identity-Wechsel beim Reclaim verlangt Lease-Ablauf, neue Claim-ID, neue Lease Generation und neues Fence. Der alte Launch wird atomar geloest; Receipt-Zeilen bleiben append-only. Es wird keine Beendigung behauptet.

## Claim-, Lease-, Fence- und Completion-Bindings

- Jeder Claim bindet logisch bezeichneten Worker, Worker-Prozessinstanz und Ownership-Digest, Claim-ID, Job, Run, Assignment, Lease Generation, Fencing Token, Job Version und die relevante Process-Launch-ID.
- `claimNext`, `loadClaim`, Heartbeat, Runtime-Start, Progress, Retry, Completion, Failure, Cancellation, Cancel-Failure, Cancel-Confirmation und alle Recovery-Mutationen validieren die vollstaendige autoritative Bindung erneut, bevor eine Mutation erfolgt.
- Completion Identity v3 bindet die opaque Worker-Instance-ID, Ownership-Digest und Process-Launch-ID an das bestehende Projekt-/Job-/Task-/Attempt-/Run-/Assignment-/Claim-/Generation-/Fence-/Version-Tupel. Das Ownership-Proof bleibt ausschliesslich in einer prozesslokalen `WeakMap` und wird nicht serialisiert.
- Der Codex-Launcher validiert die erwartete Bindung vor `spawn`, erzeugt das Receipt erst aus dem tatsaechlichen Child-Start und bindet es atomar in Job, Runtime-Run und Codex-Ledger, bevor Provider-Eingabe gesendet werden darf.
- Jede Identity-, Receipt-, Claim-, Generation-, Fence- oder Versionsabweichung wird fail-closed vor Mutation abgelehnt; die Integrationstests bestaetigen den atomaren Rollback fuer Job, Run, Result, Assignment, Inbox, Outbox, Audit und Evidence.

## Multiprocess- und Race-Evidenz

- Der finale Harness startet mindestens zwei tatsaechlich getrennte harmlose lokale Node-Prozesse. Jeder Child bootet seine eigene CSPRNG-Identitaet, registriert sie selbst und claimt intern ueber den produktiven `BackgroundWorker`; Claim-IDs werden nicht mehr vom Parent injiziert.
- Nachgewiesen sind parallele Starts, eindeutige Worker-Instanzen, PID-Reuse-Simulation, stale old-process rejection, Claim-Swap, Process-Identity-Swap, fehlende Identitaet, manipulierte/malformed Receipt-Daten, konkurrierende Heartbeats sowie atomare Rollbacks.
- Nach dem simulierten Crash startet derselbe logische Worker als neuer Node-Prozess. Dieser Restart-Child reclaimt den Job selbst und weist eine neue Worker-Instance-ID, Claim-ID, Lease Generation und ein neues Fence nach; der alte Prozess bleibt gefenced.
- Exakt `30/30` deterministische Claim-/Reclaim-/Heartbeat-Race-Runden liefen ohne Retry. Insgesamt waren `62/62` durch den produktiven Generator erzeugte Claim-IDs eindeutig; `31` Jobs hatten `0` Retries.
- Es wurde kein echter Codex-Prozess und kein Modellturn gestartet.

## Finale Test- und Gate-Evidenz

Alle finalen Laeufe verwendeten `AGENT_RUNTIME=fake`, `CODEX_REAL_SMOKE_TEST=0`, eine gesetzte lokale `TEST_DATABASE_URL`, keine parallelen Datenbank-Reset-Suiten und fuer die seriellen Suiten `retry=0`.

- Gezielte Identity-/BackgroundWorker-Tests: `24/24`, 2 Dateien, `0` Skips.
- Gezielter echter Multiprocess-/PostgreSQL-Test: `1/1`; `76` Tests nur durch den Namensfilter ausgeschlossen, keine Laufzeit-Skips; intern `30/30` Races, `62/62` eindeutige Claim-IDs und `0` Retries.
- Agent Runtime: 7 Dateien, `90/90`, `0` Skips.
- Worker: 5 Dateien, `46/46`, `0` Skips.
- Database/PostgreSQL seriell: 11 Dateien, `179/179`, `0` Skips, `retry=0`.
- Root seriell: 36 Dateien, `441/441`, `0` Skips, `retry=0`.
- Agent Runtime, Worker und Database: Typecheck `PASS`, Lint `PASS`, Build `PASS`.
- Root: Typecheck `PASS`, Lint `PASS`, Build `PASS`.
- `git diff --check`: `PASS`; ausschliesslich nicht-fehlschlagende CRLF-Hinweise. Der bestehende ESLint-Hinweis zur fehlenden Pages-Directory blieb nicht-fehlschlagend.

## Finales Dateimanifest und SHA-256-Snapshot

Kanonisches Verfahren: ordinal nach Repository-Pfad sortierte Zeilen `<lowercase-file-sha256>  <repo-path><LF>`, anschliessend SHA-256 ueber die UTF-8-Bytes dieser 29 Zeilen. Der Hash wurde durch Root sowie vor und nach jedem finalen Read-only-Review identisch reproduziert.

- `919cd12183eb08b5f31bff8243bb8822b5338e03ef291151b19b14f2be0db644  apps/worker/src/codex-runtime-context.test.ts`
- `8c6c484e55f6b4c7cf2185f480aaf25283cb0430e3a081d5e8207f0c9719a032  apps/worker/src/codex-runtime-context.ts`
- `4d12ed502905aa34fb3057260c65e7187cb69bcd6bb403b3eea80449863c4881  apps/worker/src/codex-runtime.real-smoke.ts`
- `dc9e01e876ac30cc292a93f39c981cd20dcc22b06bdd6044082f439a5766bc3e  apps/worker/src/index.ts`
- `dd520c6ae8c20502735434f3a19f9a6edadc4fd1f643b7be6a7c5043baada55d  apps/worker/src/job-processor.test.ts`
- `2d36a6b2a5a2f11b9833bfa1e3689afbd06a8900e494a24884d1a4258dc83f10  apps/worker/src/job-processor.ts`
- `06c81c2c909ed1041ec432c412a1f9eaa49191ad94e2e62f05ef1437614ea537  apps/worker/src/postgres-runtime-store.ts`
- `f4b5e0dd91d5bbe00e90651cd2cd6d5d9b70e7ac0b962e1263f699f6b5075ac0  apps/worker/src/runtime-factory.test.ts`
- `27bb83b28a547eac46f83faab65632d3e842798c65cbe87b9f29c28d7539429f  apps/worker/src/worker-loop.ts`
- `ee9943c0f557c40d39e32ed965c443f6fd6f6a954b4fa6766604b29a171e41d5  apps/worker/src/worker-process-identity-test-child.ts`
- `7513b6c75f6dd8a54a196201a0f0dd2e3caac0bb7b9e5fc795696346732b5a14  packages/agent-runtime/src/codex-provider.test.ts`
- `aa82db8e3ce19df536f5c9bc2bf2d6f4bb83950debd3158fa39327884c16a2df  packages/agent-runtime/src/codex-provider.ts`
- `b68f5eb4d11309a1157c625cff924f7dcda7cdbaa5470d4a715f7a60c37a7c3c  packages/agent-runtime/src/codex-runtime.test.ts`
- `32c76ba51cfce5eefdf9488a2ecf6eca18e9007c75f2ac1364d2628bbdd87a50  packages/agent-runtime/src/codex-runtime.ts`
- `17f3c41ac4600b49f77de63a7f40613a36d3d26890044ac4f775dcfcf183c7a4  packages/agent-runtime/src/index.ts`
- `3e35fa734026ba77dff5080534457b8299c2b1c70cc0273acc5dd17491c7105a  packages/agent-runtime/src/process-identity.test.ts`
- `20ea158b8509da263cdbcc52114a50e8ff186b363f1359b68c0693c2703e499d  packages/agent-runtime/src/process-identity.ts`
- `9b7f2933b62b0db417f7dd48cf0dd95096a3896b901a6eeba62afb96f9f46ed0  packages/database/migrations/018_real_worker_process_identity.sql`
- `42c9e1edc9a48876bd1330e07d6ffa4c770ee8acd2a3ef16ed118f2b1c48506a  packages/database/src/agent-assignment.integration.test.ts`
- `54015def301bac3433b18289cb366d50f8461f935e96ebc96147def6183a075a  packages/database/src/agent-job-repository.ts`
- `a4f3dcb0707377235d3bbe7522c08f5c5671d376c2ed93bbeac7bebcd8041b1b  packages/database/src/agent-job-test-fixture.ts`
- `ad36a388774d87f5f42a96bcc6c49df83e5f6a61b5234235d2e2a140fdcfd520  packages/database/src/codex-runtime-repository.integration.test.ts`
- `2090d8396be5b769fb5556658bf54f30f7cf626ff5f455e61693f9e17f499d35  packages/database/src/codex-runtime-repository.ts`
- `8cf82b884b4505da44b8fcdec1131286abaa2f388971c8df8db26363c2b253e0  packages/database/src/completion-identity.test.ts`
- `919890e4b0a74b00e8e37d946f922c83e831b749b43883d2faebf384d51ded07  packages/database/src/completion-identity.ts`
- `6196e9d1d001589b905cac201fba34ab603b27c105ed3541ef229f66dca2e2f5  packages/database/src/database.integration.test.ts`
- `a3c569a9db67c834c7f006be46230bc8a5b92d6ba317dda042fb6c728ff7a879  packages/database/src/implementation-orchestrator-repository.integration.test.ts`
- `5da0b17c38b0f993bfe96736ac5e655784bb93a1ed7781cad725777c38c7f599  packages/database/src/planning-orchestrator-repository.integration.test.ts`
- `04ff36ac5324c701e29d03e8aa18100d5787042666c17d88e033fc3b2fdc6b19  packages/database/src/project-workspace-repository.integration.test.ts`

Finaler kanonischer Implementierungs-Snapshot: `d950c3f73a7ccd1e4a595410892ecbc19215d23ffe3581f532623d7ddc81e80f`.

Administrative Root-Closeout-Dateien liegen ausserhalb dieses bereits geprueften Anwendungscode-Snapshots: `docs/architecture/real-worker-process-identity-01.md`, `PROJECT_STATE.md` und die ausschliessliche aktuelle Task-Status-Aktualisierung in `docs/architecture/implementation-roadmap.md`.

## Finale Review-Voten

- QA: `PASS`; AC1 bis AC12 bestanden, `QA-AC6-01` geschlossen, Snapshot vor/nach Review identisch.
- Reviewer: `PASS`; kein verbleibender In-Scope-Blocker, Snapshot nach allen Reviews identisch reproduziert.
- Security: `PASS`; AC1 bis AC12 bestanden, `SECURITY-AC6-01` geschlossen, keine neuen Security-/Privacy-/Audit-/Receipt-/Termination-/FakeRuntime-Findings.
- Legal DE/EU: `PASS_WITH_REQUIREMENTS`; kein aktueller Scope-Blocker. Datenschutz-/Provider-/Release-Anforderungen sind ausdruecklich spaeteren Gates zugeordnet.

## Verbleibende spaetere Gates

- Naechster separat zu autorisierender Task: `REAL-RUNTIME-TERMINATION-EVIDENCE-01`.
- Danach bleiben `REAL-RUNTIME-RECONCILIATION-01`, `PROVIDER-CREDENTIAL-REVOCATION-01` und `REAL-RUNTIME-HARDENING-CLOSEOUT-01` in unveraenderter Reihenfolge fail-closed.
- `WORKLOAD_NOT_CREATED`-Evidence, Prozessbaum-Beendigung, autoritative Termination Evidence und externe Runtime-Statusabfrage sind nicht Bestandteil dieses Tasks.
- Provider-/DPA-/Subprocessor-/Transfer-/Regions-/Retention-/ZDR-/Training-Evidenz, Datenschutzpflichten, Credential-/Mount-Revocation sowie alle GitHub-, Release-, Legal-, Security- und Owner-Gates bleiben spaeter separat bindend.
- Real Runtime Hardening insgesamt ist `NOT PASSED / FAIL CLOSED`. GitHub-Integration und automatische Projektausfuehrung bleiben `NO`; `RELEASE_CANDIDATE` und Production sind nicht freigegeben; Production deployment bleibt `DISABLED`.
