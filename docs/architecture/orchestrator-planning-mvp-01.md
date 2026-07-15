# ORCHESTRATOR-PLANNING-MVP-01

## Unveraenderlicher Task-Vertrag

- **Task:** `ORCHESTRATOR-PLANNING-MVP-01`
- **Branch:** `feature/orchestrator-planning-mvp`
- **Ausgangsstand:** `b2eaccebf1cf3f4dca2a6038ba51e1e29a624d3a`
- **Vertragsbeginn:** 2026-07-15T14:05:14+02:00
- **Maximales Zeitbudget:** acht Arbeitsstunden innerhalb dieser Workflow-Ausfuehrung, spaetestens bis 2026-07-15T22:05:14+02:00
- **Writer-Identitaet:** `ORCHESTRATOR-PLANNING-MVP-01-EXECUTOR`
- **Reparaturbudget:** hoechstens ein eng begrenzter Reparaturdurchlauf durch dieselbe Writer-Identitaet
- **Zulaessige Abschlussstatus:** `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`
- **Freigabestufe:** ausschliesslich `DEVELOPMENT_ONLY`

Dieser Vertrag ist nach Beginn der Implementierung unveraenderlich. Ausfuehrungsnachweise und Abschlussbefunde werden nur in den nachfolgenden Abschnitten ergaenzt.

### Scope

Implementiert wird eine kleine, persistente Planning-`ProcessInstance`-Erweiterung der bestehenden Workflow Engine. Sie koordiniert genau einen Development-Planning-Run je `projectId` und `projectRevision` in der Reihenfolge PLANNER, ARCHITECT, SECURITY und LEGAL_DE_EU parallel sowie manueller Owner-Checkpoint. Sie verwendet ausschliesslich bestehende PostgreSQL-Persistenz, Agent Registry, Agent Assignment, Runtime-Jobs, Outbox und Fake Runtime.

Die Writer-Identitaet darf Anwendungscode, Migrationen und Tests nur in den folgenden Dateien oder Komponenten aendern:

- `packages/database/migrations/013_orchestrator_planning_mvp.sql`
- `packages/database/src/planning-orchestrator-repository.ts`
- `packages/database/src/planning-orchestrator-repository.test.ts`
- `packages/database/src/planning-orchestrator-repository.integration.test.ts`
- `packages/database/src/agent-job-repository.ts`
- `packages/database/src/agent-assignment.ts`
- `packages/database/src/agent-assignment.test.ts`
- `packages/database/src/agent-assignment.integration.test.ts`
- `packages/database/src/types.ts`
- `packages/database/src/index.ts`
- `packages/database/src/schema.test.ts`
- `packages/workflow-engine/src/planning-orchestrator.ts`
- `packages/workflow-engine/src/planning-orchestrator.test.ts`
- `packages/workflow-engine/src/index.ts`

Der Hauptagent darf ausschliesslich diese Dokumentationsdatei und `PROJECT_STATE.md` dokumentarisch aendern. QA, Reviewer, Security und Legal arbeiten nach dem Writer-Freeze read-only.

### Pruefbare Akzeptanzkriterien

