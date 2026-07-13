# Agent Rules

## 1. Orchestrierung

- Der Hauptagent ist der Orchestrator. Er steuert den Workflow, delegiert klar abgegrenzte Aufgaben und fuehrt die Ergebnisse zusammen.
- Pro Workflow-Ausfuehrung wird genau eine Aufgabe bearbeitet.
- Es wird immer nur ein Meilenstein gleichzeitig umgesetzt.
- Nach der Erstimplementierung ist pro Aufgabe maximal ein automatischer Reparaturdurchlauf zulaessig. Bleibt danach ein Akzeptanzkriterium offen, stoppt der Workflow mit einem strukturierten Blocker und fordert eine manuelle Entscheidung an; eine automatische Reparatur- oder Review-Endlosschleife ist verboten.

## 2. Verbindliche Reihenfolge in der Planung

Solange der aktuelle Meilenstein `PLANNING` ist, gilt diese Reihenfolge:

1. Zuerst arbeitet der Planner.
2. Danach arbeitet der Architect auf Grundlage des abgeschlossenen Planner-Ergebnisses.
3. Danach arbeiten Security und Legal DE parallel auf Grundlage der abgeschlossenen Architektur.
4. Der Hauptagent fuehrt alle Ergebnisse zusammen und speichert sie in Dokumentationsdateien.

Waehrend `PLANNING` darf kein Anwendungscode implementiert oder veraendert werden. Anwendungscode darf erst implementiert werden, wenn `Architecture approved: YES` im Projektzustand dokumentiert ist.

## 3. Schreibrechte und Rollen

- Nur Executor und QA duerfen Anwendungscode veraendern.
- Pro Aufgabe ist hoechstens eine festgelegte Writer-Identitaet zulaessig. Das gilt unabhaengig davon, ob Executor oder ein ausdruecklich als Writer eingesetzter QA-Agent schreibt; ein Wechsel des schreibenden Agenten innerhalb derselben Aufgabe ist verboten und erfordert einen neuen Task mit neuem unveraenderlichem Arbeitsvertrag.
- Security, Legal und Reviewer arbeiten schreibgeschuetzt. Sie analysieren, dokumentieren Befunde und geben Entscheidungen oder Anforderungen ab, veraendern aber keinen Anwendungscode.
- Der Hauptagent koordiniert und dokumentiert; waehrend der Planung implementiert er keinen Anwendungscode.

## 4. Qualitaetssicherung

Nach jeder Implementierung muessen fuer das betroffene Projekt alle vorgesehenen Tests, der Typecheck, der Lint-Lauf und der Build ausgefuehrt werden. Eine Aenderung darf nur weitergegeben werden, wenn die Ergebnisse dokumentiert sind und alle verpflichtenden Pruefungen erfolgreich waren oder ein ausdruecklich dokumentierter Stop- beziehungsweise Eskalationsstatus vorliegt.

Jede implementierte Aenderung muss anschliessend von QA, Reviewer, Security und Legal geprueft werden. Diese Read-only-Reviews duerfen erst beginnen, nachdem die Implementierung abgeschlossen, der Schreibzugriff beendet und der zu pruefende Stand eindeutig fixiert ist; danach duerfen sie parallel auf demselben Stand laufen. Kritische Sicherheitsprobleme und rechtliche Stop-Status verhindern die jeweils betroffene Freigabestufe.

Ein Review prueft nur den aktuellen Task-Scope, dessen Akzeptanzkriterien und die fuer den aktuellen Meilenstein vorgeschriebenen Gates. Bereits bestandene und seitdem unveraenderte Bereiche duerfen nicht erneut zum Reparaturgegenstand gemacht werden. Neue Findings ausserhalb des aktuellen Scopes werden mit Fundstelle, Risiko, vorgeschlagenem Zielmeilenstein und erforderlicher Freigabestufe als nachfolgende Tasks erfasst; sie erweitern den laufenden Task nicht. Unveraenderte Schutzverletzungen duerfen weiterhin als bestehende, fuer eine spaetere Freigabestufe bindende Holds dokumentiert werden, ohne daraus eine Reparatur des aktuellen Tasks abzuleiten.

## 5. Sicherheits- und Produktionsregeln

