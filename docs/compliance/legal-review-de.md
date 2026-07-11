# Legal Review DE/EU

Stand: 11.07.2026

Gesamtstatus: `PASS_WITH_REQUIREMENTS`

Der Status gilt ausschließlich für die weitere Architekturplanung. Er ist keine Freigabe für `Architecture approved`, Implementierung, GitHub, automatische Projektausführung, Veröffentlichung oder Produktion. Diese Funktionen bleiben nach `PROJECT_STATE.md` deaktiviert.

## 1. Hinweis und Prüfungsgrenze

Diese automatisierte Prüfung ist keine individuelle Rechtsberatung und keine anwaltliche Freigabe. Sie bewertet die dokumentierte Architektur unter den genannten Annahmen und dem am Stichtag geprüften Rechtsstand. Ein `PASS` oder `PASS_WITH_REQUIREMENTS` garantiert weder vollständige Rechtskonformität noch Rechtefreiheit.

Qualifizierter Counsel ist zwingend, wenn die Tatsachen, Rollen, Zielmärkte, Transfers, Projektinhalte oder Rechtsfolgen nicht zuverlässig automatisiert eingeordnet werden können.

## 2. Annahmen

- V1 wird lokal in Deutschland von genau einem Plattformbesitzer als natürlicher Person für eigene, nicht öffentlich angebotene Softwareprojekte genutzt. Eine berufliche, unternehmerische oder durch eine andere Rechtsperson erfolgende Nutzung erzeugt vor externer Verarbeitung eine neue Rollen- und Rechtsgrundlagenprüfung.
- V1 verarbeitet in Projektinhalten nur synthetische Daten; echte Kundendaten sind verboten.
- OpenAI/Codex und GitHub sind noch nicht aktiviert.
- Es gibt keine automatische oder direkte Produktionsveröffentlichung.
- Monetarisierung, fremde Nutzer, Kundenbereitstellung und Produktion sind in V1 ausgeschlossen. Primärdaten bleiben auf dem lokalen Windows-Rechner; verschlüsselte Backups und minimierte Auditanker dürfen nur nach Provider-Gate in einer EU-Region liegen.
- OpenAI/Codex und die dedizierte private GitHub-Organisation sind ausgewählte, aber getrennt deaktivierte externe Verarbeitungen. Konkretes Produkt, Vertrag/DPA, Subprozessoren, Transfers, Retention und Löschung müssen vor dem jeweiligen ersten Byte nachgewiesen sein.

Wenn eine Annahme nicht zutrifft, wird die betroffene LegalAssessment unwirksam und eine neue Prüfung erforderlich.

## 3. Rechtliche Kerneinordnung

### 3.1 Datenschutzrollen und Rechtsgrundlagen

