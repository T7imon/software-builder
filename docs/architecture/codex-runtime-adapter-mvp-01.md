# CODEX-RUNTIME-ADAPTER-MVP-01

Release level: `DEVELOPMENT_ONLY`

Production deployment: `DISABLED`

## Unveraenderlicher Task-Vertrag

- **Task:** `CODEX-RUNTIME-ADAPTER-MVP-01`
- **Branch:** `feature/codex-runtime-adapter-mvp`
- **Ausgangsstand:** `d2f6a8386f1d58370cb927c464b65dcb5ebefcb2`
- **Vertragsbeginn:** 2026-07-15T21:07:57+02:00
- **Maximales Zeitbudget:** acht Arbeitsstunden innerhalb dieser Workflow-Ausfuehrung, spaetestens bis 2026-07-16T05:07:57+02:00
- **Writer-Identitaet:** genau und ausschliesslich `CODEX-RUNTIME-ADAPTER-MVP-01-EXECUTOR`
- **Reparaturbudget:** nach der Erstimplementierung hoechstens ein eng begrenzter automatischer Reparaturdurchlauf (`1/1`) durch dieselbe Writer-Identitaet
- **Zulaessige Abschlussstatus:** `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`
- **Freigabestufe:** ausschliesslich `DEVELOPMENT_ONLY`
- **Exakter Erfolgsstatus:** `CODEX RUNTIME ADAPTER MVP BESTANDEN  DEVELOPMENT ONLY`

Dieser Vertrag ist ab seiner Fixierung unveraenderlich. Die nachfolgenden Abschnitte duerfen Implementierungs-, Pruef-, Smoke-Test-, Review- und Abschlussnachweise ergaenzen, aber Scope, Writer-Identitaet, Zeitbudget, Reparaturbudget, erlaubte Dateien, Gates oder Freigabestufe nicht erweitern oder umdeuten.

### Owner-Autorisierung und Verhaeltnis zu spaeterem Hardening

Die konkrete Owner-Anweisung fuer diesen Task ist die eng begrenzte Ausnahme von der bisher allgemeinen Sperre fuer `AGENT_RUNTIME=codex`: Der Adapter darf ausschliesslich bei expliziter Development-Konfiguration einen echten, einzelnen, read-only `PLANNER`-Turn in einem persistent registrierten, erneut verifizierten `READY`-Builder-Workspace ausfuehren. Innerhalb dieser Workflow-Ausfuehrung ist genau ein echter Smoke-Test mit synthetischen Daten autorisiert.

Diese Ausnahme erlaubt weder automatische Projektausfuehrung noch weitere Rollen, Schreibzugriff, Shell-Ausfuehrung im Zielworkspace, GitHub, Websuche, Netzwerktools, MCP, externe Veroeffentlichung, Release Candidate, Deployment oder Production. `REAL_RUNTIME_HARDENING` bleibt zwingend und fail-closed fuer Real-Runtime-Attestation, beweissichere Prozessbaumbeendigung, Credential-Widerruf, verteilte Recovery, schreibende Agenten, GitHub, `RELEASE_CANDIDATE` und `PRODUCTION`. Production deployment bleibt fuer Builder V1 `DISABLED`.

### Scope

Implementiert wird ein offizieller TypeScript-SDK-basierter `CodexAgentRuntime`, der sich in die vorhandene `AgentRuntime`-Abstraktion und den persistenten Worker-/Job-/Lease-/Fencing-Vertrag einfuegt. Die bestehende `FakeAgentRuntime` bleibt vollstaendig erhalten und ist bei fehlendem Wert oder `AGENT_RUNTIME=fake` alleiniger Standard. `AGENT_RUNTIME=codex` aktiviert ausschliesslich den neuen Planner-Pfad; unbekannte Werte und jeder Startfehler werden fail-closed abgelehnt, ohne Fake-Fallback.

Der Codex-Pfad unterstuetzt genau einen Turn fuer die Rolle `PLANNER`, bindet den Run an ein persistentes unveraenderliches Agent Assignment und die konkret zugewiesene Registry-Version, verwendet nur den durch `verifyWorkspace` erneut bestaetigten kanonischen Workspace-Pfad, erzeugt einen vertrauenswuerdig aufgebauten Prompt, validiert eine kleine strukturierte Planner-Ausgabe, persistiert minimierte Provider-/Thread-/Modell-/Usage-Metadaten soweit das installierte SDK sie liefert und behandelt Timeout, Cancellation, Lease-Verlust, Replay und unklare Recovery fail-closed.

Der offizielle SDK-Pfad ist `@openai/codex-sdk`. Veroeffentlichte stabile Zielversion bei Vertragsfixierung ist `0.144.4`; installiert und verwendet werden duerfen ausschliesslich APIs, Typen und Optionen der tatsaechlich in Lockfile und `node_modules` aufgeloesten Version. Kein Modellname wird hardcodiert. `CODEX_MODEL` ist optional; ohne Wert gilt der Codex-/SDK-Standard.

### Erlaubte Anwendungscode-, Test-, Migrations- und Konfigurationsdateien

Die einzige Writer-Identitaet darf ausschliesslich folgende Dateien anlegen oder aendern:

- `.env.example`
- `package.json`
- `package-lock.json`
- `vitest.codex-smoke.config.ts`
- `packages/agent-runtime/package.json`
- `packages/agent-runtime/src/index.ts`
- `packages/agent-runtime/src/runtime.ts`
- `packages/agent-runtime/src/schemas.ts`
- `packages/agent-runtime/src/runtime.test.ts`
- `packages/agent-runtime/src/codex-provider.ts`
- `packages/agent-runtime/src/codex-runtime.ts`
- `packages/agent-runtime/src/codex-schemas.ts`
- `packages/agent-runtime/src/codex-runtime.test.ts`
- `packages/agent-runtime/src/codex-schemas.test.ts`
- `apps/worker/package.json`
- `apps/worker/src/config.ts`
- `apps/worker/src/config.test.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/job-processor.ts`
- `apps/worker/src/job-processor.test.ts`
- `apps/worker/src/postgres-runtime-store.ts`
- `apps/worker/src/runtime-factory.ts`
- `apps/worker/src/runtime-factory.test.ts`
- `apps/worker/src/codex-runtime-context.ts`
- `apps/worker/src/codex-runtime-context.test.ts`
- `apps/worker/src/codex-runtime.real-smoke.ts`
- `packages/database/migrations/016_codex_runtime_adapter_mvp.sql`
- `packages/database/src/agent-job-repository.ts`
- `packages/database/src/codex-runtime-repository.ts`
- `packages/database/src/codex-runtime-repository.test.ts`
- `packages/database/src/codex-runtime-repository.integration.test.ts`
- `packages/database/src/index.ts`
- `packages/database/src/schema.test.ts`

Der Hauptagent darf ausschliesslich dieses Dokument und `PROJECT_STATE.md` dokumentarisch aendern. `packages/project-workspace/**`, Planning-/Implementation-Orchestrator-Produktionscode und bestehende Migrationen `001` bis `015` bleiben unveraendert. QA, Reviewer und Security arbeiten nach Writer-Freeze read-only. Legal ist fuer den synthetischen read-only Smoke-Test gemaess Owner-Vorgabe `NOT_APPLICABLE`.

### Pruefbare Akzeptanzkriterien

