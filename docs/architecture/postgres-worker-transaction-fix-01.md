# POSTGRES-WORKER-TRANSACTION-FIX-01

Status: `ACTIVE - DEVELOPMENT ONLY`

Dieser Abschnitt bis einschliesslich `Execution contract` ist der unveraenderliche Arbeitsvertrag fuer genau den neuen Task `POSTGRES-WORKER-TRANSACTION-FIX-01`. Er ist ein eigener Folgetask und keine Fortsetzung der ausgeschoepften Reparaturschleife aus `WORKER-CONCURRENCY-HARDENING-01`. Er autorisiert keine Produktion, kein Deployment, keine automatische Projektausfuehrung, keine echten Kunden- oder Personendaten, kein Codex SDK, kein GitHub und keine UI-Aenderung. Production deployment bleibt `DISABLED`.

## Scope

Der Task behebt ausschliesslich:

1. PostgreSQL-Fehler `42804` in `packages/database/src/agent-job-repository.ts` durch einen fachlich und technisch konsistenten Typvertrag zwischen TypeScript, Repository-SQL und PostgreSQL-Schema;
2. die nicht autoritative Lease-Zeitpruefung vor beziehungsweise waehrend einer Row-Lock-Wartezeit, sodass die Lease-Gueltigkeit erst nach tatsaechlichem Lock-Erhalt mit aktueller autoritativer PostgreSQL-Wall-Clock-Zeit bewertet wird.

Ausdruecklich ausgeschlossen sind Late-Cancel-Race, Runtime-Cancel-Bestaetigung, Completion-ID, Codex SDK, GitHub, UI sowie andere Workflow- oder Compliance-Semantik. Diese ausgeschlossenen Findings werden nicht repariert und erweitern den Task nicht.

Erlaubte Anwendungscode- und Testkomponenten sind ausschliesslich `packages/database/src/agent-job-repository.ts`, `packages/database/src/database.integration.test.ts` und, nur falls der konsistente fachliche Typvertrag eine additive Schemaaenderung erfordert, eine neue versionierte Migration `packages/database/migrations/007_postgres_worker_transaction_fix.sql`. Zugehoerige Typdefinitionen oder Exporte unter `packages/database/src/**` duerfen nur geaendert werden, wenn dies fuer genau diesen Typvertrag zwingend erforderlich ist. Die bestehenden Migrationen `001` bis `006` sind unveraenderlich. Die In-Memory-Semantik dient nur als Vergleich und wird nicht geaendert, sofern nicht ein zwingender Scope-Widerspruch belegt wird. Der Hauptagent darf ausschliesslich diese Vertragsdatei und `PROJECT_STATE.md` dokumentieren.

## Acceptance criteria

