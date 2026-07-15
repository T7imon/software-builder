# WORKER-FAKE-RUNTIME-01

Status: `ACTIVE - DEVELOPMENT ONLY`

Dieser Abschnitt bis einschliesslich `Execution contract` ist der unveraenderliche Arbeitsvertrag fuer genau den Task `WORKER-FAKE-RUNTIME-01`. Er autorisiert keine Produktion, kein Deployment, keine automatische Projektausfuehrung, kein GitHub, kein Workspace-Provisioning, kein Codex SDK, keine OpenAI-Verbindung, keine Provider-Credentials und keine echten Kunden- oder Personendaten.

## Scope

- Eine `AgentRuntime`-Schnittstelle mit exakt `startRun`, `continueRun`, `cancelRun` und `getRunStatus`.
- Versionierte, zur Laufzeit fail-closed validierte Schemas fuer `AgentTask`, `AgentResult`, `Finding`, `Artifact`, `Decision` und `Progress`.
- Eine deterministische `FakeAgentRuntime` fuer Erfolg, Fehler, Timeout, bestaetigten Abbruch, ungueltige Ausgabe, Infrastruktur-Retry, Security `BLOCK`, Legal `COUNSEL_REQUIRED` und geordnete Fortschrittsereignisse.
- Ein persistenter PostgreSQL Background Worker mit atomarem Claim, Heartbeats, Leases, monotonen Fencing Tokens, Reclaim verlassener Jobs, Retry-Limit, Abbruch, Idempotenz, Restart-Recovery, Audit, Inbox und Outbox.
- Ausschliesslich synthetische Testdaten und lokale Fake-Ausfuehrung auf der Freigabestufe `DEVELOPMENT_ONLY`.

Erlaubte Komponenten sind `packages/agent-runtime/**`, `apps/worker/**`, `packages/database/**` einschliesslich genau einer additiven Migration und gezielter Persistenztests, `packages/core/**` nur fuer gemeinsam benoetigte IDs oder Schema-Basistypen, `packages/workflow-engine/**` nur fuer eine minimale Job-/Lifecycle-Anbindung, notwendige Workspace-Manifeste und Lockfile sowie `docs/architecture/worker-fake-runtime-01.md`, `docs/database.md` und `PROJECT_STATE.md`.

Die bestehende bestandene Workflow-Persistenz ist keine allgemeine Reparaturflaeche. Worker duerfen kein ad-hoc zustandsaenderndes SQL verwenden; Persistenz erfolgt ueber eine schmale Repository-Grenze. Fake Security- und Legal-Ergebnisse sind Simulationen, keine vertrauenswuerdigen Attestierungen und duerfen keine Holds raeumen.

## Acceptance criteria

1. Alle sechs strukturierten Schemas besitzen eine explizite `schemaVersion`, geschlossene Enums und Laufzeitvalidatoren. Fehlende, zusaetzliche oder typfalsche Pflichtfelder sowie unzulaessige Zustandskombinationen werden fail-closed abgelehnt.
2. Das Runtime-Interface exportiert die vier geforderten Lifecycle-Methoden. Start, Fortsetzung, Status und Abbruch sind idempotent und an Projekt, Task, Attempt und Run gebunden.
3. Jeder Fake-Modus ist deterministisch reproduzierbar. Progress-Sequenzen sind streng monoton; terminale Runs erzeugen keine spaeteren Ereignisse.
4. Ungueltige Fake-Ausgabe wird niemals als Erfolg persistiert, sondern als Schemafehler mit Audit-Ereignis behandelt.
5. Retry ist ein Infrastruktur-Retry desselben Runs und Attempts, verbraucht keinen Reparaturordinal und endet spaetestens am konfigurierten Limit.
6. Security `BLOCK` und Legal `COUNSEL_REQUIRED` sind strukturierte Stop-Ergebnisse, werden nicht automatisch erneut versucht und raeumen keine Holds frei.
7. Jobs werden mit `FOR UPDATE SKIP LOCKED` oder gleichwertig atomar geclaimt. Zwei konkurrierende Worker koennen denselben Job nicht gleichzeitig wirksam verarbeiten.
8. Jede Claim-Generation erhaelt einen strikt hoeheren Fencing Token. Veralteter Owner, Claim, Token oder abgelaufene Lease kann weder Heartbeat, Ergebnis, Retry, Abbruch noch Abschluss committen.
9. Heartbeats verlaengern nur eine noch aktive eigene Lease. Abgelaufene oder verlassene Jobs koennen sicher uebernommen werden.
10. Inbox-Eindeutigkeit `(consumer_identity, message_id)` verhindert Replay-Doppelwirkungen. Jobzustand, Inbox, Ergebnisreferenz, Audit und Outbox committen atomar.
11. Ein Neustart nach Commit setzt denselben Job idempotent fort; ein Neustart vor Commit hinterlaesst keinen Teilzustand.
12. Abbruch wird erst nach bestaetigtem Runtime-Abbruch terminal. Lease-Verlust waehrend Abbruch oder Verarbeitung verhindert stale Completion.
13. Audit- und Queue-Daten enthalten nur erlaubte Metadaten und Referenzen, keine Secrets, Prompt- oder Artefaktkoerper, Kundendaten oder Legal-Rohtexte.
14. Tests decken mindestens Erfolg, Fehler, Timeout, Retry, Abbruch, Prozessneustart, zwei konkurrierende Worker, Lease-Verlust, Replay und ungueltiges Schema sowie Security `BLOCK`, Legal `COUNSEL_REQUIRED`, Progress-Reihenfolge, Retry-Limit und atomaren Rollback ab.
15. Betroffene Pakettests, PostgreSQL-Integrationstests ohne Skip, Root-Tests, Typecheck, Lint, Build und `git diff --check` bestehen.
16. Der Implementierungsstand wird eindeutig fixiert und anschliessend parallel read-only durch QA, Reviewer, Security und Legal DE geprueft. Nach der Erstimplementierung ist maximal ein automatischer Reparaturdurchlauf zulaessig.

