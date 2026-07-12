# Lokale PostgreSQL-18-Datenbank

Der Persistence-Meilenstein verwendet ausschließlich PostgreSQL 18. Domain-Zustand, Idempotenz, Jobs, Outbox und Inbox liegen in derselben Datenbank. Redis, RabbitMQ, SQLite und In-Memory-Ersatzlösungen sind ausgeschlossen.

## Architekturabbildung

| Bereich | Tabelle / Abbildung |
|---|---|
| BuilderProject | `projects` → genehmigtes `Project` |
| ProjectBrief | `project_briefs` → geprüfte `IdeaSubmission` |
| ProductSpecification | `product_specifications` → spezialisierte `ArtifactRevision` |
| WorkflowDefinition | `workflow_definitions` |
| WorkflowRun | `workflow_runs` → `WorkflowExecution` mit exakt einem Task, Policy Snapshot und `requested_by` |
| WorkflowStage | `workflow_stages`, an Milestone gebunden |
| Milestone | `milestones` → genehmigtes Milestone-Aggregat |
| Task / TaskDependency | `tasks` / `task_dependencies`; Task bindet direkt an Milestone, Dependencies werden serialisiert und azyklisch geprüft |
| Attempt | `attempts`; `INITIAL` ordinal 0, `REPAIR` ordinal 1..3, Infrastruktur-Retry bleibt derselbe Attempt |
| AgentDefinition | `agent_definitions` → Rollen-/Policy-Profil der `WorkloadIdentity` |
| AgentRun / AgentThread | `agent_runs` bindet zwingend an Attempt; `agent_threads` enthält nur opake Provider-Thread-Referenz |
| Artifact | `artifacts`, revisioniert und content-adressiert |
| Decision / Finding / GateResult | append-orientierte gleichnamige Tabellen |
| RepositoryConnection | `repository_connections` → minimale opake `RepositoryBinding`; `READY` benötigt ein GateResult |
| Deployment | `deployments`: D-016/D-024 erlaubt nur `INTERNAL_CONTROLLED` nach `LOCAL`; kein Hosted Preview/Non-Production, `PRODUCTION`/`UNKNOWN` ausgeschlossen |
| AuditEvent | `audit_events`, unveränderlich, lückenlos serverseitig sequenziert und hashverkettet |
| BackgroundJob | `background_jobs` mit geordnetem `FOR UPDATE SKIP LOCKED` |
| OutboxEvent / InboxEvent | `outbox_events` / `inbox_events` |

Alle projektbezogenen Tabellen verwenden UUIDs, Timestamps, Status-Checks, zusammengesetzte Projekt-FKs und `FORCE ROW LEVEL SECURITY`. Vor jeder Repository-Transaktion prüft eine injizierte Authority eine signierte, kurzlebige, opake `ProjectCapability`; eine freie Projekt-ID autorisiert nichts. Schreibbefehle committen Aggregate, Idempotency, Audit, Outbox und optionalen Job gemeinsam. Gleicher Key/Digest liefert das frühere Resultat, gleicher Key mit anderem Digest wird abgelehnt.

Die Repository-Schicht deckt alle geforderten Datenbereiche ab. `AuditEvent`, `AuditCheckpoint`, `BackgroundJob` und `OutboxEvent` sind bewusst nur lesbar; neue Ereignis-/Queue-Zeilen entstehen ausschließlich zusammen mit einem fachlichen Command. Die Runtime-API exportiert weder Migrationsfunktionen, Pool, freie SQL-Abfragen noch Rollenwechsel. `builder_app_login` ist ausschließlich die vertrauenswürdige Control-Plane-Identität; Worker verwenden `builder_claim_login` und tauschen erst einen gültigen, einmaligen Job-Claim gegen eine kurzlebige operationsgebundene Capability.

RLS vertraut keiner frei gesetzten Projekt-GUC. Die separate `builder_context_login`-Identität stellt nach Capability-Prüfung einen zufälligen, kurzlebigen Einmal-Grant aus. Der Grant bindet Capability-ID, Subject, Actor-Scope, Audience und die exakte Repository-Operation. Nur `builder_app_login` darf ihn genau einmal in einer Transaktion konsumieren; die Issuer-Identität kann ihn nicht konsumieren und die Runtime kann ihn nicht ausstellen. Die Policy prüft Token-Hash, Projekt, Login, Backend-PID, Transaktions-ID und Ablauf serverseitig.

Die Runtime darf Audit-Tabellen nicht direkt schreiben. Eine dedizierte `NOLOGIN`-Writer-Rolle erzeugt Sequenz, Previous Hash und Event Hash unter Lock. Immutable Events enthalten nur ein Actor-Pseudonym; die separat löschbare `actor_identity_mappings`-Tabelle hält opake Identitätsreferenz und Retention-Datum. Referenzen und Fehlertexte sind begrenzt; die Repository-Grenze weist mutmaßliche Secrets ab. GitHub, automatische Ausführung, Worker und Codex bleiben deaktiviert beziehungsweise unimplementiert.

## Docker-Start unter PowerShell

Voraussetzungen: Node.js 24, npm und Docker Compose. Der Container bindet nur an `127.0.0.1`.

