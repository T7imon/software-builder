# CANCELLATION-EVIDENCE-RECONCILIATION-02 - Unveraenderlicher Arbeitsvertrag

Task-ID: `CANCELLATION-EVIDENCE-RECONCILIATION-02`

Release level: `DEVELOPMENT_ONLY`

Production deployment: `DISABLED`

## Scope

Dieser Task behebt ausschliesslich:

1. Cancellation vor Runtime-Start ohne runtime-ausgestellte, gebundene und verifizierte `WORKLOAD_NOT_CREATED`-Evidence.
2. Sicherheitsrelevante Cancellation-Reconciliation, die bislang auf selbstdeklarierten Flags statt auf einem tatsaechlich ausgefuehrten und persistent nachgewiesenen Runtime-/Ingestion-/Verifier-Ablauf beruht.
3. Unvollstaendige Reconciliation-Idempotenz einschliesslich paralleler Delivery, Digest-Konflikt, Crash/Restart, Evidence-Decision/Consumption und CAS-/Fence-Verlust.
4. Ausfuehrbare und eindeutig auffindbare Implementierungsnachweise fuer `AT-15`, `AT-16`, `AT-17`, `AT-19` und `AT-22` sowie deren vollstaendige Implementierungs-Traceability.

Alle bereits bestandenen Cancellation-, Lease-, Evidence-, PostgreSQL- und Race-Funktionen muessen erhalten bleiben.

## Akzeptanzkriterien

- AC-02.1: FakeAgentRuntime attestiert `WORKLOAD_NOT_CREATED` anhand einer eindeutigen Start-/Runtime-Operation-ID und ihres eigenen atomar ausgewerteten Workload-Registers; Runtime-Aussteller, Scope-Bindungen, Generation/Fence, Watermark, Environment, Verification Method und kanonischer Digest sind strukturiert gebunden.
- AC-02.2: `WORKLOAD_NOT_CREATED` durchlaeuft die regulaere `RuntimeTerminationEvidenceVerifier`-Schnittstelle; nur eine persistierte `VALID`-Entscheidung kann `CANCELLED` ermoeglichen. Nicht attestierbare, manipulierte, scopefremde, stale, replayte oder umgebungsfremde Evidence bleibt fail-closed.
- AC-02.3: Ein Rennen zwischen Start und Nichtvorhandenseinsattestation erzeugt genau eine autoritative Wahrheit; aktive Workload und konsumierte gueltige `WORKLOAD_NOT_CREATED`-Evidence fuer dieselbe Operation koennen nicht koexistieren.
- AC-02.4: Ein persistenter `CancellationReconciliationRun` beweist Beginn, eindeutige Operation/Idempotenz, gebundenen Ausgangszustand, tatsaechliche Runtime-Statusabfrage ausserhalb des Row Locks, Event-Ingestion bis zum neuen Watermark, regulaere Evidence-Verifikation, erneute Guards unter Row Lock und atomare Abschlussentscheidung samt Ergebnis-Digest.
- AC-02.5: Kein Aufrufer-Boolean oder vergleichbarer selbstdeklarierter Wert kann Reconciliation, Runtime-Terminierung oder `CANCELLED` beweisen.
- AC-02.6: Identische Reconciliation-Delivery liefert exakt die persistierte Entscheidung ohne doppelte Runtime-Abfrage oder Fachwirkung; gleicher Operation-Key mit anderem Digest wird abgelehnt; parallele Delivery, Crash/Restart, Verification/Consumption und neue Runden sind vollstaendig persistent idempotent; CAS-/Fence-Verlust hinterlaesst keine Teilwirkung.
- AC-02.7: `AT-15`, `AT-16`, `AT-17`, `AT-19` und `AT-22` sind als ausfuehrbare Tests mit den vom Owner genannten positiven und negativen Assertions eindeutig auffindbar und bestanden.
- AC-02.8: Die Implementierungs-Traceability nennt fuer jede dieser AT-IDs Testdatei, exakten Testnamen, Codepfad, Datenbank-, Audit-, Inbox-/Outbox- und Evidence-Assertions sowie Ergebnis.
- AC-02.9: Alle im Owner-Auftrag genannten gezielten, PostgreSQL-, Schema-, Runtime-, Worker-, Workflow-, Root-, Race-, Parallel-, Crash-/Restart-, CAS-/Fencing-, Lint-, Typecheck-, Build- und Diff-Pruefungen sind erfolgreich und ohne verbotene Skips dokumentiert.
- AC-02.10: QA, Reviewer und Security bestaetigen den fixierten Stand innerhalb ihres explizit begrenzten Review-Scopes. Legal ist `NOT_APPLICABLE`.

