# COMPLETION-ID-HARDENING-01

## Unveraenderlicher Arbeitsvertrag

- Task: `COMPLETION-ID-HARDENING-01`
- Meilenstein: `REAL_RUNTIME_HARDENING`
- Freigabestufe: `DEVELOPMENT_ONLY`
- Branch: `feature/completion-id-hardening`
- Tatsaechlicher Task-Start: `2026-07-18T00:01:56+02:00`
- Spaetester Abschluss im Zeitbudget: `2026-07-18T02:01:56+02:00`
- Maximalbudget: `120 Minuten`
- Einzige Anwendungscode-Writer-Identitaet: `COMPLETION-ID-HARDENING-01-EXECUTOR`
- Post-Review-Reparaturbudget: `0/1` verbraucht; nach Fixierung des ersten finalen Review-Snapshots ist hoechstens ein automatischer Reparaturdurchlauf erlaubt.
- Zulaessige Abschlussstatus: `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`, `SCOPE_EXPANSION_REQUIRED`.

Der Vertrag ist mit Anlage dieser Datei fixiert. Er darf waehrend dieses Tasks nicht erweitert werden. Insbesondere erfordern Migrationen, Dependency-Aenderungen oder notwendige Aenderungen ausserhalb der nachstehenden Dateiliste den sofortigen Status `SCOPE_EXPANSION_REQUIRED` und eine Owner-Entscheidung.

### Scope

Bearbeitet werden ausschliesslich:

1. normale Agent-Job-Completion;
2. bestaetigte terminale Cancellation-Completion;
3. deren Idempotenz-, Replay-, Binding- und Transaktionsschutz;
4. zugehoerige Unit- und PostgreSQL-Integrationstests;
5. diese Task-Dokumentation und `PROJECT_STATE.md`.

Nicht umfasst sind reale Worker-/Prozessidentitaet, eine neue Cancellation-Architektur, Runtime-Termination-Attestation, Codex-Statusabfragen, Mehrprozess-Reconciliation ausserhalb der Completion-Transaktion, Credential-/Provider-Aenderungen, echte Codex-Smokes oder Modellturns, der Codex-CLI-Pin, GitHub, automatische Projektausfuehrung, Deployment, Production-Freigabe, Migrationen und Dependencies.

### Erlaubte Dateien und Komponenten

- `apps/worker/src/job-processor.ts`
- `apps/worker/src/job-processor.test.ts`
- `apps/worker/src/postgres-runtime-store.ts`
- optional `apps/worker/src/postgres-runtime-store.test.ts`
- `packages/database/src/agent-job-repository.ts`
- `packages/database/src/database.integration.test.ts`
- `packages/database/src/index.ts`
- optional `packages/database/src/completion-identity.ts`
- optional `packages/database/src/completion-identity.test.ts`
- optional `packages/database/src/agent-job-repository.integration.test.ts`
- `docs/architecture/completion-id-hardening-01.md`
- `PROJECT_STATE.md`

### Pruefbare Akzeptanzkriterien

- `AC1`: Der Completion-ID-Pfad verwendet ausschliesslich `node:crypto` mit SHA-256; der wiederholte 32-Bit-FNV-Hash ist entfernt.
- `AC2`: Die deterministische persistierte ID ist ein lowercase UUID-v8-String mit RFC-9562-Variant-Bits; kein Zufallswert.
- `AC3`: Die eindeutig strukturierte, laengen- oder strukturgebundene Eingabe enthaelt eine feste Domain-/Versionsseparation, mindestens `software-builder/agent-job-completion/v2`.
- `AC4`: Operation/schema version, Kind, Project, Job, Task, Attempt, Run, Rolle, Worker, Claim, Fence, Lease Generation, Job Version, vorhandene Assignment-Bindung und operationsspezifischer Evidence-/Watermark-Discriminator sind gebunden; Secrets, Prompts und rohe Modelltexte bleiben ausgeschlossen.
- `AC5`: Die PostgreSQL-Repository-Grenze validiert den strukturierten Kontext gegen den autoritativen Job-/Task-/Run-/Claim-/Fence-/Lease-/Versions-/Assignment-Zustand, reproduziert die ID und prueft den semantischen Digest fail-closed.
- `AC6`: Exakte serielle und konkurrierende Replays liefern denselben terminalen Status ohne zweite Result-, Inbox-, Outbox- oder Audit-Wirkung; ID, Kontext, Digest und Result/Evidence muessen exakt uebereinstimmen.
- `AC7`: Fremde, stale, fehlende, malformed oder manipulierte IDs, Bindungen, Results und Evidence werden vor jeder Mutation abgelehnt; nur der exakt committed Claim darf idempotent replayen.
- `AC8`: Jede Ablehnung rollt die gesamte Transaktion einschliesslich Job, Run, Result, Inbox, Outbox, Audit/Evidence und Late-Result vollstaendig zurueck.
- `AC9`: Bestehende Cancellation-, Late-Result-, Lease- und Fencing-Semantik bleibt ausserhalb unmittelbar notwendiger Completion-ID-Anpassungen unveraendert; keine Migration.

