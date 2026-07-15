# AGENT-REGISTRY-01

Release level: `DEVELOPMENT_ONLY`

Production deployment: `DISABLED`

## Unveraenderlicher Arbeitsvertrag

- Task-ID: `AGENT-REGISTRY-01`.
- Scope: Eine kleine persistente Agent Registry fuer Definitionen und unveraenderliche Versionen der Rollen `ORCHESTRATOR`, `PLANNER`, `ARCHITECT`, `EXECUTOR`, `QA`, `REVIEWER`, `SECURITY` und `LEGAL_DE_EU`, einschliesslich typisiertem Service-/Repository-Vertrag, PostgreSQL-Persistenz, atomarem Aktivieren/Stilllegen, Development-Seeds und den beauftragten Tests.
- Akzeptanzkriterien: exakt die zehn vom Owner fuer `AGENT-REGISTRY-01` benannten Kriterien: acht Seeds; persistentes Speichern/Lesen; unveraenderliche Versionen; Aenderungen erzeugen neue Versionen; hoechstens eine aktive Version je `agentKey`; parallele Aktivierung; Ablehnung ungueltiger Daten und Secret-Felder; PostgreSQL ohne Skips; Root-Tests/Lint/Typecheck/Build; keine echte Agentenausfuehrung oder Produktionsintegration.
- Erlaubte Anwendungskomponenten: ausschliesslich `packages/database/migrations/010_agent_registry.sql`, `packages/database/src/agent-registry.ts`, taskbezogene Tests unter `packages/database/src/agent-registry*.test.ts`, zwingend erforderliche schmale Exporte/Seed-/Schemaanpassungen in `packages/database/src/index.ts`, `packages/database/src/seed.ts` und `packages/database/src/schema.test.ts`. Workspace-Manifeste oder Lockfile duerfen nur bei zwingendem mechanischem Bedarf geaendert werden.
- Erlaubte Dokumentation: ausschliesslich diese Datei und `PROJECT_STATE.md`.
- Verboten: Codex/OpenAI-Aufrufe, Worker-Aenderungen, Scheduling, Workflow-Orchestrierung, Agent-zu-Agent-Kommunikation, UI, HTTP-API, GitHub, Secrets Management, echte Legal-Entscheidungen, echte Kunden-/Personendaten, Deployment, Completion-ID-Hardening und `REAL_RUNTIME_HARDENING`.
- Anwendungscode-/Testcode-Writer: genau und ausschliesslich `AGENT-REGISTRY-01-EXECUTOR`. Ein Writer-Wechsel ist verboten. Der Hauptagent dokumentiert und koordiniert; alle weiteren Rollen arbeiten read-only.
- Maximales Zeitbudget: eine lokale Arbeitssitzung, hoechstens acht Stunden ab Vertragsfixierung am 2026-07-15.
- Reparaturbudget: nach der Erstimplementierung hoechstens ein eng begrenzter automatischer Reparaturdurchlauf (`repair ordinal 1/1`) durch dieselbe Executor-Identitaet. Danach wird bei offenem Akzeptanzkriterium strukturiert blockiert.
- Pflichtpruefungen: Agent-Registry-Unit-Tests; PostgreSQL-Integration ohne Skips; Parallelitaet/Eindeutigkeit; atomarer Rollback; Restart/Persistenz; Root-Test-Suite; Lint; Typecheck; Build; `git diff --check`.
- Fixierung und Reviews: Nach Implementierung und Pflichtpruefungen endet der Writer-Zugriff. QA, Reviewer, Security und Legal DE/EU pruefen danach parallel read-only denselben durch HEAD, Dateiliste und Digests fixierten Stand ausschliesslich gegen den Task-Scope.
- Zulaessige Abschlussstatus: `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`.
- Erfolgsformel: `AGENT REGISTRY BESTANDEN  DEVELOPMENT ONLY`.
- Nichterfuellungsformel: `AGENT REGISTRY NICHT BESTANDEN  DEVELOPMENT ONLY`.

Dieser Arbeitsvertrag ist ab seiner Fixierung unveraenderlich. Die nachfolgenden Abschnitte duerfen Nachweise und Ergebnisse dokumentieren, aber Scope, Writer, Budget oder Gates nicht erweitern.

## Implementierungsplan

