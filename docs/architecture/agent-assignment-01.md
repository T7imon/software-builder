# AGENT-ASSIGNMENT-01

Release level: `DEVELOPMENT_ONLY`

Production deployment: `DISABLED`

## Unveraenderlicher Arbeitsvertrag

- Task-ID: `AGENT-ASSIGNMENT-01`.
- Vertragsfixierung: 2026-07-15 um 13:15 Uhr Europe/Berlin auf Branch `feature/agent-assignment`, sauberem Base HEAD `1d89557c2d9930f853fa2acf1b39b6d62a4294a4`.
- Scope: Eine kleine typisierte, PostgreSQL-persistente Agent-Assignment-Komponente verbindet bestehende Background-/Fake-Agent-Jobs mit genau der zum Zuweisungszeitpunkt aktiven konkreten Version der bestehenden Agent Registry. Sie bietet `assignActiveAgent`, `getAssignmentByJob`, `listAssignmentsByProject` und `releaseAssignment` und ergaenzt nur die kleinste notwendige Fake-Job-Claim-/Audit-Referenz.
- Akzeptanzkriterien: exakt die zehn vom Owner fuer `AGENT-ASSIGNMENT-01` benannten Kriterien: konkrete aktive Version; hoechstens eine Zuweisung je Job; Rollenabgleich; fail-closed ohne aktiven Agenten; idempotente identische Wiederholung; Ablehnung widerspruechlicher Wiederholung; unveraenderte Bindung bei Registry-Aenderungen; bestandene Parallelitaets-, Restart- und Rollback-Nachweise; PostgreSQL- und Root-Tests ohne relevante Skips; bestandene Lint-, Typecheck-, Build- und Diff-Gates.
- Dateninvarianten: `assignmentId` ist eindeutig; je `jobId` existiert hoechstens eine Zuweisungszeile; das gespeicherte Tupel `agentId`/`agentKey`/`agentVersion`/`requiredRole` verweist auf genau eine Registry-Version; nur eine beim atomaren Insert `ACTIVE` Version ist neu zuweisbar; die Bindung ist unveraenderlich; nur `ASSIGNED -> RELEASED` ist erlaubt; `RELEASED` ist terminal und erlaubt weder Reaktivierung noch Ersatzzuweisung.
- Auswahlregel: `assignActiveAgent` loest ausschliesslich ueber `requiredRole` auf. Null aktive Kandidaten und mehr als ein aktiver `agentKey` fuer dieselbe Rolle werden fail-closed abgelehnt. Eine bereits bestehende identische `ASSIGNED`-Bindung wird vor erneuter Registry-Aufloesung unveraendert zurueckgegeben; widerspruechliche Assignment-ID, Rolle oder Erstellerbindung wird abgelehnt.
- Rollenregel fuer Fake-Agent-Jobs: direkte Rollen muessen uebereinstimmen. Ausschliesslich der historische Fake-Task-Wert `LEGAL` wird auf die kanonische Registry-Rolle `LEGAL_DE_EU` abgebildet. Diese Kompatibilitaetsabbildung aendert weder Registry- noch Runtime-Schemas.
- Erlaubte Anwendungscode-/Testkomponenten: ausschliesslich `packages/database/migrations/012_agent_assignments.sql`, neue taskbezogene Dateien `packages/database/src/agent-assignment*.ts`, die zwingend erforderlichen schmalen Exporte/Wiring-Aenderungen in `packages/database/src/index.ts`, Schemaassertionen in `packages/database/src/schema.test.ts`, die minimale Assignment-Lese-/Audit-Ergaenzung in `packages/database/src/agent-job-repository.ts` sowie nur bei nachgewiesenem Zwang `apps/worker/src/job-processor.ts` und dessen bestehende Testdatei. Workspace-Manifeste oder Lockfile duerfen nur bei zwingendem mechanischem Bedarf geaendert werden.
- Erlaubte Dokumentation: ausschliesslich dieses Dokument und bei vollstaendigem Erfolg nur der Agent-Assignment-Status in `PROJECT_STATE.md`.
- Verboten: Aenderungen an bestehenden Migrationen `001` bis `011`; grundlegende Worker-Erweiterung; Aenderung von `packages/agent-runtime/**`; echter Orchestrator; automatische Workflow-Planung; echte Codex-/OpenAI-Aufrufe; Agent-zu-Agent-Kommunikation; UI; oeffentliche HTTP-API; GitHub-Automatisierung; Secrets Management; neue Legal-/Security-Prozesse; Deployment; Production; `REAL_RUNTIME_HARDENING`; Completion-ID-Hardening; echte Kunden-/Personendaten.
- Anwendungscode-/Testcode-Writer: genau und ausschliesslich `AGENT-ASSIGNMENT-01-EXECUTOR`. Ein Writer-Wechsel ist verboten. Der Hauptagent koordiniert und dokumentiert; Planner, QA, Reviewer und Security arbeiten read-only.
- Maximales Zeitbudget: eine lokale Arbeitssitzung, hoechstens acht Stunden ab Vertragsfixierung, spaetestens bis 2026-07-15 21:15 Uhr Europe/Berlin.
- Reparaturbudget: Nach der Erstimplementierung hoechstens ein eng begrenzter automatischer Reparaturdurchlauf (`repair ordinal 1/1`) durch dieselbe Executor-Identitaet. Danach endet der Task bei offenem Kriterium strukturiert `BLOCKED`; automatische Reparatur- oder Review-Endlosschleifen sind verboten.
- Pflichtpruefungen in autoritativer Reihenfolge: Assignment-Unit; PostgreSQL-Assignment-Integration ohne Skips einschliesslich Parallelitaet/Idempotenz, Restart/Persistenz und Post-Mutation-Rollback; bestehende Agent-Registry-Tests; bestehende Workflow-/Worker-/Fake-Runtime-Tests; vollstaendige Root-Suite seriell und ohne konkurrierenden Reset derselben Testdatenbank; Lint; Typecheck; Build; `git diff --check`.
- Review-Fixierung: Nach abgeschlossener Implementierung, beendetem Writer-Zugriff und erfolgreicher oder explizit gestoppter Pflichtpruefung wird der Stand durch HEAD, Dateiliste, Diff und SHA-256-Digests fixiert. Erst danach pruefen QA, allgemeiner Reviewer und Security parallel read-only denselben Stand ausschliesslich gegen diesen Task-Scope. Legal ist fuer die lokale technische Rollenzuweisung mit synthetischen Development-Daten `NOT_APPLICABLE`.
- Zulaessige Abschlussstatus: `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`.
- Erfolgsformel: `AGENT ASSIGNMENT BESTANDEN  DEVELOPMENT ONLY`.
- Nichterfuellungsformel: `AGENT ASSIGNMENT NICHT BESTANDEN  DEVELOPMENT ONLY`.

