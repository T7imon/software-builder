# WORKER-CONCURRENCY-HARDENING-01

Status: `ACTIVE - DEVELOPMENT ONLY`

Dieser Abschnitt bis einschliesslich `Execution contract` ist der unveraenderliche Arbeitsvertrag fuer genau den neuen Task `WORKER-CONCURRENCY-HARDENING-01`. Er ist keine Fortsetzung der ausgeschoepften Reparaturschleife aus `WORKER-FAKE-RUNTIME-01`. Er autorisiert keine Produktion, kein Deployment, keine automatische Projektausfuehrung, kein GitHub, kein Codex, keine UI-Aenderung und keine echten Kunden- oder Personendaten. Production deployment bleibt `DISABLED`.

## Scope

Der Task behebt ausschliesslich:

1. den nichtdeterministischen Lease-Loss-/Worker-Reclaim-Pfad, einschliesslich autoritativer Zeit, atomarer Owner-/Generation-/Fence-Pruefung und deterministischer Testsynchronisation;
2. die Late-Cancel-Race, einschliesslich atomarer Cancel-Prioritaet, idempotenter Cancel-Annahme, sicherem Verwerfen spaeter Completion, Audit und Recovery verlassener `CANCELLING`-Jobs.

Der kollisionsanfaellige Completion-ID-Hash und jede Aenderung am Completion-ID-Algorithmus sind ausdruecklich ausgeschlossen und bleiben ein separater nachfolgender Blocker. Ebenfalls ausgeschlossen sind Codex-, GitHub-, UI- und Deployment-Aenderungen sowie rechtliche Semantik.

Erlaubte Anwendungscode-Komponenten sind ausschliesslich `apps/worker/src/job-processor.ts`, `apps/worker/src/worker-loop.ts`, `apps/worker/src/postgres-runtime-store.ts`, `packages/database/src/agent-job-repository.ts`, eine gegebenenfalls notwendige additive Migration `packages/database/migrations/006_worker_concurrency_hardening.sql`, `packages/agent-runtime/src/runtime.ts` und `packages/agent-runtime/src/fake-runtime.ts`. Erlaubte Testdateien sind die zugehoerigen Tests unter `apps/worker/src/**`, `packages/database/src/database.integration.test.ts`, `packages/agent-runtime/src/runtime.test.ts` und nur bei fuer den Scope erforderlicher Gate-Evidenz die bestehenden Tests unter `packages/workflow-engine/src/**`. Notwendige Exporte in den jeweiligen `index.ts`-Dateien sowie ausschliesslich mechanisch notwendige Workspace-Manifeste und Lockfile-Aenderungen sind erlaubt. Der Hauptagent darf nur diese Vertragsdatei und `PROJECT_STATE.md` dokumentieren.

## Acceptance criteria

