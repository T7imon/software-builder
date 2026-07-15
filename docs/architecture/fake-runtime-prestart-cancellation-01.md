# FAKE-RUNTIME-PRESTART-CANCELLATION-01

Release level: `DEVELOPMENT_ONLY`

Production deployment: `DISABLED`

## Unveraenderlicher Arbeitsvertrag

- Task-ID: `FAKE-RUNTIME-PRESTART-CANCELLATION-01`.
- Scope: Ausschliesslich MVP-Kriterium 7 des Meilensteins `WORKER_FAKE_RUNTIME_MVP`: atomare terminale Cancellation eines persistent eindeutig noch nicht gestarteten lokalen Fake-Jobs sowie das atomare Superseden eines zwar geplanten, aber nachweislich nicht ausgelieferten Runtime-Start-Outbox-Auftrags. Start und Cancellation konkurrieren ueber denselben PostgreSQL-Row-Lock-/CAS-Vertrag. Unklare oder bereits erfolgte Start-Auslieferung bleibt im bestehenden fail-closed `CANCELLING`-/`CANCEL_STUCK`-Pfad.
- Zielsemantik: Eine einzige PostgreSQL-Transaktion sperrt die Jobzeile, prueft den nichtterminalen abbrechbaren Pre-start-Zustand, Jobversion, Claim, Lease Generation, Fencing Token, RuntimeRun, Workload-/Prozessidentitaet, Runtime-Start-Nachweis, Start-Outbox-Auslieferung, Runtime-Events, Completion und Cancellation-Idempotenz; sie akzeptiert den Cancellation Request, setzt Job und zugehoerige Workflow-/Attempt-Projektion konsistent auf Abbruch, supersedet gegebenenfalls einen nicht ausgelieferten Start-Auftrag, invalidiert aktive Pre-start-Claims/Leases, erhoeht Version beziehungsweise Aggregate Sequence, schreibt genau ein Pre-start-Cancellation-AuditEvent, schliesst Inbox/Idempotency ab und erzeugt genau das erforderliche `JobCancelled`-OutboxEvent. CAS-Verlust oder Crash vor Commit hinterlaesst keine Teilwirkung.
- Pruefbare Akzeptanzkriterien: (1) `QUEUED` ohne Startplanung wird direkt atomar `CANCELLED`; (2) ein persistent geplanter, eindeutig nicht ausgelieferter Start wird in derselben Transaktion superseded und darf nicht mehr ausgeliefert werden; (3) ausgelieferter oder unklarer Startstatus, vorhandener erfolgreicher RuntimeRun, Workload-/Prozessidentitaet, persistierter Startnachweis oder startbeweisendes RuntimeEvent verbieten den direkten terminalen Pfad; (4) eine bereits wirksame Completion gewinnt gemaess bestehender Semantik; (5) Jobversion, Claim, Lease Generation und Fencing Token werden fail-closed geprueft; (6) identische Replays sind wirkungsfrei idempotent, gleicher Idempotency Key mit anderem Digest wird abgelehnt; (7) parallele Cancels sowie Start/Cancel werden linearisiert und koennen nie sowohl terminale Pre-start-Cancellation als auch erfolgreiche Start-Auslieferung fuer denselben Lauf ergeben; (8) alter oder stale Worker kann nach Cancellation keinen Start ausloesen; (9) Crash-/Restart- und Outbox-Verarbeitung erzeugen genau eine Wirkung; (10) `FakeAgentRuntime.cancelRun` wird im erfolgreichen Pre-start-Pfad nie aufgerufen; (11) keine `RuntimeTerminationEvidence` wird erfunden; (12) alle 22 vom Owner benannten deterministischen Tests, der Start-/Cancel-Race 30-mal ohne Test-Retry, PostgreSQL ohne Skips, Runtime-, Worker-, Workflow-Engine-, Root- und Crash-/Restart-Tests sowie Lint, Typecheck, Build und `git diff --check` bestehen; (13) anschliessende read-only QA-, Reviewer- und Security-Pruefungen geben denselben fixierten Stand gegen ausschliesslich die elf dokumentierten MVP-Kriterien frei; Legal ist `NOT_APPLICABLE`; (14) Production bleibt `DISABLED` und alle Real-Runtime-Themen bleiben `DEFERRED_TO_LATER_GATE`.
- Erlaubte Anwendungscode-Komponenten: ausschliesslich `packages/database/src/agent-job-repository.ts`, die fuer dessen schmale API zwingend erforderlichen Exporte/Typen in `packages/database/src/index.ts` und `packages/database/src/types.ts`, genau eine additive PostgreSQL-Migration unter `packages/database/migrations/`, sowie der vorhandene Start-/Cancel-Dispatchpfad in `apps/worker/src/job-processor.ts`, `apps/worker/src/postgres-runtime-store.ts`, `apps/worker/src/worker-loop.ts` und `apps/worker/src/index.ts`. `packages/agent-runtime/**` und `packages/workflow-engine/**` duerfen nur geaendert werden, falls die bestehende Schnittstelle beziehungsweise Projektion die spezifizierte lokale atomare Transition sonst nachweislich nicht ausdruecken kann; eine Runtime-Evidence- oder zweite Cancellation-Schicht ist verboten.
- Erlaubter Testcode: ausschliesslich taskbezogene Tests in `packages/database/src/database.integration.test.ts`, `apps/worker/src/job-processor.test.ts`, vorhandenen Worker-Testdateien, `packages/agent-runtime/src/runtime.test.ts`, `packages/agent-runtime/src/termination-evidence.test.ts` und `packages/workflow-engine/src/index.test.ts` beziehungsweise `workflow.integration.test.ts`. Workspace-Manifeste und Lockfile duerfen nur geaendert werden, wenn sie fuer das Ausfuehren dieser bestehenden Test-/Build-Gates zwingend erforderlich sind.
- Erlaubte Dokumentation: ausschliesslich `docs/architecture/fake-runtime-prestart-cancellation-01.md`, `docs/architecture/worker-fake-runtime-mvp-scope-reset-01.md`, `docs/architecture/worker-fake-runtime-01.md` und `PROJECT_STATE.md`.
- Verboten: allgemeine Reconciliation, reale `RuntimeTerminationEvidence`, Completion-ID-Hardening, Codex SDK, Agent Registry, GitHub-Integration, automatische Projektausfuehrung, Deployment, Release Candidate, Production, echte Kunden-/Personendaten, Secrets sowie jede parallele Job- oder Cancellation-Schicht.
- Anwendungscode-/Testcode-Writer: genau und ausschliesslich die neue Identitaet `FAKE-RUNTIME-PRESTART-CANCELLATION-01-EXECUTOR`. Ein Writer-Wechsel ist verboten. Der Hauptagent schreibt nur die erlaubte Dokumentation. QA, Reviewer, Security und Legal arbeiten ausschliesslich read-only.
- Maximales Zeitbudget: eine lokale Arbeitssitzung, hoechstens acht Stunden ab Fixierung dieses Vertrags am 2026-07-15.
- Reparaturbudget: nach der Erstimplementierung hoechstens ein automatischer Reparaturdurchlauf (`repair ordinal 1/1`) durch dieselbe Executor-Identitaet. Bleibt danach ein aktuelles Akzeptanzkriterium offen, endet der Task strukturiert `BLOCKED`; automatische Review-/Repair-Schleifen sind verboten.
- Fixierung und Reviews: Nach abgeschlossener Implementierung und Pflichtpruefung endet der Writer-Zugriff. Der Stand wird mit HEAD, Working-Tree-Dateiliste und SHA-256-Digests fixiert. Erst danach pruefen QA, Reviewer und Security parallel read-only genau diesen Stand; Legal ist fuer den lokalen synthetischen Scope `NOT_APPLICABLE`.
- Zulaessige Abschlussstatus: `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`. `PASSED` ist nur bei erfuelltem MVP-Kriterium 7, vollstaendig gruenen Pflichtpruefungen und Freigabe aller elf `WORKER_FAKE_RUNTIME_MVP`-Kriterien durch die drei technischen Read-only-Rollen zulaessig. Real-Runtime-/Production-Themen bleiben separat `DEFERRED_TO_LATER_GATE` und fail-closed.
- Erfolgsformel: `WORKER UND FAKE RUNTIME MVP BESTANDEN  DEVELOPMENT ONLY`.
- Nichterfuellungsformel: `WORKER UND FAKE RUNTIME MVP NICHT BESTANDEN`.