## Execution contract

Genau eine Anwendungscode-Writer-Identitaet ist zulaessig: der fuer diesen Task eingesetzte `Executor`. Ein Writer-Wechsel ist verboten. Planner und Architect arbeiten vor der Implementierung read-only. Nach Writer-Handoff arbeiten QA, Reviewer, Security und Legal DE read-only auf demselben fixierten Stand. Das maximale Zeitbudget ist eine lokale Arbeitssitzung, begrenzt auf acht Stunden.

Zulaessige Abschlussstatus sind `PASSED`, `BLOCKED` und `DEFERRED_TO_LATER_GATE`. Erfolg wird exakt als `WORKER UND FAKE RUNTIME BESTANDEN  DEVELOPMENT ONLY` dokumentiert. Jeder andere Abschluss dokumentiert den geprueften Stand, Pflichtpruefungen, offene Kriterien und Findings, Zielmeilensteine sowie gegebenenfalls den verbrauchten Reparaturdurchlauf und die erforderliche manuelle Entscheidung. Production deployment bleibt `DISABLED`.

## Final verification outcome

Status: `BLOCKED - DEVELOPMENT ONLY`.

Gepruefter Stand: HEAD `6f743383ec89f912ac21af41d1eeb079f169d936` plus Working-Tree-Digest `c58e69cfb4b4632caecea71a10747dad8ea2de926f618206a3eb60e9097b3ecc` ueber 99 versionierte oder neue Dateien. Genau eine Anwendungscode-Writer-Identitaet, der Executor, implementierte den Task und den einzigen zulaessigen automatischen Reparaturdurchlauf. Repair ordinal `1/1` ist verbraucht; der Writer-Zugriff ist beendet.

Implementiert sind die vier `AgentRuntime`-Operationen, die sechs versionierten Runtime-Schemas, der deterministische Fake Runtime, die additive Migration `005_worker_fake_runtime.sql`, die schmale persistente Agent-Job-Grenze sowie ein explizit opt-in aktivierter, Fake-only und auf Loopback-`_test` beschraenkter Background Worker. Die Reparatur ergaenzte semantische Replay-Digests, Stop-Invarianten, periodische Heartbeats, In-flight-Cancel-Polling, persistente Runtime-Snapshots, Higher-Fence-Reconciliation, Completion-Replay und echten Transaktions-Rollback. Codex SDK, externe Provider, echte Daten, automatische Projektausfuehrung und Produktion bleiben ausgeschlossen.

Executor-Evidenz nach Repair: Root-Tests 135/135, PostgreSQL-18-Integration 15/15 ohne Skips, Runtime 11/11, Worker 17/17, Typecheck, Lint, Build und `git diff --check` bestanden. Die unabhaengige finale Verifikation bestand Typecheck, Lint, Build und `git diff --check`. Der vollstaendige Root-Lauf bestand jedoch nur 134/135: Der sicherheitskritische Test `fenced einen langsamen Worker nach Lease-Verlust waehrend ein zweiter uebernimmt` schlug in `packages/database/src/database.integration.test.ts` fehl. Eine unmittelbar folgende gezielte Wiederholung bestand, belegt damit aber zugleich ein nicht reproduzierbar gruenes Pflichtgate.

### Offene Scope-Findings