### Pflichtnachweise

Die Implementierung muss die 14 im Owner-Vertrag genannten Determinismus-, UUID-v8-, Einzelbinding-, Assignment-, seriellen und konkurrierenden Replay-, Divergenz-, Cross-Job-/Cross-Run-, Stale-Claim-, Manipulations-, Evidence-, Rollback- und Regressionstests abdecken.

Vor einem finalen Snapshot muessen mit `AGENT_RUNTIME=fake` und `CODEX_REAL_SMOKE_TEST=0` Worker-Tests, PostgreSQL-Integration mit `TEST_DATABASE_URL` und null Skips, serielle Root-Tests, Worker- und Database-Typecheck/Lint/Build, Root-Typecheck/Lint/Build sowie `git diff --check` erfolgreich sein. Ein echter Codex-Smoke ist verboten.

Nach gruenen Pflichtgates werden Snapshot und Digest fixiert, der Writer wird beendet und QA, Reviewer, Security und Legal pruefen read-only und parallel exakt denselben Stand. Nach einem eventuellen einzigen Post-Review-Reparaturdurchlauf sind alle Gates und Reviews auf dem neuen Snapshot zu wiederholen.

## Phase-A-Status

`SCOPE_EXPANSION_REQUIRED - DEVELOPMENT ONLY`

Anwendungscode ist unveraendert. Die Writer-Identitaet wurde nicht aktiviert, Phase B wurde nicht begonnen und ein finaler Implementierungs-/Review-Snapshot wurde nicht fixiert.

## Phase-A-Befund

### Bestehende Grenze

- `AgentJobRepository.complete(guard, result, messageId)` und `confirmCancelled(guard, result, messageId, evidenceId)` delegieren an `finish(...)` in `packages/database/src/agent-job-repository.ts`.
- `AgentJobGuard` enthaelt nur Job, Worker, Claim und Fence; der vollstaendige Claim enthaelt zusaetzlich Projekt, Task, Assignment, Lease Generation und Job Version.
- Der aktuelle Semantic Digest bindet nur Event, Job-ID, Result und Evidence-ID.
- Der Replay-Pfad liest den Inbox-Eintrag und akzeptiert einen passenden Semantic Digest, bevor der aktuelle Claim, Fence, Lease oder die Assignment-Bindung geprueft wird.
- Der Caller-`messageId` wird direkt als Inbox- und Late-Result-Schluessel verwendet.
- Der Worker bindet in `messageId(...)` nur Job-ID und einen Kind-String. `stableHash(...)` wiederholt einen 32-Bit-FNV-Wert viermal und markiert die Ausgabe als UUID v4 statt v8.

Eine Migration ist fuer die Zielarchitektur nicht erforderlich: UUID-v8 passt in die vorhandenen UUID-Spalten; `semantic_digest` und die benoetigten autoritativen Job-/Run-/Assignment-Felder existieren bereits.

### Vollstaendige Aufruferanalyse

Die erlaubten Worker-Aufrufer liegen in `apps/worker/src/job-processor.ts`:

- normale Completion an Zeile 67;
- spaetes terminales Result waehrend Cancellation an Zeile 81;
- bestaetigte Cancellation mit Evidence an Zeile 97.

Folgende direkte `AgentJobRepository.complete(...)`-Aufrufer liegen jedoch ausserhalb der unveraenderlich erlaubten Dateien und uebergeben weiterhin `randomUUID()`:

- `apps/worker/src/codex-runtime.real-smoke.ts:264,436`;
- `packages/database/src/agent-assignment.integration.test.ts:57`;
- `packages/database/src/codex-runtime-repository.integration.test.ts:127,351,419,478`;
- `packages/database/src/implementation-orchestrator-repository.integration.test.ts:50`;
- `packages/database/src/planning-orchestrator-repository.integration.test.ts:42`;
- `packages/database/src/project-workspace-repository.integration.test.ts:157`.