Dieser Arbeitsvertrag ist ab seiner Fixierung unveraenderlich. Implementierungs-, Pruef-, Fixierungs-, Review- und Abschlussnachweise werden ausschliesslich unterhalb dieses Absatzes ergaenzt und duerfen Scope, Writer, Budget oder Gates nicht aendern.

## Ausfuehrungsnachweis

Status bei Vertragsfixierung: `IN_PROGRESS - DEVELOPMENT ONLY`.

### Implementierung, Reparatur und Writer-Freeze

- Alleinige Writer-Identitaet fuer Anwendungscode und Testcode: `FAKE-RUNTIME-PRESTART-CANCELLATION-01-EXECUTOR`.
- Erstimplementierung geschlossen nach gruenem Fokuslauf mit 22/22 Pre-start-Faellen und separatem Start-/Cancel-Race mit 30/30 internen Iterationen ohne Test-Retry.
- Der erste vollstaendige PostgreSQL-Lauf erreichte 57/66 Tests, 0 Skips. Neun Folgefehler hatten dieselbe reproduzierbare Ursache: Ein historischer, absichtlich nichtterminaler Test-Claim wurde durch die verlaengerte Gesamtlaufzeit erneut global claimbar und verdraengte spaetere Recovery-Fixtures.
- Reparaturdurchlauf: `repair ordinal 1/1`, vollstaendig verbraucht. Die Korrektur blieb ausschliesslich in der Test-Fixture-Isolation; die kurz gepruefte optionale produktive `claimNext(jobId)`-Erweiterung wurde verworfen. Die produktive Signatur bleibt `claimNext(workerId, claimId, leaseMs)`.
- Post-Repair-Pflichtlauf: Build `PASS`; Pre-start-Fokus 22/22 `PASS`; Start-/Cancel-Race 30/30 ohne Retry `PASS`; PostgreSQL 66/66, 0 Skips `PASS`; Agent Runtime 31/31 `PASS`; Worker 23/23 `PASS`; Workflow Engine 78/78 `PASS`; Root 212/212 in 13 Dateien, 0 Skips `PASS`; PRESTART-18, PRESTART-19 und PRESTART-20 jeweils 1/1 ohne Retry `PASS`; Lint `PASS`; Typecheck `PASS`; finaler Build `PASS`; `git diff --check` `PASS`.
- Ein kombinierter Crash-Test-Regex wurde von PowerShell am Pipe-Zeichen getrennt und startete keinen Test. Er ist keine Testevidenz; stattdessen wurden PRESTART-18, PRESTART-19 und PRESTART-20 einzeln erfolgreich ausgefuehrt.
- Anwendungscode-/Testcode-Schreibzugriff wurde danach dauerhaft beendet. Eine weitere automatische Reparatur ist unzulaessig.

