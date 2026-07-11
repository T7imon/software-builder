# Agent Rules

## 1. Orchestrierung

- Der Hauptagent ist der Orchestrator. Er steuert den Workflow, delegiert klar abgegrenzte Aufgaben und fuehrt die Ergebnisse zusammen.
- Pro Workflow-Ausfuehrung wird genau eine Aufgabe bearbeitet.
- Es wird immer nur ein Meilenstein gleichzeitig umgesetzt.
- Maximal drei automatische Reparaturversuche sind pro Aufgabe zulaessig. Danach muss der Workflow stoppen und eine manuelle Entscheidung anfordern.

## 2. Verbindliche Reihenfolge in der Planung

Solange der aktuelle Meilenstein `PLANNING` ist, gilt diese Reihenfolge:

1. Zuerst arbeitet der Planner.
2. Danach arbeitet der Architect auf Grundlage des abgeschlossenen Planner-Ergebnisses.
3. Danach arbeiten Security und Legal DE parallel auf Grundlage der abgeschlossenen Architektur.
4. Der Hauptagent fuehrt alle Ergebnisse zusammen und speichert sie in Dokumentationsdateien.

Waehrend `PLANNING` darf kein Anwendungscode implementiert oder veraendert werden. Anwendungscode darf erst implementiert werden, wenn `Architecture approved: YES` im Projektzustand dokumentiert ist.

## 3. Schreibrechte und Rollen

- Nur Executor und QA duerfen Anwendungscode veraendern.
- Pro Projekt darf immer nur ein schreibender Executor aktiv sein.
- Security, Legal und Reviewer arbeiten schreibgeschuetzt. Sie analysieren, dokumentieren Befunde und geben Entscheidungen oder Anforderungen ab, veraendern aber keinen Anwendungscode.
- Der Hauptagent koordiniert und dokumentiert; waehrend der Planung implementiert er keinen Anwendungscode.

## 4. Qualitaetssicherung

Nach jeder Implementierung muessen fuer das betroffene Projekt alle vorgesehenen Tests, der Typecheck, der Lint-Lauf und der Build ausgefuehrt werden. Eine Aenderung darf nur weitergegeben werden, wenn die Ergebnisse dokumentiert sind und alle verpflichtenden Pruefungen erfolgreich waren oder ein ausdruecklich dokumentierter Stop- beziehungsweise Eskalationsstatus vorliegt.

Jede implementierte Aenderung muss anschliessend von QA, Reviewer, Security und Legal geprueft werden. Kritische Sicherheitsprobleme und rechtliche Stop-Status verhindern eine Freigabe.

## 5. Sicherheits- und Produktionsregeln

- Geheimnisse duerfen weder in Dateien noch in Prompts oder Logs gespeichert oder ausgegeben werden.
- Agenten erhalten keine Produktionszugangsdaten.
- Direkte Aenderungen an Produktionssystemen sind verboten.
- Eine automatische Produktionsveroeffentlichung ist verboten.
- Echte Kundendaten duerfen in Version 1 nicht verwendet werden.