1. Die Ursache des bisherigen nichtdeterministischen Lease-Loss-Tests ist als Implementierungs-Race, unkontrollierte Uhr oder fehlerhafte Testsynchronisation belegt; die Loesung verwendet weder vergroesserte willkuerliche Sleeps/Timeouts noch Test-Retries.
2. PostgreSQL trifft Lease-, Reclaim-, Cancellation-, Recovery- und CAS-Entscheidungen innerhalb der jeweiligen atomaren Transaktion mit autoritativer Datenbankzeit. Tests verwenden kontrollierte Uhr beziehungsweise autoritative Zeit und explizite Synchronisationspunkte.
3. Lease Owner, Claim-Generation und Fencing Token werden bei jeder Mutation atomar geprueft. Nach Lease-Verlust kann der alte Worker keine Mutation committen, auch wenn sein Ergebnis lokal bereits berechnet ist. Ein neuer Worker arbeitet erst nach gueltigem Reclaim.
4. Zwei Worker an der Reclaim-Grenze koennen nicht beide wirksam mutieren. CAS-Verlust rollt Jobzustand, Runtimezustand, Ergebnisreferenz, Inbox, Audit und Outbox atomar zurueck.
5. Ein gueltig angenommener Cancel besitzt Vorrang vor jeder spaeter eintreffenden Completion. Completion kann `CANCELLING` oder `CANCELLED` nicht zu `COMPLETED`/`SUCCEEDED` ueberschreiben; ein spaetes Ergebnis wird verworfen oder nachvollziehbar als unwirksam auditiert.
6. Cancel ist idempotent, erzeugt keinen Teilzustand und fuehrt verlaesslich nach `CANCELLED`. Jeder wirksame oder abgelehnte Uebergang besitzt ein nachvollziehbares `AuditEvent`.
7. Ein Worker-Absturz waehrend `CANCELLING` und ein verlassener `CANCELLING`-Job werden durch Reclaim/Recovery terminal nach `CANCELLED` gebracht und bleiben nicht dauerhaft haengen.
8. Deterministische Tests decken Lease-Ablauf vor Mutation, Lease-Ablauf waehrend berechneter Arbeit, alten Worker nach Reclaim, zwei Worker an der Reclaim-Grenze, Cancel vor Ergebnisberechnung, Cancel nach Berechnung vor Completion-Commit, gleichzeitigen Cancel/Completion, wiederholten Cancel, Worker-Absturz waehrend `CANCELLING`, Recovery eines verlassenen `CANCELLING`-Jobs, spaete Completion nach `CANCELLED` und atomaren Rollback bei CAS-Verlust ab.
9. Der gezielte Lease-/Cancel-Konkurrenztest wird mindestens 30-mal einzeln ausgefuehrt; jeder Lauf besteht ohne Retry-Mechanismus oder versteckte Fehlertoleranz.
10. Runtime-Tests, Worker-Tests, PostgreSQL-Integrationstests ohne Skips, Workflow-Engine-Tests, Root-Tests, Prozessneustarttest, Mehrprozess-CAS-/Fencing-Test, Lint, Typecheck, Build und `git diff --check` bestehen.
11. Der Implementierungsstand wird eindeutig fixiert und danach read-only durch QA, Reviewer und Security ausschliesslich fuer Lease, Reclaim, Cancellation, Recovery und CAS geprueft. Legal-Review ist fuer diesen Task nicht erforderlich.
12. Der Completion-ID-Algorithmus bleibt unveraendert. Sein bestehendes Kollisionsfinding bleibt als separater nachfolgender Blocker dokumentiert und erweitert diesen Task nicht.

## Execution contract

Genau eine Anwendungscode-Writer-Identitaet ist zulaessig: `worker_concurrency_executor`. Ein Writer-Wechsel ist verboten. QA, Reviewer und Security arbeiten erst nach beendetem Writer-Zugriff read-only auf demselben fixierten Stand. Nach der Erstimplementierung ist maximal ein automatischer Reparaturdurchlauf durch dieselbe Writer-Identitaet zulaessig; danach wird bei offenem Akzeptanzkriterium strukturiert blockiert. Das maximale Zeitbudget ist eine lokale Arbeitssitzung von acht Stunden.

Zulaessige Abschlussstatus sind `PASSED`, `BLOCKED` und `DEFERRED_TO_LATER_GATE`. Erfolg wird exakt als `WORKER CONCURRENCY HARDENING BESTANDEN  DEVELOPMENT ONLY` dokumentiert. Jeder andere Abschluss wird als `WORKER CONCURRENCY HARDENING NICHT BESTANDEN` dokumentiert und enthaelt geprueften Stand, Pflichtpruefungen, offene Kriterien, reproduzierbare Evidenz, betroffenen Scope, Reparaturordinal und erforderliche manuelle Entscheidung. Production deployment bleibt `DISABLED`.

## Final verification outcome

Status: `BLOCKED - DEVELOPMENT ONLY`.

Abschlusssatz: `WORKER CONCURRENCY HARDENING NICHT BESTANDEN`.

