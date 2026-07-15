# AGENT-REGISTRY-IDENTITY-FIX-02

Release level: `DEVELOPMENT_ONLY`

Production deployment: `DISABLED`

## Unveraenderlicher Arbeitsvertrag

- Task-ID: `AGENT-REGISTRY-IDENTITY-FIX-02`.
- Ausgangsstand: Branch `feature/agent-registry`, Base HEAD `c04bceae08e5af892be7b3bd8849f4bcca37c29b`, sauberer Worktree bei Vertragsfixierung am 2026-07-15 um 12:10 Uhr Europe/Berlin.
- Scope: Ausschliesslich die dauerhafte, transaktions- und konkurrenzsichere bijektive Bindung `agentKey <-> agentId` in der persistenten Agent Registry sowie ein echter PostgreSQL-Nachweis, dass ein deterministischer Fehler nach einer bereits erfolgten Mutation die gesamte `createDefinition`-Transaktion zurueckrollt.
- Akzeptanzkriterien: (1) genau eine `agentId` je `agentKey`; (2) genau ein `agentKey` je `agentId`; (3) Erzwingung in PostgreSQL; (4) keine Umgehung durch parallele Erstellung; (5) kanonische `agentId` fuer alle Versionen; (6) belastbarer Post-Mutation-Rollback-Test ohne Produktions-Bypass; (7) alle Agent-Registry-Tests bestehen; (8) serielle Root-Suite besteht vollstaendig; (9) Lint, Typecheck, Build und `git diff --check` bestehen; (10) QA, Reviewer und Security haben kein Finding im autorisierten Scope.
- Erlaubte Anwendungscode-/Testdateien: ausschliesslich `packages/database/migrations/011_agent_registry_identity_binding.sql`, `packages/database/src/agent-registry.ts`, `packages/database/src/agent-registry.test.ts`, `packages/database/src/agent-registry.integration.test.ts` und `packages/database/src/index.ts` nur bei technischem Zwang.
- Erlaubte Dokumentation: `docs/architecture/agent-registry-01.md`, dieses Closeout-Dokument und `PROJECT_STATE.md`.
- Verboten: Aenderung der Migration `010`; Agent Runtime; Worker; Workflow Engine; Cancellation; Completion IDs; Scheduler; Orchestrator; Codex/OpenAI-Anbindung; GitHub-Automatisierung; Benutzeroberflaeche; oeffentliche API; Secrets Management; Deployment; Production-Aktivierung; andere Registry-Funktionen.
- Anwendungscode-/Testcode-Writer: genau und ausschliesslich `AGENT-REGISTRY-IDENTITY-FIX-02-EXECUTOR`. Ein Writer-Wechsel innerhalb dieses Tasks ist verboten. Der Hauptagent koordiniert und dokumentiert; QA, Reviewer und Security arbeiten nach Writer-Ende read-only.
- Maximales Zeitbudget: eine lokale Arbeitssitzung, hoechstens vier Stunden ab Vertragsfixierung, spaetestens bis 2026-07-15 16:10 Uhr Europe/Berlin.
- Reparaturbudget: Nach der Erstimplementierung hoechstens ein eng begrenzter automatischer Reparaturdurchlauf (`repair ordinal 1/1`) durch dieselbe Writer-Identitaet. Danach wird bei offenem Akzeptanzkriterium strukturiert blockiert.
- Pflichtpruefungen in autoritativer Reihenfolge: gezielte Agent-Registry-Unit-Tests; Agent-Registry-PostgreSQL-Integration ohne Skips; vollstaendige Root-Test-Suite seriell; Lint; Typecheck; Build; `git diff --check`.
- Review-Fixierung: Nach abgeschlossener Implementierung, beendetem Writer-Zugriff und erfolgreicher oder explizit gestoppter Pflichtpruefung wird der Stand durch HEAD, erlaubte Dateiliste, Diff und SHA-256-Digests fixiert. Erst danach pruefen QA, Reviewer und Security parallel read-only genau diesen Stand. Legal DE/EU ist gemaess Owner-Vorgabe fuer diesen technischen Hotfix `NOT_APPLICABLE`.
- Zulaessige finale Abschlussstatus: genau einer aus `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`.
- Erfolgsformel: `AGENT REGISTRY BESTANDEN  DEVELOPMENT ONLY`.
- Nichterfuellungsformel: `AGENT REGISTRY NICHT BESTANDEN  DEVELOPMENT ONLY`.

