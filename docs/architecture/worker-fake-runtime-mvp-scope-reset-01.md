# WORKER-FAKE-RUNTIME-MVP-SCOPE-RESET-01

Release level: `DEVELOPMENT_ONLY`

Production deployment: `DISABLED`

## Unveraenderlicher Arbeitsvertrag

- Task-ID: `WORKER-FAKE-RUNTIME-MVP-SCOPE-RESET-01`.
- Scope: Ausschliesslich dokumentations- und freigabebasierte Neubewertung des vorhandenen lokalen Worker-/`FakeAgentRuntime`-Stands gegen einen realistischen Builder-V1-Meilenstein `WORKER_FAKE_RUNTIME_MVP` sowie ausdrueckliche Zuordnung aller realen Runtime-, Attestation-, Provider-, Mehrprozess- und Production-Nachweise zum spaeteren zwingenden Meilenstein `REAL-RUNTIME-HARDENING`. Der freigegebene Cancellation-Vertrag bleibt unveraenderte Zielarchitektur.
- Pruefbare Akzeptanzkriterien: (1) `AgentRuntime`-Schnittstelle vorhanden; (2) FakeRuntime simuliert deterministisch Erfolg, Fehler, Timeout und Abbruch; (3) persistenter Job-Claim; (4) Lease, Generation und Fencing verhindern offensichtliche Doppelverarbeitung; (5) Retry-Limit; (6) Restart verliert keine persistenten Jobs; (7) atomarer Cancel eines nachweislich noch nicht gestarteten lokalen Fake-Jobs; (8) unklarer Runtime-/Cancellation-Ausgang wird fail-closed `BLOCKED` oder `CANCEL_STUCK`; (9) kein unklarer Ausgang als `CANCELLED` oder `SUCCEEDED`; (10) alle fuer den zurueckgesetzten stabilen Stand vorhandenen Pflichtpruefungen bestehen; (11) Production deployment bleibt `DISABLED`.
- Erlaubte Dateien: ausschliesslich `AGENTS.md`, `PROJECT_STATE.md`, `docs/architecture/implementation-roadmap.md`, `docs/architecture/worker-fake-runtime-01.md` und dieses Dokument.
- Verboten: jede Aenderung an Anwendungscode, Testcode, Datenbankschema, Migrationen, generierten Artefakten oder Laufzeitkonfiguration; echte Codex-Agenten; GitHub-Merge oder automatische GitHub-Aenderungen; Deployment; Production; echte Kunden- oder Personendaten; Aufhebung oder Abschwaechung des freigegebenen Cancellation-Vertrags.
- Dokumentations-Writer: ausschliesslich der Hauptagent dieses Tasks. Alle delegierten Planner-, Architect-, QA-, Reviewer-, Security- und Legal-DE-Rollen arbeiten read-only. Ein Writer-Wechsel ist verboten.
- Maximales Zeitbudget: 180 Minuten ab Task-Start am 2026-07-15.
- Pflichtpruefungen: alle aktuell vorhandenen Tests; PostgreSQL-Integrationstests ohne Skips; Lint; Typecheck; Build; `git diff --check`. Keine Aenderung oder Reparatur von Anwendungscode oder Tests.
- Review-Scope: QA prueft nur stabilen gruenen Teststand und vorhandene Fake-Runtime-Grundfunktionen. Reviewer prueft nur die eindeutige Trennung zwischen MVP und `REAL-RUNTIME-HARDENING`. Security prueft fail-closed Behandlung unklarer Zustaende und das Ausbleiben einer Production-Freigabe. Legal DE klassifiziert den technischen Scope als `NOT_APPLICABLE` oder uebernimmt unveraenderte spaetere Requirements. Die vollstaendige Production-Cancellation-Architektur wird nicht erneut geprueft.
- Reparaturbudget: kein Reparaturdurchlauf fuer Anwendungscode; hoechstens ein automatischer Dokumentations-Reparaturdurchlauf.
- Zulaessige Abschlussstatus: `PASSED`, `BLOCKED` und `DEFERRED_TO_LATER_GATE`. `PASSED` ist nur zulaessig, wenn alle aktuellen MVP-Kriterien und Pflichtpruefungen bestanden sind und die vier Abschlussreviews den fixierten Stand im jeweiligen Scope freigeben. Spaetere Real-Runtime-/Production-Gates werden als nicht bestanden, fail-closed und zwingend `DEFERRED_TO_LATER_GATE` dokumentiert.
- Erfolgsformel: `WORKER UND FAKE RUNTIME MVP BESTANDEN  DEVELOPMENT ONLY`.
- Nichterfuellungsformel: `WORKER UND FAKE RUNTIME MVP NICHT BESTANDEN`.