Die PostgreSQL-Integrationstests werden von den vorgeschriebenen Database- und seriellen Root-Gates mit gesetzter `TEST_DATABASE_URL` tatsaechlich ausgefuehrt. Die Real-Smoke-Datei wird zwar nicht ausgefuehrt, liegt aber im Worker-Typecheck-/Build-Scope.

### Warum der Konflikt nicht innerhalb des Vertrags loesbar ist

`AC5` und `AC7` verlangen, dass eine fehlende, erfundene, malformed, fremde oder abweichende Completion-Bindung vor jeder Mutation fail-closed abgelehnt wird. Die Repository-Signatur muss deshalb einen strukturierten Kontext verlangen und dessen UUID sowie Semantic Digest unabhaengig reproduzieren. Die aufgefuehrten Legacy-Aufrufer besitzen diesen Kontext nicht und liefern eine zufaellige UUID.

Eine Legacy-Ueberladung, welche zufaellige IDs weiter akzeptiert oder ignoriert, waere ein direkter Verstoss gegen `AC5`/`AC7` und liesse die zu haertende Repository-Grenze offen. Eine strikt ablehnende Ueberladung koennte zwar den Smoke-Typecheck erhalten, liesse aber die verpflichtenden PostgreSQL-Regressionstests fehlschlagen. Damit sind sowohl die Akzeptanzkriterien als auch das Null-Skip-/Root-Gate innerhalb der erlaubten Dateiliste unvereinbar.

## Strukturierter Blocker

### Nicht erfuellbare Akzeptanzkriterien im aktuellen Scope

- `AC5`: Der strukturierte, repository-seitig reproduzierte Completion-Kontext kann nicht fuer alle verpflichtend ausgefuehrten Caller eingefuehrt werden.
- `AC7`: Die vorhandenen zufaelligen Legacy-Bindungen muessen korrekt abgelehnt werden, wodurch die unveraenderten Pflicht-Regressionstests scheitern.
- Pflichtgate/Regressionstest 14: Database- und serielle Root-Suite koennen nach einer fail-closed Signaturaenderung nicht gruen bleiben, solange die ausserhalb des Scopes liegenden Caller nicht angepasst werden duerfen.

### Reproduzierbare Evidenz

1. `packages/database/src/agent-job-repository.ts:115,117,122-147` zeigt die oeffentliche Completion-Grenze, die direkte Caller-ID-Verwendung und den vorgezogenen Replay-Pfad.
2. `apps/worker/src/job-processor.ts:67,81,97,106,110` zeigt alle Worker-Completion-Pfade und die unvollstaendige FNV-ID.
3. Die oben aufgelisteten nicht erlaubten Caller uebergeben jeweils `randomUUID()` an dieselbe Repository-Grenze.
4. `vitest.config.ts` nimmt `packages/**/*.test.ts` in die Root-Suite auf; die PostgreSQL-Suite wird laut Vertrag mit `TEST_DATABASE_URL` und null Skips ausgefuehrt.
5. Ein Workspace-weiter Read-only-Search bestaetigte keine alternative zentrale erlaubte Testhilfe, ueber die diese Caller vertragskonform angepasst werden koennten.

### Betroffener Scope

Die notwendige Erweiterung betrifft ausschliesslich die direkten Completion-Caller und deren Regressionstests. Migrationen, Dependencies, echte Runtime, Codex-Smoke/-Turn, Cancellation-Architektur, GitHub, automatische Projektausfuehrung, Deployment und Production bleiben unveraendert ausgeschlossen.

Minimal benoetigte zusaetzliche Dateien fuer einen neuen Owner-Vertrag:

- `apps/worker/src/codex-runtime.real-smoke.ts` nur fuer die statische Caller-Anpassung; kein Smoke oder Modellturn;
- `packages/database/src/agent-assignment.integration.test.ts`;
- `packages/database/src/codex-runtime-repository.integration.test.ts`;
- `packages/database/src/implementation-orchestrator-repository.integration.test.ts`;
- `packages/database/src/planning-orchestrator-repository.integration.test.ts`;
- `packages/database/src/project-workspace-repository.integration.test.ts`.

### Gepruefter Stand und Checks