Gepruefter Stand: HEAD `f9b51cd23992103b28b31f84cc4951cc1bb1ce2d` plus Writer-Diff-Hash `9272a799637486bd335925a92fe799c196274c4e` fuer die fuenf geaenderten Anwendungscode-/Testdateien und SHA-256 `69D2281C08FCC7649AF7B42EC59C6DED3AA8E3513D526FF758724F69F372D302` fuer `006_worker_concurrency_hardening.sql`. Genau die festgelegte Writer-Identitaet `worker_concurrency_executor` schrieb Anwendungscode. Der Writer-Zugriff ist beendet. Repair ordinal `1/1` ist verbraucht. Completion-ID-Algorithmus, Codex, GitHub, UI und Deployment blieben unveraendert. Production deployment bleibt `DISABLED`.

### Diagnose und Implementierung

Der alte Lease-Loss-Test war nicht deterministisch, weil er nur auf `CLAIMED` synchronisierte und danach reale Runtime-, Heartbeat- und Prozess-Timer an einer manuell verschobenen Lease-Grenze gegeneinander laufen liess. Die konkrete Flake-Ursache war fehlerhafte Testsynchronisation zusammen mit unkontrollierter Wallclock, nicht nachgewiesene doppelte DB-Completion. Die Implementierung ersetzte diesen Pfad teilweise durch kontrollierte Unit-Barrieren und direkte autoritative DB-Grenzen, band Mutationen expliziter an Owner, Claim und Fence, erweiterte Cancel-Audittypen und fuegte atomare Late-Completion-/Cancel- und CANCELLING-Reclaim-Pfade hinzu.

### Pflichtpruefungen

Erstimplementierung vor Repair: Runtime `11/11`, Worker `17/17`, betroffene Typechecks, Lints und Builds sowie `git diff --check` bestanden. PostgreSQL-18-Integration bestand nur `6/19`; Primaerfehler war PostgreSQL `42P08` im neuen `claimNext`-DB-Zeitparameter. Der einzige Repair korrigierte ausschliesslich diesen belegten Typfehler mit `$7::timestamptz`.

Nach Repair bestanden Database- und Worker-Build. PostgreSQL-18-Integration bestand nur `14/19`; `5/19` schlugen fehl. Primaerfehler ist PostgreSQL `42804` in `packages/database/src/agent-job-repository.ts` im `scheduleRetry`-Ausdruck fuer `available_at`. Prozess-, Claim- und Recovery-Fehler danach waren Kaskaden eines liegengebliebenen Retry-Jobs. Wegen Fail-fast wurden Workflow-Engine-Tests, Root-Tests, die vollstaendige abschliessende Lint-/Typecheck-/Build-Suite, Prozessneustart-Gate, vollstaendiges Mehrprozess-Gate und die geforderten 30 Einzellaeufe nicht mehr vollstaendig ausgefuehrt. Es gibt keine `30/30`-Evidenz und keinen Test-Retry.

Unabhaengige QA-Evidenz auf dem fixierten Stand: Worker `17/17` und Runtime `11/11` bestanden; der gezielte PostgreSQL-Retry-Test reproduzierte `42804`; eine persistente Late-Cancel-Probe reproduzierte `CANCEL_REJECTED` gefolgt von `SUCCEEDED`; `git diff --check` bestand. Der Versuch einer unabhaengigen 30er-Sequenz lieferte keinen gueltigen `30/30`-Nachweis, weil bereits der erste Suite-Teardown durch weitere aktive lokale Test-DB-Verbindungen scheiterte. Reviewer bestaetigte zusaetzlich die gezielten Worker-Unit-Tests `6/6`.

### Blockierende Findings