1. `startPlanning` erzeugt bei parallelen und wiederholten Aufrufen genau einen persistenten Run und genau einen konkret zugewiesenen PLANNER-Job.
2. Ein erfolgreiches, revisionsgebundenes PLANNER-Ergebnis wird persistent referenziert und erzeugt genau einen konkret zugewiesenen ARCHITECT-Job.
3. Ein erfolgreiches ARCHITECT-Ergebnis wird persistent referenziert und erzeugt atomar genau einen SECURITY- und einen LEGAL_DE_EU-Job mit identischer `projectRevision` und identischem Architekturstand.
4. `WAITING_FOR_OWNER_APPROVAL` ist erst nach zwei terminalen, erfolgreichen Reviews erreichbar; ein einzelnes Review reicht nicht.
5. SECURITY- oder LEGAL_DE_EU-`BLOCK` setzt den Run verlaesslich und terminal auf `BLOCKED`.
6. `PASS_WITH_REQUIREMENTS` ist fuer `DEVELOPMENT_ONLY` erfolgreich und speichert minimierte, synthetische Requirement-Codes und opake Referenzen persistent.
7. Eine unveraenderliche Owner-Entscheidung `APPROVE` ist nur aus `WAITING_FOR_OWNER_APPROVAL` zulaessig und fuehrt mit Owner, Zeitpunkt, Grund und freigegebener Revision zu `READY_FOR_IMPLEMENTATION`.
8. Eine unveraenderliche Owner-Entscheidung `REJECT` fuehrt zu `REJECTED` und erzeugt keine weiteren Jobs.
9. Falsche Revisionen, fremde oder veraltete Events und widerspruechliche Replays werden abgewiesen; identische Replays sind idempotent; terminale Runs sind unveraenderlich.
10. Parallelitaet, Restart/`resumePlanning`, immutable Agent-Snapshots und vollstaendiger Transaktionsrollback ohne Teilzustand sind durch PostgreSQL-Integrationstests nachgewiesen.
11. Fehlt eine aktive Agent-Version, wird fail-closed `BLOCKED`; insbesondere entstehen bei fehlendem SECURITY- oder LEGAL_DE_EU-Agenten keine partiellen Review-Jobs.
12. Es wird kein EXECUTOR-Job und kein Anwendungscode durch den Produkt-Orchestrator erzeugt.
13. Alle vom Owner vorgegebenen Abschlussgates bestehen in der verlangten sequenziellen Reihenfolge.

### Verbindlicher Architekturrahmen

- Zustandsfolge: `PLANNING -> ARCHITECTURE_REVIEW -> SECURITY_LEGAL_REVIEW -> WAITING_FOR_OWNER_APPROVAL -> READY_FOR_IMPLEMENTATION`; terminale Abzweige sind `BLOCKED` und `REJECTED`.
- Ein spezialisierter Planning-Run erweitert die vorhandene Workflow-Infrastruktur; es entsteht keine zweite allgemeine Workflow Engine und die bestehende Ein-Job-Phasenmaschine wird nicht veraendert.
- `planning_runs`, `planning_jobs`, `planning_review_requirements` und `planning_owner_decisions` sind projektisoliert, RLS-geschuetzt und revisionsgebunden.
- Ein Run ist eindeutig je `(project_id, project_revision)`, ein Rollenjob eindeutig je `(planning_run_id, role)`, Runtime- und Background-Job-Referenzen sind eindeutig und Owner-Entscheidungen sowie angenommene Ergebnisse sind unveraenderlich.
- Jede schreibende Operation sperrt denselben Run. Runtime-Task, Background-Job, Outbox, Assignment, Planning-Job, Resultat, Requirements und Zustandswechsel werden je Operation in genau einer PostgreSQL-Transaktion geschrieben.
- Bestehende Agent-Job- und Assignment-Logik wird ueber kleine transaktionsfaehige Helfer wiederverwendet; ihre bisherigen oeffentlichen Transaktionsgrenzen bleiben kompatibel.
- Der vorhandene Fake-Runtime-Job muss technisch erfolgreich und persistent abgeschlossen sein. `PASS`, `PASS_WITH_REQUIREMENTS` und `BLOCK` sind synthetische, typisierte Planning-Ergebnisse, keine Erweiterung oder Umdeutung realer Runtime- oder Rechtssemantik.
- Fehlende erwartete aktive Agenten werden als `NO_ACTIVE_AGENT_VERSION` fail-closed persistiert. Unbekannte Datenbank- oder Queuefehler rollen vollstaendig zurueck und werden nicht als fachlicher Block kaschiert.

### Ausdruecklich ausgeschlossen

EXECUTOR-, QA- und allgemeine Reviewer-Ausfuehrung im Produkt, Softwareerzeugung, echte Codex-/OpenAI-Aufrufe, Agent-zu-Agent-Chat, automatische Reparaturzyklen, GitHub-Schreibzugriffe, Branches oder Pull Requests, Weboberflaeche, oeffentliche HTTP-API, automatische Projektausfuehrung, `REAL_RUNTIME_HARDENING`, Completion-ID-Hardening, echte anwaltliche Entscheidungen, Deployment und Production.

Production deployment bleibt `DISABLED`. GitHub-Integration und automatische Projektausfuehrung bleiben deaktiviert. Spaetere Release-, Real-Runtime-, Provider-, Counsel- und Production-Gates erweitern diesen `DEVELOPMENT_ONLY`-Task nicht.

