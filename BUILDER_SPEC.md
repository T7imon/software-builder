# Builder Platform Specification

## 1. Ziel

Die Builder-Plattform erstellt neue Softwareprojekte, die organisatorisch, technisch und im Dateisystem voneinander getrennt sind. Jedes Projekt besitzt einen eigenen Planungsstand, einen eigenen isolierten Projektordner und spaeter ein eigenes GitHub-Repository.

Ein Benutzer beschreibt eine Softwareidee. Die Plattform ueberfuehrt diese Idee in einen kontrollierten, nachvollziehbaren Projekt-Workflow und koordiniert die beteiligten spezialisierten Agenten.

## 2. Verbindlicher Projekt-Workflow

1. Der Benutzer beschreibt die Softwareidee und die gewuenschten Ergebnisse.
2. Die Plattform erstellt daraus eine Spezifikation, eine Architektur, eine Roadmap und umsetzbare Aufgaben.
3. Nach der Planung pruefen deutsche beziehungsweise EU-Rechtsagenten und Sicherheitsagenten das geplante Projekt.
4. Die Ergebnisse der Planung sowie der Rechts- und Sicherheitspruefungen werden dokumentiert.
5. Der Plattformbesitzer erteilt genau eine initiale Projektfreigabe. Vor dieser Freigabe darf weder ein ausfuehrbarer Projektordner angelegt noch Anwendungscode implementiert werden.
6. Nach der initialen Freigabe erstellt die Plattform einen isolierten Projektordner. Spaeter erstellt sie fuer dieses Projekt ein eigenes GitHub-Repository.
7. Erst nach bestandenem `REAL_RUNTIME_HARDENING` und allen fuer die Handlung einschlaegigen Gates duerfen schreibende echte Codex-Agenten jeweils genau eine einzelne Aufgabe implementieren. Der bestandene read-only PLANNER-Pfad allein erteilt diese Freigabe nicht.
8. QA, Reviewer, Security und Legal pruefen jede implementierte Aenderung, bevor sie als akzeptiert gelten kann.
9. Nach Fixierung des ersten finalen Review-Snapshots und Beginn der Abschlussreviews ist pro Aufgabe hoechstens ein automatischer Reparaturdurchlauf zulaessig. Normale, zeitlich begrenzte Bearbeitungs- und Pruefiterationen vor diesem Snapshot verbrauchen den Reparaturdurchlauf nicht. Bleibt danach ein Akzeptanzkriterium offen, wird die Aufgabe mit einem strukturierten Blocker gestoppt und erfordert eine manuelle Entscheidung.

## 3. Umfang von Version 1

Version 1 unterstuetzt ausschliesslich Full-Stack-Webanwendungen. Eine Anwendung umfasst dabei ein Web-Frontend, die benoetigte serverseitige Anwendungslogik und die fuer das Projekt erforderliche Datenhaltung.

Version 1 hat genau einen Plattformbesitzer. Ein Mehrbenutzer-, Rollen- oder Mandantenmodell fuer die Verwaltung der Builder-Plattform ist nicht Bestandteil von Version 1.

Pro Projekt arbeitet zu jedem Zeitpunkt hoechstens ein schreibender Executor. Andere Agenten duerfen parallel analysieren oder pruefen, aber keine konkurrierenden Schreibzugriffe auf den Anwendungscode ausfuehren.

## 4. Nicht Bestandteil von Version 1

- Mobile Apps werden nicht unterstuetzt.
- Desktop-Apps werden nicht unterstuetzt.
- Eine automatische Veroeffentlichung in Produktionsumgebungen findet nicht statt.
- Die Verarbeitung echter Kundendaten ist nicht zulaessig.
- Agenten erhalten keine Produktionszugangsdaten.

## 5. Freigaben und Stop-Bedingungen

Der Rechtsstatus eines Projekts oder einer Aenderung muss genau einen der folgenden Werte besitzen:

- `PASS`: Die Rechtspruefung hat keine blockierende Anforderung festgestellt.
- `PASS_WITH_REQUIREMENTS`: Eine Fortsetzung ist nur unter vollstaendiger Erfuellung der dokumentierten Anforderungen zulaessig.
- `BLOCK`: Das Projekt oder die Aenderung darf nicht fortgesetzt beziehungsweise veroeffentlicht werden.
- `COUNSEL_REQUIRED`: Eine qualifizierte externe oder interne Rechtsberatung ist erforderlich. Die Veroeffentlichung wird gestoppt, bis eine dokumentierte anwaltliche Entscheidung vorliegt.

Kritische Sicherheitsprobleme stoppen die Veroeffentlichung. Eine Fortsetzung ist erst zulaessig, nachdem das Problem behoben, erneut geprueft und die Behebung dokumentiert wurde.

Eine Freigabe hebt keine spaeter festgestellte rechtliche oder sicherheitsbezogene Stop-Bedingung auf. Jede Aenderung muss die vorgesehenen QA-, Review-, Security- und Legal-Pruefungen bestehen.
