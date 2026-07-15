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