- Geheimnisse duerfen weder in Dateien noch in Prompts oder Logs gespeichert oder ausgegeben werden.
- Agenten erhalten keine Produktionszugangsdaten.
- Direkte Aenderungen an Produktionssystemen sind verboten.
- Eine automatische Produktionsveroeffentlichung ist verboten.
- Echte Kundendaten duerfen in Version 1 nicht verwendet werden.
- Production deployment bleibt `DISABLED`. Keine Entwicklungs-, Komponenten- oder Release-Candidate-Pruefung darf diesen Status aendern oder als Produktionsfreigabe ausgelegt werden.

## 6. Task-Vertrag und Abschluss

Vor Beginn benoetigt jeder Task einen dokumentierten, unveraenderlichen Arbeitsvertrag mit:

- klarem Scope;
- pruefbaren Akzeptanzkriterien;
- ausdruecklich erlaubten Dateien oder Komponenten;
- einem maximalen Zeitbudget;
- einem eindeutigen Abschlussstatus.

Zulaessige Abschlussstatus sind mindestens `PASSED`, `BLOCKED` und `DEFERRED_TO_LATER_GATE`. Ein Abschluss muss den geprueften Stand, die ausgefuehrten Pflichtpruefungen, offene Findings und deren Zielmeilenstein dokumentieren. Ein strukturierter Blocker enthaelt mindestens das nicht erfuellte Akzeptanzkriterium, reproduzierbare Evidenz, den betroffenen Scope, den bereits verbrauchten Reparaturdurchlauf und die erforderliche manuelle Entscheidung.

## 7. Meilensteinbezogene Pruefung

- Komponenten werden waehrend der Entwicklung ausschliesslich gegen den Scope, die Akzeptanzkriterien und die Gates ihres aktuellen Meilensteins geprueft.
- Eine bestandene Komponentenpruefung ist weder eine Release-Candidate- noch eine Produktionsfreigabe.
- `NOT_VERIFIABLE_LOCALLY` blockiert einen Entwicklungsmeilenstein nicht, wenn der Punkt ausdruecklich als spaeteres, fail-closed Production Gate mit benoetigter Evidenz und Zielmeilenstein dokumentiert ist. Der Punkt gilt damit nicht als bestanden und darf fuer die spaetere Freigabe nicht uebersprungen werden.
- PostgreSQL-Integration, reale Workeridentitaet, echte Counsel-Qualifikation, Providervertraege und Deployment werden nur in den Meilensteinen geprueft, denen sie in der Roadmap zugeordnet sind. Vorher bleiben sie dokumentierte, fail-closed Folge- oder Production Gates und duerfen nicht als Akzeptanzkriterium eines technisch isolierten frueheren Tasks nachgezogen werden.
- Security-, Legal-, Audit-, Daten-, Datenschutz-, Geheimnis-, Isolations- und Produktionsschutzregeln bleiben in allen Meilensteinen bindend. Die zeitliche Zuordnung einer Pruefung beseitigt oder lockert keine Schutzmassnahme.

## 8. Getrennte Freigabestufen

`DEVELOPMENT_ONLY`, `RELEASE_CANDIDATE` und `PRODUCTION` sind getrennte, nicht austauschbare Freigabestufen:

- `DEVELOPMENT_ONLY` erlaubt nur die weitere technisch isolierte Entwicklung im aktuellen Meilenstein. Es erlaubt keine externe Veroeffentlichung, kein Deployment, keine echten Kundendaten und keine Produktion.
- `RELEASE_CANDIDATE` erfordert alle dafuer vorgesehenen Security-, Legal-, Qualitaets-, Provider- und Betriebsnachweise. Es ist keine Produktionsfreigabe.
- `PRODUCTION` erfordert die vollstaendige Erfuellung aller Production Gates und eine separate ausdrueckliche Owner-Freigabe. Fuer Builder V1 bleibt diese Stufe gesperrt und Production deployment `DISABLED`.

Legal `PASS_WITH_REQUIREMENTS` kann fuer `DEVELOPMENT_ONLY` zulaessig sein, wenn jede Requirement einem spaeteren Gate zugeordnet ist und keine Requirement den aktuellen technischen Scope verbietet. `COUNSEL_REQUIRED` blockiert `PRODUCTION` und die davon betroffene externe oder rechtliche Handlung, aber nicht automatisch die Implementierung einer technisch isolierten Komponente ohne diese Handlung. Security `BLOCK` blockiert den aktuellen Entwicklungsmeilenstein genau dann, wenn der Blocker dessen eigenen Scope oder ein fuer diesen Meilenstein bindendes Schutz-Gate betrifft. Fuer spaetere Freigabestufen bleiben alle einschlaegigen Security- und Legal-Blocker fail-closed bestehen.