### Fixierter technischer Review-Stand

- Base HEAD: `4fb029fe34ee288079852a0f78bfb87e52598ad9`.
- `apps/worker/src/index.ts`: `53A5C30A872344218CCD5C2E8D9705EABCAAA4F5F602C015564C8918B971A31D`.
- `apps/worker/src/job-processor.ts`: `FFA8DB49592105173AB9F83738B8CCC8A4C7BFE028EBC2F8224EEF4A423504B8`.
- `apps/worker/src/job-processor.test.ts`: `30C45BF75E9C26CD12BD61BA676332F643E12A601DC815BC826A77E2FAD03032`.
- `packages/database/src/agent-job-repository.ts`: `576CCEA5FCE9A12FF691CB10D455363DB3EACA12E4CB0A25AA08EDADE51EC82B`.
- `packages/database/src/database.integration.test.ts`: `EBEDA12B7AA2A7C593AD5D174D025277091481C3237601B36E39FC1D12A87E2A`.
- `packages/database/migrations/009_fake_runtime_prestart_cancellation.sql`: `BEDC21F4B90D2AABAE635109675AE47E1567A8C174327F219ACFF996228C0B08`.
- Die Dokumentationsdateien sind ein append-only Orchestrator-Protokoll und nicht Teil des eingefrorenen Anwendungscode-/Testcode-Hashsets. QA, Reviewer, Security und Legal pruefen ausschliesslich den oben fixierten technischen Stand.

### Read-only-Abschlussreviews auf demselben Stand

Alle Rollen bestaetigten vor und nach ihrer Pruefung Base HEAD und alle sechs technischen SHA-256-Digests. Keine Review-Rolle veraenderte eine Datei. QA fuehrte als einzige Review-Rolle Tests und DB-Laeufe aus; Reviewer, Security und Legal arbeiteten ausschliesslich statisch read-only.