### Pflichtpruefungen

Die Gates werden ohne parallele Root-Testlaeufe sequenziell ausgefuehrt:

1. Orchestrator-Unit-Tests
2. PostgreSQL-Integrationstests ohne Skips
3. Agent-Registry-Tests
4. Agent-Assignment-Tests
5. Workflow-Engine-Tests
6. Worker-/Fake-Runtime-Tests
7. vollstaendige serielle Root-Test-Suite
8. Lint
9. Typecheck
10. Build
11. `git diff --check`

Danach pruefen QA, allgemeiner Reviewer, Security und Legal-DE/EU denselben eingefrorenen Stand read-only. Legal-DE/EU prueft ausschliesslich BLOCK-Semantik, Requirements-Persistenz, Development-Disclaimer und Datenminimierung.

## Implementierungsplan

1. Planning-Domaenentypen, Eingabevalidierung und monotone Zustandsregeln in der bestehenden Workflow Engine ergaenzen.
2. Migration 013 mit minimalem Planning-Datenmodell, Constraints, Triggern, RLS und unveraenderlichen Entscheidungen anlegen.
3. Agent-Job- und Assignment-Erzeugung transaktionsfaehig wiederverwendbar machen und das PostgreSQL-Planning-Repository implementieren.
4. Unit- und PostgreSQL-Integrationstests fuer Ablauf, Fehlerfaelle, Parallelitaet, Idempotenz, Restart und Rollback ergaenzen.
5. Writer-Freeze herstellen, Pflichtgates sequenziell ausfuehren und den fixierten Stand read-only reviewen.

## Ausfuehrungs- und Abschlussnachweise

### Ergebnis

- **Abschlussstatus:** `PASSED`
- **Freigabe:** `DEVELOPMENT_ONLY`
- **Writer-Freeze:** Reparaturdurchlauf 1/1 abgeschlossen; danach keine Anwendungscode-, Migrations- oder Testaenderung
- **Offene Findings im Task-Scope:** keine
- **GitHub, automatische Projektausfuehrung und Production:** weiterhin deaktiviert
- **Commit, Push, Pull Request, Merge oder Deployment:** nicht ausgefuehrt

Der Planning-Orchestrator ist eine spezialisierte ProcessInstance-Erweiterung der vorhandenen Workflow-Infrastruktur. Er erzeugt keine Software und keinen EXECUTOR-Job. `READY_FOR_IMPLEMENTATION` ist ausschliesslich der persistente Zustand eines konkret freigegebenen Planning-Runs, keine Release-Candidate- oder Production-Freigabe.

### Planning-Ablauf

1. `startPlanning(projectId, projectRevision, requestedBy)` linearisiert parallele Starts ueber einen projekt- und revisionsgebundenen Advisory-Lock. Der eindeutige Run beginnt in `PLANNING` und erhaelt genau einen PLANNER-Runtime-Job mit unveraenderlichem Agent-Assignment.
2. Ein an Job, Run, Projekt und Revision gebundenes, technisch erfolgreiches Fake-Runtime-Ergebnis wird als PLANNER-`PASS` persistent referenziert. In derselben Transaktion entsteht genau ein ARCHITECT-Job; der Run wechselt zu `ARCHITECTURE_REVIEW`.
3. Ein entsprechendes ARCHITECT-`PASS` referenziert den Architekturstand und erzeugt SECURITY und LEGAL_DE_EU atomar. Beide Jobs tragen dieselbe Revision und dieselbe `architectureJobId`; der Run wechselt zu `SECURITY_LEGAL_REVIEW`.
4. SECURITY und LEGAL_DE_EU koennen parallel `PASS`, `PASS_WITH_REQUIREMENTS` oder `BLOCK` melden. Der erste erfolgreiche Reviewabschluss allein oeffnet den Owner-Checkpoint nicht. Jeder `BLOCK` setzt terminal `BLOCKED`.
5. Erst zwei erfolgreiche Reviews setzen `WAITING_FOR_OWNER_APPROVAL`. `PASS_WITH_REQUIREMENTS` ist dabei nur fuer `DEVELOPMENT_ONLY` erfolgreich; der vollstaendige minimierte Requirement-Satz wird atomar mit dem Ergebnis versiegelt.
6. `recordOwnerDecision(..., "APPROVE", ...)` speichert Owner, Datenbankzeitpunkt, Grundreferenz und exakt die Run-Revision und setzt `READY_FOR_IMPLEMENTATION`. `REJECT` setzt `REJECTED`. Beide Entscheidungen sind unveraenderlich und erzeugen keine Folgejobs.