1. Bestehende PostgreSQL-, Migrations-, Capability-, Repository- und Testkonventionen wiederverwenden.
2. Versionierte Registry-Persistenz und typisierte Service-/Repository-Schnittstellen mit fail-closed Validierung implementieren.
3. Acht synthetische Development-Seeds sowie Unit-, PostgreSQL-, Parallelitaets-, Rollback- und Restart-Tests erstellen.
4. Pflichtgates ausfuehren, Stand fixieren, vier getrennte read-only Reviews einholen und nur das tatsaechliche Ergebnis dokumentieren.

## Voraussichtliche Dateien

- `packages/database/migrations/010_agent_registry.sql`
- `packages/database/src/agent-registry.ts`
- `packages/database/src/agent-registry.test.ts`
- `packages/database/src/agent-registry.integration.test.ts`
- `packages/database/src/index.ts`
- `packages/database/src/seed.ts`
- `packages/database/src/schema.test.ts`
- `docs/architecture/agent-registry-01.md`
- `PROJECT_STATE.md`

## Ausfuehrungsnachweis

Status: `BLOCKED - DEVELOPMENT ONLY`.

## Zweck und Abgrenzung

Die Implementierung stellt eine lokale, persistente Registry fuer Definitionen und Versionen der acht Builder-Rollen bereit. Sie startet keine Agenten und ist nicht mit Worker, Codex/OpenAI, GitHub, Scheduling, Workflow-Orchestrierung, Deployment oder Produktion verbunden. Die bestehende projektbezogene Tabelle `builder.agent_definitions` und der FOUNDATION-Rollenstub `@software-builder/agent-registry` bleiben unveraendert; ihre spaetere Integration ist kein Bestandteil dieses Tasks.

## Datenmodell und Datenbank-Constraints

Migration `010_agent_registry.sql` fuegt `builder.agent_registry_versions` additiv hinzu. Eine Zeile ist eine konkrete Revision mit `id`, stabil vorgesehener `agent_id`, `agent_key`, Anzeigename, Rolle, Beschreibung, `version`, identischer `revision`, Status, Instructions, erlaubten und verbotenen Capabilities, optionaler nicht geheimer Modellkonfiguration, `created_at` und `created_by`.

Die Datenbank erzwingt:

- Rollen exakt `ORCHESTRATOR`, `PLANNER`, `ARCHITECT`, `EXECUTOR`, `QA`, `REVIEWER`, `SECURITY`, `LEGAL_DE_EU`;
- Status exakt `DRAFT`, `ACTIVE`, `RETIRED`;
- `UNIQUE(agent_key, version)` und `UNIQUE(agent_id, version)`;
- einen partiellen Unique-Index fuer hoechstens eine `ACTIVE`-Version je `agent_key`;
- `revision = version`, nicht leere begrenzte Texte, disjunkte Capability-Listen und eine JSONB-Allowlist fuer `model`, `reasoningLevel`, `timeoutMs`, `maxAttempts`;
- Secret-Muster-Checks fuer Instructions und Modellkonfiguration;
- `ENABLE/FORCE ROW LEVEL SECURITY`, Capability-Kontext sowie Runtime-Rechte nur fuer `SELECT`, `INSERT` und `UPDATE(status)`;
- einen Trigger, der alle Inhalts- und Identitaetsfelder unveraenderlich haelt und nur `DRAFT -> ACTIVE` beziehungsweise `ACTIVE -> RETIRED` erlaubt. `RETIRED` ist terminal; `DELETE` ist nicht freigegeben.

## Oeffentliche TypeScript-Schnittstellen

`AgentRegistryRepository` und `AgentRegistryService` bieten typisiert:

1. `createDefinition`;
2. `createVersion`;
3. `getVersion`;
4. `getActive`;
5. `list` nach optionaler Rolle oder Status;
6. `activate`;
7. `retireActive`.

`PostgresAgentRegistryRepository` implementiert den Port ueber die vorhandene capability-validierte Transaktionsgrenze von `PostgresDatabase`. Eingaben werden vor Repository-Aufruf fail-closed auf Rollen, Status, Schluessel, Texte, Capabilities, Secret-Material und die enge Modellkonfiguration geprueft.

## Versionierungsregeln und Statusuebergaenge