1. Fehlendes `AGENT_RUNTIME` und `AGENT_RUNTIME=fake` verwenden ausschliesslich `FakeAgentRuntime`; `codex` verwendet ausschliesslich `CodexAgentRuntime`; unbekannte Werte werden abgelehnt; es existiert kein stiller Fallback.
2. `CodexAgentRuntime` akzeptiert ausschliesslich `PLANNER`; `EXECUTOR`, `ARCHITECT`, `QA`, `REVIEWER`, `SECURITY`, `LEGAL_DE_EU` und `ORCHESTRATOR` werden vor Providerstart fail-closed abgelehnt.
3. Vor jedem Providerstart existieren ein persistentes Assignment und die exakt gebundene lesbare Registry-Version. Rolle, `agentId`, `agentKey` und `agentVersion` stimmen ueberein und bleiben gegen spaetere Registry-Aenderungen unveraenderlich.
4. Der Workspace ist persistent registriert, `READY`, nicht `ARCHIVED`, stimmt in `projectId`, `projectRevision` und Workspace-ID ueberein, besteht `verifyWorkspace` und liegt kanonisch innerhalb `BUILDER_WORKSPACE_ROOT`. Nur `VerifiedWorkspace.absolutePath`, niemals ein Jobpfad, wird dem SDK uebergeben.
5. Der installierte SDK-Stand erzwingt fuer den Turn `read-only`, verbietet interaktive Freigaben und konfiguriert die kleinsten offiziell unterstuetzten Berechtigungen ohne `danger-full-access` oder `full-auto`. Notwendige Web-/Netzwerk-/MCP-/Tool-Grenzen werden explizit deaktiviert, soweit die installierten Typen dies unterstuetzen. Fehlt eine notwendige sichere Option, stoppt der Task fail-closed.
6. Der kanonische Prompt besteht serverseitig aus unveraenderlichen Registry-Instructions, Projekt-/Revisionsbindung, begrenzter synthetischer Planning-Aufgabe, Ausgabeformat, Read-only-Grenze und Development-Disclaimer. Nicht vertrauenswuerdige Job-/Workspace-Inhalte koennen Rolle, Workspace, Sandbox oder Berechtigungen nicht aendern. Persistent gespeichert wird nur sein SHA-256-Digest.
7. Die Planner-Ausgabe enthaelt und validiert mindestens `status`, `summary`, `requirements`, `assumptions`, `openQuestions`, `recommendedNextStep`, optionale Provider-/Thread- und Modellreferenz sowie `startedAt` und `completedAt`. Ungueltige oder unvollstaendige Ausgabe wird niemals als Erfolg markiert. Chain-of-Thought und interne Reasoning-Inhalte werden nicht gespeichert.
8. Timeout, Cancel-Request, Auth-, SDK-, Workspace-, Rollen-, Output-, Provider- und erkennbare Usage-/Rate-Limit-Fehler werden sanitisiert. Rohfehler, Tokens, API-Schluessel, Umgebungsvariablen und `auth.json` werden weder gelesen noch persistiert oder geloggt.
9. Startreservierung, Claim, Lease-Generation und Fence erlauben fuer denselben Job genau einen Providerstart. Parallele oder doppelte Starts, Statusabfragen, Callback-Replays, spaete Ergebnisse und verlorene Leases erzeugen keinen zweiten Turn und koennen keinen stale Erfolg persistieren.
10. Ein nach Crash nicht eindeutig fortsetzbarer Codex-Run wird `RECOVERY_REQUIRED` beziehungsweise gleichwertig fail-closed behandelt und niemals blind neu gestartet. `continueRun` startet keinen zweiten Turn; Status und Resultat werden ueber die bestehende persistente Status-/Snapshot-Grenze gelesen.
11. Normale Tests, CI, Typecheck, Build und Modulimporte starten keinen Codex-Prozess, verwenden keine lokalen Credentials und benoetigen kein Netzwerk. Der echte Smoke-Test ist separat und nur bei `CODEX_REAL_SMOKE_TEST=1` zusammen mit `AGENT_RUNTIME=codex` aktivierbar.
12. Genau ein echter Smoke-Test erstellt einen temporaeren synthetischen lokalen Git-Workspace, aktiven PLANNER und korrektes Assignment, fuehrt genau einen kurzen read-only Turn aus, validiert das Ergebnis und weist per Dateidigest und Git-Diff nach, dass keine Datei veraendert wurde.
13. Alle Pflichtgates und die drei beauftragten Abschlussreviews bestehen auf demselben fixierten finalen Stand. Fake Runtime, Worker, Workspace, Registry/Assignment und Orchestratoren bleiben regressionsfrei.

### Verbindlicher Sicherheits- und Recovery-Rahmen

- Das SDK wird hinter einer kleinen internen `CodexProvider`-Schnittstelle gekapselt. Normale Tests verwenden ausschliesslich Testdoubles und sind keine echte Codex-Evidenz.
- Der Provider darf erst nach atomarer persistenter Startautorisierung aufgerufen werden. Nur der Gewinner darf einen Thread erzeugen. `DISPATCHED` beziehungsweise ein vergleichbarer unklarer Zustand ohne sicher fortsetzbare persistente Providerreferenz fuehrt zu `RECOVERY_REQUIRED`, nie zu einem zweiten Start.
- Lease-Verlust und Cancellation loesen, soweit vom SDK unterstuetzt, best-effort ein lokales Abort-Signal aus. Ohne beweissichere Termination wird kein `CANCELLED` behauptet. Prozessbaumbeweis und Credential-Widerruf bleiben `REAL_RUNTIME_HARDENING`.
- Providerresultate werden nur unter noch gueltigem Job-/Run-/Claim-/Fence-Kontext persistiert. Spaete oder doppelte Callback-/Promise-Ergebnisse sind wirkungslos.
- Provider- und Threadreferenzen, Modell und Usage werden nur gespeichert, wenn die installierte SDK-Version sie offiziell liefert. Keine Metadaten werden erfunden.
- Authentifizierung wird ausschliesslich dem lokalen Codex-/SDK-Start ueberlassen. Der Adapter liest oder kopiert `auth.json` nie und prueft nur den sanitisierten Starterfolg beziehungsweise -fehler.

### Ausdruecklich ausgeschlossen

Echter Executor oder irgendeine schreibende Rolle, mehrere Codex-Turns, automatische Reparatur, beliebige Zielworkspace-Shellbefehle, Git-Commit, GitHub, Weboberflaeche, oeffentliche HTTP-API, automatische Projektausfuehrung, Deployment, Production, echte Kundendaten, Prozessbaum-Beweis, Credential-Widerruf, verteilte Real-Runtime-Recovery und eine allgemeine Aufhebung von `REAL_RUNTIME_HARDENING`.

### Pflichtpruefungen

Alle Datenbank- und Root-Testlaeufe erfolgen seriell; keine zwei Tests duerfen dieselbe Testdatenbank oder denselben Workspace-Root parallel zuruecksetzen.

1. Codex-Runtime-Unit- und Provider-Double-Tests
2. Runtime-Auswahl- und Worker-Tests
3. Workspace-Tests
4. Agent-Registry- und Assignment-Tests
5. Planning- und Implementation-Orchestrator-Tests
6. PostgreSQL-Integrationstests ohne Skips
7. vollstaendige serielle Root-Test-Suite
8. Lint
9. Typecheck
10. Build
11. `git diff --check`
12. genau ein explizit aktivierter echter Codex-Smoke-Test

Nach Implementierung und Gates endet der Writer-Zugriff. Der Anwendungscode-Stand wird durch HEAD, Dateiliste, Diff und SHA-256-Digests fixiert. Erst danach pruefen QA, allgemeiner Reviewer und Security parallel und read-only denselben Stand ausschliesslich gegen SDK-Nutzung, Read-only-Sandbox, Workspace-Bindung, Runtime-Auswahl, Secret-Schutz, strukturierte Ausgabe, Idempotenz und die Akzeptanzkriterien dieses Tasks. Legal bleibt `NOT_APPLICABLE`.

## Kurzer Implementierungsplan

1. Das offizielle SDK exakt im Runtime-Paket installieren und seine gelieferten TypeScript-Typen fuer Thread-, Turn-, Sandbox-, Approval-, Output-, Abort- und Metadatenoptionen vollstaendig pruefen.
2. Strikte Codex-Planner-Schemas, kanonischen Prompt und eine kleine testbare Provider-Grenze in `@software-builder/agent-runtime` ergaenzen, ohne `FakeAgentRuntime` oder die bestehende Lifecycle-Abstraktion zu ersetzen.
3. Runtime-Auswahl und lazy Worker-Wiring implementieren; Default und normale Tests bleiben Fake-only.
4. Migration 016 und eine schmale Codex-Persistenzgrenze fuer Workspace-/Revision-/Assignment-Bindung, atomare Startreservierung, Provider-/Threadreferenz, Prompt-Digest, Ausgabevalidierung, Modell/Usage, sanitisierten Fehler und Recovery-Zustand anlegen.
5. Workspace-Verifikation und Registry-Snapshot im Worker vor jedem Start erzwingen; Timeout, Abort, Lease-Verlust, Replay und Restart fail-closed behandeln.
6. Unit-, Worker- und PostgreSQL-Nachweise mit Provider-Testdoubles umsetzen; anschliessend alle normalen Gates seriell ausfuehren.
7. Den separaten synthetischen read-only Smoke-Test genau einmal ausfuehren, Writer-Freeze herstellen und QA, Reviewer sowie Security parallel read-only pruefen.

## Ausfuehrungs- und Abschlussnachweise

Status bei Vertragsfixierung: `IN_PROGRESS - DEVELOPMENT_ONLY`.

### Strukturierter Blocker: SDK kann geerbte MCP-Server nicht pro Run deaktivieren