- Branch: `feature/completion-id-hardening`.
- Anwendungscode-Snapshot: `04c9800f7da588d50ce5b862c18943c4aadc137d`.
- Anwendungscode-Diff: leer.
- Bereits vor Task-Start vorhanden und unangetastet: unversionierte Datei `d`.
- Writer: nicht aktiviert; Schreibzugriff auf Anwendungscode wurde nie begonnen.
- Post-Review-Reparatur: `0/1` verbraucht.
- Pflichtgates: `NOT_RUN`, weil der Task vor Implementierung und vor Phase B vertragsgemaess mit `SCOPE_EXPANSION_REQUIRED` stoppt.
- QA-/Reviewer-/Security-/Legal-Abschlussreviews: `NOT_STARTED`, weil kein Implementierungsstand und kein finaler Review-Snapshot existieren.
- `PROJECT_STATE.md`: unveraendert; `REAL_RUNTIME_HARDENING` bleibt `NOT PASSED / FAIL CLOSED`, Release-Level `DEVELOPMENT_ONLY`, GitHub `NO`, automatische Projektausfuehrung `NO`, Production deployment `DISABLED`.

### Erforderliche Owner-Entscheidung

Der Owner muss einen neuen unveraenderlichen Task-Vertrag autorisieren, der mindestens die sechs aufgefuehrten direkten Caller-Dateien zusaetzlich erlaubt und weiterhin genau `COMPLETION-ID-HARDENING-01-EXECUTOR` als einzige Anwendungscode-Writer-Identitaet festlegt, oder den Task blockiert lassen. Der aktuelle Vertrag darf nicht automatisch erweitert werden.

# COMPLETION-ID-HARDENING-02

## Unveraenderlicher Arbeitsvertrag

- Task: `COMPLETION-ID-HARDENING-02`
- Autorisierung: ausdruecklicher Owner-Nachfolgetask zu `COMPLETION-ID-HARDENING-01`; dessen Abschluss `SCOPE_EXPANSION_REQUIRED - DEVELOPMENT ONLY` bleibt unveraenderte historische Evidenz.
- Meilenstein: `REAL_RUNTIME_HARDENING`
- Freigabestufe: `DEVELOPMENT_ONLY`
- Branch: `feature/completion-id-hardening`
- Tatsaechlicher Task-Start: `2026-07-18T00:15:55+02:00`
- Spaetester Abschluss im Zeitbudget: `2026-07-18T03:15:55+02:00`
- Maximalbudget: `180 Minuten`
- Einzige Anwendungscode-Writer-Identitaet: `COMPLETION-ID-HARDENING-02-EXECUTOR`
- Post-Review-Reparaturbudget zu Beginn: `0/1` verbraucht. Normale Implementierungs-, Test- und Debug-Iterationen vor Fixierung des ersten finalen Review-Snapshots gehoeren zur Erstimplementierung. Danach ist hoechstens ein automatischer Reparaturdurchlauf erlaubt.
- Zulaessige Abschlussstatus: `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`, `SCOPE_EXPANSION_REQUIRED`.

Der Vertrag ist mit Anlage dieses Abschnitts fixiert und darf waehrend dieses Tasks nicht erweitert werden. Ein weiterer zwingend zu aendernder Caller ausserhalb der nachstehenden Liste fuehrt ohne Legacy-Umgehung und ohne fremde Dateiaenderung zu `SCOPE_EXPANSION_REQUIRED`.

### Scope und Akzeptanzkriterien

Scope, `AC1` bis `AC9` und saemtliche Pflichtnachweise aus `COMPLETION-ID-HARDENING-01` bleiben unveraendert verbindlich. Insbesondere gilt:

- Caller liefern strukturierten Completion-Kontext beziehungsweise einen zulaessigen operationsspezifischen Discriminator, niemals eine als vertrauenswuerdig behandelte fertige Completion-ID.
- Die Repository-Grenze validiert den vollstaendigen Kontext gegen autoritativen Job-, Task-, Run-, Attempt-, Claim-, Fence-, Lease-/Job-Version-, Rollen- und vorhandenen Assignment-Zustand und berechnet beziehungsweise reproduziert die kanonische SHA-256-basierte lowercase UUID-v8 selbst.
- Ein Legacy-Pfad fuer beliebige Caller-UUIDs, zufaellige Completion-IDs oder hartcodierte Ersatz-UUIDs ist verboten.
- Exakte Replays bleiben idempotent; fremde, manipulierte, stale oder divergierende Replays werden vor Mutation fail-closed abgelehnt.
- Normale Completion und bestaetigte Cancellation sind geschuetzt; bestehende Cancellation- und Late-Result-Semantik wird nicht abgeschwaecht.