- QA: `PASS - DEVELOPMENT_ONLY`. Pre-start-Fokus 22/22 mit `--retry=0`; PRESTART-17 1/1 mit 30/30 internen Iterationen und `--retry=0`; PostgreSQL 66/66, 0 Skips; Agent Runtime 31/31; Worker 23/23; Workflow Engine 78/78; Root 212/212 in 13 Dateien, 0 Skips; PRESTART-18, PRESTART-19 und PRESTART-20 jeweils 1/1 ohne Retry; Lint, Typecheck fuer 11 Workspaces, Build fuer 11 Workspaces und `git diff --check` jeweils `PASS`, Exit 0. Aktuelle Scope-Findings: keine.
- Reviewer: `PASS`. Gemeinsamer Job-Row-Lock, CAS-/Guard-Vertrag, Pending-/Dispatch-Unterscheidung, atomisches Supersede, Projektions- und Claim-Invalidierung, Completion-Winner, Replay, Rollback, Crash/Restart sowie die Aussagekraft von PRESTART-01 bis PRESTART-22 wurden freigegeben. Aktuelle Scope-Findings: keine.
- Security: `PASS - DEVELOPMENT_ONLY`. Unklare oder ausgelieferte Starts bleiben fail-closed, stale Guards koennen den direkten Pfad nicht nutzen, alte Worker starten nach einem zuerst committeten Cancel keine Workload, und der erfolgreiche Pre-start-Pfad erzeugt weder Ergebnis noch Cancellation-Confirmation noch `RuntimeTerminationEvidence`. Aktuelle Scope-Findings: keine.
- Legal DE: `NOT_APPLICABLE`. Der Stand verwendet nur lokale FakeRuntime-Logik und synthetische Testdaten; es gibt keine externe Handlung, Provider-, GitHub-, Release-, Deployment- oder Production-Aktivitaet. Aktuelle rechtliche Scope-Findings: keine.

### Finale WORKER-FAKE-RUNTIME-MVP-Matrix

| Nr. | Kriterium | Status | Aktueller Nachweis |
|---:|---|---|---|
| 1 | `AgentRuntime`-Schnittstelle | `PASS` | Runtime-Implementierung und 31/31 Runtime-Tests |
| 2 | Deterministische Fake-Modi | `PASS` | Runtime-, Worker- und PostgreSQL-Szenariotests |
| 3 | Persistenter Job-Claim | `PASS` | PostgreSQL-Claim- und Konkurrenztests |
| 4 | Lease, Generation und Fencing | `PASS` | Lease-/Reclaim-/stale-Guard-Tests |
| 5 | Retry-Limit | `PASS` | Runtime-, Worker- und PostgreSQL-Tests |
| 6 | Restart ohne Jobverlust | `PASS` | Prozess-, Crash- und Restart-Tests |
| 7 | Atomarer terminaler Pre-start-Cancel | `PASS` | Migration 009, gemeinsamer Row-Lock-/CAS-Vertrag und PRESTART-01 bis PRESTART-22 |
| 8 | Unklarer Ausgang bleibt fail-closed | `PASS` | Dispatch-/Startnachweis-Guards und bestehender `CANCELLING`-/`CANCEL_STUCK`-Pfad |
| 9 | Kein unbelegtes `CANCELLED` oder `SUCCEEDED` | `PASS` | Completion-/Cancel-Races, Rollback und Evidence-Negativtest |
| 10 | Alle aktuellen Pflichtpruefungen | `PASS` | Executor- und unabhaengiger QA-Pflichtlauf vollstaendig gruen |
| 11 | Production deployment bleibt `DISABLED` | `PASS` | Projektzustand und alle Abschlussreviews |

### Finaler Abschluss

- Abschlussstatus des Tasks: `PASSED - DEVELOPMENT ONLY`.
- Abschlussstatus des Meilensteins: `PASSED_WITH_DEFERRED_HARDENING - DEVELOPMENT ONLY`.
- Gepruefter technischer Stand: Base HEAD und sechs Datei-Digests aus dem fixierten Review-Manifest; nach allen Reviews unveraendert.
- Reparaturdurchlauf: `repair ordinal 1/1` verbraucht und erfolgreich abgeschlossen; der Writer-Zugriff bleibt beendet.
- Offene Findings im aktuellen Task- oder MVP-Scope: keine.
- Zielmeilenstein der unveraendert offenen Real-Runtime-, Attestation-, Completion-ID-, Mehrprozess-, Provider-, Credential-, Release- und Production-Nachweise: `REAL_RUNTIME_HARDENING`, Status `DEFERRED_TO_LATER_GATE - FAIL CLOSED`.
- GitHub-Integration bleibt `NO`; automatische Projektausfuehrung bleibt `NO`; Production deployment bleibt `DISABLED`.
- `git diff --check` nach Aktualisierung aller vier erlaubten Abschlussdokumente: `PASS`, Exit 0.

`WORKER UND FAKE RUNTIME MVP BESTANDEN  DEVELOPMENT ONLY`