1. `AC2/AC10 - BLOCK`: `scheduleRetry` setzt `available_at=$6+interval`, ohne `$6` als `timestamptz` zu typisieren. PostgreSQL 18 meldet reproduzierbar `42804` (`available_at` ist `timestamptz`, Ausdruck ist `interval`). Betroffener Scope: autoritative DB-Zeit, Retry-Mutation und PostgreSQL-Pflichtgate.
2. `AC2/AC3/AC4/AC8 - BLOCK`: `databaseNow()` wird vor dem potenziell wartenden `FOR UPDATE`-Lock gesampelt. Laeuft die Lease waehrend der Lock-Wartezeit ab, kann die anschliessende Guard-Pruefung den alten Zeitpunkt verwenden und einem stale Worker noch Heartbeat oder Mutation erlauben. Betroffener Scope: Lease-Ablauf vor Mutation, stale Worker, Reclaim-Grenze und CAS.
3. `AC5/AC6/AC8 - BLOCK`: Der reale persistente Cancel-nach-Berechnung-Pfad verliert. `FakeAgentRuntime` persistiert `SUCCEEDED` vor dem Job-Completion-Commit; `requestCancel` lehnt wegen des terminalen Runtime-Zustands ab, obwohl der Job noch `CLAIMED` und ohne committed Ergebnis ist. QA reproduzierte `CANCEL_REJECTED`, danach `SUCCEEDED`. Der neue Repository-Test nutzt dagegen einen store-losen Fake und deckt diese Race nicht ab.
4. `AC6/AC7 - BLOCK`: Fehler aus `cancelRun` werden im Execution Control verschluckt; der Processor kann danach ein synthetisches `CANCELLED`-Ergebnis committen, obwohl der Runtime-Abbruch nicht bestaetigt ist. Worker-Crash waehrend `CANCELLING` und Recovery durch einen echten Worker sind nicht belegt; der neue Test prueft nur Repository-Reclaim und manuelles `confirmCancelled`.
5. `AC4/AC6/AC8/AC9 - BLOCK`: Der gleichzeitige Cancel-/Completion-Test kontrolliert keinen Linearisationpunkt und akzeptiert beide moeglichen Ergebnisse. Atomarer Rollback speziell bei CAS-Verlust ueber Job, Runtime, Resultat, Inbox, Audit und Outbox ist nicht vollstaendig belegt. Abgelehnte stale/late Mutationen erzeugen zudem kein dauerhaftes `LEASE_LOST`- beziehungsweise Late-Discard-Audit, wenn die Guard-Transaktion rollt.
6. `AC10 - BLOCK`: Nicht alle Pflichtpruefungen bestanden oder wurden nach Repair ausgefuehrt; insbesondere fehlen PostgreSQL ohne Fehler, Root, Workflow, Prozessneustart, die vollstaendige Mehrprozess-Evidenz und `30/30` einzelne Race-Laeufe.

Read-only-Entscheidungen auf demselben Stand: QA `BLOCK`, Reviewer `BLOCK`, Security `BLOCK - DEVELOPMENT_ONLY`. Legal-Review war laut Owner-Vertrag nicht erforderlich. Die Reviews bestaetigten als Teilstaerken gemeinsame Owner-/Claim-/Fence-Guards, transaktionale Resultat-/Inbox-/Audit-/Outbox-Completion, einen einzelnen Reclaim-Gewinner, unveraenderte Completion-ID-Logik und secret-freie neue Audit-Metadaten. Diese Teilstaerken heben die Blocks nicht auf.

### Separater Folgeblocker

Der kollisionsanfaellige Completion-ID-Hash aus `WORKER-FAKE-RUNTIME-01` bleibt unveraendert und ausserhalb dieses Tasks. Vorgeschlagenes Ziel ist ein eigener, vom Owner autorisierter Entwicklungs-Task mit separatem unveraenderlichem Vertrag und eigener Freigabe; er wurde hier weder repariert noch erneut zum Scope gemacht.

### Erforderliche manuelle Entscheidung

Der Erfolgssatz ist unzulaessig. Wegen Repair ordinal `1/1` darf dieser Task nicht automatisch weiter repariert werden. Der Owner muss entweder den blockierten Stand beibehalten beziehungsweise verwerfen oder einen neuen, eng begrenzten Task mit neuem unveraenderlichem Vertrag und neuer festgelegter Writer-Identitaet autorisieren. Ein Folgetask muss mindestens PostgreSQL-Typisierung, DB-Zeit am Lock-/Mutations-Linearisationpunkt, persistente Late-Cancel-Prioritaet, bestaetigten Runtime-Abbruch/Recovery, stale Audit und deterministische CAS-/30x-Evidenz abdecken und danach alle Pflichtgates sowie QA, Reviewer und Security auf einem neu fixierten Stand wiederholen.