### Erlaubte Dateien und Komponenten

Bisheriger Scope:

- `apps/worker/src/job-processor.ts`
- `apps/worker/src/job-processor.test.ts`
- `apps/worker/src/postgres-runtime-store.ts`
- optional `apps/worker/src/postgres-runtime-store.test.ts`
- `packages/database/src/agent-job-repository.ts`
- `packages/database/src/database.integration.test.ts`
- `packages/database/src/index.ts`
- optional `packages/database/src/completion-identity.ts`
- optional `packages/database/src/completion-identity.test.ts`
- optional `packages/database/src/agent-job-repository.integration.test.ts`
- `docs/architecture/completion-id-hardening-01.md`
- `PROJECT_STATE.md`

Zusaetzlich ausdruecklich autorisierte Caller:

- `packages/database/src/agent-assignment.integration.test.ts`
- `packages/database/src/codex-runtime-repository.integration.test.ts`
- `packages/database/src/implementation-orchestrator-repository.integration.test.ts`
- `packages/database/src/planning-orchestrator-repository.integration.test.ts`
- `packages/database/src/project-workspace-repository.integration.test.ts`
- `apps/worker/src/codex-runtime.real-smoke.ts`, ausschliesslich statische Anpassung an die neue Completion-Identity-Schnittstelle und Pruefung durch Typecheck/Build; kein echter Smoke und kein Modellturn.

### Ausdruecklich ausgeschlossen

- Migrationen, Dependency- oder `package.json`-Aenderungen und Aenderungen am Codex-CLI-Pin;
- Aenderungen an Codex Provider, CLI oder Runtime;
- neue Cancellation- oder Reconciliation-Architektur, reale Worker-/Prozessidentitaet oder Termination-Attestation;
- GitHub-Integration, automatische Projektausfuehrung, Deployment oder Production-Freigabe;
- Lesen, Veraendern, Loeschen, Verschieben oder Hinzufuegen der vorbestehenden unversionierten Datei `d`.

### Zusaetzliche pruefbare Nachweise

- Alle sechs neu autorisierten Caller verwenden die strukturierte Schnittstelle; kein Caller kann eine beliebige UUID als gueltige Completion-ID einschleusen.
- Bekannte deterministische SHA-256-/UUID-v8-Testvektoren und vollstaendige feldweise Binding-Separation.
- Exakter serieller und konkurrierender Replay.
- Cross-Job-, Cross-Run-, Cross-Claim- und Cross-Assignment-Ablehnung.
- Ablehnung stale Fence, Lease Generation und Job-Version.
- Ablehnung derselben ID bei divergentem Result oder divergierender Evidence.
- Atomarer Rollback fuer jede Ablehnung.
- Bestehende Orchestrator-, Workspace-, Assignment- und Codex-Ledger-Regressionen bleiben gruen.

### Pflichtgates und finaler Review-Ablauf

Alle Gates laufen mit `AGENT_RUNTIME=fake` und `CODEX_REAL_SMOKE_TEST=0`: gezielte Completion-Identity-Unit-Tests; Worker-Tests; serielle PostgreSQL-Integration mit gesetzter `TEST_DATABASE_URL` und null Skips; serielle Root-Tests; Worker Typecheck/Lint/Build; Database Typecheck/Lint/Build; Root Typecheck/Lint/Build; `git diff --check`. Ein echter Codex-Smoke oder echter Modellturn ist verboten.

Erst nach vollstaendig gruenen Gates wird der finale Anwendungscode-Snapshot eindeutig fixiert und der Writer beendet. QA, Reviewer, Security und Legal pruefen danach read-only und parallel exakt denselben Stand ausschliesslich gegen `AC1` bis `AC9` und diesen erweiterten Scope. Ein eventueller einziger Post-Review-Reparaturdurchlauf erfordert anschliessend die Wiederholung aller Gates und aller vier Reviews; weitere Review-/Repair-Schleifen sind verboten.

### Abschlussgrenzen

Ein Komponenten-Pass ist ausschliesslich `DEVELOPMENT_ONLY`. `REAL_RUNTIME_HARDENING` bleibt insgesamt `NOT PASSED / FAIL CLOSED`. GitHub-Integration bleibt `NO`, automatische Projektausfuehrung `NO`, Production deployment `DISABLED` und der Release-Level `DEVELOPMENT_ONLY`. Nur bei bestandenen `AC1` bis `AC9`, allen Pflichtgates und allen vier Reviews ist der exakte Erfolgsstatus `COMPLETION ID HARDENING BESTANDEN  DEVELOPMENT ONLY`; andernfalls wird ein strukturierter Abschlussstatus dokumentiert.