Dieser Arbeitsvertrag ist mit Task-Beginn unveraenderlich. Planungs-, Architektur-, Pruef-, Review- und Abschlussnachweise werden in den nachfolgenden Abschnitten dokumentiert, ohne diesen Vertrag zu erweitern oder umzudeuten.

## Owner-Scope und Architekturentscheidung

`WORKER_FAKE_RUNTIME_MVP` ist ein isolierter lokaler Entwicklungsmeilenstein mit ausschliesslich synthetischen Daten, `FakeAgentRuntime` und standardmaessig einem lokalen Worker. Echte Codex-Agenten, `AGENT_RUNTIME=codex`, automatische GitHub-Aenderungen oder Merge, automatische Projektausfuehrung, externe Veroeffentlichung, Deployment, Release Candidate und Production bleiben ausgeschlossen.

Der autoritative PostgreSQL-Commit unter gemeinsamem Row-Lock, CAS, Generation und Fencing ist der fachliche Linearisierungspunkt fuer Completion und Cancellation:

- Ein nachweislich noch nicht gestarteter Fake-Job darf nur in einer atomaren lokalen Transaktion abgebrochen werden, die anhand des persistenten Job-/Outbox-Zustands belegt, dass kein Start committed oder autorisiert wurde.
- Bei einem laufenden Fake-Job darf ein zuerst committedes Cancel nur nach einer bestaetigten, an Projekt, Job, Run, Attempt, Generation und Fence gebundenen FakeRuntime-Cancellation zu `CANCELLED` fuehren.
- Fehler, Ablehnung, Timeout, fehlender oder widerspruechlicher Snapshot, Crash-/Restart-Ambiguitaet, erschoepftes Retry-Budget oder CAS-/Fence-Verlust bleiben fail-closed. Der persistente Jobzustand ist dabei `CANCEL_STUCK`, soweit anwendbar; `BLOCKED` bezeichnet den Task-, Hold- oder Gate-Status. Nie wird ein unklarer Ausgang als `CANCELLED` oder `SUCCEEDED` behauptet.
- Wurde Completion zuerst atomar committed, bleibt `SUCCEEDED` bestehen und der Cancel wird als zu spaet abgelehnt. Wurde Cancellation zuerst atomar committed, darf eine spaete Completion nicht als Erfolg publiziert werden.

Planner: `READY FOR ARCHITECT`. Architect: `PASS - DEVELOPMENT_ONLY`. Security-Planungsreview: `PASS - DEVELOPMENT_ONLY` unter den vorstehenden fail-closed Grenzen. Legal-DE-Planungsreview: `NOT_APPLICABLE` fuer den rein technischen lokalen synthetischen Scope; bestehende spaetere Requirements bleiben unveraendert.

## Zwingend verschobener Meilenstein `REAL_RUNTIME_HARDENING`

Die folgenden Punkte sind nicht bestanden, nicht geloescht und `DEFERRED_TO_LATER_GATE`:

1. reale `RuntimeTerminationEvidence`;
2. kryptografische beziehungsweise providergebundene Termination-Attestation;
3. vollstaendige `WORKLOAD_NOT_CREATED`-Attestation einer echten externen Runtime;
4. verteilte, mehrprozessfaehige finale Reconciliation;
5. tatsaechliche Runtime-Statusabfrage gegen Codex;
6. Crash zwischen externer Runtime-Abfrage und Evidence-Commit;
7. vollstaendige AT-15/16/17/19/22-Production-Evidenz;
8. Completion-ID-Hardening;
9. echte Worker- und Prozessidentitaet;
10. Provider- und Credential-Widerruf.

`REAL_RUNTIME_HARDENING` ist zwingendes fail-closed Vor-Gate fuer `AGENT_RUNTIME=codex`, schreibende echte Codex-Executors, automatische GitHub-Aenderungen, `RELEASE_CANDIDATE` und `PRODUCTION`. Sein Abschluss ist notwendig, aber nicht allein hinreichend; alle zugeordneten Security-, Legal-, Provider-, GitHub-, Release- und Owner-Gates muessen separat bestehen.

Der normative Cancellation-Vertrag `CANCELLATION-CONTRACT-DECISION-01`, SHA-256 `58e44fe0a3638d25bdf34dc5aff8551872796486c343904923cb4f41150a4b9f`, bleibt unveraenderte Zielarchitektur. Nur seine vollstaendige Real-Runtime-Umsetzung ist zeitlich diesem spaeteren Meilenstein zugeordnet.

## MVP-Akzeptanzmatrix

| Kriterium | Nachweisquelle | Status vor Pflichtlauf |
|---|---|---|
| AgentRuntime-Schnittstelle | `runtime.ts`; Runtime- und Root-Tests | `PASS` |
| Deterministische Fake-Modi Erfolg, Fehler, Timeout, Abbruch | `runtime.test.ts`; PostgreSQL-Szenariotest | `PASS` |
| Persistenter Claim | PostgreSQL-Integration | `PASS` |
| Lease, Generation und Fencing | PostgreSQL Lock-/Lease-/Reclaim-Integration | `PASS` |
| Retry-Limit | Runtime-/Worker-/PostgreSQL-Tests | `PASS` |
| Restart ohne Jobverlust | Prozess-Recovery-Integration | `PASS` |
| Atomarer Pre-start-Cancel | `requestCancel` und Processor-Pfad; kein terminaler atomarer Pre-start-Pfad vorhanden | `BLOCK` |
| Unklarer Ausgang fail-closed | Cancellation-/Worker-/PostgreSQL-Tests | `PASS` |
| Kein falsches `CANCELLED` oder `SUCCEEDED` | Cancellation-/Race-/Monotonie-Tests | `PASS` |
| Alle aktuellen Pflichtpruefungen | Test-, Lint-, Typecheck-, Build- und Diff-Protokoll | `PASS` |
| Production deployment bleibt `DISABLED` | Projektzustand und Dokumentreview | `PASS` |

## Rechtliche Reichweite

Legal DE klassifiziert diesen Task als `NOT_APPLICABLE`, weil er ausschliesslich eine technische lokale FakeRuntime-Neubewertung mit synthetischen Daten dokumentiert. Dies autorisiert keine externe oder rechtliche Handlung. Das bestehende Architekturprofil `PASS_WITH_REQUIREMENTS` und insbesondere die Legal-/Provider-Gates fuer OpenAI/Codex, GitHub, externe Verarbeitung, Release und Veroeffentlichung bleiben unveraendert fail-closed. Echte Personen-/Kundendaten, Produktionskopien, Tickets, Screenshots, Logs oder Repository-Historien mit Realbezug sowie Credentials sind ausgeschlossen. Jede Scope-Aenderung invalidiert `NOT_APPLICABLE` und verlangt die zugeordnete neue Legal-/Provider-Pruefung.

## Pflichtpruefungen

Gepruefter Anwendungscode: unveraenderter aktueller Working-Tree-Anwendungsstand. Dieser Task hat ausschliesslich die fuenf im Vertrag erlaubten Dokumentationsdateien geaendert.