- **Abschlussstatus:** `BLOCKED - DEVELOPMENT_ONLY`
- **Festgestellt am:** 2026-07-15T21:13:36+02:00
- **Nicht erfuellte Akzeptanzkriterien:** Akzeptanzkriterium 5 (notwendige MCP-Grenze) und deshalb Akzeptanzkriterium 12 (genau ein sicherer echter Smoke-Test)
- **Betroffener Scope:** offizieller Codex-SDK-Providerstart und der autorisierte synthetische read-only `PLANNER`-Smoke-Test
- **Reparaturdurchlauf:** `0/1` verbraucht; es gab noch keine Erstimplementierung und daher keinen automatischen Reparaturdurchlauf
- **Writer-Status:** Die festgelegte Writer-Identitaet wurde nicht gestartet. Es wurden keine Anwendungscode-, Test-, Migrations-, Konfigurations-, Package- oder Lockfile-Aenderungen vorgenommen.

Reproduzierbare Evidenz:

1. Die am 2026-07-15 veroeffentlichte stabile Zielversion `@openai/codex-sdk@0.144.4` wurde ueber die offizielle npm-Paketmetadaten bestimmt. Das offiziell veroeffentlichte Tarball und dessen `dist/index.d.ts` wurden read-only geprueft. `CodexOptions` bietet nur `codexPathOverride`, `baseUrl`, `apiKey`, `config` und `env`; `ThreadOptions` bietet Modell-, Sandbox-, Workspace-, Netzwerk-, Web-, Approval- und Additional-Directory-Optionen. Eine per-Run-Option wie `mcpServers`, `noMcp` oder `disableMcp` existiert nicht.
2. Die offizielle SDK-Dokumentation beschreibt generische CLI-Config-Overrides. Der Override `config: { mcp_servers: {} }` ist jedoch kein sicherer Ersatz: Der dokumentierte nicht-destruktive Config-Merge entfernt geerbte MCP-Server nicht. Das offizielle Codex-Issue `#16045` dokumentiert genau dieses leere-Override-Problem; `#9550` bestaetigt die fehlende per-session MCP-API im TypeScript-SDK.
3. Die offizielle Managed-Configuration-Dokumentation nennt als fail-closed Kontrolle einen vorhandenen, leeren `[mcp_servers]`-Allowlist-Abschnitt in der System-/Enterprise-`requirements.toml`. Der dokumentierte Windows-Pfad wurde ohne Inhaltszugriff geprueft:

   ```text
   C:\ProgramData\OpenAI\Codex\requirements.toml
   Exists: False
   ```

4. Ein isoliertes `CODEX_HOME` waere kein zulaessiger Ersatz, weil die autorisierte bestehende lokale Codex-Authentifizierung dann ohne Lesen oder Kopieren von `auth.json` nicht verfuegbar waere. Das Lesen, Kopieren oder Verlinken der Authentifizierungsdatei ist ausdruecklich verboten.
5. `sandboxMode: "read-only"`, `approvalPolicy: "never"`, ein kanonisch verifizierter `workingDirectory`-Wert und `webSearchMode: "disabled"` sind in `0.144.4` offiziell typisiert. Diese Optionen loesen aber nicht die separate MCP-Vererbung. Deshalb wurde weder ein Codex-Prozess noch ein echter Turn gestartet.

Provider-Test, normaler Gate-Lauf und Abschlussreviews wurden nicht begonnen, weil sie den fehlenden realen Sicherheitsvorbehalt nicht beseitigen koennen. Der echte Smoke-Test wurde `0`-mal ausgefuehrt. Damit wurden weder Account-Limits noch Netzwerk noch lokale Codex-Credentials verwendet. Fake Runtime und der gesamte bestehende Anwendungscode bleiben unveraendert.

**Erforderliche manuelle Entscheidung beziehungsweise externe Zustandsaenderung:** Ein Administrator muss ausserhalb dieses unveraenderlichen Task-Vertrags die offizielle System-/Enterprise-Policy mit einem vorhandenen leeren `[mcp_servers]`-Abschnitt unter `C:\ProgramData\OpenAI\Codex\requirements.toml` installieren und deren Wirksamkeit nachweisen. Alternativ waere eine Aenderung der ausdruecklichen No-MCP-Anforderung erforderlich; das waere eine Scope-Aenderung und benoetigt einen neuen Task-Vertrag. Der Adapter und der echte Smoke-Test bleiben bis dahin fail-closed gesperrt.

### Gate- und Review-Status beim Stop

- Codex-Runtime-Unit-Tests: `NOT_RUN - blocked before implementation`
- Runtime-/Worker-, Workspace-, Registry-/Assignment- und Orchestrator-Tests: `NOT_RUN - existing code unchanged`
- PostgreSQL-Integration und serielle Root-Suite: `NOT_RUN - existing code unchanged`
- Lint, Typecheck und Build: `NOT_RUN - existing code unchanged`
- `git diff --check`: `PASSED` fuer die bis zum Stop vorhandenen Dokumentationsaenderungen
- echter Codex-Smoke-Test: `NOT_RUN (0 turns)`
- QA, allgemeines Review und Security: `NOT_RUN - no fixed implemented application-code stand`
- Legal: `NOT_APPLICABLE` gemaess Owner-Vorgabe
- Production deployment: `DISABLED`

# CODEX-EXEC-RUNTIME-ADAPTER-MVP-02

Release level: `DEVELOPMENT_ONLY`

Production deployment: `DISABLED`

## Unveraenderlicher Task-Vertrag

- **Task:** `CODEX-EXEC-RUNTIME-ADAPTER-MVP-02`
- **Branch:** `feature/codex-runtime-adapter-mvp`
- **Ausgangsstand:** `312a6a0f141b901fbe6d1af0dc285240bc604ced`
- **Vertragsbeginn:** 2026-07-15T21:42:23+02:00
- **Maximales Zeitbudget:** acht Arbeitsstunden innerhalb dieser Workflow-Ausfuehrung, spaetestens bis 2026-07-16T05:42:23+02:00
- **Writer-Identitaet:** genau und ausschliesslich `CODEX-EXEC-RUNTIME-ADAPTER-MVP-02-EXECUTOR`
- **Reparaturbudget:** nach der Erstimplementierung hoechstens ein eng begrenzter automatischer Reparaturdurchlauf (`1/1`) durch dieselbe Writer-Identitaet
- **Zulaessige Abschlussstatus:** `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`
- **Freigabestufe:** ausschliesslich `DEVELOPMENT_ONLY`
- **Exakter Erfolgsstatus:** `CODEX EXEC RUNTIME ADAPTER MVP BESTANDEN  DEVELOPMENT ONLY`

Dieser Vertrag ist ab seiner Fixierung unveraenderlich. Die nachfolgenden Abschnitte duerfen Implementierungs-, Paket-/CLI-, Pruef-, Smoke-Test-, Review- und Abschlussnachweise ergaenzen, aber Scope, Writer-Identitaet, Zeitbudget, Reparaturbudget, erlaubte Dateien, Gates oder Freigabestufe nicht erweitern oder umdeuten. Der vorstehende historische Vertrag und Blocker von `CODEX-RUNTIME-ADAPTER-MVP-01` bleiben unveraendert erhalten; dieser neue Task ist die ausdruecklich autorisierte Owner-Nachfolgeentscheidung mit neuer Writer-Identitaet.

### Owner-Entscheidung und Scope

Der SDK-Zwang des Vorgaengertasks ist fuer diesen eng begrenzten MVP aufgehoben. `@openai/codex-sdk` wird nicht verwendet. Implementiert wird stattdessen ein `CodexExecAgentRuntime`, der die offiziell dokumentierte non-interaktive Schnittstelle `codex exec` fuer genau einen read-only `PLANNER`-Turn in einem persistent registrierten, erneut verifizierten synthetischen Builder-Workspace nutzt.

Die bestehende `FakeAgentRuntime` bleibt bei fehlendem `AGENT_RUNTIME` und bei `AGENT_RUNTIME=fake` alleiniger Standard. Nur `AGENT_RUNTIME=codex` aktiviert den Codex-Pfad; unbekannte Werte, unsichere Konfiguration und jeder Codex-Startfehler werden ohne Fake-Fallback fail-closed abgelehnt. Alle anderen Rollen werden vor einem Prozessstart abgelehnt.

Die Anwendung pinnt exakt `@openai/codex@0.144.4`, die am Vertragsbeginn aktuelle stabile npm-Version. Nach lokaler Installation werden Version, Paketmetadaten, `bin`-Eintrag und Hilfeausgaben erneut gegen genau diese Projektabhaengigkeit geprueft. Vorlaeufige, projektunabhaengige Read-only-Evidenz aus derselben Version bestaetigt `bin/codex.js` sowie die benoetigten Optionen. Eine globale `codex`-Installation ist auf dem System nicht vorhanden und wird weder vorausgesetzt noch als Fallback verwendet.