Der Plattformaccount und der menschliche Owner sind nicht automatisch der datenschutzrechtlich Verantwortliche. Die Architektur benötigt einen getrennten `LegalEntity`- und `ControllerEntity`-Begriff. Für Account-, Intake-, Workflow-, Audit-, Support- und Providerdaten ist der Betreiber regelmäßig Verantwortlicher; Dienstleister können je Verarbeitung Auftragsverarbeiter oder eigenständig Verantwortliche sein. Die Rollen sind pro Zweck und tatsächlichem Einfluss zu bestimmen, entsprechend der [DSGVO](https://eur-lex.europa.eu/eli/reg/2016/679/oj) und den [EDPB Guidelines 07/2020 zu Controller und Processor](https://www.edpb.europa.eu/documents/guideline/guidelines-072020-concepts-controller-and-processor-gdpr_en).

Zwecke und Rechtsgrundlagen sind einzeln festzulegen. Eine pauschale Einwilligung ist kein Ersatz für die Prüfung von Art. 6, gegebenenfalls Art. 9/10, und die Transparenzpflichten. Die Architektur muss insbesondere unterstützen:

- Art. 5: Zweckbindung, Datenminimierung, Richtigkeit, Speicherbegrenzung, Integrität/Vertraulichkeit und Rechenschaft;
- Art. 12 bis 22: Betroffenenrechte;
- Art. 25: Datenschutz durch Technikgestaltung und datenschutzfreundliche Voreinstellungen;
- Art. 28: Auftragsverarbeitung;
- Art. 30: Verzeichnis von Verarbeitungstätigkeiten;
- Art. 32: risikoadäquate Sicherheit;
- Art. 33/34: Datenschutzverletzungen;
- Art. 35/36: Datenschutz-Folgenabschätzung und Konsultation;
- Art. 44 ff.: Drittlandtransfers.

### 3.2 Verbot echter Kundendaten

Das V1-Verbot umfasst mehr als strukturierte Kundendatensätze. Ebenfalls abzulehnen sind insbesondere:

- pseudonymisierte Produktionskopien;
- Tickets, Chatverläufe und Support-Exporte;
- Screenshots und Bildschirmaufzeichnungen;
- Log- und Telemetrieauszüge;
- Repository-Historie mit Personen- oder Geheimnisbezug;
- Testdaten, die reale Personen oder Kunden reproduzieren;
- Produktionskonfigurationen und Credentials.

Screening vor der Persistenz reduziert Risiken, beweist aber keine Datenfreiheit. Verdächtiger Inhalt ist fail closed zu behandeln. Transiente Scan-Inhalte dürfen nicht geloggt werden und sind nach der Entscheidung unverzüglich zu verwerfen, sofern keine eng begrenzte Incident-Pflicht besteht.

### 3.3 OpenAI/Codex als externer Provider

Vor dem ersten externen Byte muss das konkrete Produkt und der konkrete Betriebsweg geprüft werden. Erforderlich sind mindestens Vertrag, Produktabdeckung des DPA, Rollen, Subprozessoren, Regionen, Retention, Löschung, Incident-Regeln, Transfers, Training-/Feedback-Einstellungen und technische Datenminimierung.

Das aktuelle [OpenAI Data Processing Addendum](https://openai.com/policies/data-processing-addendum/) regelt unter anderem Betroffenenanfragen, Subprozessoren, Löschung und internationale Transfers, aber die tatsächliche Abdeckung hängt vom gewählten Vertrag und Service ab. Die aktuelle [OpenAI-Datennutzungs- und Retention-Dokumentation](https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint) erklärt, dass API-Daten grundsätzlich nicht zum Training verwendet werden, sofern nicht ausdrücklich optiert wird, und dass Retention sowie ZDR-/MAM-Eignung endpoint- und featureabhängig sind. Standardmäßige Abuse-Monitoring-Logs können Inhalte bis zu 30 Tage enthalten; Application State kann je Endpoint anders oder länger gespeichert werden. EU-Residency und regionale Verarbeitung haben Voraussetzungen und Ausnahmen.

Folgerung: Die Architektur darf weder „kein Training“, „EU-only“ noch „Zero Retention“ pauschal aus dem Produktnamen ableiten. Ein versioniertes Provider-Gate muss den exakten Codex-/SDK-/API-Pfad und alle genutzten Features nachweisen. Die aktuelle [OpenAI-Subprozessorliste](https://openai.com/policies/sub-processor-list/) ist Teil dieses Gates.

### 3.4 GitHub

Für GitHub sind Vertragspartner, Tarif, Repository-Eigentum, DPA-Abdeckung, Subprozessoren, Regionen, Löschung und Transfermechanismus festzulegen. Ein kostenloses persönliches Konto darf nicht ohne Prüfung als Art.-28-geeignete Vertragskonstellation behandelt werden. Maßgeblich sind das konkrete [GitHub Data Protection Agreement](https://github.com/customer-terms/github-data-protection-agreement) und die aktuelle [GitHub-Subprozessorliste](https://docs.github.com/en/site-policy/privacy-policies/github-subprocessors).

Private Repositories, eine GitHub App und kurzlebige Tokens sind sinnvolle Schutzmaßnahmen, ersetzen aber keine Rollen-, Vertrags-, Transfer- und Veröffentlichungseinordnung.

### 3.5 Drittlandtransfers

Transfers benötigen einen dokumentierten Mechanismus und eine Prüfung der tatsächlichen Datenflüsse. Relevante Quellen sind die [Angemessenheitsbeschlüsse der EU-Kommission](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en) und die [Standardvertragsklauseln 2021/914](https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj).

Für jeden Provider sind Empfänger, Länder, Subprozessoren, SCC/Angemessenheit, Transfer Impact Assessment und ergänzende Maßnahmen versioniert zu dokumentieren. Provider- oder Rechtsänderungen müssen das Gate auslaufen lassen und eine neue Prüfung erzeugen.

### 3.6 Retention, Immutable Evidence und Löschung

Unveränderliche Evidence darf keine unbegrenzt unveränderlichen personenbezogenen Rohdaten erzeugen. Das reconciliierte Modell ist erforderlich:

- Evidence bevorzugt Hashes, strukturierte Ergebnisse und minimierte Metadaten;
- Personenbezug liegt möglichst in separat löschbaren Zuordnungsschichten;
- Retention ist record-spezifisch und zweckgebunden;
- Legal Holds haben Zweck, Rechtsgrundlage, Umfang, Frist und Review;
- Löschung umfasst Primärdaten, Objekte, Workspaces, Repositories/Provider-Referenzen, Indizes, Replikate und Backup-Ablauf;
- Wiederherstellung respektiert Tombstones und abgelaufene Credentials;
- jede nicht löschbare Restinformation wird begründet und dokumentiert.

### 3.7 Datenschutzverletzungen und Betroffenenrechte

Die Plattform benötigt einen DSR-Workflow für Art. 12 bis 22 sowie einen Breach-Workflow. Der Breach-Fall erfasst insbesondere Awareness-Zeitpunkt, Risikobewertung, 72-Stunden-Entscheidung, Behördenmeldung, Betroffeneninformation, Maßnahmen und Breach Register. Provider-Verträge müssen die Mitwirkung und Meldewege abbilden.

Eine DPIA-Vorprüfung ist vor jeder neuen Verarbeitungsart erforderlich. Wenn Art. 35 einschlägig ist, muss die DPIA vor der Verarbeitung abgeschlossen werden. Die Notwendigkeit eines Datenschutzbeauftragten ist unter anderem nach § 38 BDSG zu prüfen ([BDSG](https://www.gesetze-im-internet.de/bdsg_2018/)).

### 3.8 EU AI Act

Bei rein persönlicher, nicht beruflicher Nutzung kann die Ausnahme für natürliche Personen außerhalb einer beruflichen Tätigkeit eingreifen. Bei beruflicher oder unternehmerischer Nutzung ist die Builder-Plattform regelmäßig als Betreiber eines KI-Systems zu prüfen und kann je eigener Marke, Zweckbestimmung, Integration oder wesentlicher Änderung zusätzlich Anbieter oder Downstream-Anbieter sein. Die tatsächliche Rolle wird vor erster externer KI-Verarbeitung im `AISystemRecord` dokumentiert; Unklarheit erzeugt `COUNSEL_REQUIRED`.

Der Grundtext ist die [Verordnung (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj). Verbote und KI-Kompetenzpflichten gelten bereits; Transparenzpflichten werden nach der aktuellen [EU-Kommissionsübersicht zum AI Act](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai) im August 2026 relevant. Die Kommissionsseite weist zugleich auf politische Einigungen zu Vereinfachungs-/Zeitplanänderungen hin. Vor jedem Milestone-Gate ist daher der endgültig geltende Text und Anwendungszeitpunkt erneut zu prüfen; ein Vorschlag oder politischer Kompromiss darf nicht ungeprüft als verbindliche Systemkonstante eingebaut werden.

Erforderlich sind:

- AI-Systemregister und Rollenentscheidung;
- dokumentierte KI-Kompetenz;
- Prüfung verbotener Praktiken;
- projektspezifischer High-Risk-Screen;
- Transparenz und Kennzeichnung, soweit einschlägig;
- menschliche Aufsicht und revisionsgebundene Provenienz;
- neue LegalAssessment bei Zweck- oder Risikoklassenänderung.

### 3.9 Urheberrecht, generierter Code und Open Source

Reine autonome KI-Ausgabe begründet nicht automatisch deutsches Urheberrecht; maßgeblich ist eine persönliche geistige Schöpfung. Für Software sind insbesondere [§§ 2 und 69a UrhG](https://www.gesetze-im-internet.de/urhg/BJNR012730965.html) relevant. Vertraglich zugesagte Output-Rechte schaffen weder Schutzfähigkeit noch Rechtefreiheit; die konkreten [OpenAI Service Terms](https://openai.com/policies/service-terms/) sind vor Nutzung zu prüfen.

Jede extern bereitgestellte Revision braucht deshalb:

- Datei-, Modell-, Template- und Abhängigkeitsprovenienz;
- Lockfiles und maschinenlesbare SBOM;
- OSS-Lizenz- und Notice-Prüfung;
- dokumentierte Rechtekette;
- Behandlung von Similarity-/License-Findings;
- menschliche Freigabe vor Repository-Push oder Release.

Technische Scanner können Rechtefreiheit nicht beweisen.

### 3.10 Cyber Resilience Act

Ob der CRA greift, hängt vom konkreten Produkt-, Vermarktungs- und Remote-Processing-Modell ab. Reines unabhängiges SaaS ist nicht automatisch gleich einem Produkt mit digitalen Elementen; vermarktete Software oder integrierte Remote-Processing-Lösungen können dagegen erfasst sein. Das muss pro Projekt im Release Legal Profile entschieden werden.

Die EU-Kommission nennt den 11.09.2026 für Reportingpflichten und den 11.12.2027 für die volle Anwendung ([CRA-Implementierungszeitplan](https://digital-strategy.ec.europa.eu/en/factpages/cyber-resilience-act-implementation); [Verordnung (EU) 2024/2847](https://eur-lex.europa.eu/eli/reg/2024/2847/oj)). Bereits vor einer möglichen Vermarktung sind Herstellerrolle, Supportzeitraum, Vulnerability Handling, SBOM, sichere Entwicklung und Meldeprozess zu prüfen.

### 3.11 Verträge, Verbraucher und Produkthaftung

Für B2C-Projekte können insbesondere §§ 312 ff. und 327 ff. BGB relevant sein, einschließlich Widerruf, Bestellbutton, Vertragsmäßigkeit und Updates ([§ 327 BGB](https://www.gesetze-im-internet.de/bgb/__327.html), [§ 327f BGB](https://www.gesetze-im-internet.de/bgb/__327f.html)). Produkthaftung und nationale Umsetzung der Richtlinie (EU) 2024/2853 sind vor kommerzieller Distribution erneut anwaltlich zu prüfen ([Richtlinie (EU) 2024/2853](https://eur-lex.europa.eu/eli/dir/2024/2853/oj)).

### 3.12 DDG, TDDDG, Cookies und öffentliche Seiten

Öffentlich erreichbare Builder- oder Projektseiten benötigen je nach Betreiber/Sachverhalt insbesondere Anbieterinformationen nach § 5 DDG, Datenschutzhinweise und eine §-25-TDDDG-Entscheidung. Nicht notwendige Tracker oder Identifier dürfen nicht ungeprüft vor Einwilligung aktiviert werden. Quellen: [DDG](https://www.gesetze-im-internet.de/ddg/) und [TDDDG](https://www.gesetze-im-internet.de/ttdsg/).

V1 sollte ohne nicht notwendige Tracking-Technik starten.

### 3.13 Barrierefreiheit

Eine interne Ein-Personen-Oberfläche fällt nicht allein deshalb unter das BFSG. B2C-E-Commerce-Projekte können jedoch seit 28.06.2025 erfasst sein. WCAG 2.2 AA ist eine sinnvolle technische Baseline, ersetzt aber keine projektspezifische BFSG-/BFSGV-Prüfung ([BFSG](https://www.gesetze-im-internet.de/bfsg/), [BFSGV § 19](https://www.gesetze-im-internet.de/bfsgv/__19.html)).

### 3.14 Beschäftigtenkontext

Ein späterer Einsatz zur Beschäftigtensteuerung, Leistungsbewertung oder Überwachung benötigt eine neue Prüfung, insbesondere nach § 26 BDSG und gegebenenfalls § 87 Abs. 1 Nr. 6 BetrVG ([BetrVG](https://www.gesetze-im-internet.de/betrvg/)). Solche Projekte sind in V1 standardmäßig `COUNSEL_REQUIRED`.

## 4. Status- und Veröffentlichungssemantik

| Status | Verbindliche Wirkung |
|---|---|
| `PASS` | Kein erkannter Legal-Stop innerhalb der dokumentierten Fakten, Annahmen, Jurisdiktion, Rechtslage und des Digests; keine Garantie. |
| `PASS_WITH_REQUIREMENTS` | Gate bleibt unwirksam, bis jede revisionsgebundene Anforderung durch Legal verifiziert ist. |
| `BLOCK` | Automatische Fortsetzung und Veröffentlichung stoppen. Nur read-only Analyse, Rechtsprüfung und ausdrücklich definierte Abhilfe sind zulässig; kein Owner-Waiver. |
| `COUNSEL_REQUIRED` | Veröffentlichung und interimistisch automatische Fortsetzung stoppen. Nur CounselCase, read-only Untersuchung oder anwaltlich abgegrenzte Abhilfe sind zulässig. Danach ist eine neue immutable LegalAssessment erforderlich. |
| Fehlend/stale/konfliktär | Kein fünfter Status; stattdessen `LEGAL_UNRESOLVED_HOLD`, fail closed. |

Klassifikation:

- `EXTERNAL_PROCESSING`: Übermittlung an einen konkret vertraglich und technisch freigegebenen Provider.
- `PUBLICATION_RELEASE`: Bereitstellung außerhalb des kontrollierten Owner-/Processor-/Reviewer-Kreises, etwa öffentliches Repository, extern geteilter Preview-Link, Paketübergabe, Kundenhandoff, App-Listing, Open-Source-Release oder Livebetrieb.
- `PRODUCTION`: dauerhaft nicht unterstützte Untermenge in V1.
- `UNKNOWN`: abgelehnt.

Ein ausschließlich lokal gespeicherter und nur vom Owner kontrollierter Export ist `INTERNAL_CONTROLLED`. Sobald ein Export in Cloudspeicher gelangt, an Dritte übergeben, geteilt oder anderweitig dem alleinigen lokalen Kontrollbereich entzogen wird, ist vorab mindestens `EXTERNAL_PROCESSING` und je Empfänger/Zweck gegebenenfalls `PUBLICATION_RELEASE` neu zu prüfen. Ein unklarer Zielort ist `UNKNOWN` und wird abgelehnt.

Der 12 Monate gesperrte Auditanker darf nur Hashketten, Signaturen, RFC-3161-Zeitstempel und minimierte technische Metadaten enthalten. Personenbezogene Rohinhalte und anwaltliche Volltexte sind ausgeschlossen; Identitätszuordnungen bleiben getrennt löschbar. Zweck, Rechtsgrundlage, Sperrfrist und Löschlauf sind in der Retention Policy zu dokumentieren.

## 5. Binding Legal Changes

| ID | Kategorie | Verbindliche Änderung/Evidence | Trace |
|---|---|---|---|
| LGL-B01 | BLOCKING | Statussemantik, `LEGAL_UNRESOLVED_HOLD`, Publication-Taxonomie und nicht übersteuerbare Holds in Datenmodell/State Machine; Transitionstests | FR-018..021, FR-028; D-015/016/032 |
| LGL-B02 | BLOCKING | `LegalEntity`, Processing Inventory, Zwecke, Rechtsgrundlagen, Daten-/Betroffenenkategorien, Empfänger, Rollen und Art.-30-Daten | FR-023/024/028/029; D-019/028 |
| LGL-B03 | BLOCKING | Provider-Gate vor erstem externen Byte mit Produktvertrag/DPA, Subprozessoren, Regionen, Retention, Training, Transfer/TIA, Löschung, Incident | FR-008/024/025/029/031; D-008/010/019/029 |
| LGL-B04 | BLOCKING | Projektinhalte klassifizieren; echte Kundendaten einschließlich Exporte/Tickets/Screenshots/Logs/Produktionskopien ablehnen; transiente Scans nicht loggen | FR-001/024/025; D-006/008/022/029 |
| LGL-B05 | BLOCKING | Record-spezifische Retention, Löschung, Backup, Legal Hold, Provider-Erasure; immutable Evidence minimieren; Löschtests | FR-028/029; D-007/019/027 |
| LGL-B06 | BLOCKING | DSR- und Personal-Data-Breach-Workflow mit Awareness, 72h-Entscheidung, Betroffenenentscheidung und Register | FR-028/029; D-021/022/025/027 |
| LGL-B07 | BLOCKING | AI-Systemregister, Rollen-/Risikoprüfung, Kompetenz, Verbote, Transparenz, High-Risk-Screen | FR-003/010/014/018/022/024; D-005/008/026/028/029 |
| LGL-B08 | BLOCKING | Provenienz, OSS-Policy, Notices, Rechtekette, Similarity/License-Findings, Lockfiles und SBOM vor Push/Release | FR-002/008/010/013..015/028; D-005/007/010/012/023 |
| LGL-B09 | BLOCKING | Release Legal Profile für CRA, Produkthaftung, B2B/B2C, DDG/TDDDG, BFSG, regulierte Domänen und Zielstaaten; unbekannt -> Counsel | FR-008/018..022/026; D-016/023/024/028/030 |
| LGL-B10 | BLOCKING | LegalAssessment bindet Scope, Fakten, Annahmen, Jurisdiktion, Rechtsstand, Quellen, Reviewer-Typ und Digest; nur qualifizierter Counsel schließt CounselCase | FR-003/018/019; D-015/026/028/031/032 |

## 6. Weitere Anforderungen

| ID | Priorität | Anforderung |
|---|---|---|
| LGL-R01 | REQUIRED | Öffentliche Seiten: Impressum, Datenschutz, TDDDG-/Cookie-Entscheidung; keine nicht notwendigen Tracker vor wirksamer Einwilligung. |
| LGL-R02 | REQUIRED | DPIA-Screen vor neuer Verarbeitungsart; Art.-35-DPIA und DSB-Prüfung, wenn einschlägig. |
| LGL-R03 | REQUIRED | Counsel-/Legal-Evidence enger schützen; anwaltliche Volltexte nicht an Agenten oder Provider senden. |
| LGL-R04 | REQUIRED | Beschäftigteneinsatz nur nach neuer §-26-BDSG-/Mitbestimmungs-/AI-Act-Prüfung. |
| LGL-R05 | REQUIRED | Rechts-, Vertrags-, Provider-, Subprozessor- und Behördenquellen versioniert überwachen; Änderung erzeugt Hold/Neubewertung. |
| LGL-E01 | RECOMMENDED | EU-Region sowie geeignete ZDR/MAM-/Retention-Konfiguration bevorzugen; Feedback-/Training-Opt-in technisch sperren; datensparsame Git-Identitäten. |
| LGL-E02 | RECOMMENDED | WCAG 2.2 AA als Default; zusätzlich EN-301-549/BFSGV-Profil pro Projekt prüfen. |
| LGL-E03 | RECOMMENDED | Vor erster externer Veröffentlichung qualifizierte deutsche/EU-Rechtsberatung für Betreiber-, Transfer-, IP-, CRA- und Vertragsmodell. |

## 7. Milestone Legal Gates

| Milestone | Legal Acceptance Gate |
|---|---|
| M-000 | LGL-B01/B02/B05/B10 vollständig in Anforderungen, Modell und State Machine; Legal-Entscheidungen und Counsel-Trigger zugewiesen. |
| M-001 | LegalEntity/Controller, Processing Inventory, Notices, Retention, DSR, Breach, DPIA-Screen, Verschlüsselung und Audit-Minimierung belegt. |
| M-002 | Intake Legal Profile und Pre-persistence-Screen bestehen; nur synthetische Daten; keine Rohinhalte in Logs. |
| M-003 | Aktuelle Planner/Architect/Security/Legal-Evidence; Anforderungen verifiziert; Counsel-Trigger ausgewertet; Approval erst danach. |
| M-004 | Workspace-Löschung, Schlüsseltrennung, Isolation sowie Customer-Data-/Secret-Seed-Tests bestanden. |
| M-005 | GitHub-Produkt/DPA/Transfer/Ownership genehmigt; private Default-, Lizenz-, Provenienz- und Datenscans bestanden. |
| M-006 | OpenAI/Codex-Produkt/DPA/Transfer/Retention/Region genehmigt; AI-Rolle, Kompetenz, Transparenz und Minimierung belegt. |
| M-007 | Jede Revision besitzt vier Checks, vier Reviews, SBOM/Provenienz und aktuelles LegalAssessment; kein Self-Clear. |
| M-008 | Publication-Klasse, Empfänger, CRA/Produkthaftung/B2C/BFSG/Jurisdiktion/Counsel geklärt; Holds geschlossen; Produktion unmöglich. |

## 8. Requirement/Evidence Ledger

| Bereich | Erforderliche Evidence | Status |
|---|---|---|
| Rechtsträger und Rollen | LegalEntity, Controller/Processor/Joint-Controller-Memo | M-001 GATE; Architekturmodell akzeptiert |
| Verarbeitungen | Zwecke, Rechtsgrundlagen, Kategorien, Empfänger, Art.-30-Daten | M-001 GATE; Architekturmodell akzeptiert |
| OpenAI/Codex | Exaktes Produkt, Vertrag/DPA, Features, Retention, Region, Subprozessoren, Transfer/TIA, Löschung, Incident | M-006 ACTIVATION GATE; external processing prohibited |
| GitHub | Tarif/Vertrag, DPA-Abdeckung, Ownership, Subprozessoren, Transfer, Löschung | M-005 ACTIVATION GATE; GitHub prohibited |
| Datenlebenszyklus | Retention Matrix, Legal Holds, DSR, Erasure, Backups, Tombstones | M-001/M-004 GATE; Modell und Zielwerte akzeptiert |
| Datenschutzverletzung | Incident/Breach-Verfahren, Awareness und Fristen, Provider-SLA | M-001 GATE |
| AI Act | Rollen, Systemregister, Kompetenz, Verbote, Risiko, Transparenz, Rechtsstand | M-001/M-006 GATE |
| IP/OSS | Provenienz, Lizenzpolicy, Notices, SBOM, Similarity-/Rights-Review | M-005/M-007 GATE |
| Release | Publication-Klasse, CRA/Produkthaftung/B2C/DDG/TDDDG/BFSG/Jurisdiktion | M-008 GATE; Veröffentlichung verboten |
| Counsel | Qualifikations-, Vertraulichkeits- und Successor-Assessment-Verfahren | M-003/M-008 GATE; kein CounselCase für aktuelle M-000-Fakten |

## 9. Legal Successor Review für M-000

Legal hat die vollständige D-001..D-032-Baseline einschließlich privater Ein-Personen-Nutzung, lokalem Windows-Betrieb, Windows-Hello/FIDO2-Authentifizierung, PIV-Backup-Recovery, minimiertem EU-Auditanker, kontrollierter OpenAI-Verarbeitung und dedizierter privater GitHub-Organisation neu bewertet. Für M-000 bleibt der Status `PASS_WITH_REQUIREMENTS`; es gibt keinen aktuellen `BLOCK` und keinen aktuellen `COUNSEL_REQUIRED`-Sachverhalt. Provider-, Vertrags-, Transfer-, Implementierungs- und Release-Nachweise sind spätere fail-closed Gates und keine offene Architekturentscheidung.

| ID | M-000-Status | Späterer Nachweis |
|---|---|---|
| LGL-B01 | ACCEPTED | Transitionstests ab M-003 |
| LGL-B02 | ACCEPTED | konkrete LegalEntity/Verarbeitungsverzeichnisse in M-001 |
| LGL-B03 | ACCEPTED | produktbezogene OpenAI-, GitHub-, Backup- und Timestamp-Gates vor erstem externen Byte |
| LGL-B04 | ACCEPTED | Scanner-, Quarantäne- und Löschtests in M-002/M-004 |
| LGL-B05 | ACCEPTED | Retention-, Object-Lock-, Erasure- und Restore-Nachweise in M-001/M-004 |
| LGL-B06 | ACCEPTED | DSR-/Breach-Verfahren und Fristentests in M-001 |
| LGL-B07 | ACCEPTED | AI-Rolle, Register, Kompetenz und Rechtsstandsprüfung vor M-006 |
| LGL-B08 | ACCEPTED | Provenienz, SBOM, Lizenz- und Rechteprüfung in M-005/M-007 |
| LGL-B09 | ACCEPTED | projektspezifisches Release Legal Profile in M-008; Veröffentlichung bleibt aus |
| LGL-B10 | ACCEPTED | digestgebundene Assessments und qualifizierter Counsel-Prozess in M-003/M-008 |

Die spätere Nutzung durch ein Unternehmen, Beschäftigte, Kunden oder Dritte, ein Zielmarkt außerhalb DE/EU, regulierte Domänen, echte personenbezogene Projektdaten, öffentliche/kommerzielle Distribution oder ein unklarer Transfer ist eine wesentliche Scope-Änderung und erzwingt eine neue LegalAssessment; die vorhandene M-000-Bewertung darf dafür nicht wiederverwendet werden.

## 10. Zwingende Counsel-Trigger

`COUNSEL_REQUIRED` gilt mindestens bei:

- Gesundheit, Kredit, Versicherung, Beschäftigung, Bildung oder biometrischen Anwendungen;
- Kindern, Rechtsberatung, kritischer Infrastruktur, Behörden, Strafverfolgung oder Migration;
- Art.-9-/Art.-10-Daten;
- automatisierten Entscheidungen mit rechtlicher oder ähnlich erheblicher Wirkung;
- unklarer Controller-/Joint-Controller-Rolle;
- unzureichender oder unklarer Transfergrundlage;
- öffentlicher/kommerzieller Distribution mit ungeklärten Lizenzen oder Rechteketten;
- unklarer CRA-, Hersteller-, Produkthaftungs-, B2C- oder BFSG-Rolle;
- Beschäftigtenüberwachung;
- meldepflichtverdächtigen Datenschutz-/Cybersecurity-Vorfällen;
- Zielmärkten außerhalb des geprüften DE/EU-Scope;
- wesentlicher Änderung des AI-Systems oder einer möglichen High-Risk-Einordnung.

## 11. Restrisiken

- Automatisierte Legal-Prüfung kann Rechtsänderungen, Tatsachen und Rechtsprechung übersehen.
- Rechtefreiheit generierten Codes lässt sich technisch nicht beweisen.
- Providerbedingungen, Subprozessoren, Regionen, DPF/SCC-Lage und Retention können sich ändern.
- AI-Act-Vereinfachungen und Anwendungszeitpunkte können sich bis zur formalen Veröffentlichung/Anwendbarkeit ändern.
- Scanner können Kundendaten, Geheimnisse oder Lizenzähnlichkeiten übersehen.
- Das konkrete Geschäftsmodell eines generierten Projekts kann neue Pflichten erst nach Planung erkennbar machen.

Diese Risiken dürfen nicht durch Owner-Freigabe oder `ManualDecision` aufgehoben werden.

## 12. Abschluss

Die Legal-DE/EU-Prüfung ist für die Architekturplanung abgeschlossen. Status bleibt `PASS_WITH_REQUIREMENTS`. Vor Architecture Approval sind die M-000-Anforderungen zuzuweisen; vor jeder externen Verarbeitung oder Veröffentlichung müssen die jeweils einschlägigen Ledger-Einträge evidenzbasiert geschlossen sein.