Dieser Arbeitsvertrag ist ab seiner Fixierung unveraenderlich. Nachfolgende Abschnitte duerfen nur Implementierungs-, Test-, Review- und Abschlussnachweise ergaenzen; Scope, Writer, Zeit-, Reparatur- oder Reviewbudget und Gates duerfen nicht erweitert oder umgedeutet werden.

## Kurzer Implementierungsplan

1. Migration `012_agent_assignments.sql` additiv mit Projekt-/Job-/Registry-Fremdschluesseln, Eindeutigkeit, Statuscheck, Active-at-insert-Pruefung, unveraenderlicher Bindung, terminalem Release, RLS und minimalen Assignment-Audittypen erstellen.
2. Typisierte Service-/Repository-Schnittstelle mit den vier Operationen, enger Eingabevalidierung, rollenbasierter fail-closed Active-Auswahl sowie transaktionaler Idempotenz und Konflikterkennung implementieren.
3. Fake-Agent-Claims um eine optionale konkrete Assignment-Bindung ergaenzen und terminale synthetische Job-Audits mit `assignmentId`, `agentId`, `agentKey` und `agentVersion` referenzieren, ohne echte Runtime oder Worker-Lifecycle zu erweitern.
4. Unit-, PostgreSQL-, Parallelitaets-, Registry-Race-, Restart-, Rollback- und minimale FakeRuntime-Integrationsnachweise erstellen und anschliessend alle Pflichtgates sequenziell ausfuehren.
5. Writer-Zugriff beenden, Stand fixieren, drei technische Reviews parallel read-only einholen und nur bei vollstaendigem Erfolg `PROJECT_STATE.md` um den bestandenen Assignment-Status ergaenzen.

## Ausfuehrungsnachweis

Status: `PASSED - DEVELOPMENT_ONLY`.

- Implementierung: Die additive Migration `012_agent_assignments.sql`, die typisierte Assignment-Komponente, ihre Unit-/PostgreSQL-Tests, die Exporte und Schemaassertionen sowie die schmale Fake-Job-Claim-/Audit-Anbindung wurden durch die festgelegte Writer-Identitaet `AGENT-ASSIGNMENT-01-EXECUTOR` umgesetzt. Bestehende Migrationen, Agent Runtime und Worker-Lifecycle blieben unveraendert.
- Datenmodell: `builder.agent_assignments` speichert die technische Assignment-ID, Projekt und Job, die erforderliche Rolle, das konkrete Registry-Tupel aus Agent-ID, Agent-Key, Version und Rolle, Status, Erstellungs- und optionale Release-Metadaten. Primaerschluessel, globale Job-Eindeutigkeit, Projekt-/Job- und Registry-Fremdschluessel, Statuschecks, Trigger und RLS erzwingen die Invarianten in PostgreSQL.
- Operationen: `assignActiveAgent`, `getAssignmentByJob`, `listAssignmentsByProject` und `releaseAssignment` sind typisiert implementiert. Identische Wiederholungen liefern dieselbe aktive Bindung; abweichende Assignment-ID, Rolle oder Erstellerbindung werden abgelehnt. `RELEASED` ist terminal.
- Parallelitaet: Jobbezogene Advisory Locks, deterministisch geordnete Registry-Locks und eine erneute Active-/Rollenpruefung im Insert-Trigger linearisieren Assignment und Registry-Aktivierung. Die PostgreSQL-Tests beweisen eine Zeile bei parallelen identischen Aufrufen, hoechstens einen Erfolg bei widerspruechlichen Aufrufen und einen konsistenten Zustand beim Aktivierungsrace.
- Persistenz und Atomaritaet: Eine neu aufgebaute Repository-/Verbindungskonfiguration liest nach einem simulierten Neustart dieselbe konkrete Bindung. Ein absichtlich fehlschlagender `AFTER INSERT`-Trigger beweist den vollstaendigen Rollback der Mutation ohne Teilzustand.
- Fake Runtime: Ein Fake-Agent-Claim kann die konkrete Bindung lesen. Terminale synthetische Job-Audits referenzieren `assignmentId`, `agentId`, `agentKey` und `agentVersion`. Es wurde kein echter Codex-, OpenAI-, GitHub-, Deployment- oder Production-Pfad hinzugefuegt.
- Reparaturbudget: `0/1` automatische Reparaturdurchlaeufe verbraucht.