Neue Versionen werden als `DRAFT` angelegt. `createVersion` uebernimmt bei normaler Verwendung die vorhandene `agentId` und verbietet einen Rollenwechsel. Aktivierung und Stilllegung serialisieren je `agentKey` ueber `pg_advisory_xact_lock`; eine Aktivierung setzt die bisher aktive Revision und die Zielrevision in derselben Transaktion um. Bereits `RETIRED`e Revisionen koennen nicht reaktiviert werden.

Der finale Reviewer fand jedoch, dass diese Zielregel umgangen werden kann: `createDefinition` sperrt den `agentKey` nicht und weist einen bereits vorhandenen Key nicht zurueck. Zwei Aufrufe mit demselben `agentKey`, unterschiedlichen Versionsnummern und unterschiedlichen `agentId`-Werten koennen deshalb zwei Identitaetslinien erzeugen. Umgekehrt bindet kein Constraint genau einen `agentKey` dauerhaft an genau eine `agentId`. Damit ist Akzeptanzkriterium 4 nicht vollstaendig erfuellt.

## Development-Seeds

`DEVELOPMENT_AGENT_SEEDS` enthaelt exakt `orchestrator`, `planner`, `architect`, `executor`, `qa`, `reviewer`, `security` und `legal-de-eu`. Alle Inhalte sind synthetisch. Jede Rolle verbietet `production.deploy`; relevante Rollen verbieten zusaetzlich echte Agentenausfuehrung oder GitHub-Schreibzugriff. `LEGAL_DE_EU` ist ausdruecklich eine technische Rolle ohne anwaltliche Freigabe und verbietet `legal.counsel.decision`.

## Gepruefter Stand und Reparatur

- Base HEAD: `5730f57175a983b235dca8b46745fadecdad538c`.
- `010_agent_registry.sql`: `c97588c90d40ea2df10a5eeed02a043a0f20f4e3d35e8a13e75089ae9d2c843d`.
- `agent-registry.ts`: `f9031c1adb39e48fede658e9dfdbfbcffd802dfa5b0a21aaa3bc82e437c0bdca`.
- Unit-Test: `543c235a65523f472cb9bfec660e9e3f357828af1edfd2ca8ab0509f0c232d54`.
- PostgreSQL-Test: `02101685003be2314fdf9c42007fd809f0acf0d690d4992dea71d04378a1ec82`.
- `index.ts`: `85297516c766c1ebe67c2d7866fa49693f0c04e80f37bf0396b304014fd4a786`.
- Alleiniger Anwendungscode-/Testcode-Writer: `AGENT-REGISTRY-01-EXECUTOR`; Writer-Zugriff nach den Gates beendet.
- Repair ordinal `1/1` ist verbraucht. Die einzige Reparatur korrigierte vier Unit-Test-Assertions, die synchrone Validierungsfehler faelschlich als Promise-Rejections erwarteten. Eine weitere automatische Reparatur ist verboten.

## Testnachweise

Autoritativer Executor-Pflichtlauf nach Repair:

| Pruefung | Ergebnis |
|---|---|
| Agent-Registry-Unit | `PASS`, 1/1 Datei, 6/6 Tests |
| PostgreSQL Agent Registry | `PASS`, 1/1 Datei, 7/7 Tests, 0 Skips |
| Root-Test-Suite seriell | `PASS`, 15/15 Dateien, 225/225 Tests, 0 Skips, 45,88 s |
| Root Lint | `PASS` |
| Root Typecheck | `PASS`, 10/10 Workspaces |
| Root Build | `PASS`, 10/10 Workspaces |
| `git diff --check` | `PASS` |

Ein zusaetzlicher nicht autoritativer Default-Parallel-Lauf endete mit 152 bestandenen Tests und 73 wegen Suite-Setup nicht ausgefuehrten Tests, weil zwei vorhandene PostgreSQL-Dateien dieselbe `_test`-Datenbank gleichzeitig resetten und sich im Quiescence-Guard blockieren. Es wurde keine Datei geaendert; derselbe vollstaendige Root-Scope bestand danach seriell mit 225/225 und 0 Skips.

Die unabhaengige QA bestaetigte Unit 6/6 und PostgreSQL 7/7 mit 0 Skips. Ihr eigener serieller Root-Lauf wurde nach 225,5 Sekunden abgebrochen; Lint, Typecheck, Build und Diff-Check wurden in dieser QA-Ausfuehrung nicht abgeschlossen. Der bereits fixierte Executor-Nachweis fuer diese Gates bleibt oben dokumentiert.