### Zustaende und Uebergaenge

| Ausgang | Erlaubtes Ereignis | Ziel |
| --- | --- | --- |
| `PLANNING` | PLANNER erfolgreich und ARCHITECT autorisiert | `ARCHITECTURE_REVIEW` |
| `PLANNING` | PLANNER-Zuweisung fehlt oder ist mehrdeutig | `BLOCKED` |
| `ARCHITECTURE_REVIEW` | ARCHITECT erfolgreich und beide Reviews atomar autorisiert | `SECURITY_LEGAL_REVIEW` |
| `ARCHITECTURE_REVIEW` | ARCHITECT- oder Review-Zuweisung fehlt/ist mehrdeutig | `BLOCKED` |
| `SECURITY_LEGAL_REVIEW` | ein Review `BLOCK` | `BLOCKED` |
| `SECURITY_LEGAL_REVIEW` | beide Reviews `PASS` oder `PASS_WITH_REQUIREMENTS` | `WAITING_FOR_OWNER_APPROVAL` |
| `WAITING_FOR_OWNER_APPROVAL` | Owner `APPROVE` | `READY_FOR_IMPLEMENTATION` |
| `WAITING_FOR_OWNER_APPROVAL` | Owner `REJECT` | `REJECTED` |

Rueckwaerts- und Seitwaertsuebergaenge sind nicht erlaubt. `BLOCKED`, `REJECTED` und `READY_FOR_IMPLEMENTATION` sind terminal. Ein identischer Event-Replay ist ein No-op; ein widerspruechlicher Replay oder ein Event aus falscher Revision beziehungsweise falschem Zustand wird abgewiesen.

### Typisierte Operationen

| Operation | Persistente Wirkung |
| --- | --- |
| `startPlanning` | Eindeutigen Run und gegebenenfalls genau einen PLANNER-Job anlegen; fehlenden Agenten fail-closed speichern |
| `handleJobResult` | Fake-Runtime-`SUCCESS`, Artefakt, Projekt, Revision, Run und Job pruefen; Ergebnis/Requirements und autorisierten Folgeschritt atomar schreiben |
| `recordOwnerDecision` | Einmalige Owner-Entscheidung und terminalen Zielzustand atomar schreiben |
| `getPlanningStatus` | Projektgebundenen Run inklusive Block- oder Owner-Metadaten lesen |
| `listPlanningJobs` | Unter Run-Share-Lock einen konsistenten Snapshot aus Jobs, Agent-Snapshots, Ergebnissen und Requirements lesen |
| `resumePlanning` | Persistenten Zustand sperren, nur bereits autorisierte fehlende Rollenjobs sicherstellen und terminale Runs unveraendert lassen |

Der produktive Persistenzpfad wird durch `PostgresDatabase.createPlanningOrchestrator(capability)` erzeugt. Jede Operation verifiziert Capability, Operation, Projekt und Subject; `requestedBy` und `decidedBy` muessen dem verifizierten Subject entsprechen. Erst danach wird ein einmaliger Projektkontext ausgegeben und innerhalb der PostgreSQL-Transaktion konsumiert. Die direkte Migrator-Variante ist hart auf `_test`-Datenbanken und `builder_migrator` begrenzt.

### Datenmodell und Migration 013

| Tabelle | Zweck und zentrale Sicherungen |
| --- | --- |
| `planning_runs` | Eindeutig je `(project_id, project_revision)`; INSERT nur in `PLANNING`; monotone Trigger-Uebergaenge; Block-Metadaten konsistent; terminal unveraenderlich |
| `planning_jobs` | Genau eine Rolle je Run; eindeutige Background-, Runtime- und Result-Referenzen; Revision-FK; Assignment, Background-Job, Runtime-Run, Runtime-Rolle und `ASSIGNED`-Status gemeinsam validiert; Ergebnis bei INSERT verboten und nach Annahme unveraenderlich |
| `planning_review_requirements` | Nur strukturierter Code plus opake Referenz; vor Ergebnis unter Parent-Lock gestaged; deferred ausschliesslich an dasselbe `PASS_WITH_REQUIREMENTS` gebunden; danach kein INSERT, UPDATE oder DELETE |
| `planning_owner_decisions` | Eine Entscheidung je Run; nur aus `WAITING_FOR_OWNER_APPROVAL`; APPROVE muss exakt die Run-Revision tragen; append-only |