## Review-Snapshot 1 und Reparaturdurchlauf 1/1

- Fixiert am: `2026-07-18T01:39:38.146+02:00`
- Branch: `feature/completion-id-hardening`
- Basis-HEAD: `04c9800f7da588d50ce5b862c18943c4aadc137d`
- Anwendungscode-Manifest: 13 explizit autorisierte Dateien
- Aggregat-SHA-256: `51da0e6e7825f750cf2652548466bde681d1e3f820935324ae257c814ccd2c99`
- Writer vor Review beendet: `COMPLETION-ID-HARDENING-02-EXECUTOR`
- Reparaturverbrauch bei Fixierung: `0/1`

Die Pflichtgates waren auf diesem Stand vollstaendig gruen: Completion-Identity-Unit `13/13`, Worker `42/42`, PostgreSQL seriell `171/171` bei null Skips, Root seriell `421/421` bei null Skips, Worker/Database/Root Typecheck, Lint und Build jeweils `PASS`, `git diff --check` `PASS`. Es galten `AGENT_RUNTIME=fake` und `CODEX_REAL_SMOKE_TEST=0`; ein echter Codex-Smoke und ein Modellturn wurden nicht ausgefuehrt.

Die parallelen Read-only-Reviews auf demselben Hash ergaben:

- QA: `BLOCK` fuer `AC9`;
- Reviewer: `BLOCK` fuer `AC9`;
- Security: `SECURITY BLOCK` fuer `AC9`;
- Legal: `PASS_WITH_REQUIREMENTS - DEVELOPMENT_ONLY`; keine Requirement verbietet den aktuellen technischen Scope, alle Provider-, Counsel-, Daten-, Release- und Production-Anforderungen bleiben spaeteren fail-closed Gates zugeordnet.

Strukturierter Befund: Nach einem atomar committeten `LATE_RESULT_DISCARDED` und einem Worker-Crash vor Evidence-Bestaetigung erzeugt ein Reclaim vertragsgemaess eine neue claim-, fence-, lease- und versionsgebundene Completion-ID. Die Repository-Grenze lehnt diese zweite jobweite Late-Identity ab; der Processor unterschied den Zustand jedoch nicht und erreichte deshalb weder Evidence-Bestaetigung noch bounded Reconciliation. Ein Job konnte dadurch dauerhaft in `CANCELLING` verbleiben. Betroffener Scope: `apps/worker/src/job-processor.ts`, `apps/worker/src/job-processor.test.ts`, `packages/database/src/agent-job-repository.ts`, `packages/database/src/database.integration.test.ts` und gegebenenfalls der bestehende Export in `packages/database/src/index.ts`.

Der einzige zulaessige Post-Review-Reparaturdurchlauf wurde nach Abschluss aller vier Reviews aktiviert. Reparaturverbrauch ist damit `1/1`. Das Ziel ist ein spezifischer, mutationsfreier und erst nach vollstaendiger autoritativer Context-, Result-, Cancellation- und Effektpruefung erzeugter Already-Late-Sentinel. Die neue Cross-Claim-ID bleibt abgelehnt; nur der Cancellation-Processor darf diesen Sentinel behandeln, um Evidence-Bestaetigung beziehungsweise bounded Reconciliation fortzusetzen. Stale, fremde, manipulierte und divergierende Aufrufe bleiben fail-closed. Nach der Reparatur sind alle Pflichtgates und alle vier Reviews auf einem neuen fixierten Snapshot genau einmal zu wiederholen; eine weitere automatische Reparatur ist ausgeschlossen.

## Finaler Review-Snapshot 2