## Review-Ergebnisse

- QA: `BLOCK - DEVELOPMENT_ONLY`. Registry-spezifisch Unit 6/6 und PostgreSQL 7/7, 0 Skips; der eigene vollstaendige Gate-Lauf wurde nicht abgeschlossen.
- Reviewer: `BLOCK`. `createDefinition` kann fuer denselben `agentKey` eine zweite `agentId`-Linie erzeugen; die Zuordnung `agentKey <-> agentId` ist nicht dauerhaft erzwungen. Der Rollback-Test aktiviert eine unbekannte Version und scheitert vor der ersten Mutation, belegt also keinen Fehler nach bereits begonnener Statusaenderung.
- Security: `PASS - DEVELOPMENT_ONLY`. Keine taskbezogenen Security-Blocker; Secret-/Modellvalidierung, RLS/Capabilities, Immutabilitaet und fehlende Runtime-/Production-Aktivierung sind fuer diesen Scope ausreichend.
- Legal DE/EU: `PASS - DEVELOPMENT_ONLY`. Datenminimierung, synthetische Seeds, technische Rollenbezeichnung und Disclaimer sind ausreichend; keine Aussage zur Qualitaet spaeterer anwaltlicher Entscheidungen.

## Bewusst verschobene Aufgaben

- Integration des FOUNDATION-Rollenstubs beziehungsweise der alten projektbezogenen `agent_definitions` mit der neuen Registry: spaeterer eigener Task.
- Runtime-Enforcement deklarativer Capabilities, Codex/OpenAI, Worker/Scheduling, Workflow-Orchestrierung, GitHub und echte Agentenausfuehrung: `REAL_RUNTIME_HARDENING` beziehungsweise zugeordnete spaetere Meilensteine, fail-closed.
- Reale Identitaeten, Kundendaten, Provider-, Datenschutz-, Release- und Production-Gates: spaetere separate Freigabestufen. Production deployment bleibt `DISABLED`.

## Strukturierter Blocker

- Nicht erfuelltes Akzeptanzkriterium: Kriterium 4, wonach Aenderungen neue Versionen derselben stabilen Agentendefinition erzeugen. Die stabile `agentId`-Linie ist ueber `createDefinition` und die Datenbank-Constraints umgehbar.
- Reproduzierbare Evidenz: Zwei `createDefinition`-Aufrufe mit gleichem `agentKey`, unterschiedlichen Versionen und unterschiedlichen beziehungsweise automatisch erzeugten `agentId`-Werten kollidieren weder mit `UNIQUE(agent_key,version)` noch mit `UNIQUE(agent_id,version)`. Fundstellen: `packages/database/src/agent-registry.ts`, Methode `createDefinition`, und Migration `010`, Unique-Constraints.
- Weiterer fehlender Nachweis: Der Rollback-Test scheitert beim Lesen der unbekannten Zielversion vor einer Mutation und beweist nicht den Rollback nach bereits begonnenem Schreibvorgang.
- Betroffener Scope: stabile Agentenidentitaet, Versionserstellung und atomarer Fehlernachweis der Registry.
- Verbrauchter Reparaturdurchlauf: `repair ordinal 1/1`; eine weitere automatische Reparatur ist nicht zulaessig.
- Erforderliche manuelle Entscheidung: Einen neuen eng begrenzten Task mit neuem unveraenderlichem Arbeitsvertrag und neuer festgelegter Writer-Identitaet autorisieren. Er muss die bijektive `agentKey`-/`agentId`-Identitaetslinie atomar erzwingen, `createDefinition` auf einen erstmaligen Key begrenzen und einen Rollback nach begonnener Mutation deterministisch testen. Danach sind alle Pflichtgates und vier Reviews auf neu fixiertem Stand erneut erforderlich.

## Finaler Abschluss

Abschlussstatus: `BLOCKED - DEVELOPMENT ONLY`.

Offene Findings ausserhalb dieses Tasks blockieren diesen Abschluss nicht; der Blocker oben liegt unmittelbar in Akzeptanzkriterium 4. GitHub-Integration bleibt `NO`, automatische Projektausfuehrung bleibt `NO`, Production deployment bleibt `DISABLED`.

`AGENT REGISTRY NICHT BESTANDEN  DEVELOPMENT ONLY`
