# ROADMAP-RECONCILIATION-AFTER-CODEX-MVP-01

## Unveraenderlicher Arbeitsvertrag

- Task: `ROADMAP-RECONCILIATION-AFTER-CODEX-MVP-01`
- Basisstand: lokaler `main`-Merge-Commit `44937a7` (`CODEX_RUNTIME_ADAPTER_MVP` gemergt)
- Scope: ausschliesslich die Builder-V1-Dokumentation nach dem bestandenen `CODEX_RUNTIME_ADAPTER_MVP` auf den aktuellen, widerspruchsfreien `DEVELOPMENT_ONLY`-Stand bringen.
- Writer-Identitaet: Hauptagent `/root`; kein Writer-Wechsel innerhalb dieses Tasks.
- Erlaubte Dateien: `README.md`, `BUILDER_SPEC.md`, `PROJECT_STATE.md`, `docs/architecture/implementation-roadmap.md`, `docs/product/requirements.md`, `docs/product/user-flows.md` und diese Reconciliation-Datei.
- Verboten: Anwendungscode, Tests, Migrationen oder Dependencies veraendern; Codex-Prozess oder echten Modell-Smoke starten; GitHub oder Deployment verwenden; Production aktivieren.
- Maximales Zeitbudget: 60 Minuten ab der ersten Dokumentationsaenderung.
- Zielabschluss: `PASSED`; falls ein Akzeptanzkriterium nach hoechstens einem zulaessigen automatischen Reparaturdurchlauf offen bleibt, `BLOCKED`; ein nachweislich erst an einem spaeteren Gate pruefbarer Punkt wird `DEFERRED_TO_LATER_GATE`.

### Akzeptanzkriterien

1. Das README beschreibt die vorhandene, bestandene read-only Codex-Runtime-Adapter-Integration und die vorhandenen Orchestratoren korrekt, ohne schreibende echte Agenten oder automatische Projektausfuehrung zu behaupten.
2. `WORKER_FAKE_RUNTIME_MVP` wird nicht mehr als aktueller oder blockierter Meilenstein dargestellt; seine historischen Nachweise bleiben erhalten.
3. `REAL_RUNTIME_HARDENING` ist der naechste verbindliche Meilenstein mit Status `READY FOR FIRST BOUNDED TASK - DEVELOPMENT ONLY`.
4. Die sechs Tasks `COMPLETION-ID-HARDENING-01`, `REAL-WORKER-PROCESS-IDENTITY-01`, `REAL-RUNTIME-TERMINATION-EVIDENCE-01`, `REAL-RUNTIME-RECONCILIATION-01`, `PROVIDER-CREDENTIAL-REVOCATION-01` und `REAL-RUNTIME-HARDENING-CLOSEOUT-01` sind in dieser Reihenfolge verbindlich dokumentiert.
5. Fuer neue Tasks gilt nach dem fixierten ersten Review-Snapshot genau ein automatischer Reparaturdurchlauf; normale Bearbeitungs- und Pruefiterationen vor diesem Snapshot verbrauchen ihn nicht.
6. Historische `BLOCKED`- und `PASSED`-Nachweise bleiben unveraendert als Historie erkennbar.
7. Die Dokumentation behauptet keine vollstaendige Produktionsreife von M-001 bis M-004.
8. `PROJECT_STATE.md` nennt `REAL_RUNTIME_HARDENING`, `READY FOR FIRST BOUNDED TASK - DEVELOPMENT ONLY` und `COMPLETION-ID-HARDENING-01` als aktuellen Stand.
9. GitHub-Integration und automatische Projektausfuehrung bleiben `NO`; Production deployment bleibt `DISABLED`.
10. `git diff --check` besteht; die abschliessenden Widerspruchssuchen melden keine aktuelle Aussage ueber drei Reparaturen, `WORKER_FAKE_RUNTIME_MVP` als aktuellen Meilenstein oder eine fehlende Codex-Integration. Historische Treffer werden einzeln klassifiziert.

### Snapshot- und Reparaturregel

Normale Bearbeitungs- und Pruefiterationen vor Fixierung des finalen Review-Snapshots sind kein automatischer Reparaturdurchlauf. Das Limit von genau einem automatischen Reparaturdurchlauf beginnt erst, nachdem der finale Snapshot fixiert wurde und die Abschlussreviews gegen genau diesen Stand begonnen haben.

## Ausfuehrungsrahmen

- Erste Dokumentationsaenderung: `2026-07-17 23:15:13 +02:00`.
- Zeitbudget-Ende: `2026-07-18 00:15:13 +02:00`.
- Writer waehrend der gesamten Bearbeitung: Hauptagent `/root`.
- Delegierte Audits vor dem finalen Snapshot: ausschliesslich read-only; keine weitere Writer-Identitaet.
- Fremder Arbeitsbaum-Eintrag `d`: bereits vor Taskbeginn unversioniert vorhanden, ausserhalb des erlaubten Scopes und unveraendert.

## Automatischer Reparaturdurchlauf

- Erster finaler Review-Snapshot: sieben Task-Dateien mit SHA-256 fixiert; `git diff --check` und die geforderten Widerspruchssuchen bestanden.
- Abschlussreview-Befund: QA `BLOCK`, weil D-031 Trusted Quality Checks nach dem Writer-Handoff verlangte, waehrend der verbindliche User-Flow sie auf dem Candidate-Digest vor dem finalen Handoff ausfuehrt.
- Reparaturbudget: `1/1` verbraucht.
- Eng begrenzte Korrektur: D-031 an den User-Flow angeglichen; nach der Implementierung laufen die Trusted Quality Checks vor dem finalen Writer-Handoff, danach wird der Snapshot fixiert, der Schreibzugriff beendet und die vier read-only Abschlussreviews werden gestartet.
- Die drei zuvor bestandenen Rollenreviews und der QA-Block des ersten Snapshots sind historische Review-Evidenz; alle vier Rollen muessen den reparierten Ersatzsnapshot erneut pruefen.