1. `AC-14/AC-15 - BLOCK`: Der Slow-Lease-Loss-/Second-Worker-Pflichtpfad ist nicht deterministisch und der vollstaendige finale Root-Test ist nicht gruen. Reproduzierbare Evidenz: unabhaengiger Lauf 134/135, Assertion am erwarteten `reclaim-fast`-Processing in `packages/database/src/database.integration.test.ts`; gezielter Rerun 1/1 bestanden. Betroffener Scope: Heartbeat, Lease-Verlust, Reclaim und konkurrierende Worker.
2. `AC-12/AC-14 - BLOCK`: Ein persistenter Cancel zwischen letztem Heartbeat-Poll und Runtime-Abschluss kann vom Processor nicht mehr gesehen werden. Normale Completion endet dann mit `CANCEL_CONFIRMATION_REQUIRED`, waehrend der persistierte Runtime-Snapshot bereits terminal `SUCCEEDED` sein kann. Der Job kann in `CANCELLING` verbleiben. Betroffener Scope: In-flight-Abbruch und bestaetigte Cancellation.
3. `AC-10/AC-11 - BLOCK`: Die Completion-Message-ID wird aus einem wiederholten 32-Bit-FNV-Hash erzeugt. Unterschiedliche Jobs koennen dieselbe ID erhalten; der semantische Divergenzschutz verhindert dann zwar Fremdwirkung, blockiert aber den zweiten Job dauerhaft als `COMPLETION_REPLAY_DIVERGED`. Betroffener Scope: Idempotenz, Replay, Inbox und Restart-Recovery.

Finale Read-only-Entscheidungen auf demselben Stand: QA `BLOCK`, Reviewer `BLOCK`, Security `BLOCK - DEVELOPMENT_ONLY`, Legal DE `PASS_WITH_REQUIREMENTS`. Legal bestaetigt den isolierten synthetischen Fake-Scope, hebt die technischen Blocks aber nicht auf.

### Erforderliche manuelle Entscheidung

Der Erfolgssatz `WORKER UND FAKE RUNTIME BESTANDEN  DEVELOPMENT ONLY` ist nicht zulaessig. Der Owner muss entweder diesen Task als `BLOCKED` belassen oder einen neuen, eng begrenzten Task mit neuem unveraenderlichem Arbeitsvertrag und neuer festgelegter Writer-Identitaet fuer Cancel-Linearisation, kollisionsfeste Completion-IDs und die deterministische Stabilisierung des Lease-Loss-Gates autorisieren. Danach muessen alle Pflichtpruefungen und die vier Read-only-Reviews auf einem neuen fixierten Digest erneut ausgefuehrt werden.

Production deployment bleibt `DISABLED`; diese Komponentenpruefung ist keine Release-Candidate- oder Produktionsfreigabe.

## Scope-Reset-Nachfolger `WORKER-FAKE-RUNTIME-MVP-SCOPE-RESET-01`

Owner-Entscheidung vom 2026-07-15: Der vorstehende historische Abschluss und seine damalige Bewertung gegen weitergehende Cancellation-/Produktionsmassstaebe bleiben unveraendert erhalten. Sie werden weder geloescht noch rueckwirkend als bestanden bezeichnet. Der neue, getrennte Dokumentations- und Freigabetask `WORKER-FAKE-RUNTIME-MVP-SCOPE-RESET-01` bewertet den aktuellen stabilen Stand ausschliesslich gegen den lokalen `DEVELOPMENT_ONLY`-Meilenstein `WORKER_FAKE_RUNTIME_MVP`.

Fuer diesen MVP bleiben der aktuelle vollstaendige Testlauf, der persistente atomare Pre-start-Cancel, fail-closed Cancellation, Retry/Restart sowie Lease-/Generation-/Fencing-Schutz bindende Gates. Der damalige flakige Lease-Loss-Test kann nur durch einen frischen vollstaendig gruenen Pflichtlauf geschlossen werden; er wird nicht aufgrund dieser Dokumentation als bestanden angenommen.

Reale RuntimeTerminationEvidence, kryptografische oder providergebundene Attestation, echte externe `WORKLOAD_NOT_CREATED`-Attestation, verteilte finale Reconciliation, Codex-Statusabfrage, der Crash zwischen externer Abfrage und Evidence-Commit, vollstaendige AT-15/16/17/19/22-Production-Evidenz, Completion-ID-Hardening, reale Worker-/Prozessidentitaet und Provider-/Credential-Widerruf bleiben offen. Sie sind zwingend und fail-closed dem spaeteren Meilenstein `REAL_RUNTIME_HARDENING` zugeordnet.

Der genehmigte Cancellation-Vertrag bleibt als Zielarchitektur in Kraft. Der Scope-Reset hebt ihn nicht auf, erlaubt keine echte Runtime und erzeugt keine Release-Candidate- oder Produktionsfreigabe. Massgeblich fuer den neuen Task sind Vertrag, Pruefnachweise, Reviews und Abschluss in `docs/architecture/worker-fake-runtime-mvp-scope-reset-01.md`.