1. Jeder der vor Taskbeginn bekannten fuenf fehlschlagenden PostgreSQL-Integrationstests wird vor der ersten Codeaenderung einzeln reproduziert und mit Testname sowie Fehlerbild dokumentiert; automatische Test-Retries sind verboten.
2. Fuer PostgreSQL `42804` sind vor der Reparatur das exakte SQL-Statement, der betroffene Parameter, sein TypeScript-Typ, der PostgreSQL-Spaltentyp, der tatsaechlich von PostgreSQL inferierte Parametertyp und jeder betroffene Codepfad belegt.
3. Die Reparatur verwendet in TypeScript, Repository und Datenbankschema denselben fachlichen Typ. Pauschale Text-Casts, die einen fehlerhaften Datenvertrag verstecken, sind verboten. Falls eine Schemaaenderung erforderlich ist, wird ausschliesslich die additive Migration `007_postgres_worker_transaction_fix.sql` erstellt; angewendete Migrationen bleiben unveraendert.
4. Der `42804`-Pfad wird mit allen relevanten Parameterkombinationen getestet, einschliesslich aller Statement-Pfade und nicht nur des zuerst fehlschlagenden Pfads.
5. Jede Lease-Gueltigkeitsentscheidung fuer eine mutierende Guard-Operation verwendet eine autoritative PostgreSQL-Wall-Clock-Zeit, die erst nach dem tatsaechlichen Erhalt des betreffenden Row Locks ausgewertet wird. `CURRENT_TIMESTAMP`, `now()` und `transaction_timestamp()` sowie die lokale Node.js-Uhr sind fuer diese Entscheidung unzulaessig; eine geeignete Semantik ist beispielsweise `clock_timestamp()` nach Lock-Erhalt.
6. Lease Owner, Claim-Generation und Fencing Token werden im selben atomaren Ablauf geprueft. Exakt bei `now >= leaseExpiresAt` gilt die Lease als abgelaufen. Ein Worker, dessen Lease waehrend der Lock-Wartezeit ablaeuft, wird nach Lock-Erhalt abgelehnt und kann keine Mutation committen.
7. Deterministische PostgreSQL-Tests belegen: Mutation unmittelbar vor Ablauf erlaubt; exakt an der Ablaufgrenze abgelehnt; nach Ablauf abgelehnt; alter Owner nach Reclaim abgelehnt; altes Fencing Token nach Reclaim abgelehnt; spaeterer gueltiger Reclaim moeglich; CAS-Verlust fuehrt zu vollstaendig atomarem Rollback ohne Audit-, Inbox-, Outbox- oder Job-Teilmution.
8. Der Lock-Wait-Test verwendet zwei kontrollierte Transaktionen: A haelt das Job-Row-Lock; B beginnt vor Lease-Ablauf und wartet auf dasselbe Lock; waehrend der Wartezeit laeuft die Lease ab; erst nach Freigabe erkennt B den tatsaechlichen Ablauf und lehnt die Mutation ohne Teilzustand ab. Primaere Synchronisation erfolgt ueber kontrollierte Transaktionen, Barrieren oder explizite Lock-Synchronisation, nicht ueber zufaellige Sleeps.
9. Der gezielte Lock-Wait-/Lease-Test besteht 30 einzelne Male ohne Fehler, Retry-Mechanismus oder versteckte Fehlertoleranz.
10. Abschliessend bestehen alle 19 PostgreSQL-Integrationstests ohne Skips, der gezielte Lock-Wait-/Lease-Test `30/30`, Runtime-Tests, Worker-Tests, Workflow-Engine-Tests, Root-Tests, Lint, Typecheck, Build und `git diff --check`.
11. Nach beendeter Implementierung und beendetem Writer-Zugriff wird der zu pruefende Stand eindeutig durch HEAD und Diff-Digest fixiert. QA und Reviewer pruefen read-only ausschliesslich SQL-Typisierung, Lock-Reihenfolge, Zeitsemantik, CAS und Rollback. Security prueft read-only ausschliesslich, ob ein abgelaufener oder veralteter Worker noch mutieren kann. Ein Legal-Review findet fuer diesen Task nicht statt.
12. Late-Cancel-, Runtime-Cancel- und Completion-ID-Findings bleiben unveraendert als separate spaetere Blocker dokumentiert. `PROJECT_STATE.md` bleibt nach Abschluss `BLOCKED - DEVELOPMENT ONLY`; Production deployment bleibt `DISABLED`.

## Execution contract

Genau eine neue Anwendungscode-Writer-Identitaet ist zulaessig: `postgres_worker_transaction_executor`. Ausschliesslich dieser neue Executor darf Anwendungscode oder Tests fuer diesen Task schreiben. Der Root-Orchestrator implementiert nicht. Ein Writer-Wechsel ist verboten. QA, Reviewer und Security arbeiten erst nach beendetem Writer-Zugriff read-only auf demselben fixierten Stand. Nach der Erstimplementierung ist maximal ein automatischer Reparaturdurchlauf durch dieselbe Writer-Identitaet zulaessig; danach wird bei offenem Akzeptanzkriterium strukturiert blockiert. Das maximale Zeitbudget ist eine lokale Arbeitssitzung von acht Stunden.