## Erlaubte Dateien und Komponenten

- `packages/agent-runtime/src/`: ausschliesslich FakeRuntime, Runtime-Vertrag, Termination-Evidence, zugehoerige Schemas/Exports und Tests.
- `packages/database/migrations/`: ausschliesslich eine neue vorwaertsgerichtete Migration fuer diesen Task; bestehende Migrationen bleiben unveraendert.
- `packages/database/src/`: ausschliesslich Cancellation-/Evidence-/Reconciliation-Persistenz, notwendige Typen/Exports/Migrationsregistrierung sowie zugehoerige Integrations- und Schematests.
- `apps/worker/src/`: ausschliesslich Cancellation-/Recovery-/Reconciliation-Ausfuehrung und zugehoerige Tests.
- `packages/workflow-engine/src/`: nur falls fuer die expliziten Cancellation-Reconciliation-Akzeptanzkriterien zwingend erforderlich, einschliesslich Tests.
- `docs/architecture/cancellation-contract-implementation-01-traceability.md`: ausschliesslich die geforderte Implementierungs-Traceability nach abgeschlossenem Code-/Teststand.
- Ein neues Closeout-Dokument fuer diesen Task und `PROJECT_STATE.md`: ausschliesslich durch den Hauptagenten nach beendetem Writer-Zugriff und Reviews.

## Ausdruecklich verboten

Completion-ID-Algorithmus; allgemeine Cancellation-Neugestaltung; Agent Registry; Codex SDK; GitHub; UI; Legal-Semantik; Deployment; Produktion; echte Kundendaten; Secrets; Aenderung des normativen Vertrags; Aenderung bestehender Migrationen; Scope-Erweiterung aufgrund ausserhalb dieses Tasks gefundener Befunde.

## Rollen und Schreibrechte

- Einzige Writer-Identitaet fuer Anwendungs- und Testcode sowie die Implementierungs-Traceability: `executor-cancellation-evidence-reconciliation-02`.
- Kein anderer Agent darf waehrend dieses Tasks Anwendungs- oder Testcode veraendern.
- Der Hauptagent orchestriert und darf nach beendetem Writer-Zugriff ausschliesslich Closeout und `PROJECT_STATE.md` dokumentieren.
- QA, Reviewer und Security arbeiten nach dem eingefrorenen Stand strikt read-only. Legal ist `NOT_APPLICABLE`.

## Vorbedingungen und Guards

- Vor jeder Codeaenderung ist der normative Bereich aus `docs/architecture/cancellation-contract-decision-01.md` kanonisch als UTF-8, LF-normalisiert und bis unmittelbar vor Abschnitt 13 zu hashen.
- Erwarteter SHA-256: `58e44fe0a3638d25bdf34dc5aff8551872796486c343904923cb4f41150a4b9f`.
- Bei Abweichung endet der Task sofort `BLOCKED`, ohne Codeaenderung.
- Der Writer liest vor der ersten Codeaenderung alle vom Owner genannten Dokumente sowie alle relevanten Cancellation-, Recovery-, Runtime-, Worker-, Evidence-, Repository-, Test- und Migrationsdateien vollstaendig.

## Budget und Abschluss

- Maximales Zeitbudget: 240 Minuten ab Task-Start am 2026-07-15.
- Automatisches Reparaturbudget: maximal ein Reparaturdurchlauf (`0/1` zu Beginn), ausschliesslich durch dieselbe Writer-Identitaet.
- Zulaessige Abschlussstatus: `PASSED`, `BLOCKED`, `DEFERRED_TO_LATER_GATE`.
- `PASSED` erfordert alle Scope-Kriterien und begrenzten Reviews. Abschlussformel: `CANCELLATION EVIDENCE RECONCILIATION BESTANDEN  DEVELOPMENT ONLY`.
- Andernfalls ist der Status `BLOCKED` mit unerfuelltem Kriterium, reproduzierbarer Evidenz, betroffenem Scope, Repair ordinal und erforderlicher manueller Entscheidung. Abschlussformel: `CANCELLATION EVIDENCE RECONCILIATION NICHT BESTANDEN`.
- Unabhaengig vom Task-Ergebnis bleibt `PROJECT_STATE` wegen Completion-ID und finalem Worker-Closeout `BLOCKED - DEVELOPMENT ONLY`; Production deployment bleibt `DISABLED`.

Dieser Arbeitsvertrag ist ab seiner Erstellung unveraenderlich. Spaetere Dokumente duerfen ihn referenzieren, aber weder erweitern noch umdeuten.