```powershell
$migrationCredential = Get-Credential -UserName builder_migrator -Message "Lokales Migrationspasswort"
$env:POSTGRES_PASSWORD = $migrationCredential.GetNetworkCredential().Password
docker compose up -d postgres
docker compose exec postgres createdb -U builder_migrator software_builder_test
$env:DATABASE_MIGRATION_URL = "postgresql://builder_migrator:$($env:POSTGRES_PASSWORD)@127.0.0.1:5432/software_builder"
$env:TEST_DATABASE_URL = "postgresql://builder_migrator:$($env:POSTGRES_PASSWORD)@127.0.0.1:5432/software_builder_test"
$env:ALLOW_DATABASE_MAINTENANCE = "YES"
$env:DATABASE_MAINTENANCE_CONFIRM = "local-only:software_builder"
npm.cmd run db:migrate
$runtimeCredential = Get-Credential -UserName builder_app_login -Message "Anderes Runtime-Passwort (mindestens 16 Zeichen)"
$env:RUNTIME_DATABASE_PASSWORD = $runtimeCredential.GetNetworkCredential().Password
$contextCredential = Get-Credential -UserName builder_context_login -Message "Drittes, getrenntes Context-Issuer-Passwort"
$env:CONTEXT_DATABASE_PASSWORD = $contextCredential.GetNetworkCredential().Password
$claimCredential = Get-Credential -UserName builder_claim_login -Message "Viertes, getrenntes Job-Claim-Passwort"
$env:CLAIM_DATABASE_PASSWORD = $claimCredential.GetNetworkCredential().Password
npm.cmd run db:provision-runtime
$env:DATABASE_URL = "postgresql://builder_app_login:$($env:RUNTIME_DATABASE_PASSWORD)@127.0.0.1:5432/software_builder"
$env:CONTEXT_DATABASE_URL = "postgresql://builder_context_login:$($env:CONTEXT_DATABASE_PASSWORD)@127.0.0.1:5432/software_builder"
$env:CLAIM_DATABASE_URL = "postgresql://builder_claim_login:$($env:CLAIM_DATABASE_PASSWORD)@127.0.0.1:5432/software_builder"
Remove-Item Env:RUNTIME_DATABASE_PASSWORD
Remove-Item Env:CONTEXT_DATABASE_PASSWORD
Remove-Item Env:CLAIM_DATABASE_PASSWORD
npm.cmd run db:seed
```

Passwörter mit Sonderzeichen müssen im URL-Anteil percent-encodiert werden. Zugangsdaten bleiben in Prozessvariablen und werden weder committed noch geloggt. `builder_app_login` ist ausschließlich Mitglied der `NOBYPASSRLS`-Rolle `builder_runtime`; die Anwendung lehnt Migrator-, Superuser-, Owner-, Queue- oder Claimer-Pools ab. Es gibt kein `SET ROLE` als Sicherheitsgrenze.

Bei nativer PostgreSQL-18-Installation werden dieselben Datenbanken und getrennten Login-Passwörter angelegt. Der initiale Migrator benötigt `CREATEROLE`/`CREATE EXTENSION`; normale Runtime erhält diese Rechte nie.

## Migrieren, betrachten und zurücksetzen

Migrationen laufen unter einem nicht wartenden exklusiven Advisory Lock, je Datei atomar, und speichern einen SHA-256-Checksum. Sie brechen ab, solange Runtime-, Context-Issuer- oder Claim-Exchange-Verbindungen aktiv sind. Das datenbankgebundene Bestätigungsmerkmal verhindert, dass ein für eine andere lokale Datenbank vorbereiteter Wartungsbefehl wiederverwendet wird:

```powershell
npm.cmd run db:migrate
docker compose exec postgres psql -U builder_migrator -d software_builder
```

In `psql`: `\dt builder.*`, `\d+ builder.background_jobs`, `SELECT id,status FROM builder.projects;`, danach `\q`.

Reset ist destruktiv und prüft zusätzlich Loopback, tatsächlichen Datenbanknamen sowie die Development-/`_test`-Allowlist:

```powershell
$env:ALLOW_DATABASE_RESET = "YES"
npm.cmd run db:reset
Remove-Item Env:ALLOW_DATABASE_RESET
npm.cmd run db:seed
```

Nach Abschluss der Wartung: `Remove-Item Env:ALLOW_DATABASE_MAINTENANCE` und `Remove-Item Env:DATABASE_MAINTENANCE_CONFIRM`. Migration und Reset akzeptieren ausschließlich `builder_migrator`, verwenden denselben Advisory Lock und Reset migriert noch unter diesem Lock neu. Die drei Runtime-Passwörter können nur durch die separate Provisioner-Rolle mit expliziter `ADMIN`-Berechtigung gesetzt werden; die normale Runtime besitzt diese Berechtigung nicht.

Komplett entfernen: `docker compose down -v`.

## Tests und Datenschutz

`npm.cmd test` führt Unit-Tests immer aus. Echte Integrationstests laufen nur mit `TEST_DATABASE_URL`, verlangen PostgreSQL 18+ und eine Datenbank mit `_test`-Suffix. Ohne Variable erscheinen sie sichtbar als `skipped`; es gibt keinen Ersatz-Backend-Fallback.

Seeds und Tests verwenden ausschließlich synthetische Daten. Produktionskopien, echte Kunden-/Personendaten, reale Provider-IDs oder echte Secrets dürfen nicht in lokale Entwicklung oder Tests importiert werden.