Dieser Arbeitsvertrag ist ab seiner Fixierung unveraenderlich. Nachfolgende Abschnitte duerfen ausschliesslich Nachweise und Ergebnisse ergaenzen; Scope, Writer, Zeit-, Reparatur- oder Reviewbudget und Gates duerfen nicht geaendert werden.

## Ausfuehrungsnachweis

Status: `BLOCKED - DEVELOPMENT_ONLY`.

## Closeout

- Gepruefter Stand: uncommitteter Hotfix-Diff auf Base HEAD `c04bceae08e5af892be7b3bd8849f4bcca37c29b`; Anwendungscode-/Testcode-Writer `AGENT-REGISTRY-IDENTITY-FIX-02-EXECUTOR` hat den Schreibzugriff beendet.
- Implementiert: kanonische append-only Identity-Tabelle; fail-closed Historienpruefung und Backfill; eindeutige `agent_key`-/`agent_id`-Bindung in beide Richtungen; zusammengesetzter Versions-Fremdschluessel; atomare Definitionserstellung; kanonische Versionserstellung; Konflikt-, Parallelitaets-, Restart- und Post-Mutation-Rollback-Tests.
- Autoritative Nachweise vor Repair: Agent-Registry-Unit `PASS` 7/7; Agent-Registry-PostgreSQL `PASS` 12/12, 0 Skips; serielle Root-Suite `PASS` 15/15 Dateien und 231/231 Tests, 0 Skips; Lint `PASS`.
- Typecheck: `FAIL`. `npm.cmd run typecheck` meldete zweimal `TS2345` in `packages/database/src/agent-registry.integration.test.ts:32`: `keys[0]` und `keys[1]` haben unter `noUncheckedIndexedAccess` den Typ `string | undefined`, waehrend `create` einen `string` verlangt.
- Repair ordinal `1/1`: verbraucht. Die automatische Reparatur markierte irrtuemlich nur das unmittelbar vorherige `candidateIds`-Array als Tuple. Der anschliessende gezielte Database-Typecheck meldete dieselben beiden `TS2345`-Fehler fuer `keys[0]` und `keys[1]`. Vertragsgemaess erfolgte keine zweite Codeaenderung.
- Nicht ausgefuehrt nach dem bindenden Typecheck-Stop: Build, `git diff --check`, QA-, Reviewer- und Security-Review.
- Nicht erfuelltes Akzeptanzkriterium: Kriterium 9, erfolgreicher Typecheck. Kriterium 10 wurde wegen des vorgeschriebenen Stops nicht erreicht.
- Reproduzierbare Evidenz: `npm.cmd run typecheck --workspace @software-builder/database` endet mit Exit 2 und den beiden genannten `TS2345`-Befunden in Zeile 32.
- Betroffener Scope: ausschliesslich die Typisierung des festen Zwei-Schluessel-Arrays im neuen PostgreSQL-Parallelitaetstest; kein Datenbank-Constraint und kein Laufzeittest schlug fehl.
- Erforderliche manuelle Entscheidung: neuen, eng begrenzten Task mit neuem unveraenderlichem Arbeitsvertrag und neuer Writer-Identitaet autorisieren, der nur das feste `keys`-Array typkorrekt als Tuple behandelt und danach die vollstaendige Pflichtsequenz sowie die drei Reviews erneut ausfuehrt.

Abschlussstatus: `BLOCKED - DEVELOPMENT_ONLY`.

Production deployment bleibt `DISABLED`; GitHub-Integration und automatische Projektausfuehrung bleiben deaktiviert.

`AGENT REGISTRY NICHT BESTANDEN  DEVELOPMENT ONLY`

## AGENT-REGISTRY-TUPLE-TYPECHECK-CLOSEOUT-03

### Unveraenderlicher Arbeitsvertrag