- Fixiert am: `2026-07-18T02:29:16.083+02:00`
- Nach den Reviews unveraendert bestaetigt am: `2026-07-18T02:36:22.145+02:00`
- Branch: `feature/completion-id-hardening`
- Basis-HEAD: `04c9800f7da588d50ce5b862c18943c4aadc137d`
- Writer vor dem zweiten Review beendet: `COMPLETION-ID-HARDENING-02-EXECUTOR`
- Reparaturverbrauch: `1/1`; kein weiterer automatischer Reparaturdurchlauf zulaessig
- Primaer-SHA-256: `354dcf9cda409b815bc98329c4352f4774089b21717e7c30528dfc8a234d8b7a`
- Primaer-Kanonisierung: lexikographisch sortiert je `UTF8(relativePath) + NUL + raw file bytes + NUL`
- Sekundaerer Manifest-SHA-256: `6c856ff964c592906c5ed02b0099cce115e0cd60aad2b730ce0bd7627055169d`
- Sekundaere Kanonisierung: Pfadreihenfolge des Manifests, je `relativePath=lowercase-file-sha256`, mit LF verbunden und abschliessendem LF

Dateimanifest des finalen Anwendungscode-Snapshots:

- `apps/worker/src/codex-runtime.real-smoke.ts`: `646e7ab603324c891dcf0e3ae1640b2ba776190b7f796c97bb69fe4e11c0e3c6`
- `apps/worker/src/job-processor.test.ts`: `737dd3ddb5999781680ff6fffee52fccc4296192a79e3f1e58f7a82ac3b7bc03`
- `apps/worker/src/job-processor.ts`: `fb7a274112e5f8c462c7686c01b0e5ad2585aa54773e942dd8312b76235b9fa4`
- `packages/database/src/agent-assignment.integration.test.ts`: `a8684786e1cac757116ed9ca93b36953bcc908a8e8c71453fb2abf9fd5278420`
- `packages/database/src/agent-job-repository.ts`: `1e9592a4c274dd9da656ff790e7c4b8893ad9acd780a40cf4f7eee1ddcc2dceb`
- `packages/database/src/codex-runtime-repository.integration.test.ts`: `5979a32f4a439cba8b79d7f2aa073643579a5b1d9aa4bfbe98c98fda2577caec`
- `packages/database/src/database.integration.test.ts`: `73b716d2df320afddb09726103f2d5bf999fc4d4b9e259b5c187b13a7952ba49`
- `packages/database/src/implementation-orchestrator-repository.integration.test.ts`: `909e87592d5bb85018b318999403a933c051523c1024ceae1f44f7a7d937c962`
- `packages/database/src/index.ts`: `ab4a4baf7e2487912ea104cbde0e591fa7d1f15de0b95844ec4095922e152214`
- `packages/database/src/planning-orchestrator-repository.integration.test.ts`: `3d760fbc3582e5232ab86c32e5c189aaad30f14b74f8fcbf2ab398dbcc91a9ee`
- `packages/database/src/project-workspace-repository.integration.test.ts`: `bd3248e5fa6a7c1801fec60d25e07f99462a443e6b972229132e2f85cc8ccf5c`
- `packages/database/src/completion-identity.test.ts`: `7d1dd892e9d9df6b081ea7d73978904cd73003c13de4a9239ede9f24c3abb6d6`
- `packages/database/src/completion-identity.ts`: `f215b9301ec48417024746d29015692068a064399d822690e4c022014bfedebe`

### Implementierter Abschlussstand

- Die Repository-Grenze akzeptiert fuer `complete` und `confirmCancelled` nur den strikt strukturierten Completion-Kontext und berechnet die SHA-256-basierte lowercase UUID-v8 selbst. Es existiert keine Legacy-Ueberladung fuer Caller-UUIDs.
- Domain, Schema-/Operationsversion, Operation, Project, Job, Task, Attempt, Run, Rolle, Worker, Claim, Fence, Lease Generation, Job Version, Assignment und operationsspezifischer Runtime-Watermark beziehungsweise Evidence-Discriminator sind gebunden.
- Alle produktiven und Test-Caller wurden vollstaendig gescannt. Alle sechs zusaetzlich autorisierten Caller sowie Worker-Normal-Completion, Late-Completion und bestaetigte Cancellation verwenden die strukturierte Schnittstelle. Es wurde kein weiterer zwingend zu aendernder Caller ausserhalb des Owner-Scope gefunden.
- Exakte serielle und konkurrierende Replays bleiben idempotent. Cross-Job, Cross-Run, Cross-Claim, Cross-Assignment, stale Fence, Lease Generation oder Job Version sowie divergierende Result-/Evidence-Payloads werden vor Mutation fail-closed abgelehnt.
- Normal Completion, bestaetigte Cancellation, Immediate-Cancel-vs-Completion und Late-Result werden unter dem autoritativen Job-Lock linearisiert. Ablehnungen rollen Job, Run, Result, Inbox, Outbox, Audit, Evidence und Late-Result atomar zurueck.
- Der AC9-Reparaturpfad akzeptiert eine neue Cross-Claim-ID niemals als Replay-Erfolg. Nach vollstaendiger aktueller Claim-Pruefung reproduziert er fuer genau einen vorhandenen Late-Commit dessen urspruenglichen strukturierten Kontext, UUID-v8 und Semantic Digest und verlangt exakt eine passende Inbox-, Audit- und Outbox-Wirkung. Nur dann wird ein typisierter, mutationsfreier Sentinel geworfen. Der Cancellation-Processor faengt ausschliesslich diesen Sentinel und setzt Evidence-Bestaetigung oder bounded Reconciliation fort.
- Ein echter `AgentJobProcessor`-/`FakeAgentRuntime`-Test crasht per engem Test-Hook unmittelbar nach dem ersten Late-Commit und vor Evidence, laesst die Lease ablaufen und startet einen separaten Recovery-Worker. Der Abschluss ist `CANCELLED` mit exakt einer Late-Row, Inbox, Late-Audit und Late-Outbox, keiner publizierten SUCCESS-Result-Wirkung und jeweils genau einer Evidence-/Cancel-Wirkung. Korruptions-, No-Evidence- und Generic-Divergence-Faelle bleiben fail-closed.

