# CANCELLATION-CONTRACT-IMPLEMENTATION-01

Release level: `DEVELOPMENT_ONLY`

Production deployment: `DISABLED`

## Unveraenderlicher Arbeitsvertrag

- Task-ID: `CANCELLATION-CONTRACT-IMPLEMENTATION-01`.
- Scope: Ausschliesslich Implementierung des freigegebenen normativen Cancellation-Vertrags aus `docs/architecture/cancellation-contract-decision-01.md` in Worker, Runtime, Repository, Recovery, Datenbankschema/Migrationen und den unmittelbar zugehoerigen Tests. Keine neue oder umgedeutete Cancellation-Semantik.
- Normativer Hashbereich: Byte 0 bis unmittelbar vor `## 13. Review- und Abschlussprotokoll`, UTF-8 ohne BOM und auf LF normalisierte Zeilenenden.
- Verbindlicher SHA-256: `58e44fe0a3638d25bdf34dc5aff8551872796486c343904923cb4f41150a4b9f`.
- Vorpruefung: am 2026-07-14 mit dem dokumentierten Wert identisch; Anwendungscode darf nur unter dieser erfuellten Vorbedingung geaendert werden.
- Akzeptanzkriterien: alle AC1 bis AC9, alle Wahrheitstabellenzeilen WT-01 bis WT-20 und alle Akzeptanztests AT-01 bis AT-23 des normativen Vertrags; besonders AC8 sowie AT-09, AT-15, AT-16, AT-17, AT-19 und AT-20. Zusaetzlich gelten die zwoelf unter `Bestehende Schutzmassnahmen` im Owner-Auftrag genannten Nichtregressionsanforderungen.
- Erlaubte Anwendungscode-Komponenten: `apps/worker/src/**`, `packages/agent-runtime/src/**`, `packages/database/src/**`, `packages/database/migrations/**`, `packages/workflow-engine/src/**` sowie deren bestehende Package-Export- und Build-Konfiguration, soweit fuer den normativen Vertrag zwingend erforderlich.
- Erlaubter Testcode: Tests innerhalb der vorstehenden Komponenten sowie neue unmittelbar taskbezogene Testdateien innerhalb derselben Package-/App-Verzeichnisse.
- Erlaubte Dokumentation: diese unveraenderliche Vertragsdatei; eine getrennte Traceability- und Abschlussdatei fuer Testergebnisse und Reviews; `PROJECT_STATE.md` ausschliesslich fuer den finalen, weiterhin blockierten Development-only-Projektzustand.
- Ausdruecklich verboten: Completion-ID-Algorithmus, Agent Registry, Codex SDK, GitHub, UI, Deployment, Legal-Status, Produktionsintegration, echte Kundendaten, Produktionszugriffe und jede Produktionsfreigabe.
- Writer-Identitaet: ausschliesslich `executor-cancellation-contract-01`. Nur dieser Executor darf in diesem Task Anwendungscode und Testcode schreiben. Der Hauptagent dokumentiert und koordiniert; QA, Reviewer, Security und Legal arbeiten read-only. Ein Writer-Wechsel ist verboten.
- Maximales Zeitbudget: 180 Minuten ab Task-Start am 2026-07-14.
- Pflichtpruefungen: alle Cancellation-Akzeptanztests; alle Evidence-Tests; PostgreSQL-Integrationstests ohne Skips; Runtime-, Worker-, Workflow-Engine- und Root-Tests; Crash-/Restart-Recovery; Mehrprozess-CAS-/Fencing; Cancel-/Completion-Race 30-mal ohne Retry; Lint; Typecheck; Build; `git diff --check`.
- Reviewfolge: Nach beendeter Implementierung und Writer-Zugriff wird der Stand durch Git-Diff und SHA-256-Manifest fixiert. Erst dann pruefen QA, Reviewer, Security und Legal read-only denselben Stand. QA prueft ausschliesslich AC/AT; Reviewer Vertragstreue und Traceability; Security Evidence, Fencing, Replay, Race und falsche Cancellation-Bestaetigungen; Legal ausschliesslich `NOT_APPLICABLE`.
- Reparaturbudget: maximal ein automatischer Reparaturdurchlauf durch dieselbe Writer-Identitaet nach dem ersten Review. Danach wird nicht erneut automatisch repariert.
- Abschlussstatus: `PASSED`, wenn alle freigegebenen Akzeptanzkriterien und Pflichtpruefungen bestanden und QA, Reviewer sowie Security fuer `DEVELOPMENT_ONLY` freigeben und Legal `NOT_APPLICABLE` bestaetigt. `BLOCKED`, wenn ein Kriterium offen bleibt. `DEFERRED_TO_LATER_GATE` nur fuer ausdruecklich spaetere Production-Evidence, niemals als Ersatz fuer ein aktuelles AC/AT.
- Erfolgsformel: `CANCELLATION CONTRACT IMPLEMENTATION BESTANDEN  DEVELOPMENT ONLY`.
- Nichterfuellungsformel: `CANCELLATION CONTRACT IMPLEMENTATION NICHT BESTANDEN`.
- Projektwirkung: `PROJECT_STATE` bleibt auch bei Erfolg `BLOCKED - DEVELOPMENT ONLY`, weil Completion-ID und Gesamt-Closeout ausserhalb dieses Tasks offen bleiben.

Dieser Arbeitsvertrag ist mit Task-Beginn unveraenderlich. Ausfuehrungs-, Test-, Review- und Abschlussnachweise werden ausschliesslich in einer getrennten Datei dokumentiert.