## Gepruefter Stand

- Base HEAD: `1d89557c2d9930f853fa2acf1b39b6d62a4294a4`.
- Migration `012_agent_assignments.sql`: SHA-256 `9B9E609886F2D718B37BBFDDCE1CAD61C3480CF1E8E87661510A5BEF061CAFBA`.
- Assignment-Komponente: SHA-256 `7C3B7EAC6A580C906592CD2CAFCD927AF6B2502A08F0335DF38DB39521CED1C3`.
- Assignment-Unit-Test: SHA-256 `BB96DF122CF971B9B9E5510E24B90B7404AB6F2307EC28493C67D27A65BC4F86`.
- Assignment-PostgreSQL-Test: SHA-256 `A32C9DBCC805104FEE7CFC94E63D1677F3FFA7DC16518C20137B2ACA59AC118D`.
- Fake-Job-Repository: SHA-256 `699A0393A78D1637FD7DFE6200B8DCEB52F63B9A0400AE37525F7AB2962BF510`.
- Datenbankexport: SHA-256 `C6FDFC62AC1EBBDDEA15E7CBCCDDA6E4743D08F845E5194E39C21029AB49C210`.
- Schema-Test: SHA-256 `4A23E512E5E1B7BB6460C663114AC4DC1667A02A0A0D1619A4E7DDEE4633BA0D`.
- Fixierter Tracked-Diff: SHA-256 `F6FFD8BB757B489291D778F7213CAD17BDE11163655A0C5CF52D0D5CAAA0554D`.

## Pflichtpruefungen

- Assignment-Unit: `2/2` bestanden.
- Assignment-PostgreSQL-Integration: `12/12` bestanden, `0` Skips; enthaelt Parallelitaet, Idempotenz, Konflikte, Registry-Race, Neustart/Persistenz, Rollback und Fake-Claim/Audit.
- Agent Registry Unit: `7/7` bestanden.
- Agent Registry PostgreSQL: `12/12` bestanden, `0` Skips.
- Agent Runtime: `31/31` bestanden.
- Worker: `23/23` bestanden.
- Workflow Engine: `78/78` bestanden.
- Vollstaendige Root-Suite, seriell gegen dieselbe PostgreSQL-Testdatenbank: `17/17` Dateien und `246/246` Tests bestanden, `0` Skips, `0` Retries.
- Lint: bestanden.
- Typecheck: alle `11` Workspaces bestanden.
- Build: alle `11` Workspaces bestanden.
- `git diff --check`: bestanden; lediglich nicht-fehlerhafte LF/CRLF-Hinweise fuer drei bereits getrackte Dateien.

## Read-only-Reviews

- QA: `PASS - DEVELOPMENT_ONLY`; alle zehn Akzeptanzkriterien bestaetigt, Assignment Unit `2/2`, PostgreSQL `12/12` ohne Skips und `git diff --check` unabhaengig reproduziert, keine Findings.
- Allgemeines Code-Review: `APPROVE / PASS - DEVELOPMENT_ONLY`; keine Findings im Task-Scope.
- Security: `PASS - DEVELOPMENT_ONLY`; Fail-closed-Auswahl, unveraenderliche Bindung, Locking, RLS/Capabilities, Datenminimierung und Fake-only-Grenze bestaetigt, keine Findings.
- Legal: `NOT_APPLICABLE`, da ausschliesslich synthetische Development-Daten und technische Rollenzuweisungen verarbeitet werden.

## Abschluss

- Alle zehn Akzeptanzkriterien sind erfuellt.
- Bewusst spaeteren Gates zugeordnet bleiben echter Orchestrator und automatische Workflow-Planung, echte Codex-/OpenAI-Runtime, Agent-zu-Agent-Kommunikation, UI und oeffentliche API, GitHub-Automatisierung, Secrets Management, `REAL_RUNTIME_HARDENING`, Completion-ID-Hardening, Release Candidate, Deployment und Production.
- GitHub-Integration und automatische Projektausfuehrung bleiben deaktiviert. Production deployment bleibt `DISABLED`.
- Abschlussstatus: `PASSED`.
- Erfolgsstatus: `AGENT ASSIGNMENT BESTANDEN  DEVELOPMENT ONLY`.