Der Prozess wird ausschliesslich ueber `node:child_process.spawn` mit `shell: false`, `windowsHide: true` auf Windows, fester Argumentliste, Prompt ueber `stdin` und minimaler Umgebungs-Allowlist gestartet. Der JavaScript-Launcher wird sicher aus den installierten Paketmetadaten aufgeloest, auf die gepinnte Paketversion und einen enthaltenen physischen Bin-Pfad geprueft und ueber `process.execPath` ausgefuehrt. Benutzer-, Job-, Registry- oder Workspace-Daten koennen keine zusaetzlichen CLI-Flags, Kommandos oder Pfade einfuegen.

Jeder Run verwendet das verifizierte dedizierte `BUILDER_CODEX_HOME`, `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, `--json`, `--sandbox read-only`, die tatsaechlich unterstuetzte globale Option `--ask-for-approval never`, `--cd` mit dem verifizierten Workspace, `--output-schema` und den festen Config-Override `web_search="disabled"`. Ein optionales, streng validiertes `CODEX_MODEL` wird nur ueber `--model` uebergeben. Die genaue Argumentreihenfolge bleibt an die lokal gepinnte Hilfeausgabe gebunden.

`BUILDER_CODEX_HOME` muss gesetzt, absolut, vorhanden, physisch und kanonisch stabil sein sowie ausserhalb des Builder-Repositories, des Zielworkspaces und des normalen `CODEX_HOME` des Builder-Prozesses liegen. Der Builder oeffnet, liest, kopiert, parst, protokolliert oder persistiert `auth.json` und Tokenmaterial niemals. Nur der Child-Prozess erhaelt `CODEX_HOME=<verifizierter BUILDER_CODEX_HOME>` und darf die dortige Anmeldung selbst verwenden. Es erfolgt keine Aenderung an `C:\ProgramData\OpenAI\Codex\requirements.toml` oder einer anderen systemweiten Policy.

Vor jedem Start werden der persistente Job, Claim, Lease Generation und Fencing Token, das unveraenderliche Assignment, die konkret zugewiesene Registry-Version, Rolle, Projekt, Revision, Workspace-ID, `READY`-/Nicht-`ARCHIVED`-Status, kanonischer Workspace-Pfad, lokales Git-Repository, erwarteter aktiver Branch und die erneute `verifyWorkspace`-Pruefung gebunden. Eine neue unveraenderliche persistente Job-zu-Projekt-Revision-zu-Workspace-Bindung ist erforderlich, weil `AgentTask.inputRef` keine Autoritaet ist und der initiale Planning-PLANNER vor Owner-Approval noch keinen READY-Workspace besitzen kann. Ein beliebiger oder nur aus Nutzdaten abgeleiteter Workspace ist verboten.

Nach erfolgreicher Workspace-Verifikation wird jede projektlokale `.codex`-Konfiguration fail-closed abgelehnt, insbesondere `config.toml`, Plugins, Skills, weitere Codex-Konfiguration sowie erkennbare lokale Plugin-/MCP-Konfiguration. Normale `AGENTS.md`-Dateien duerfen existieren, koennen aber keine Runtime-Berechtigung erhoehen. Workspace- und Projektinhalte bleiben untrusted data.

Der JSONL-Eventstrom wird begrenzt und defensiv ausgewertet. `mcp_tool_call` und `web_search` fuehren sofort zu `SECURITY_POLICY_VIOLATION`, best-effort Prozessabbruch, ausschliesslich sanitierter Audit-Evidence und niemals zu erfolgreicher Completion oder Orchestrator-Promotion. Unbekannte Events werden verworfen und nicht roh protokolliert; Reasoning-Inhalte werden weder gespeichert noch ausgegeben. Ungueltiges JSONL, ungueltige strukturierte Ausgabe, Spawnfehler, Timeout, Cancellation, Lease-/Fence-Verlust und unklare Recovery enden sanitisiert und fail-closed.

Eine persistente Startreservierung linearisiert den kostenpflichtigen Providerstart. Nur der frische aktive Claim-/Lease-/Fence-Gewinner darf genau einen Prozess starten. Ein bereits dispatchter oder nach Crash unklarer Start wird nie automatisch erneut gespawnt, sondern `RECOVERY_REQUIRED` oder gleichwertig terminal blockiert. Statusabfragen und `continueRun` starten keinen Prozess. Spaete Ergebnisse nach Lease-/Fence-Verlust werden verworfen. Best-effort Abort/Kill ist fuer Timeout, Cancellation und Lease-Verlust zulaessig; eine beweissichere Prozessbaumterminierung oder reale Termination-Attestation wird nicht behauptet.

### Erlaubte Anwendungscode-, Test-, Migrations- und Konfigurationsdateien

Die einzige Writer-Identitaet darf ausschliesslich folgende Dateien anlegen oder aendern:

- `.env.example`
- `package.json`
- `package-lock.json`
- `vitest.codex-smoke.config.ts`
- `packages/agent-runtime/package.json`
- `packages/agent-runtime/src/index.ts`
- `packages/agent-runtime/src/runtime.ts`
- `packages/agent-runtime/src/schemas.ts`
- `packages/agent-runtime/src/runtime.test.ts`
- `packages/agent-runtime/src/codex-cli.ts`
- `packages/agent-runtime/src/codex-cli.test.ts`
- `packages/agent-runtime/src/codex-provider.ts`
- `packages/agent-runtime/src/codex-provider.test.ts`
- `packages/agent-runtime/src/codex-runtime.ts`
- `packages/agent-runtime/src/codex-runtime.test.ts`
- `packages/agent-runtime/src/codex-schemas.ts`
- `packages/agent-runtime/src/codex-schemas.test.ts`
- `packages/agent-runtime/src/codex-planner-output.schema.json`
- `apps/worker/package.json`
- `apps/worker/src/config.ts`
- `apps/worker/src/config.test.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/job-processor.ts`
- `apps/worker/src/job-processor.test.ts`
- `apps/worker/src/worker-loop.ts`
- `apps/worker/src/postgres-runtime-store.ts`
- `apps/worker/src/runtime-factory.ts`
- `apps/worker/src/runtime-factory.test.ts`
- `apps/worker/src/codex-runtime-context.ts`
- `apps/worker/src/codex-runtime-context.test.ts`
- `apps/worker/src/codex-runtime-context.integration.test.ts`
- `apps/worker/src/codex-runtime.real-smoke.ts`
- `packages/database/migrations/016_codex_exec_runtime_adapter_mvp.sql`
- `packages/database/src/agent-job-repository.ts`
- `packages/database/src/codex-runtime-repository.ts`
- `packages/database/src/codex-runtime-repository.test.ts`
- `packages/database/src/codex-runtime-repository.integration.test.ts`
- `packages/database/src/index.ts`
- `packages/database/src/schema.test.ts`

Der Hauptagent darf ausschliesslich dieses Dokument und `PROJECT_STATE.md` dokumentarisch aendern. `packages/project-workspace/**`, Planning-/Implementation-Orchestrator-Produktionscode und bestehende Migrationen `001` bis `015` bleiben unveraendert. QA, Reviewer und Security arbeiten nach dem Writer-Freeze read-only. Legal ist gemaess Owner-Entscheidung `NOT_APPLICABLE`.

### Pruefbare Akzeptanzkriterien

1. Fehlendes `AGENT_RUNTIME` und `AGENT_RUNTIME=fake` verwenden ausschliesslich `FakeAgentRuntime`; `AGENT_RUNTIME=codex` verwendet ausschliesslich `CodexExecAgentRuntime`; unbekannte Werte und Codex-Fehler werden ohne stillen Fallback abgelehnt.
2. Der Codex-Pfad akzeptiert ausschliesslich `PLANNER`; alle anderen Rollen werden vor Bin-Aufloesung oder Providerstart fail-closed abgelehnt.
3. Exakt die lokal gepinnte `@openai/codex`-Version und ihr verifizierter Paket-Bin werden ueber `process.execPath` und `spawn` mit `shell: false`, fester Argumentliste, `windowsHide` auf Windows und Prompt ueber `stdin` verwendet. Kein globaler oder benutzerdefinierter Kommando-/Argumentpfad existiert.
4. Dediziertes `BUILDER_CODEX_HOME`, minimale secret-freie Umgebung, `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, `--json`, `read-only`, Approval `never`, deaktivierte Websuche, verifizierter Working Directory und strukturiertes Output-Schema sind fuer jeden echten Start aktiv.
5. Assignment und konkrete Registry-Version sowie persistente Projekt-, Revisions- und Workspace-Bindung stimmen exakt; `verifyWorkspace` bestaetigt erneut READY, Nicht-ARCHIVED, kanonischen Root, lokales Git und aktiven Branch. Projektlokale Codex-Konfiguration wird fail-closed abgelehnt.
6. Der kanonische serverseitige Prompt bindet Registry-Instructions, Projekt und Revision, eine begrenzte Planning-Aufgabe, Read-only-Regeln, Schema und Development-Disclaimer. Untrusted Workspace-/Projektinhalte koennen Rolle, Berechtigungen, MCP, Websuche, Workspace oder CLI-Argumente nicht aendern. Persistiert wird nur der Prompt-SHA-256.
7. Die finale Ausgabe validiert streng `status`, `summary`, `requirements`, `assumptions`, `openQuestions` und `recommendedNextStep`. Thread-ID, Modell, Usage sowie Start-/Endzeit werden nur soweit sicher verfuegbar minimiert gespeichert. Reasoning, rohe Events, rohe Providerfehler und Secrets werden nicht gespeichert.
8. Jeder MCP- oder Web-Search-Event beendet den Lauf als `SECURITY_POLICY_VIOLATION`, verhindert Erfolg und Promotion und speichert nur sanitierte Evidence. Ungueltiges JSONL oder ungueltige finale Ausgabe fuehrt zu `FAILED`.
9. Pro Job entsteht hoechstens ein Codex-Prozess; parallele Starts haben genau einen persistenten Gewinner; nur ein aktueller Lease-/Fence-Inhaber startet; Statusabfragen, Replays und Restart starten keinen zweiten Turn; spaete oder stale Ergebnisse koennen keinen Erfolg committen; unklare Recovery erfordert eine neue explizite Entscheidung.
10. Festes Development-Timeout, Abort-/Kill-Steuerung und sanitierte Timeout-/Cancellation-Fehler sind implementiert, ohne beweissichere Prozessbaumterminierung oder reale Termination-Attestation zu behaupten.
11. Normale Tests, Build, Typecheck und Modulimporte starten keinen Codex-Prozess, lesen keine Credentials und benoetigen kein Netzwerk. Providerstart und JSONL-Auswertung sind hinter kleinen testbaren Grenzen gekapselt und werden normal ausschliesslich mit kontrollierten Testdoubles geprueft.
12. Die zwanzig vom Owner benannten Negativ-, Parallelitaets-, Recovery-, Secret- und Logging-Szenarien sind durch Unit-/Worker-/PostgreSQL-Tests abgedeckt.
13. Genau ein echter opt-in Smoke-Test mit `AGENT_RUNTIME=codex`, `CODEX_REAL_SMOKE_TEST=1` und verifiziertem `BUILDER_CODEX_HOME` erstellt synthetische persistente Registry-/Assignment-/Workspace-Bindungen, startet genau einen kurzen Turn und weist per Dateidigest sowie Git-Status/-Diff nach, dass kein Workspace-Inhalt veraendert wurde und weder MCP noch Websuche auftrat.
14. Alle Pflichtgates und QA, allgemeines Code-Review sowie Security bestehen auf demselben fixierten finalen Stand. Fake Runtime, Worker, Workspace, Registry/Assignment und Orchestratoren bleiben regressionsfrei. Legal bleibt `NOT_APPLICABLE`.

### Pflichtpruefungen

Alle Datenbank- und Root-Testlaeufe erfolgen seriell und ohne konkurrierende Resets:

1. Codex-Exec-Runtime-Unit-Tests
2. Provider-/JSONL-Parser-Tests
3. Runtime-/Worker-Tests
4. Workspace-Tests
5. Registry- und Assignment-Tests
6. Planning- und Implementation-Orchestrator-Tests
7. PostgreSQL-Integrationstests ohne Skips
8. vollstaendige serielle Root-Test-Suite
9. Lint
10. Typecheck
11. Build
12. `git diff --check`
13. genau ein echter opt-in Codex-Smoke-Test

Nach Implementierung und Gates endet der Writer-Zugriff. Der Anwendungscode-Stand wird durch HEAD, Dateiliste, Diff und SHA-256-Digests fixiert. Erst danach pruefen QA, allgemeiner Reviewer und Security parallel und read-only denselben Stand ausschliesslich gegen diesen `DEVELOPMENT_ONLY`-Scope. Das Fehlen einer systemweiten `requirements.toml` ist fuer den autorisierten isolierten Smoke-Test kein Blocker; eine systemweit erzwungene MCP-Allowlist oder gleichwertige Provider-Isolation bleibt ein zwingendes spaeteres Production Gate.

### Kurzer Implementierungsplan

1. `@openai/codex@0.144.4` lokal pinnen und die installierte Paketmetadaten-, Bin-, Versions- und Help-Oberflaeche erneut verifizieren.
2. Strikte Planner-Schemas, kanonischen Prompt, sichere CLI-/CODEX_HOME-/Environment-Aufloesung und die kleine spawn-/JSONL-basierte Provider-Grenze implementieren.
3. Runtime-Auswahl und claim-gebundenes Worker-Wiring mit erneuter Workspace-/Git-/Registry-/Assignment-/Codex-Config-Pruefung ergaenzen; Fake bleibt Default.
4. Migration 016 und eine schmale Codex-Persistenzgrenze fuer unveraenderliche Job-/Revision-/Workspace-Bindung, atomare Startreservierung, minimierte Metadaten, sanitierte Fehler, Policy-Evidence und fail-closed Recovery implementieren.
5. Unit-, Worker- und PostgreSQL-Tests mit kontrollierten Prozessdoubles erstellen, anschliessend alle normalen Gates sequenziell ausfuehren und hoechstens einen eng begrenzten Reparaturdurchlauf zulassen.
6. Genau einen opt-in synthetischen realen Smoke-Turn ausfuehren, unveraenderten Workspace nachweisen, Writer-Freeze herstellen und QA, Reviewer sowie Security parallel read-only pruefen.

## Ausfuehrungs- und Abschlussnachweise fuer MVP-02

Status bei Vertragsfixierung: `IN_PROGRESS - DEVELOPMENT_ONLY`.

### Implementierter DEVELOPMENT_ONLY-Stand

Der einzige Writer `CODEX-EXEC-RUNTIME-ADAPTER-MVP-02-EXECUTOR` implementierte den eng begrenzten Adapter. `@openai/codex-sdk` wird nicht verwendet, weil der Vorgaengertask seine fehlende belastbare per-Run-Abschaltung geerbter MCP-Server fuer Version `0.144.4` nachgewiesen hat. Die ausdrueckliche Owner-Nachfolgeentscheidung verwendet deshalb vorlaeufig die offiziell dokumentierte non-interaktive CLI-Grenze `codex exec`. Eine spaetere SDK-Rueckkehr bleibt zulaessig, sobald das SDK eine gleichwertig starke per-Run-Isolation anbietet.

Die Anwendung pinnt `@openai/codex@0.144.4`. Die lokal installierte Paketmetadatei weist `bin.codex = bin/codex.js` aus; `node <lokaler-bin> --version` meldete `codex-cli 0.144.4`. Die lokale `codex exec --help`-Ausgabe bestaetigte die verwendeten Optionen. Eine globale `codex.cmd`-Datei wird nicht gesucht oder gestartet.

Der Prozessvertrag verwendet `node:child_process.spawn` mit `process.execPath`, dem verifizierten physischen lokalen JavaScript-Launcher als erstem Argument, `shell: false`, `windowsHide: true` auf Windows, dem kanonisch verifizierten Workspace als `cwd` und einer fest aufgebauten Argumentliste. Der Prompt wird ausschliesslich ueber `stdin` uebergeben. Die feste Liste enthaelt:

- die globale Option `--ask-for-approval never` vor `exec`;
- `exec`, `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, `--json` und `--strict-config`;
- feste `--disable`-Werte fuer Plugins, Apps, Hooks, Multi-Agent, Browser-/Computer-/Image-Funktionen, Remote-Plugins, MCP-Apps und weitere in `0.144.4` vorhandene Integrations-/Elicitation-Funktionen;
- `--sandbox read-only`, `--cd <verifizierter Workspace>`, `--output-schema <festes Schema>` und `--color never`;
- `--config web_search="disabled"` und `--config shell_environment_policy.inherit="none"`;
- optional genau ein streng validiertes `--model <CODEX_MODEL>`;
- `-` als fester stdin-Promptmarker.

Job-, Registry-, Workspace- und Promptdaten koennen keine CLI-Argumente oder Kommandos hinzufuegen. Fehlendes `AGENT_RUNTIME` und `AGENT_RUNTIME=fake` verwenden weiterhin `FakeAgentRuntime`; nur `AGENT_RUNTIME=codex` waehlt `CodexExecAgentRuntime`. Unbekannte Werte und alle Rollen ausser `PLANNER` werden ohne Fake-Fallback abgelehnt. Modulimport, normale Tests, Typecheck und Build starten keinen Codex-Prozess.

### CODEX_HOME-, Workspace- und Provider-Isolation

`BUILDER_CODEX_HOME` muss gesetzt, absolut, vorhanden, physisch, kanonisch stabil und ausserhalb von Repository, Zielworkspace und normalem Builder-`CODEX_HOME` liegen. Der Adapter prueft `auth.json` ausschliesslich mit Dateimetadaten und Realpath auf regulaere Datei, Link-/Junction- und Hardlink-Ausschluss; er oeffnet, liest, kopiert, parst, protokolliert oder persistiert den Inhalt nie. Die CLI selbst darf die Anmeldung aus `CODEX_HOME=<verifiziertes BUILDER_CODEX_HOME>` verwenden.

Jeder Run erhaelt zusaetzlich ein frisches leeres temporaeres `HOME`/`USERPROFILE`. Die Child-Umgebung ist an Builder- und Provider-Grenze allowlist-basiert und enthaelt nur `CODEX_HOME` sowie die erforderlichen Plattformwerte `PATH`, `PATHEXT`, `SystemRoot`, `WINDIR`, `TEMP`, `TMP`, `HOME` und `USERPROFILE`, soweit vorhanden. `process.env` wird nie ungefiltert uebergeben; Token-, Secret-, Key-, Passwort-, GitHub- und Datenbankvariablen sind ausgeschlossen. Umgebungswerte werden nicht geloggt.

Vor dem Start werden aktueller Job-/Claim-/Lease-/Fence-Kontext, immutable Assignment, konkrete Registry-Version, Projekt und Revision sowie der persistente `READY`-Workspace erneut geladen. `verifyWorkspace` bindet Workspace-ID, kanonischen Pfad innerhalb `BUILDER_WORKSPACE_ROOT`, Nicht-`ARCHIVED`, lokales Git und erwarteten aktiven Branch. Rekursiv erkannte `.codex`-, `.agents`-, `.codex-plugin`-, Skill-, Plugin- oder MCP-Konfiguration und Symlinks/Junctions im Workspace werden fail-closed abgelehnt.

Der JSONL-Parser ist UTF-8-, Zeilen-, Event- und Gesamtgroessen-begrenzt. Unbekannte Events werden verworfen und nicht roh persistiert. `mcp_tool_call`, Websuche und weitere verbotene Integrationsereignisse fuehren zu `CODEX_SECURITY_POLICY_VIOLATION`, best-effort Kill und ausschliesslich sanitierter Audit-Evidence; ein Erfolg oder eine Orchestrator-Promotion ist dann unmoeglich. stderr, rohe Providerfehler, Prompt, Umgebung und Reasoning werden nicht gespeichert.

### Prompt, Ausgabe, Idempotenz und Recovery

Der serverseitige Prompt bindet Assignment-Referenz, konkrete aktive PLANNER-Registry-Version und deren Instructions, `projectId`, `projectRevision`, eine begrenzte Planning-Aufgabe, Read-only-/No-MCP-/No-Web-Regeln, das strukturierte Schema und den DEVELOPMENT_ONLY-Disclaimer. Workspace-, Projekt- und Aufgabentext gelten als untrusted data. Persistiert wird der SHA-256 des Prompts, nicht der Prompt selbst.

Das finale Objekt wird strikt auf genau `status`, `summary`, `requirements`, `assumptions`, `openQuestions` und `recommendedNextStep` validiert. `status` ist nur `SUCCEEDED` oder `FAILED`. Thread-ID, Modell, Usage, Start- und Endzeit werden nur nach Format- und Secret-Pruefung minimiert gespeichert. Interne Reasoning-Inhalte werden nicht uebernommen.

Migration `016` fuegt eine immutable Job-zu-Projekt-Revision-zu-Workspace-/Assignment-/Registry-Bindung, genau ein Run-Ledger pro Job und minimierte Audit-Ereignisse hinzu. Eine atomare Startreservierung und Datenbank-Trigger lassen nur den aktuellen Claim-/Lease-/Fence-Inhaber starten beziehungsweise terminalisieren. Parallele Starts haben genau einen Gewinner; prozesslokale In-Flight-Koordination verhindert einen zweiten Start im selben Worker. Statusabfragen und `continueRun` starten nichts. Spaete Ergebnisse nach Lease-/Fence-Verlust werden abgelehnt. Ein bereits `DISPATCHED`er Lauf unter einem neuen Fence wird `RECOVERY_REQUIRED` und nie automatisch erneut kostenpflichtig gestartet.

Timeout, Lease-Verlust und Cancellation senden best-effort Abort/Kill. Der einzige Reparaturdurchlauf korrigierte die Reihenfolge fuer eine laufende extern persistierte Runtime: `abortActiveRun("CANCELLED")` erfolgt jetzt genau einmal vor der blockierenden Statusabfrage; danach bleibt die autoritative Cancellation-Reconciliation ohne verifizierte Termination Evidence fail-closed. Eine beweissichere Prozessbaumterminierung wird nicht behauptet.

### Gate-Evidenz auf dem finalen Anwendungscode-Stand

- Branch: `feature/codex-runtime-adapter-mvp`
- HEAD: `312a6a0f141b901fbe6d1af0dc285240bc604ced`
- gepruefte geaenderte Anwendungsdateien: `33`
- kombinierter Anwendungssnapshot-SHA-256: `bd2f63f5792c4ea6950a78c7eafc350542d519ace3e3a7180b7ba3f7c3ef70ec`
- Codex-CLI-/Schema-/Runtime-Unit: `29/29 PASSED`
- Provider-/JSONL-Parser: `9/9 PASSED`
- Runtime-/Worker nach Reparatur: `42/42 PASSED`
- Workspace: `13/13 PASSED`
- Registry und Assignment: `9/9 PASSED`
- Planning- und Implementation-Orchestrator: `9/9 PASSED`
- serielle PostgreSQL-Suite mit gesetzter Testdatenbank: `152/152 PASSED`, keine Skips
- finale vollstaendige serielle Root-Suite: `389/389 PASSED`
- Lint: `PASSED`
- Typecheck aller Workspaces: `PASSED`
- Build aller Workspaces einschliesslich Next.js: `PASSED`
- `git diff --check`: `PASSED` mit ausschliesslich nicht-blockierenden Windows-Zeilenendungswarnungen

Ein erster irrtuemlich parallel gestarteter Datenbank-Gate-Aufruf wurde wegen der gegenseitigen Quieszenz-Sperren der gemeinsam genutzten Testdatenbank verworfen und ohne Codeaenderung korrekt seriell wiederholt. Dies war eine Korrektur des Gate-Aufrufs und kein Reparaturdurchlauf.

### Verbrauchter Reparaturdurchlauf

Reparaturbudget: `1/1 verbraucht`. Der Read-only-Pre-Smoke-Audit fand, dass die Worker-Cancellation fuer eine aktive extern persistierte Runtime vor dem Abort auf deren In-Flight-Status wartete. Dieselbe Writer-Identitaet aenderte ausschliesslich `apps/worker/src/job-processor.ts` und `apps/worker/src/job-processor.test.ts`. Der Regressionstest beweist Abort genau einmal vor `getRunStatus`, keinen spaeten Success-Publish und kein autoritatives `CANCELLED` ohne Termination Evidence. Re-Review: `PASS`. Weitere automatische Anwendungscodeaenderungen sind nach dem Vertrag unzulaessig.

### Strukturierter Abschlussblocker: echter Smoke erreicht den Codex-Prozess nicht

- **Abschlussstatus:** `BLOCKED - DEVELOPMENT_ONLY`
- **Festgestellt am:** 2026-07-15T23:22:00+02:00
- **Nicht erfuelltes Akzeptanzkriterium:** Owner-Akzeptanzkriterium 10 beziehungsweise Vertragskriterium 13: ein echter opt-in Codex-Turn muss erfolgreich strukturierte Ausgabe sowie unveraenderte Dateien/Git und das Ausbleiben von MCP/Web nachweisen.
- **Betroffener Scope:** ausschliesslich der opt-in Development-Smoke-Harness in `apps/worker/src/codex-runtime.real-smoke.ts`; der normale Adapter- und Gate-Stand bleibt wie oben geprueft.
- **Reparaturdurchlauf:** `1/1 verbraucht`; eine weitere automatische Korrektur oder Wiederholung ist verboten.
- **Reproduzierbare Evidenz:** Der einzige opt-in Smoke-Harness-Aufruf mit `AGENT_RUNTIME=codex`, `CODEX_REAL_SMOKE_TEST=1` und `BUILDER_CODEX_HOME=C:\Users\timon\.codex-builder` endete bei `codex-runtime.real-smoke.ts:373` mit `INVALID_CLAIM`. Der Harness uebergibt `claimNext(..., 300_000)`, waehrend `AgentJobRepository.assertOwner` in `agent-job-repository.ts:159` maximal `120_000` Millisekunden akzeptiert.
- **Provider-/Turn-Evidenz:** `CountingLauncher.start` wurde nicht erreicht. Gestartete Codex-Prozesse: `0`; echte Codex-Turns: `0`; automatischer Retry: `0`. Es wurden weder die dedizierte CLI-Anmeldung noch ein externer Providerturn verwendet.
- **Fehlende Nachweise:** tatsaechlicher Child-Start und Flag-Anwendung, reale strukturierte Providerausgabe, Vorher-/Nachher-Datei- und Git-Gleichheit sowie reales Ausbleiben von MCP-/Web-Events.
- **Erforderliche manuelle Entscheidung:** neuer Task mit neuem unveraenderlichem Arbeitsvertrag und neuer ausdruecklicher Owner-Autorisierung fuer die eng begrenzte Korrektur des Smoke-Lease-Werts und genau einen neuen echten Smoke-Turn. Dieser Task darf weder selbst repariert noch der Smoke automatisch wiederholt werden.

### Formale Review-Voten auf demselben Snapshot

- QA: `BLOCKED`; Akzeptanzkriterien 1 bis 9 und alle normalen Gates bestaetigt, Akzeptanzkriterium 10 wegen fehlendem echten Smoke offen; keine weiteren QA-Blocker.
- Allgemeines Code-Review: `BLOCK`; ein HIGH-Finding ausschliesslich am Smoke-Lease-Wert `300_000 > 120_000`; im uebrigen DEVELOPMENT_ONLY-Scope kein weiterer blockierender Codefehler.
- Security: statisches Implementierungsreview `PASS`; Gesamtvotum `BLOCK FOR DEVELOPMENT_ONLY` ausschliesslich wegen fehlender realer Smoke-Evidenz. Keine kritische Security-Verletzung im implementierten MVP-Scope gefunden.
- Legal: `NOT_APPLICABLE` gemaess Owner-Vorgabe.

Das Fehlen einer systemweiten `C:\ProgramData\OpenAI\Codex\requirements.toml` wurde nicht als Blocker dieses isolierten lokalen MVP-Scopes gewertet, und keine systemweite Policy wurde veraendert. Fuer `PRODUCTION` bleiben Managed Policy oder gleichwertige Provider-Isolation, systemweit erzwungene MCP-Grenze, belastbare Prozessbaumterminierung, reale Runtime-Attestation und externe Statusabfrage, mehrprozessfaehige Reconciliation, Completion-ID-Hardening, echte Worker-/Prozessidentitaet, Credential-Widerruf sowie alle Provider-, Release-, Legal- und Owner-Gates fail-closed verschoben. Production deployment bleibt `DISABLED`; GitHub-Integration und automatische Projektausfuehrung bleiben `NO`.

Der exakte Erfolgsstatus `CODEX EXEC RUNTIME ADAPTER MVP BESTANDEN  DEVELOPMENT ONLY` wird nicht vergeben.

# CODEX-RUNTIME-SMOKE-LEASE-FIX-03

Release level: `DEVELOPMENT_ONLY`

Production deployment: `DISABLED`

## Unveraenderlicher Micro-Fix-Task-Vertrag

- **Task:** `CODEX-RUNTIME-SMOKE-LEASE-FIX-03`
- **Branch:** `feature/codex-runtime-adapter-mvp`
- **Ausgangsstand:** `761e23f3cc100436dd8d4a6df1ad7cd259122b63`
- **Vertragsbeginn:** 2026-07-15T23:37:50+02:00
- **Maximales Zeitbudget:** eine lokale Arbeitssitzung von hoechstens zwei Stunden, spaetestens bis 2026-07-16T01:37:50+02:00
- **Writer-Identitaet:** genau und ausschliesslich `CODEX-RUNTIME-SMOKE-LEASE-FIX-03-EXECUTOR`; nur diese Identitaet darf die erlaubte Anwendungscodezeile schreiben; ein Writer-Wechsel ist verboten
- **Reparaturbudget:** `0/0`; nach der einmaligen beauftragten Wertkorrektur ist keine automatische weitere Codekorrektur zulaessig
- **Echter-Smoke-Budget:** genau ein neuer echter Read-only-Codex-Smoke-Start; sobald der Codex-Prozess tatsaechlich gestartet wurde, sind Retry und zweiter echter Turn verboten
- **Zulaessige Abschlussstatus:** `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`
- **Freigabestufe:** ausschliesslich `DEVELOPMENT_ONLY`
- **Exakter Erfolgsstatus:** `CODEX EXEC RUNTIME ADAPTER MVP BESTANDEN  DEVELOPMENT ONLY`

Dieser Vertrag ist ab seiner Fixierung unveraenderlich. Nachfolgende Abschnitte duerfen ausschliesslich Vorpruefungs-, Smoke-, Gate-, Review- und Abschlussnachweise ergaenzen; Scope, Writer-Identitaet, Zeitbudget, Reparaturbudget, Smoke-Budget, erlaubte Dateien, Gates oder Freigabestufe duerfen nicht erweitert oder umgedeutet werden. Der Task ist die ausdruecklich autorisierte Owner-Nachfolgeentscheidung zum strukturierten Blocker von `CODEX-EXEC-RUNTIME-ADAPTER-MVP-02` und verbraucht keinen Reparaturdurchlauf des Vorgaengertasks.

### Scope, erlaubte Dateien und Abgrenzung

Die einzige erlaubte Anwendungscodeaenderung ist in `apps/worker/src/codex-runtime.real-smoke.ts` der semantische Lease-Parameter des Aufrufs `claimNext(..., 300_000)` auf `120_000`. Der davon unabhaengige Run-/Test-Timeout `300_000`, das Datenbankmaximum, Produktions- und Runtime-Logik, Lease-Validierung, Heartbeat/Renewal, Cancellation, Migrationen, sonstige Tests und alle Sicherheitsgrenzen bleiben unveraendert.

Der Hauptagent darf nach Vertragsfixierung und bei Abschluss ausschliesslich `docs/architecture/codex-runtime-adapter-mvp-01.md` und `PROJECT_STATE.md` dokumentieren. Keine weitere Anwendungscode-, Test-, Migrations-, Konfigurations-, Paket- oder Lockfileaenderung ist erlaubt. Commit, Push, Pull Request, Merge und Deployment sind verboten. GitHub integration bleibt `NO`, Automatic project execution bleibt `NO`, Production deployment bleibt `DISABLED`, Release level bleibt `DEVELOPMENT_ONLY`.

### Pruefbare Akzeptanzkriterien und Gates

1. Ausschliesslich der Smoke-Harness-Lease-Wert wird von `300_000` auf `120_000` korrigiert; alle anderen Anwendungscodewerte und Sicherheitsgrenzen bleiben unveraendert.
2. Vor einem echten Turn bestehen Worker-Typecheck, Worker-Lint, alle betroffenen Tests ohne echten Codex-Aufruf und `git diff --check`; der Anwendungscode-Diff enthaelt exakt die eine Wertkorrektur.
3. Mit gesetztem `BUILDER_CODEX_HOME`, `AGENT_RUNTIME=codex` und `CODEX_REAL_SMOKE_TEST=1` wird ueber den vorhandenen Repository-Befehl genau ein neuer echter Smoke gestartet; kein Retry ist zulaessig.
4. Der Smoke weist genau einen Codex-Prozess, genau einen echten Turn, ausschliesslich `PLANNER`, Read-only-Sandbox, Approval `never`, `ignore-user-config`, `ignore-rules`, deaktivierte Websuche, keine MCP-/Web-Aktivitaet, strukturierte validierte Planner-Ausgabe, unveraenderten Zielworkspace und Git sowie keine Credential-Offenlegung nach.
5. Bei bestandenem Smoke bestehen danach sequenziell Worker-Tests, Codex-Runtime-Tests, PostgreSQL-Integration ohne Skips, vollstaendige serielle Root-Suite, Lint, Typecheck, Build und `git diff --check`; parallele Datenbank-Reset-Laeufe sind verboten.
6. Nach beendetem Writer-Zugriff pruefen QA, allgemeiner Reviewer und Security read-only denselben eindeutig fixierten Stand und stimmen innerhalb dieses Micro-Fix-Scopes jeweils mit `PASS`; Legal ist `NOT_APPLICABLE`.
7. Abschlussdokumentation nennt geprueften Stand, exakte Testzahlen, Smoke-/MCP-/Web-/Workspace-/Git-Evidenz, Review-Voten, offene Findings mit Zielmeilenstein und eindeutigen Abschlussstatus.
8. `PASSED` ist nur zulaessig, wenn alle vorstehenden Kriterien erfuellt sind; andernfalls endet der Task ohne weitere Codeaenderung oder Smoke-Wiederholung strukturiert `BLOCKED` beziehungsweise `DEFERRED_TO_LATER_GATE`.

## Ausfuehrungs- und Abschlussnachweis

- **Abschlussstatus:** `BLOCKED - DEVELOPMENT_ONLY`
- **Gepruefter Anwendungsstand:** HEAD `761e23f3cc100436dd8d4a6df1ad7cd259122b63` plus exakt ein Anwendungscode-Hunk in `apps/worker/src/codex-runtime.real-smoke.ts:373`
- **Writer:** ausschliesslich `CODEX-RUNTIME-SMOKE-LEASE-FIX-03-EXECUTOR`; Anwendungscode-Schreibzugriff nach der einmaligen Korrektur beendet
- **Datei-SHA-256 vorher:** `72ce39367fcf345aacd0a9cb35a00310b25d299e2950102de496180148ba04f5`
- **Datei-SHA-256 nachher und Review-Snapshot:** `2abeff866c6affd65274f70c222a28184c2ea47fca52b21f1e8032a6e747afbf`
- **Reparaturbudget:** `0/0`; keine weitere Codeaenderung und kein Reparaturdurchlauf

Der urspruengliche Fehler war ausschliesslich der semantische Claim-Lease-Wert `300_000` im echten Smoke-Harness. Er wurde als einzige Anwendungscodeaenderung auf das erlaubte Maximum `120_000` gesetzt. Das Repositorymaximum `120_000`, der unabhaengige Run-/Test-Timeout `300_000`, Produktions- und Runtime-Logik, Lease-Validierung, Heartbeat/Renewal, Cancellation, Migrationen, sonstige Tests und Sicherheitsgrenzen blieben unveraendert. Der alte Versuch aus `CODEX-EXEC-RUNTIME-ADAPTER-MVP-02` startete `0` Codex-Prozesse, `0` echte Turns und `0` Retries.

### Vorpruefungen ohne echten Codex-Aufruf

- Worker-Typecheck: `PASSED`
- Worker-Lint: `PASSED`; ausschliesslich nicht-blockierender bestehender ESLint-Hinweis zur fehlenden Pages-Directory-Konfiguration
- Worker: `42/42 PASSED`
- Codex Runtime/CLI/Schema: `29/29 PASSED`
- Provider/JSONL: `9/9 PASSED`
- Smoke-Harness mit erzwungenem `AGENT_RUNTIME=fake` und `CODEX_REAL_SMOKE_TEST=0`: `1/1 SKIPPED` wie vorgesehen; kein Codex-Prozess
- `git diff --check`: `PASSED`
- Anwendungscode-Diff: exakt eine entfernte `claimNext(..., 300_000)`-Zeile und eine hinzugefuegte `claimNext(..., 120_000)`-Zeile; keine zweite Anwendungscode-Datei

### Einziger aktivierter echter Smoke-Aufruf

Der dokumentierte Befehl `npm.cmd run test:codex-smoke` wurde mit gesetztem `BUILDER_CODEX_HOME`, erzwungenem `AGENT_RUNTIME=codex`, `CODEX_REAL_SMOKE_TEST=1` und der bereits gesetzten loopback-gebundenen `_test`-Datenbank-URL genau einmal aktiviert. Es erfolgte kein Retry.

Der Aufruf begann am 2026-07-16T05:52:54+02:00 und scheiterte fail-closed im `beforeAll` bei `waitForDatabaseQuiescence` mit einem sanitisierten PostgreSQL-Authentifizierungsfehler fuer den lokalen Testdatenbankbenutzer `builder`. Exaktes Vitest-Ergebnis: `1` Testdatei fehlgeschlagen, `1` Test uebersprungen. Der Testkoerper ab Zeile 237, `temporaryRoot`, `CountingLauncher` und `CodexExecProvider` wurden nicht erreicht.

- gestartete Codex-Prozesse: `0`
- gestartete echte Codex-Turns: `0`
- Retries: `0`
- strukturierte Planner-Ausgabe: `NOT_EVALUATED`
- echter PLANNER-/Flag-Nachweis: `NOT_EVALUATED`
- MCP-Tool-Calls und Websuche: `0`, weil kein Codex-Prozess existierte; der erforderliche dynamische Nachweis innerhalb eines echten Turns bleibt `NOT_EVALUATED`
- temporaerer Zielworkspace: nicht erzeugt; daher keine Zielworkspace- oder Ziel-Git-Aenderung
- Repositorystand unmittelbar vor/nach dem Aufruf: identische geaenderte Dateiliste und identischer Diff-Hash `aa62594288f8cfb05ef676af853d19c43c0431bb` vor der anschliessenden Abschlussdokumentation
- Credential-Offenlegung: keine Credential-Werte ausgegeben; der Fehler enthielt nur die sanitisiert benannte lokale Testidentitaet

Die im unveraenderlichen Vertrag fixierte Deadline 2026-07-16T01:37:50+02:00 war nach der externen Freigabewartezeit beim Aufruf bereits um `4:15:04` ueberschritten. Der Vertrag wird nicht nachtraeglich erweitert oder umgedeutet.

### Nicht ausgefuehrte bedingte Abschlussgates

Weil der echte Smoke nicht bestand, wurden die vertraglich nachgelagerten Worker-Tests, Codex-Runtime-Tests, PostgreSQL-Integration ohne Skips, vollstaendige serielle Root-Suite, Root-Lint, Root-Typecheck und Build nicht als Abschlussgates ausgefuehrt. Die gruenen Vorpruefungen ersetzen diese Gates nicht. Ein weiteres `git diff --check` unmittelbar nach dem fehlgeschlagenen Smoke bestand und bestaetigte den unveraenderten Ein-Zeilen-Anwendungscode-Diff.

### Read-only-Review-Voten auf demselben Anwendungssnapshot

- QA: `BLOCKED`; Lease-Korrektur und unveraenderte Grenzen bestaetigt, aber echter Smoke-Nachweis, Abschlussgates und gueltiges Zeitbudget offen
- Allgemeines Code-Review: `BLOCK`; Ein-Zeilen-Fix korrekt, keine weitere Codebeanstandung; Block wegen abgelaufener Deadline, fehlgeschlagenem echtem Smoke und offenen Abschlussgates
- Security: Lease-Micro-Fix `PASS`, Task `BLOCK`; keine neue Sicherheitsluecke oder veraenderte Sicherheitsgrenze, aber erforderliche dynamische Smoke-Evidenz und Abschlussgates fehlen und die Deadline ist abgelaufen
- Legal: `NOT_APPLICABLE`

### Strukturierter Blocker und manuelle Entscheidung

- **Nicht erfuellte Akzeptanzkriterien:** Vertragskriterien 3 bis 8 beziehungsweise Owner-Erfolgskriterien 3 bis 8; insbesondere kein erfolgreicher echter Turn, keine validierte Planner-Ausgabe, keine dynamische MCP-/Web-/Workspace-/Git-/Credential-Evidenz innerhalb eines echten Turns, keine Abschlussgates und keine drei PASS-Voten
- **Reproduzierbare Evidenz:** einmaliger Befehl und sanitisiertes Ergebnis wie oben; Fehlerstellen `apps/worker/src/codex-runtime.real-smoke.ts:180` und Cleanup-Versuch bei Zeile 192; Testkoerper ab Zeile 237 nicht erreicht
- **Betroffener Scope:** lokales Testdatenbank-Setup des opt-in Smoke-Harness und der abgelaufene Task-Vertrag; der Lease-Micro-Fix selbst ist korrekt
- **Verbrauchter Reparaturdurchlauf:** `0`; Vertragsbudget `0/0`, keine weitere automatische Codekorrektur erlaubt
- **Verbrauchter Smoke-Aufruf:** `1`; kein Retry
- **Offene Findings und Zielmeilenstein:** gueltige lokale Testdatenbank-Authentifizierung, erfolgreicher echter Read-only-Smoke und alle nachgelagerten Gates bleiben im aktuellen `CODEX_RUNTIME_ADAPTER_MVP` fail-closed offen
- **Erforderliche manuelle Entscheidung:** Der Owner muss den blockierten Stand beibehalten oder einen neuen ausdruecklich autorisierten Task mit neuem unveraenderlichem Vertrag und gueltigem Zeitbudget fuer einen weiteren Smoke-Versuch nach Korrektur der lokalen Development-Testdatenbank-Konfiguration eroeffnen. Dieser Task fuehrt weder automatisch einen weiteren Smoke noch eine weitere Codeaenderung aus.

GitHub integration bleibt `NO`, Automatic project execution bleibt `NO`, Production deployment bleibt `DISABLED`, Release level bleibt `DEVELOPMENT_ONLY`. Der exakte Erfolgsstatus `CODEX EXEC RUNTIME ADAPTER MVP BESTANDEN  DEVELOPMENT ONLY` wird nicht vergeben.