- Task-ID: `AGENT-REGISTRY-TUPLE-TYPECHECK-CLOSEOUT-03`.
- Vertragsfixierung: 2026-07-15 um 12:50 Uhr Europe/Berlin auf Base HEAD `c04bceae08e5af892be7b3bd8849f4bcca37c29b` und dem uncommitteten, funktional abgeschlossenen Stand aus `AGENT-REGISTRY-IDENTITY-FIX-02`. Der SHA-256-Digest der Zieldatei vor diesem Task lautet `6825911B4FBBFBD499B3D004C8E5A423BA462122B7235D049DC5D267913A1BC6`.
- Scope: Ausschliesslich die Deklaration des bestehenden festen `keys`-Arrays in `packages/database/src/agent-registry.integration.test.ts` als Tuple typisieren, ohne seine beiden Werte oder Ausdruecke und ohne die Testsemantik zu veraendern; danach alle autoritativen Abschlussgates und die drei Read-only-Reviews auf demselben fixierten Stand abschliessen.
- Akzeptanzkriterien: (1) `keys` ist ein festes Tuple; (2) `keys[0]` und `keys[1]` haben statisch den Typ `string`; (3) Database-Typecheck besteht; (4) Root-Typecheck besteht; (5) Agent-Registry-Unit-Tests bestehen; (6) Agent-Registry-PostgreSQL-Integration besteht ohne Skips; (7) die vollstaendige serielle Root-Suite besteht; (8) Lint besteht; (9) Build besteht; (10) `git diff --check` besteht; (11) QA, Reviewer und Security finden innerhalb des autorisierten Scopes keinen Blocker; (12) die `agentKey`-/`agentId`-Invariante bleibt unveraendert intakt.
- Erlaubte Testcodedatei: ausschliesslich `packages/database/src/agent-registry.integration.test.ts`, darin ausschliesslich der Zusatz `as const` an der bestehenden `keys`-Deklaration. Die beiden Arraywerte beziehungsweise Ausdruecke bleiben bytegleich.
- Erlaubte Dokumentation: ausschliesslich dieses bestehende Closeout-Dokument und in `PROJECT_STATE.md` ausschliesslich der Agent-Registry-Status.
- Verboten: Non-null Assertions an `keys`, `as string`, `any`, `ts-ignore`, deaktivierte TypeScript-Regeln, Aenderungen an `candidateIds`, Produktionscode, Migrationen, Registry-Funktionen, Architektur, Runtime, GitHub, Scheduling, Orchestrierung, automatische Projektausfuehrung, Deployment und Production-Aktivierung.
- Testcode-Writer: genau und ausschliesslich `AGENT-REGISTRY-TUPLE-TYPECHECK-CLOSEOUT-03-EXECUTOR`. Ein Writer-Wechsel innerhalb dieses Tasks ist verboten. Der Hauptagent koordiniert und dokumentiert; QA, Reviewer und Security arbeiten nach Writer-Ende read-only.
- Maximales Zeitbudget: eine lokale Arbeitssitzung, hoechstens zwei Stunden ab Vertragsfixierung, spaetestens bis 2026-07-15 14:50 Uhr Europe/Berlin.
- Reparaturbudget: Nach der Erstimplementierung hoechstens ein eng begrenzter automatischer Reparaturdurchlauf (`repair ordinal 1/1`) durch dieselbe Writer-Identitaet. Danach wird bei offenem Akzeptanzkriterium strukturiert blockiert.
- Pflichtreihenfolge: Zieldatei vollstaendig lesen; Tuple-Deklaration implementieren; sofort Database-Typecheck; danach Agent-Registry-Unit, Agent-Registry-PostgreSQL-Integration ohne Skips, vollstaendige Root-Suite seriell, Root-Typecheck, Lint, Build und `git diff --check`. Datenbank- und Root-Tests laufen nicht parallel.
- Review-Fixierung: Nach abgeschlossener Implementierung, beendetem Writer-Zugriff und gruenen Gates wird der Stand durch HEAD, Diff und SHA-256-Digests fixiert. Erst danach pruefen QA, Reviewer und Security parallel read-only genau diesen Stand. Legal ist gemaess Owner-Entscheidung fuer diese reine Test-Typkorrektur `NOT_APPLICABLE`.
- Reviews duerfen nur blockieren, wenn der Tuple-Fix unsicher oder falsch ist, ein Typecheck oder bestehender Test fehlschlaegt, Lint oder Build fehlschlaegt oder die bestehende `agentKey`-/`agentId`-Invariante beschaedigt wurde. Spaetere Produktionsanforderungen, Runtime-Integration, GitHub, Deployment, Scheduling und Orchestrierung sind keine Blocker dieses Tasks.
- Zulaessige finale Abschlussstatus: genau einer aus `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`.
- Erfolgsformel: `AGENT REGISTRY BESTANDEN  DEVELOPMENT ONLY`.
- Nichterfuellungsformel: `AGENT REGISTRY NICHT BESTANDEN  DEVELOPMENT ONLY`.

Dieser neue Arbeitsvertrag ist ab seiner Fixierung unveraenderlich. Nachfolgende Abschnitte duerfen ausschliesslich Nachweise und Ergebnisse fuer `AGENT-REGISTRY-TUPLE-TYPECHECK-CLOSEOUT-03` ergaenzen; Scope, Writer, Zeit-, Reparatur- oder Reviewbudget und Gates duerfen nicht geaendert werden.