Zulaessige Abschlussstatus sind `PASSED`, `BLOCKED` und `DEFERRED_TO_LATER_GATE`. Wenn ausschliesslich die beiden Scope-Probleme behoben sind, lautet der Abschluss exakt `POSTGRES WORKER TRANSACTION FIX BESTANDEN  DEVELOPMENT ONLY`. Wenn PostgreSQL `42804` oder die Lock-Wait-Lease-Luecke weiter reproduzierbar ist, lautet der Abschluss exakt `POSTGRES WORKER TRANSACTION FIX NICHT BESTANDEN`. Ein Blocker dokumentiert mindestens nicht erfuelltes Akzeptanzkriterium, reproduzierbare Evidenz, betroffenen Scope, Repair ordinal und erforderliche manuelle Entscheidung. Eine Komponentenfreigabe ist weder Release-Candidate- noch Produktionsfreigabe. Production deployment bleibt `DISABLED`.

## Final verification outcome

Status: `PASSED - DEVELOPMENT ONLY`.

Abschlusssatz: `POSTGRES WORKER TRANSACTION FIX BESTANDEN  DEVELOPMENT ONLY`.

Gepruefter Stand: HEAD `80cef05b357d8ae437579da5e18de7192c1c1d58` plus Writer-Diff-Hash `22adeb195e81e4da1aee77fd622f0d3e7b6029cb7dc784f7c153fea6a3b62262` fuer ausschliesslich `packages/database/src/agent-job-repository.ts` und `packages/database/src/database.integration.test.ts`. Genau die neue festgelegte Writer-Identitaet `postgres_worker_transaction_executor` schrieb Anwendungscode und Tests. Der Writer-Zugriff ist beendet. Repair ordinal `0/1`; kein Reparaturdurchlauf wurde benoetigt. Es wurde keine Migration erstellt, und die angewendeten Migrationen `001` bis `006` blieben unveraendert.

### Vorher-Reproduktion und Typdiagnose

Der unveraenderte Identifikationslauf bestand `14/19` PostgreSQL-Integrationstests. Die fuenf fehlgeschlagenen Tests waren der Infrastruktur-Retry-Test mit PostgreSQL `42804`, der langlebige Polling-Test mit Timeout, der Crash-Recovery-Test mit `PENDING` statt `CLAIMED`, der deterministische Reclaim-Grenztest mit Claim auf dem falschen Job und der CANCELLING-Constraint-Test mit Claim auf dem falschen Job. Vor der ersten Aenderung wurden alle fuenf einzeln ausgefuehrt: Der Retry-Test reproduzierte `42804`, der Polling-Test reproduzierte den Timeout, der Crash- und Constraint-Test bestanden isoliert, und der Reclaim-Grenztest bestand isoliert im Testkoerper bei einem damaligen transienten Teardown-Fehler. Damit wurden die letzten drei Fehler als Shared-Database-Kaskaden des nach dem Primaerfehler liegengebliebenen Retry-Jobs belegt.

Das primaere fehlerhafte Statement war `UPDATE builder.background_jobs ... available_at=$6+($7::text||' milliseconds')::interval ... terminal_at=CASE WHEN $5='DEAD_LETTER' THEN $6 ELSE NULL END ...`. Der betroffene Parameter `$6` war in TypeScript ein `Date`; die Zielspalten `available_at` und `terminal_at` sind PostgreSQL `timestamp with time zone`. PostgreSQL inferierte `$6` im alten Ausdruck tatsaechlich als `interval` und meldete deshalb `42804`. Betroffen waren `RETRY_SCHEDULED` und `DEAD_LETTER`. Nach der Primaerreparatur wurde derselbe verdeckte Vertrag im Runtime-Run-Statement sichtbar: dessen `$4` war ebenfalls TypeScript `Date`, Zielspalte `terminal_at timestamptz`, vorherige PostgreSQL-Inferenz aber `text`.

