-- Temporärer DEVELOPMENT_ONLY Windows-Kompatibilitätspin.
-- 0.144.4 bleibt für bereits gespeicherte historische Ledger-Einträge erlaubt.
-- Neue Runs werden zusätzlich durch die Anwendung auf CODEX_CLI_VERSION geprüft.

ALTER TABLE builder.codex_exec_runs
  DROP CONSTRAINT codex_exec_runs_cli_version_check,
  ADD CONSTRAINT codex_exec_runs_cli_version_check
    CHECK (cli_version IN ('0.132.0', '0.144.4'));