### Finale Pflichtgates auf Snapshot 2

Alle Gates liefen mit `AGENT_RUNTIME=fake` und `CODEX_REAL_SMOKE_TEST=0`:

- Completion-Identity-Unit: `1/1` Datei, `13/13` Tests, `0` Skips, `PASS`;
- Worker: `5/5` Dateien, `45/45` Tests, `0` Skips, `PASS`;
- PostgreSQL seriell mit gesetzter `TEST_DATABASE_URL`: `11/11` Dateien, `173/173` Tests, `0` Skips, `PASS`;
- Root seriell: `35/35` Dateien, `426/426` Tests, `0` Skips, `PASS`;
- Worker Typecheck, Lint und Build: `PASS`;
- Database Typecheck, Lint und Build: `PASS`;
- Root Typecheck, Lint und Build: `PASS`;
- `git diff --check`: `PASS`; ausschliesslich nicht blockierende LF-zu-CRLF-Hinweise.

Ein echter Codex-Smoke und ein echter Modellturn wurden nicht ausgefuehrt. Es erfolgten kein Commit, Push, PR, Merge oder Deployment.

### Finale Read-only-Reviews auf Snapshot 2

Alle vier Reviews begannen erst nach Ende des Writers und prueften denselben unveraenderten Primaerhash:

- QA: `PASS`;
- Reviewer: `PASS - DEVELOPMENT_ONLY`;
- Security: `PASS - DEVELOPMENT_ONLY`; keine aktuellen Security-Findings;
- Legal: `PASS_WITH_REQUIREMENTS - DEVELOPMENT_ONLY`; keine Requirement verbietet diesen technischen Scope. Die technische Completion-Metadata enthaelt im aktuellen Profil nur synthetische Betriebsidentifikatoren und Digests, keine Secrets, Prompts, rohen Modelltexte oder Kundendaten. Dateninventar, Retention, Zugriffsschutz, Counsel-, Provider-, reale Daten-, Release- und Production-Nachweise bleiben spaeteren fail-closed Gates zugeordnet.

### Abschluss

- Gepruefter Stand: finaler Snapshot 2 mit Primaerhash `354dcf9cda409b815bc98329c4352f4774089b21717e7c30528dfc8a234d8b7a`
- Offene Findings im aktuellen Task-Scope: keine
- Abschlussstatus: `PASSED - DEVELOPMENT_ONLY`
- Completion-ID-Hardening-Vorgaenger: `COMPLETION-ID-HARDENING-01 - SCOPE_EXPANSION_REQUIRED - DEVELOPMENT ONLY`
- Completion-ID-Hardening: `COMPLETION-ID-HARDENING-02 - PASSED - DEVELOPMENT ONLY`
- Naechster begrenzter Task: `REAL-WORKER-PROCESS-IDENTITY-01`
- `REAL_RUNTIME_HARDENING`: `NOT PASSED / FAIL CLOSED`
- GitHub-Integration: `NO`
- Automatische Projektausfuehrung: `NO`
- Production deployment: `DISABLED`
- Release-Level: `DEVELOPMENT_ONLY`

`COMPLETION ID HARDENING BESTANDEN  DEVELOPMENT ONLY`