### Ausfuehrungsnachweis und Closeout

- Abschlussstatus: `PASSED - DEVELOPMENT_ONLY`.
- Gepruefter Stand: Base HEAD `c04bceae08e5af892be7b3bd8849f4bcca37c29b` plus uncommitteter Agent-Registry-Diff. Der Testcode-Writer `AGENT-REGISTRY-TUPLE-TYPECHECK-CLOSEOUT-03-EXECUTOR` hat nach der Erstimplementierung und dem sofortigen Database-Typecheck den Schreibzugriff beendet.
- Geaenderte Codezeile: `packages/database/src/agent-registry.integration.test.ts:32` enthaelt nun `const keys=["parallel-id-agent-a","parallel-id-agent-b"] as const;`. Ausschliesslich `as const` wurde ergaenzt; beide bestehenden Werte, `candidateIds` und die Testsemantik blieben unveraendert.
- Fixierte SHA-256-Digests des Review-Stands: Migration `011_agent_registry_identity_binding.sql` `80AD814011226087C2AF92CCC098957768AC44F8C89ECB7338601C946EB6740F`; `agent-registry.ts` `B20E1EDAFF8348F81457A11A21DD7BD8D8D5C2F26712521373DF5D168B581B7A`; `agent-registry.test.ts` `E3A5EB0DB51F120C5EFB21832F321F676E3F219597E1D7152BB1424F37CF4369`; `agent-registry.integration.test.ts` `014B2AEEEBD9D1366355D3D170B589056E7D806B8498F504E605C22FA4C69D6C`.
- Database-Typecheck: `npm.cmd run typecheck --workspace @software-builder/database` - `PASS`, Exitcode 0. Die beiden bisherigen `TS2345`-Fehler sind behoben.
- Agent-Registry-Unit: `npm.cmd exec -- vitest run packages/database/src/agent-registry.test.ts` - `PASS`, 1/1 Testdatei und 7/7 Tests.
- Agent-Registry-PostgreSQL-Integration: gezielter Vitest-Lauf mit lokaler `_test`-Datenbank - `PASS`, 1/1 Testdatei und 12/12 Tests, 0 Skips.
- Vollstaendige serielle Root-Suite: `npm.cmd test -- --no-file-parallelism` - `PASS`, 15/15 Testdateien und 231/231 Tests, 0 Skips.
- Root-Typecheck: `npm.cmd run typecheck` - `PASS`, Exitcode 0, einschliesslich `@software-builder/database`.
- Lint: `npm.cmd run lint` - `PASS`, Exitcode 0.
- Build: `npm.cmd run build` - `PASS`, Exitcode 0, einschliesslich Web-Build und aller vorhandenen Workspace-Builds.
- Diff-Hygiene: `git diff --check` - `PASS`, Exitcode 0.
- Reparaturbudget: kein Reparaturdurchlauf verbraucht; die Erstimplementierung bestand den sofortigen Database-Typecheck und alle folgenden Gates.
- QA: `PASS`. Der rekonstruierte Vorher-Digest stimmt mit der Vertragsbaseline ueberein; nur `as const` wurde ergaenzt, beide Werte und die Semantik sind unveraendert, `keys[0]` und `keys[1]` sind statisch `string`, und die `agentKey`-/`agentId`-Invariante bleibt intakt.
- Allgemeines Code-Review: `APPROVE`. Kein Finding im autorisierten Scope.
- Security: `PASS`. Der Tuple-Fix ist typsicher, umgeht keine Typregel, aendert keine Laufzeitsemantik und erhaelt den Invariantentest.
- Legal: `NOT_APPLICABLE` gemaess Owner-Entscheidung fuer diese reine Test-Typkorrektur.
- Offene Findings im Task-Scope: keine. Spaetere Production-, Runtime-, GitHub-, Deployment-, Scheduling- und Orchestrierungs-Gates bleiben ausserhalb dieses Tasks unveraendert fail-closed beziehungsweise deaktiviert.
- Freigabestufe: ausschliesslich `DEVELOPMENT_ONLY`; keine Release-Candidate- oder Produktionsfreigabe.

Production deployment bleibt `DISABLED`; GitHub-Integration und automatische Projektausfuehrung bleiben deaktiviert.

`AGENT REGISTRY BESTANDEN  DEVELOPMENT ONLY`