Alle vier Tabellen haben `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` und projektgebundene Policies. Runtime-Task, Runtime-Run, Background-Job, Outbox-Events, konkretes Agent-Assignment, Planning-Job, Ergebnis, Requirements und Zustandswechsel teilen jeweils eine PostgreSQL-Transaktion. Der vorhandene Agent-Job- und Agent-Assignment-Code stellt dafuer sessiongebundene Helfer bereit; seine bisherigen oeffentlichen Transaktionspfade bleiben kompatibel.

### Parallelitaets-, Idempotenz- und Rollback-Nachweise

| Nachweis | Mechanismus und Testresultat |
| --- | --- |
| Zwei parallele Starts | Advisory-Lock plus `UNIQUE(project_id, project_revision)`; ein Run und ein PLANNER-Job |
| Doppelte PLANNER-Ergebnisse | Run-`FOR UPDATE`, immutable Resultat und Rollen-Unique; ein ARCHITECT-Job |
| Doppelte ARCHITECT-Ergebnisse | Gleiche Serialisierung; genau ein SECURITY- und ein LEGAL_DE_EU-Job |
| SECURITY und LEGAL parallel | Gemeinsamer Run-Lock; erster Erfolg bleibt Review, zweiter Erfolg oeffnet Owner-Waiting |
| Owner gegen BLOCK | Owner nur nach zwei bereits unveraenderlich erfolgreichen Reviews; BLOCK und Approval koennen nicht beide gewinnen |
| Restart und Resume | Neue Repository-Instanz liest denselben persistenten Run; vorhandene Jobs werden nicht dupliziert; terminale Runs sind No-op |
| Transaktionsfehler | Testlokaler Failpoint nach Teiloperation; Run, Runtime-Task, Background-Job, Assignment und Outbox bleiben vollstaendig aus |
| Listen-Snapshot | Share-Lock auf demselben Run serialisiert zwei Leseabfragen gegen Ergebnis-/Requirement-Commits; keine zerrissene Sicht |
| Registry-Wechsel | Assignment speichert `agentId`, `agentKey` und `agentVersion`; spaetere ACTIVE-Version veraendert bestehende Jobs nicht |
| Direkte SQL-Bypaesse | Initialer Terminal-Run, vorbefuelltes Jobresultat und inkonsistente Assignment-/Runtime-Bindung werden durch Trigger abgewiesen |

### Finale Test- und Gate-Ergebnisse

Alle Datenbanklaeufe erfolgten sequenziell gegen die lokale PostgreSQL-Testdatenbank. Es gab keine parallelen Root-Resets und keine Skips.

| Gate | Ergebnis |
| --- | --- |
| Orchestrator-Unit-Tests | 1 Datei, 4/4 Tests bestanden |
| Planning-PostgreSQL-/Capability-/RLS-Integration | 1 Datei, 16/16 Tests bestanden, keine Skips |
| Agent Registry | 2 Dateien, 19/19 Tests bestanden |
| Agent Assignment | 2 Dateien, 14/14 Tests bestanden |
| Workflow Engine | 3 Dateien, 82/82 Tests bestanden |
| Worker und Fake Runtime | 5 Dateien, 54/54 Tests bestanden |
| Vollstaendige serielle Root-Suite | 19 Dateien, 267/267 Tests bestanden |
| Root Lint | bestanden |
| Root Typecheck | alle Workspaces bestanden |
| Root Build | alle Workspaces einschliesslich Next.js bestanden |
| `git diff --check` | bestanden; nur nicht-blockierende LF/CRLF-Hinweise von Git |

### Reparaturdurchlauf und finale Reviews

Der einzige erlaubte Reparaturdurchlauf 1/1 wurde nach dem ersten Review-Freeze verbraucht. Er schloss ausschliesslich diese Scope-Findings:

- Capability-/RLS- und Actor-Bindung des neuen Repository-Pfads;
- INSERT-Guards fuer initiale Run-/Jobzustaende und die Assignment-/Background-/Runtime-/Rollenbindung;
- atomar geschlossener, nachtraeglich nicht appendierbarer Requirement-Satz;
- konsistenter `listPlanningJobs`-Snapshot unter Parallelitaet.

Danach wurden alle Pflichtgates vollstaendig wiederholt und alle Reviews auf dem neuen SHA-256-Freeze erneut ausgefuehrt.

| Review | Finales Votum | Offene Findings |
| --- | --- | --- |
| QA | `PASS` | keine |
| Allgemeines Code-Review | `PASS` | keine |
| Security | `PASS - DEVELOPMENT_ONLY` | keine |
| Legal-DE/EU, begrenzter Scope | `PASS` | keine |

### Finaler Anwendungscode-Freeze

```text
2b247a0d9107a19bd903a5a3d04c10d96047f5ab7c42095aebeb425ef5c253dd  packages/database/migrations/013_orchestrator_planning_mvp.sql
7bdf7c7f328b48e0a1eba373326b4d05d9209d9ea9ce399ab5ab88d2a618a9cb  packages/database/src/planning-orchestrator-repository.ts
cc83440a9eb5931cae1a5757f8de6f043c802fac2839f2d3403760da43bd5111  packages/database/src/planning-orchestrator-repository.integration.test.ts
3d92f33332b42c22ae2e2b1a126389bd240445df9bdf4d7e46f92e6af7f317d4  packages/database/src/agent-job-repository.ts
d941fac9c1b47fc86d24830d639567924e96f9734db5779eb7024fbb71da2511  packages/database/src/agent-assignment.ts
674946a854d84c14529d535aff8a281e0f5900dc4b5d3257612541e720c3347e  packages/database/src/index.ts
568e2cd8b8910e62865e9687c97a7cb5a559526665e7a3cd4136de0f4657aca5  packages/database/src/schema.test.ts
f53ed1653f6ada62702223c7aba53630d693f18d5f723dd1b81a8c3c3b066b7e  packages/workflow-engine/src/planning-orchestrator.ts
0c28818508f70b845e3302474ae6ccdf1bb7ad32890b87c6ac1d60f4a0e4ba38  packages/workflow-engine/src/planning-orchestrator.test.ts
ec19207a434ac1dc40311fc19492798a1d1e7523b8feca95e998ae5455456e23  packages/workflow-engine/src/index.ts
```

### Verschobene Aufgaben

Unveraendert spaeteren Tasks beziehungsweise Gates zugeordnet sind: EXECUTOR-, QA- und allgemeine Reviewer-Ausfuehrung im Produkt, echte Codex-/OpenAI-Runtime, Agent-zu-Agent-Chat, Softwareerzeugung, GitHub-Schreibzugriffe und automatisches Merge, automatische Projektausfuehrung, Web-/HTTP-Oberflaeche, `REAL_RUNTIME_HARDENING`, Completion-ID-Hardening, reale Counsel-Qualifikation, Provider-/Credential-Nachweise, Release Candidate, Deployment und Production.

Diese Punkte sind nicht bestanden, wurden nicht uebersprungen und blockieren den technisch isolierten `DEVELOPMENT_ONLY`-Task nicht. Production deployment bleibt fuer Builder V1 `DISABLED`.

### Development-Disclaimer

Der Orchestrator verarbeitet in diesem Meilenstein ausschliesslich synthetische Testdaten und technisch erfolgreiche Ergebnisse der vorhandenen Fake Runtime. Er startet keinen Codex-Prozess, schreibt keine Software, verwendet keine Kundendaten und greift nicht auf GitHub oder Production zu. `LEGAL_DE_EU` bezeichnet ausschliesslich einen synthetischen technischen Reviewstatus fuer den Development-Workflow; weder `PASS` noch `PASS_WITH_REQUIREMENTS` ist Rechtsberatung oder eine anwaltliche Freigabe.

## Exakter Erfolgsstatus

`ORCHESTRATOR PLANNING MVP BESTANDEN  DEVELOPMENT ONLY`