| Pruefung | Ergebnis |
|---|---|
| Alle aktuellen Root-Tests | `PASS`, 13/13 Testdateien, 190/190 Tests |
| PostgreSQL-Integration separat ohne Skips | `PASS`, 1/1 Testdatei, 44/44 Tests, 0 Skips |
| Build aller Workspaces | `PASS` |
| Typecheck aller Workspaces | `PASS` nach abgeschlossenem Build |
| Lint | `PASS` |
| `git diff --check` | `PASS` vor fixiertem Review-Stand; nach Abschlussdokumentation erneut auszufuehren |

Ein zunaechst parallel mit dem Build gestarteter Web-Typecheck sah waehrend konkurrierender Erzeugung des Next.js-`.next`-Verzeichnisses die temporaer fehlende Datei `.next/types/routes.js`. Es erfolgte keine Datei- oder Code-Reparatur. Der anschliessende sequenzielle Build bestand und der danach auf dem abgeschlossenen Build-Artefakt ausgefuehrte Typecheck bestand vollstaendig. Fuer das Gate ist dieser nicht konkurrierende Lauf autoritativ.

## Strukturierter Blocker

- Nicht erfuelltes Akzeptanzkriterium: MVP-Kriterium 7. Cancellation vor einem nachweislich noch nicht gestarteten lokalen Fake-Job muss den persistenten Job atomar terminal abbrechen koennen.
- Reproduzierbare Evidenz: `packages/database/src/agent-job-repository.ts`, Methode `requestCancel`, setzt jeden nichtterminalen Job einschliesslich eines noch nicht geclaimten Jobs auf `CANCELLING`, schreibt `RuntimeCancellationStatusQuery` in die Outbox und setzt nicht atomar `CANCELLED`. `apps/worker/src/job-processor.ts` verarbeitet einen fehlenden Runtime-Snapshot anschliessend ueber den Runtime-Cancel-Pfad. Der bestehende Integrationstest `macht Abbruch erst nach Runtime-Bestaetigung terminal` erwartet genau `CANCELLING` vor dem Workerlauf und erst danach `CANCELLED`; ein atomarer terminaler Pre-start-Cancel wird nicht getestet oder implementiert.
- Betroffener Scope: ausschliesslich lokaler persistenter Fake-Job vor Runtime-Start, sein Job-/Outbox-Zustand und die atomare Cancel-Transition. Reale `WORKLOAD_NOT_CREATED`-Attestation bleibt separat in `REAL_RUNTIME_HARDENING`.
- Verbrauchter Reparaturdurchlauf: `0/0` fuer Anwendungscode; der Task verbietet jeden Code-Reparaturdurchlauf.
- Erforderliche manuelle Entscheidung: Einen neuen eng begrenzten Implementierungstask mit unveraenderlichem Vertrag und neuer festgelegter Writer-Identitaet fuer den atomaren lokalen Pre-start-Fake-Cancel autorisieren oder MVP-Kriterium 7 in einer neuen Owner-Entscheidung aendern. Dieser Dokumentationstask darf den Code nicht reparieren.
- Zielmeilenstein: `WORKER_FAKE_RUNTIME_MVP`; der Blocker ist kein spaeteres Real-Runtime-Gate und kann nicht nach `REAL_RUNTIME_HARDENING` verschoben werden.

## Vorlaeufiger Abschluss vor Read-only Reviews

Status: `BLOCKED - DEVELOPMENT ONLY`.

Abschlusssatz: `WORKER UND FAKE RUNTIME MVP NICHT BESTANDEN`.

Die technische Testbasis ist stabil und gruen. Der Meilenstein kann dennoch wegen des offenen aktuellen MVP-Kriteriums 7 nicht als `PASSED_WITH_DEFERRED_HARDENING` freigegeben werden. Production deployment bleibt `DISABLED`.

## Fixierter Review-Stand und Abschlussreviews

Die Read-only-Reviews prueften HEAD `b683a91b67862b133fbb8df550e5695865eba6d3` und folgenden Dokumentstand vor Einfuegung dieses reinen Abschlussprotokolls:

| Datei | SHA-256 |
|---|---|
| `AGENTS.md` | `7BEE0D5D3D90845EB85F7A3E31974A5D24A95925A79B84701C08B9C01FA73524` |
| `PROJECT_STATE.md` | `B89398DDDD47B0C2D504A0C9F16AB67B2530FF28CBD151E239527E630281FE9A` |
| `docs/architecture/implementation-roadmap.md` | `27F3712E63F54D0C2FD8E3A483CAD6670620F0561E2121D125F42FB9A0FEFF74` |
| `docs/architecture/worker-fake-runtime-01.md` | `FDD6E33EBBCC777694B342A5E046B77CD803D4887002FA539AAD4110A1686C8F` |
| `docs/architecture/worker-fake-runtime-mvp-scope-reset-01.md` | `2500B1EAB1D8A5AD91D42CB1814C1FFAC0F4FCE1C0AAA5040C5976BB576EB6E3` |

- QA: `BLOCK`. Der stabile Teststand und die FakeRuntime-Grundfunktionen sind nachgewiesen. MVP-Kriterium 7 ist nicht erfuellt, weil `requestCancel` einen ungeclaimten beziehungsweise nachweislich noch nicht gestarteten Job nur auf `CANCELLING` setzt und die terminale Entscheidung dem spaeteren Worker-/Runtime-Pfad ueberlaesst.
- Reviewer: `PASS` fuer den beauftragten Dokumentationsscope. MVP und `REAL_RUNTIME_HARDENING` sind eindeutig getrennt, der historische Block bleibt erhalten, der Cancellation-Zielvertrag samt normativem Digest bleibt unveraendert und es entsteht keine Release-Candidate- oder Production-Freigabe.
- Security: `PASS` fuer die Dokumentationsentscheidung bei zwingend blockiertem MVP. Unklare Zustaende bleiben fail-closed, kein unbelegtes `CANCELLED` oder `SUCCEEDED` wird erlaubt, und Kriterium 7 bleibt korrekt ein aktueller MVP-Blocker.
- Legal DE: `NOT_APPLICABLE`. Der lokale synthetische technische Scope erzeugt keine externe oder rechtliche Freigabe; alle spaeteren Legal-/Provider-Requirements bleiben unveraendert fail-closed.

Alle Rollen arbeiteten read-only. Es wurden keine neuen Anwendungscode-Findings ausserhalb des aktuellen Scopes erhoben und die vollstaendige Production-Cancellation-Architektur wurde nicht erneut geprueft.

## Finaler Abschluss

Abschlussstatus: `BLOCKED - DEVELOPMENT ONLY`.

Gepruefter Anwendungscode-Stand: HEAD `b683a91b67862b133fbb8df550e5695865eba6d3`; Anwendungscode, Testcode, Datenbankschema und Migrationen blieben unveraendert. Dokumentations-Writer war ausschliesslich der Hauptagent. Code-Reparaturordinal: `0/0`.

Offenes Finding: ausschliesslich MVP-Kriterium 7, atomarer terminaler Cancel eines nachweislich noch nicht gestarteten lokalen Fake-Jobs. Zielmeilenstein ist `WORKER_FAKE_RUNTIME_MVP`; eine manuelle Entscheidung ueber einen neuen eng begrenzten Implementierungstask ist erforderlich. Alle zehn `REAL_RUNTIME_HARDENING`-Punkte bleiben davon getrennt `DEFERRED_TO_LATER_GATE` und fail-closed.

`PROJECT_STATE.md` bleibt deshalb `BLOCKED - DEVELOPMENT ONLY`; der fuer einen erfolgreichen Development-Abschluss vorgesehene Status `PASSED_WITH_DEFERRED_HARDENING - DEVELOPMENT ONLY` wird nicht gesetzt. GitHub integration bleibt `NO`, Automatic project execution bleibt `NO`, Production deployment bleibt `DISABLED`.

`WORKER UND FAKE RUNTIME MVP NICHT BESTANDEN`