Die Reparatur bindet Zeitwerte explizit als `timestamptz`. Fachlich numerische `delayMs`- und `leaseMs`-Werte bleiben numerisch und werden als `double precision * interval '1 millisecond'` verarbeitet; verschleiernde pauschale Text-Casts wurden entfernt. Tests decken `0 ms` und positiven Delay jeweils fuer den nicht erschoepften `RETRY_SCHEDULED`- sowie den erschoepften `DEAD_LETTER`-Pfad einschliesslich `terminal_at` ab.

### Lock-, Zeit-, CAS- und Rollback-Semantik

Guard-Operationen sperren die Job-Zeile zuerst mit Job-ID, Lease Owner, Claim-ID beziehungsweise Generation, Fencing Token und zulaessigem Status per `FOR UPDATE`. Erst nach tatsaechlichem Lock-Erhalt wird einmalig eine materialisierte `clock_timestamp()`-Wall-Clock ausgewertet. Nur `lease_expires_at > now` ist gueltig; exakt bei `now >= leaseExpiresAt` wird fail-closed abgelehnt. Claim-Eligibility nutzt ebenfalls PostgreSQL-Wall-Clock, und die Claim-Zeit wird nach Erhalt des `SKIP LOCKED`-Row-Locks bestimmt.

Der deterministische Test verwendet zwei kontrollierte Transaktionen, eine explizit ueber `pg_stat_activity.wait_event_type='Lock'` belegte Lock-Wartebarriere und eine PostgreSQL-Zeitbarriere bis zum Lease-Ablauf. Er belegt gueltige Mutation unmittelbar vor Ablauf, Ablehnung an beziehungsweise nach der Grenze, Ablauf waehrend der Lock-Wartezeit, spaeteren gueltigen Reclaim, Ablehnung von altem Owner und altem Fencing Token sowie vollstaendigen Rollback bei Guard-, CAS- und synthetischem Post-Insert-Fehler. Abgelehnte Pfade hinterlassen keine Job-, Audit-, Inbox-, Outbox- oder Result-Teilmution.

### Pflichtpruefungen und Reviews

Executor-Evidenz: PostgreSQL-Integration `19/19` ohne Skips, Datenbankpaket `26/26`, gezielter Lock-Wait-/Lease-Test `30/30` in getrennten vollstaendigen Vitest-Prozessen ohne Retry, Runtime `11/11`, Worker `17/17`, Workflow-Engine `78/78`, Root `139/139`, Lint, Typecheck, Build und `git diff --check` bestanden.

Read-only QA bestaetigte auf demselben fixierten Stand den gezielten Retry-Test `1/1`, den gezielten Lock-Wait-Test `1/1`, PostgreSQL `19/19` ohne Skips, eine eigene getrennte `30/30`-Serie ohne Retry und `git diff --check`: `PASS`. Reviewer: `PASS` fuer SQL-Typisierung, Lock-Reihenfolge, autoritative Zeitsemantik, CAS, Rollback und Testdeterminismus. Security: `PASS - DEVELOPMENT_ONLY`; ein abgelaufener oder veralteter Owner, Claim oder Fence kann keine gepruefte Mutation committen. Alle Reviews blieben read-only. Laut Owner-Vertrag fand kein Legal-Review statt.

### Verbleibende separate Holds

Late-Cancel-Race, Runtime-Cancel-Bestaetigung und Completion-ID bleiben unveraendert als getrennte spaetere Findings offen und waren nicht Teil dieser Reparatur oder Reviews. Deshalb bleibt der Gesamtprojektzustand `BLOCKED - DEVELOPMENT ONLY`. Diese Komponentenfreigabe erlaubt keine externe Veroeffentlichung, keine echten Kundendaten, kein Release Candidate und keine Produktion. Production deployment bleibt `DISABLED`.
