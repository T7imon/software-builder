# CANCELLATION-CONTRACT-DECISION-01

Release level: `DEVELOPMENT_ONLY`

Production deployment: `DISABLED`

## 1. Unveraenderlicher Arbeitsvertrag

- Task-ID: `CANCELLATION-CONTRACT-DECISION-01`
- Scope: Der Task entscheidet und dokumentiert ausschliesslich den architektonischen Vertrag fuer Rennen zwischen Completion, Cancellation, Runtime-Snapshots und Recovery. Er definiert Linearisierung, monotone Zustaende, verifizierbare Runtime-Termination-Evidence, FakeRuntime-Grenzen, Retry-/Recovery- und `CANCEL_STUCK`-Semantik, eine Wahrheitstabelle sowie nummerierte Akzeptanztests fuer eine spaetere Implementierung.
- Akzeptanzkriterien:
  1. Completion und Cancellation sind ueber denselben PostgreSQL-Row-Lock und dieselbe CAS-/Versionskontrolle linearisiert; der erste dauerhaft gespeicherte Zustandsuebergang gewinnt.
  2. Die Folgen von "Completion zuerst" und "Cancellation zuerst" sind widerspruchsfrei fuer Job, Runtime, Workflow, Audit sowie Inbox/Outbox festgelegt.
  3. `CANCELLED` setzt erfolgreich verifizierte, scope-, generation- und jobgebundene `RuntimeTerminationEvidence` voraus; das strukturierte Mindestmodell und seine Verifier-Schnittstelle sind festgelegt.
  4. FakeRuntime-Evidence durchlaeuft dieselbe Verifier-Schnittstelle; gueltige, ungueltige, manipulierte, alte, scopefremde und replayte Evidence sind unterscheidbar; Fake-Evidence bleibt `DEVELOPMENT_ONLY`.
  5. Fehler und Timeouts von `runtime.cancelRun`, Retry-Limit, Recovery-Vorpruefungen und `CANCEL_STUCK` sind fail-closed und persistent definiert.
  6. Terminal gespeicherte Zustaende sind monoton; alte oder verspaetete Events werden nur auditiert.
  7. Eine vollstaendige Wahrheitstabelle deckt mindestens alle vom Owner geforderten Renn-, Evidence-, Retry-, Crash-, Timeout- und Fencing-Faelle ab.
  8. Aus der Wahrheitstabelle abgeleitete nummerierte Akzeptanztests dokumentieren jeweils Linearisierungspunkt, erlaubte Ausgangszustaende, Zielzustand, Evidence, AuditEvent, Inbox-/Outbox- und Retry-/Recovery-Verhalten.
  9. Architect, Reviewer und Security bestaetigen denselben Vertrag read-only als widerspruchsfrei; andernfalls lautet das Ergebnis `CANCELLATION CONTRACT NEEDS OWNER DECISION`.
- Erlaubte Dateien: dieses neue Dokument; falls fuer widerspruchsfreie Referenzen notwendig bestehende Dateien unter `docs/architecture/`; `PROJECT_STATE.md` ausschliesslich als Referenz auf die offene beziehungsweise abgeschlossene Entscheidung.
- Verboten: jede Aenderung an Anwendungscode, Tests, Migrationen, generierten Artefakten oder Laufzeitkonfiguration; Implementierung oder Reparatur des blockierten Tasks; Legal-Review; externe Veroeffentlichung; Deployment; Produktionsfreigabe.
- Dokumentations-Writer: ausschliesslich der Hauptagent. Architect, Reviewer und Security arbeiten read-only.
- Maximales Zeitbudget: 120 Minuten ab Task-Start am 2026-07-14.
- Reparaturbudget: maximal ein automatischer Dokumentations-Reparaturdurchlauf nach dem ersten fixierten Review-Stand; keine Reparatur von Anwendungscode.
- Abschlussstatus: `PASSED`, wenn alle Akzeptanzkriterien erfuellt und alle drei read-only Rollen widerspruchsfrei bestaetigen; andernfalls `BLOCKED`. `DEFERRED_TO_LATER_GATE` ist nur fuer ausdruecklich spaeter zu erbringende Production-Evidence zulaessig und ersetzt kein offenes Vertragskriterium.
- Freigabeformel bei `PASSED`: `CANCELLATION CONTRACT APPROVED  DEVELOPMENT ONLY`.
- Blockierformel bei `BLOCKED`: `CANCELLATION CONTRACT NEEDS OWNER DECISION`.

Dieser Arbeitsvertrag ist nach Task-Beginn unveraenderlich. Nachfolgende Abschnitte duerfen ihn nur ausfuellen, nicht erweitern oder umdeuten.

### 1.1 Unveraenderlicher Formalisierungsvertrag

- Task-ID: `CANCELLATION-CONTRACT-FORMALIZATION-02`.
- Scope: ausschliesslich formale Praezisierung des bereits akzeptierten Vertrags in diesem Dokument; neue fachliche Anforderungen und Aenderungen der akzeptierten Semantik sind verboten.
- Pruefbare Akzeptanzkriterien: AC8 ist gemaess Abschnitt 8.1 formal vollstaendig; AT-09, AT-15, AT-16, AT-17, AT-19 und AT-20 enthalten jeweils die 22 Felder aus Abschnitt 10.1; Abschnitt 10.2 ordnet jedes Akzeptanzkriterium, jede Wahrheitstabellenzeile und jede AT-ID widerspruchsfrei zu; im normativen Bereich verbleiben keine undefinierten Begriffe, widerspruechlichen Eventnamen, fehlenden Vorbedingungen, fehlenden negativen Assertions oder Platzhalter.
- Erlaubte Datei waehrend der Formalisierung: ausschliesslich `docs/architecture/cancellation-contract-decision-01.md`; `PROJECT_STATE.md` darf ausschliesslich nach erfolgreichem Architect-, Security- und Reviewer-PASS durch ausdruecklichen Folgeauftrag aktualisiert werden.
- Verboten: Anwendungscode, Testcode, Datenbankschema, Migrationen, Completion-ID-Thema, neue Produktanforderungen, Legal-Review, Deployment und Produktion.
- Writer: genau die Writer-Identitaet `writer` dieses Tasks. Architect, Security und Reviewer arbeiten nach beendetem Writer-Zugriff read-only auf demselben fixierten Stand.
- Maximales Zeitbudget: 45 Minuten ab Task-Start am 2026-07-14.
- Reparaturbudget: maximal ein Dokumentations-Reparaturdurchlauf.
- Abschlussstatus dieser Writer-Phase: `PASSED`, wenn alle vorstehenden Kriterien formal erfuellt sind; andernfalls `BLOCKED` mit reproduzierbarer Evidenz, betroffenem Scope, Repair ordinal und erforderlicher manueller Entscheidung.

Dieser Formalisierungsvertrag ist nach Task-Beginn unveraenderlich. Er ersetzt oder erweitert keine normative fachliche Entscheidung der Abschnitte 2 bis 12.

## 2. Entscheidung, Geltung und Begriffe

Dieses Dokument ist die normative Architekturentscheidung fuer eine spaetere, neu zu autorisierende Implementierung. Es ersetzt fuer Completion-/Cancellation-Rennen, Termination-Evidence und Cancellation-Recovery jede weniger genaue Aussage in den referenzierten Architekturtexten. Es veraendert den blockierten Implementierungsstand nicht.

- `Runtime-Beobachtung`: ein persistierter Snapshot oder ein Runtime-Event, zum Beispiel mit beobachtetem Status `SUCCEEDED`. Er ist kein autoritativer Job-Completion-Commit.
- `Completion`: die atomare PostgreSQL-Transaktion, die den autoritativen Job auf `SUCCEEDED` setzt, das kanonische Ergebnis bindet und die zugehoerigen Job-, Workflow-, Audit-, Inbox- und Outbox-Wirkungen festschreibt.
- `Cancellation-Annahme`: die atomare PostgreSQL-Transaktion, die einen noch nicht terminalen Job auf `CANCELLING` setzt und den Cancellation Request als angenommen festschreibt.
- `Termination-Evidence`: ein strukturierter, verifizierter Nachweis, dass genau die gebundene Runtime-Workload terminal ist. Eine Cancel-Annahme, ein Provider-Acknowledgement oder ein Statusstring allein ist keine Termination-Evidence.
- `dauerhaft gespeichert`: Die gesamte Transition-Transaktion wurde erfolgreich committed. Ein Lock, ein Update vor Commit oder ein spaeter zurueckgerollter Versuch gewinnt nicht.
- `CAS-Ergebnis`: `APPLIED` bezeichnet genau einen erfolgreichen autoritativen Commit mit erwarteter Jobversion; `REJECTED_STALE` bezeichnet eine wegen Version, Lease Generation oder Fencing Token abgelehnte Mutation ohne Fachwirkung; `IDEMPOTENT_REPLAY` bezeichnet die unveraenderte Wiedergabe einer bereits committeden Entscheidung.
- `Gate-Ergebnis`: `PASS - DEVELOPMENT_ONLY` bedeutet, dass der einzelne Akzeptanztest den dokumentierten Entwicklungsvertrag erfuellt. Es ist keine Release-Candidate- oder Produktionsfreigabe. Jedes abweichende Ergebnis ist fuer den jeweiligen Test `BLOCK`.
- Kanonische AuditEvent-Namen in diesem Vertrag sind `COMPLETED`, `CANCEL_REQUESTED`, `CANCEL_REJECTED`, `LATE_COMPLETION_DISCARDED`, `CANCEL_ATTEMPTED`, `CANCEL_ATTEMPT_FAILED`, `CANCEL_RETRY_SCHEDULED`, `EVIDENCE_VERIFIED`, `EVIDENCE_REJECTED`, `CANCEL_CONFIRMED`, `CANCELLED`, `CANCEL_STUCK`, `RECLAIMED`, `LEASE_LOST` und `PROJECT_HOLD_CLEARED`. `SUCCEEDED`, `CANCEL_REJECTED_TOO_LATE`, `LATE_RESULT_DISCARDED`, `FAILED`, `TIMED_OUT` und `RECOVERY_BUDGET_EXHAUSTED_WITHOUT_VALID_TERMINATION_EVIDENCE` sind Status-, Dispositions- oder Reason Codes und keine abweichenden AuditEvent-Namen.

Die Freigabe dieses Dokuments ist ausschliesslich `DEVELOPMENT_ONLY`. Sie ist weder eine Implementierungsfreigabe fuer den blockierten Vorgaengertask noch eine Release-Candidate- oder Produktionsfreigabe. Production deployment bleibt `DISABLED`.

## 3. Verbindliche Invarianten

1. Completion und Cancellation sperren dieselbe Zeile in `background_jobs` mit PostgreSQL `FOR UPDATE` und pruefen dieselbe erwartete Jobversion beziehungsweise CAS-Generation. Lease Generation, Claim-ID und Fencing Token sind zusaetzliche Guards, aber kein zweiter Linearisierungspunkt.
2. Der erfolgreiche Commit der ersten autoritativen Transition ist der Linearisierungspunkt. Die danach wartende oder am CAS gescheiterte Operation laedt den committed Zustand neu und darf ihren urspruenglichen Zielzustand nicht blind erneut schreiben.
3. Ein Runtime-Snapshot `SUCCEEDED` vor dem Completion-Commit ist nur eine Beobachtung. Er darf einen spaeter unter Row-Lock zuerst committeden Cancellation Request nicht umgehen.
4. Ein als `SUCCEEDED` committedter Job bleibt `SUCCEEDED`. Ein spaeterer Cancel wird mit dem kanonischen Reason Code `CANCEL_REJECTED_TOO_LATE` abgelehnt.
5. Ein zuerst auf `CANCELLING` committedter Job kann durch keine spaetere Completion auf `SUCCEEDED` wechseln. Das Resultat wird append-only mit dem kanonischen Reason Code `LATE_RESULT_DISCARDED` dokumentiert, nicht veroeffentlicht und nicht als Task-Ergebnis verwendet.
6. `CANCELLED` setzt eine fuer genau diesen Job und Cancellation Request erfolgreich verifizierte `RuntimeTerminationEvidence` voraus. Die Werte `PROCESS_TERMINATED`, `RECOVERY_CONFIRMED`, `RUNTIME_CANCEL_CONFIRMED`, `RUNTIME_STATUS_CANCELLED` oder `RUNTIME_TERMINAL_OBSERVED` sind ohne das verifizierte Evidence-Objekt nur Behauptungen und unzureichend.
7. `CANCELLING` bleibt erhalten, solange weder ein gueltiger terminaler Nachweis noch eine sichere Eskalation vorliegt. Fehler, Ablehnung oder Timeout von `runtime.cancelRun` duerfen nie synthetisch `CANCELLED` erzeugen.
8. Vor jedem weiteren Cancel-Versuch und zwingend vor `CANCEL_STUCK` wird der aktuelle Runtime-Status neu abgefragt und die vollstaendige Recovery-Reconciliation aus Abschnitt 8 ausgefuehrt.
9. `SUCCEEDED` und `CANCELLED` sind monotone terminale Jobzustaende. Alte, duplizierte, replayte oder verspaetete Ereignisse koennen Audit- und Discard-Eintraege erzeugen, aber keinen terminalen Zustand umschreiben.
10. Dieselbe Transaktion, die eine autoritative Transition entscheidet, schreibt die neue Jobversion, betroffene Workflow-/Attempt-Projektion, Resultatbindung oder Discard-Disposition, Cancellation- beziehungsweise Evidence-Referenz, AuditEvent, Inbox-Abschluss beziehungsweise IdempotencyRecord und genau die fachlich erforderlichen Outbox-Events. Ein Rollback hinterlaesst davon nichts.
11. Doppelte Zustellung mit demselben Consumer und derselben Message-ID beziehungsweise demselben Idempotency Key liefert die bereits gespeicherte Entscheidung ohne ein zweites AuditEvent, einen zweiten Retry oder ein zweites Outbox-Event. Derselbe Schluessel mit anderem Digest wird abgelehnt.
12. Runtime-I/O findet niemals innerhalb der Row-Lock-Transaktion statt. Die Transaktion plant die externe Operation per Outbox; ein Worker fragt vor der Ausfuehrung den committeden Zustand und seine aktuelle Generation/Fence erneut ab.

## 4. Linearisierungsvertrag

### 4.1 Completion-Transaktion

Die Completion-Transaktion:

1. sperrt die Jobzeile;
2. prueft Projekt-/Jobbindung, erlaubten Ausgangszustand, erwartete Jobversion, Lease Generation, Claim-ID und Fencing Token;
3. prueft, dass keine Cancellation-Annahme committed ist;
4. bindet das kanonische Ergebnis und setzt Job sowie die betroffene Workflow-/Attempt-Projektion konsistent auf den vorgesehenen Erfolgsfortschritt;
5. schreibt `COMPLETED`/`SUCCEEDED`-Audit, Inbox-/Idempotenzabschluss und Outbox;
6. erhoeht die Jobversion und committed.

Nur Schritt 6 linearisiert Completion. Ein vorher persistierter Runtime-Snapshot oder berechnetes Resultat ist kein Gewinn.

### 4.2 Cancellation-Transaktion

Die Cancellation-Transaktion:

1. sperrt dieselbe Jobzeile;
2. prueft Projekt-/Jobbindung, erlaubten Ausgangszustand und dieselbe erwartete Jobversion;
3. bei bereits committedem `SUCCEEDED`: persistiert den Request als `REJECTED_TOO_LATE`, belaesst alle autoritativen Zustaende unveraendert und schreibt `CANCEL_REJECTED` mit Reason Code `CANCEL_REJECTED_TOO_LATE` sowie die idempotente Outbox-Antwort;
4. bei einem abbrechbaren nichtterminalen Zustand: persistiert den Request als `ACCEPTED`, setzt Job und Workflow auf `CANCELLING`, merkt die Reihenfolge durch Aggregate Sequence und neue Jobversion vor und schreibt `CANCEL_REQUESTED` sowie den Outbox-Auftrag zur Runtime-Statusabfrage;
5. committed atomar.

Nur der Commit in Schritt 5 linearisiert die Ablehnung beziehungsweise Annahme. Bei Annahme darf der eigentliche `runtime.cancelRun`-Aufruf erst nach Commit erfolgen.

### 4.3 Verhalten des Verlierers

- Verliert Cancellation gegen committedes `SUCCEEDED`, bleibt der Job `SUCCEEDED`; es gibt keinen Runtime-Cancel, keinen Retry und keinen Wechsel zu `CANCELLING` oder `CANCELLED`.
- Verliert Completion gegen committedes `CANCELLING`, wird ein separater idempotenter Discard-Commit ausgefuehrt. Er sperrt die Jobzeile erneut, bestaetigt die Cancellation-Reihenfolge, speichert nur Digest und minimierte Metadaten des spaeten Resultats mit Disposition `LATE_RESULT_DISCARDED`. Der Payload MUSS GENAU DANN quarantiniert werden, wenn die bestehende Retention Policy diese Disposition der Quarantaene zuordnet. Der Commit schreibt Audit/Inbox/Outbox und veraendert den Jobzustand nicht.
- Ein CAS-Verlierer darf nur klassifizieren, ablehnen oder discardieren. Er darf die fachliche Transition nicht mit einer neuen Version wiederholen.

## 5. Gewinnersemantik und monotone Zustaende

### 5.1 Completion gewinnt zuerst

Wenn `SUCCEEDED` atomar committed wurde, bevor die Cancellation-Annahme committed werden konnte:

- Job bleibt `SUCCEEDED`; Workflow-/Attempt- und Runtime-Ergebnisprojektion bleiben auf dem atomar gebundenen Erfolgspfad.
- Der spaetere Request wird persistent als `REJECTED_TOO_LATE` dokumentiert.
- Das AuditEvent verwendet `CANCEL_REJECTED` und Reason Code `CANCEL_REJECTED_TOO_LATE` und referenziert die erfolgreiche Completion Sequence/Version.
- Inbox beziehungsweise IdempotencyRecord speichern die Ablehnungsantwort; die Outbox enthaelt hoechstens das idempotente fachliche Ereignis `CancellationRejectedTooLate`.
- Kein Runtime-Cancel, kein Cancellation-Retry und keine Cancellation-Outbox-Arbeit wird erzeugt.

### 5.2 Cancellation gewinnt zuerst

Wenn der Request zuerst atomar als `ACCEPTED` committed und der Job auf `CANCELLING` gesetzt wurde:

- Eine spaetere Completion darf Job, Workflow oder Attempt nicht auf einen Erfolgspfad setzen.
- Das spaete Ergebnis wird unveraenderbar als `LATE_RESULT_DISCARDED` dokumentiert; es ist weder kanonisches Jobresultat noch publizierbares Task-Ergebnis und darf keine Erfolgsobligation erfuellen.
- Ein bereits vorhandener Runtime-Snapshot `SUCCEEDED` wird als beobachtetes Runtime-Event behandelt. Nach Cancellation-Annahme ist seine fachliche Disposition `LATE_RESULT_DISCARDED`, nicht Job-`SUCCEEDED`.
- Job und Workflow bleiben `CANCELLING`, bis gueltige Termination-Evidence den atomaren Wechsel zu `CANCELLED` erlaubt oder die sichere Eskalation nach `CANCEL_STUCK` erforderlich ist.
- Ein spaet beobachteter terminaler Runtime-Status kann als Quelle fuer einen Evidence-Kandidaten dienen; er darf nur nach erfolgreicher Verifikation zur Termination-Bestaetigung beitragen.

### 5.3 Erlaubte monotone Transitionen

| Ausgangszustand | Erlaubtes Ergebnis in diesem Vertrag | Verboten |
|---|---|---|
| abbrechbar, nichtterminal | `SUCCEEDED`, falls Completion zuerst committed | nachtraegliches `CANCELLING`/`CANCELLED` fuer denselben spaeteren Request |
| abbrechbar, nichtterminal | `CANCELLING`, falls Cancellation zuerst committed | spaeteres `SUCCEEDED` |
| `CANCELLING` | `CANCELLED` nur mit gueltiger Evidence; sonst weiter `CANCELLING` oder `CANCEL_STUCK` nach Reconciliation | unbelegtes `CANCELLED`, `SUCCEEDED` |
| `CANCEL_STUCK` | `CANCELLED` mit neuer oder bereits gueltig persistierter Evidence; autorisiert zurueck zu `CANCELLING` nur fuer einen neuen manuellen/spaeteren Recovery-Versuch | automatisches `SUCCEEDED`, unbelegtes `CANCELLED` |
| `SUCCEEDED` | unveraendert | `CANCELLING`, `CANCELLED`, `CANCEL_STUCK` |
| `CANCELLED` | unveraendert | `SUCCEEDED` oder Wiederaufnahme der Arbeit |

`CANCEL_STUCK` ist ein expliziter nicht-erfolgreicher Eskalationszustand. Seine Aufloesung veraendert keine bereits terminale Wahrheit.

### 5.4 Konsistente Runtime-, Job- und Workflow-Projektion

Die unterschiedlichen Zustandsnamen bezeichnen verschiedene Ebenen und werden wie folgt gebunden:

| Entscheidung | Runtime-Beobachtung | Background Job | WorkflowExecution / Attempt |
|---|---|---|---|
| noch kein autoritativer Completion-/Cancellation-Commit | darf terminal `SUCCEEDED` beobachtet haben, bleibt aber `OBSERVED`/un-dispositioniert | weiterhin erlaubter nichtterminaler Claim-/Run-Zustand | bleibt auf dem laufenden Pfad; kein Task-Erfolg ist publiziert |
| Completion gewinnt | `SUCCEEDED`, Disposition `ACCEPTED_AS_CANONICAL_RESULT` | `SUCCEEDED`, kanonische Resultatreferenz gebunden | WorkflowExecution wechselt konsistent nach `AWAITING_OBLIGATIONS`; Attempt-/Resultatprojektion darf den vorgesehenen Erfolgsfortschritt abbilden, aber erst spaetere Obligationsannahme erzeugt Workflow-`COMPLETED` |
| Cancellation gewinnt, Runtime laeuft | `CANCELLATION_REQUESTED` oder laufende Beobachtung, Disposition `NOT_TERMINAL` | `CANCELLING` | WorkflowExecution `CANCELLING`; Attempt/Task nicht erfolgreich |
| Cancellation gewinnt, Runtime meldet spaet `SUCCEEDED` | beobachtetes `SUCCEEDED` bleibt append-only erhalten, Disposition `LATE_RESULT_DISCARDED` | `CANCELLING`, danach nur mit Evidence `CANCELLED` | WorkflowExecution bleibt `CANCELLING`; kein Success-Publish und keine Erfolgsobligation |
| Termination verifiziert | terminale Beobachtung plus `VALID` Evidence | `CANCELLED` | WorkflowExecution und betroffene laufende Attempt-/Task-Projektion `CANCELLED` nach den bestehenden Abbruchregeln |
| Termination nicht beweisbar, Budget erschoepft | letzte Beobachtung bleibt erhalten | `CANCEL_STUCK` | WorkflowExecution `CANCEL_STUCK`; Task-/Projekt-Hold aktiv |

Wo diese Projektionen in derselben PostgreSQL-Domaene liegen, werden sie in derselben autoritativen Transition-Transaktion geschrieben. Asynchrone read models duerfen nur den versionierten Outbox-Stand spiegeln und muessen bis zur Zustellung den Quellstatus samt Pending-Sequence zeigen; sie duerfen keinen gegenteiligen terminalen Zustand erfinden. Runtime-Beobachtung und ihre fachliche Disposition sind getrennte Records oder getrennte unveraenderbare Felder.

## 6. `RuntimeTerminationEvidence`

### 6.1 Logisches Mindestmodell

Jeder Evidence-Kandidat und jede persistierte Verifikationsentscheidung ist strukturiert. Das logische Modell besitzt mindestens:

| Feld | Vertrag |
|---|---|
| `schemaVersion` | explizite Version des geschlossenen Evidence-Schemas und der kanonischen Serialisierung |
| `evidenceId` | global beziehungsweise projektweit eindeutige, unveraenderliche Evidence-ID; Teil des Replay-Schutzes |
| `evidenceType` | geschlossener Typ, der eine terminale Beobachtung bezeichnet, zum Beispiel `RUNTIME_TERMINATION_ATTESTATION`, `PROCESS_EXIT_ATTESTATION`, `RUNTIME_TERMINAL_STATUS_ATTESTATION`, `WORKLOAD_NOT_CREATED` oder `FAKE_RUNTIME_TERMINATION`; ein blosses Cancel-Acknowledgement ist nicht terminal |
| `projectId` | zusaetzliche zwingende Projektbindung |
| `runtimeId` | exakte Runtime-Instanz beziehungsweise Runtime-Run-Bindung |
| `agentRunId` | exakter AgentRun |
| `attemptId` | exakter Task-/Agent-Attempt |
| `jobId` | exakter autoritativer Job |
| `cancellationRequestId` | genau der angenommene Cancellation Request |
| `workloadId` / `processIdentity` | genau eine Variante muss gesetzt sein; `processIdentity` muss PID-Wiederverwendung durch Host-/Boot-/Startidentitaet oder gleichwertige Attestation ausschliessen |
| `leaseGeneration` | die Claim-/Lease-Generation, unter der die Beobachtung erzeugt wurde |
| `fencingToken` | der zu dieser Generation gehoerende monotone Fence |
| `runtimeEventSequence` | monotone Runtime-Sequenz beziehungsweise attestierter Status-Watermark fuer Frische und Ordnung |
| `terminalState` | beobachteter terminaler Runtime-/Prozesszustand; bestimmt nur Termination, nicht die Job-Erfolgsentscheidung |
| `issuedBy` | typisierte Issuer-Identitaet und Trust-Domain, nicht freier unvalidierter Text |
| `issuerEnvironment` | `DEVELOPMENT`, `TEST`, `RELEASE_CANDIDATE` oder `PRODUCTION`; Fake-Evidence darf nur `DEVELOPMENT`/`TEST` sein |
| `observedAt` | attestierter Beobachtungszeitpunkt; keine alleinige Ordnungsvermutung gegen DB-Commits |
| `verificationMethod` | geschlossene Methode und Version, zum Beispiel signierte Runtime-Attestation oder lokal attestierte Prozessidentitaet |
| `evidenceDigest` | Digest der kanonisch serialisierten unveraenderlichen Claims und des referenzierten Attestation-Payloads |
| `verifiedAt` | PostgreSQL-Wall-Clock-Zeit der Verifikationsentscheidung |
| `verifierIdentity` | autorisierte, versionierte Verifier-Identitaet |
| `validity` | exakt `VALID` oder `REJECTED` |
| `rejectionReason` | bei `REJECTED` zwingender geschlossener Reason Code; bei `VALID` leer |

Zulaessige Rejection Reasons umfassen mindestens `MALFORMED`, `DIGEST_MISMATCH`, `UNTRUSTED_ISSUER`, `UNSUPPORTED_METHOD`, `NOT_TERMINAL`, `STALE`, `PROJECT_SCOPE_MISMATCH`, `RUNTIME_SCOPE_MISMATCH`, `AGENT_RUN_SCOPE_MISMATCH`, `JOB_SCOPE_MISMATCH`, `WORKLOAD_SCOPE_MISMATCH`, `CANCELLATION_SCOPE_MISMATCH`, `LEASE_GENERATION_MISMATCH`, `FENCING_TOKEN_MISMATCH`, `REPLAYED`, `ENVIRONMENT_NOT_ALLOWED` und `VERIFIER_ERROR`.

### 6.2 Verifikation und Persistenz

Die eine konzeptionelle Schnittstelle lautet `verify(candidate, expectedContext) -> verificationDecision`. `expectedContext` enthaelt mindestens Projekt, Runtime, AgentRun, Job, Cancellation Request, Workload-/Prozessidentitaet, erlaubte Lease Generation/Fence, Cancellation Sequence, Runtime-Watermark, Environment und Policy-/Verifier-Version.

Die Verifikation prueft fail-closed:

1. Schema, geschlossene Typen und kanonische Serialisierung;
2. Digest und, soweit fuer die Methode vorgesehen, Signatur/Attestation sowie Issuer-Vertrauen;
3. Projekt-, Runtime-, AgentRun-, Job-, Cancellation- und Workload-Scope;
4. Generation/Fence und Runtime-Sequenz;
5. terminale Aussage, Frische und erlaubte Umgebung;
6. Evidence-ID-/Digest-Replay und eine bereits erfolgte Consumption.

Kandidat und Entscheidung werden append-only gespeichert. Nur `VALID` darf von einer Transition zu `CANCELLED` referenziert werden. `REJECTED` wird auditiert, veraendert den Job nicht und kann einen sicheren neuen Status-Query beziehungsweise Retry ausloesen. Ein Verifier-Fehler ist eine Ablehnung, kein implizites Pass.

Eine unter ihrer damaligen aktiven Generation/Fence bereits erfolgreich verifizierte und committed gespeicherte Evidence bleibt fuer denselben Job und Cancellation Request auch nach Worker-Reclaim verwertbar. Eine erst nach Reclaim eingegangene Evidence aus einer historischen Generation darf ausschliesslich die aktuelle Generation verifizieren und transitionieren: Der Kandidat muss unveraendert den exakten historischen Cancel-Versuch, dieselbe Cancellation Sequence und dieselbe Workload binden, darf keiner spaeteren Runtime-Aktivitaet widersprechen und muss alle uebrigen Trust-/Digest-/Frischepruefungen bestehen. Der alte Worker selbst darf nichts mehr committen. Eine nur alte, nicht lueckenlos gebundene Generation/Fence ist `REJECTED`. Erneute Zustellung derselben bereits verarbeiteten Evidence ist idempotent und erzeugt keine zweite Transition; Verwendung fuer einen anderen Scope ist ein Replay und wird abgelehnt.

Fuer einen nachweislich nie erzeugten beziehungsweise nie gestarteten Workload darf `WORKLOAD_NOT_CREATED` als terminale Evidence dienen. Auch dieser Nachweis muss Runtime, AgentRun, Attempt, Job, Cancellation Sequence, Generation/Fence und die negative Provider-/Runtime-Attestation binden und dieselbe Verifier-Schnittstelle bestehen. Eine lokale Annahme "Start vermutlich fehlgeschlagen" genuegt nicht.

### 6.3 FakeRuntime

Die `FakeAgentRuntime` darf deterministische Kandidaten vom Typ `FAKE_RUNTIME_TERMINATION` erzeugen. Sie benutzt exakt dieselbe Candidate-Struktur, `expectedContext`-Bindung und Verifier-Schnittstelle wie eine spaetere reale Runtime. Nur Trust-Profile, Issuer und Verification Method sind testbezogen.

- Test-Fixtures koennen deterministisch gueltige, schema-ungueltige, digest-manipulierte, alte, scopefremde, generations-/fencefremde und replayte Kandidaten erzeugen.
- Manipulation darf nicht dadurch simuliert werden, dass der Verifier umgangen oder sein Ergebnis vorgegeben wird.
- Fake-Evidence traegt `issuerEnvironment=DEVELOPMENT` oder `TEST`; ein Release-Candidate-/Production-Verifier lehnt sie mit `ENVIRONMENT_NOT_ALLOWED` oder `UNTRUSTED_ISSUER` ab.
- Fake-Evidence ist ausschliesslich `DEVELOPMENT_ONLY`, keine reale Attestation und kein Produktionsnachweis.

## 7. Runtime-Cancel, Fehler und Timeout

Der externe Cancel-Pfad wird als persistente Zustandsfolge behandelt:

1. Nach `CancellationAccepted` fragt der Worker den aktuellen Runtime-Status ab.
2. Liegt terminale Evidence vor, laeuft sie durch den Verifier. Bei `VALID` wird ohne weiteren Cancel-Aufruf `CANCELLED` committed; bei `REJECTED` bleibt `CANCELLING`.
3. Nur bei weiter laufender Runtime und vorhandenem Budget wird der naechste Attempt mit Attempt-Nummer, Generation/Fence, Startzeit und idempotenter Operation-ID persistent als begonnen gespeichert und `runtime.cancelRun` aufgerufen.
4. Erfolg darf nur dann `CANCELLED` ergeben, wenn die Antwort terminale Evidence enthaelt oder eine anschliessende Statusabfrage solche Evidence liefert und diese `VALID` ist.
5. Fehler, Ablehnung oder Timeout speichern Outcome, minimierten Error Code, Attempt-Nummer, `lastAttemptAt`, `nextRetryAt`, Runtime-Watermark sowie Audit und Retry-Outbox atomar. Der Job bleibt `CANCELLING`.
6. Timeout ist ein unbekanntes externes Ergebnis. Vor jedem Retry muss deshalb der Runtime-Status erneut abgefragt werden; ein Cancel-Aufruf darf nicht blind dupliziert werden.

Ein Provider-Receipt, ein erfolgreich zurueckgekehrter Methodenaufruf oder ein String `CANCELLED` ist ohne verifizierte terminale Evidence nicht ausreichend.

## 8. Recovery, Retry-Limit und `CANCEL_STUCK`

Vor jedem weiteren Cancel-Versuch und nochmals unmittelbar vor einer Budgetentscheidung sperrt Recovery die Jobzeile und reconciliert in einer konsistenten Transaktion beziehungsweise einem nach Status-I/O neu gesperrten Snapshot:

1. vorhandene `VALID` Runtime-Termination-Evidence;
2. neu eingegangene Runtime-Events und ihre Verifikationsentscheidungen;
3. aktuellen Job- und Workflowstatus samt Version;
4. aktuelle und in Evidence gebundene Lease Generation;
5. aktuellen und in Evidence gebundenen Fencing Token;
6. bereits gespeicherte autoritative Completion und Resultatbindung;
7. Aggregate Sequences/Versionen der dauerhaft committeden Completion- und Cancellation-Ereignisse;
8. aktuelles Attempt-Budget und eventuell bereits geplanten Retry.

Die Entscheidung lautet exakt:

- Gueltige, passende Termination-Evidence: atomarer Uebergang `CANCELLING` oder `CANCEL_STUCK` nach `CANCELLED`; Evidence-Referenz, Audit, Inbox/Idempotenz und Outbox werden gemeinsam committed.
- Nachweislich vor Cancellation-Annahme committedes `SUCCEEDED`: Job bleibt `SUCCEEDED`; der Request ist `REJECTED_TOO_LATE`. Ein solcher Stand darf nicht als `CANCELLING` oder `CANCEL_STUCK` neu erzeugt werden.
- Cancellation zuerst, Runtime noch nicht nachweislich terminal und Budget vorhanden: Job bleibt `CANCELLING`; naechster Retry wird genau einmal geplant.
- Cancellation zuerst, Budget erschoepft und keine gueltige terminale Evidence: atomarer Uebergang zu `CANCEL_STUCK`, Audit/Outbox/ProjectHold werden geschrieben; `CANCELLED` wird nicht behauptet.

`CANCEL_STUCK` ist korrekt, wenn Cancellation zuerst angenommen wurde, Runtime-Cancel nicht bestaetigt werden konnte, das Retry-Budget erschoepft ist und keine verifizierbare terminale Evidence existiert. Der Zustand blockiert Task- und Projektfortschritt. Neue Evidence darf weiterhin verifiziert werden und bei Gueltigkeit `CANCELLED` herstellen; eine autorisierte manuelle Entscheidung darf einen spaeteren Recovery-Versuch erlauben, aber niemals Evidence erfinden oder einen terminalen Zustand umschreiben.

### 8.1 AC8 - formales Akzeptanzkriterium fuer `CANCEL_STUCK`

AC8 ist GENAU DANN erfuellt, wenn die Implementierung und die zugeordneten Tests alle folgenden Aussagen gemeinsam belegen:

1. `CANCEL_STUCK` DARF GENAU DANN committed werden, wenn der unter demselben Job-Row-Lock gelesene Job `CANCELLING` ist, der gebundene Cancellation Request dauerhaft `ACCEPTED` ist, dessen Aggregate Sequence vor jeder Completion Sequence liegt, kein autoritatives `SUCCEEDED` oder `CANCELLED` committed ist, das konfigurierte persistente Attempt-Limit erreicht ist und keine passende `VALID` Runtime-Termination-Evidence vorhanden ist.
2. Vor der Entscheidung MUESSEN alle budgetierten Cancel Attempts mit eindeutiger Operation-ID persistent begonnen und mit einem terminal gespeicherten Attempt-Outcome abgeschlossen sein. Als abgeschlossen gelten `FAILED`, `REJECTED`, `TIMED_OUT` oder ein erfolgreich beantworteter Aufruf ohne verifizierte terminale Evidence. Ein begonnener Attempt ohne terminal gespeichertes Outcome, ein faelliger noch nicht ausgefuehrter Attempt oder ein noch vorhandenes Budget VERBIETET `CANCEL_STUCK`.
3. Nach Abschluss des letzten budgetierten Attempts MUSS Recovery den aktuellen Runtime-Status abfragen, alle bis zum Query-Watermark eingegangenen Runtime-Events ingestieren und jeden vorhandenen terminalen Evidence-Kandidaten erneut ueber `verify(candidate, expectedContext)` pruefen. Erst nach diesem I/O MUSS Recovery die Jobzeile erneut sperren und die Entscheidung gegen den dann aktuellen Datenbankstand treffen. Runtime-I/O DARF NICHT innerhalb der Row-Lock-Transaktion stattfinden.
4. Akzeptiert wird ausschliesslich eine persistierte Verifikationsentscheidung `VALID` fuer einen der geschlossenen Evidence-Typen `RUNTIME_TERMINATION_ATTESTATION`, `PROCESS_EXIT_ATTESTATION`, `RUNTIME_TERMINAL_STATUS_ATTESTATION`, `WORKLOAD_NOT_CREATED` oder, nur in `DEVELOPMENT`/`TEST`, `FAKE_RUNTIME_TERMINATION`, wenn alle Bindungen und Pruefungen aus Abschnitt 6 bestanden sind. Ein Statusstring, Cancel-Acknowledgement, Provider-Receipt, erfolgreicher Methoden-Return, fehlender Workload ohne Attestation sowie jede `REJECTED`, manipulierte, nichtterminale, veraltete, scopefremde, generations-/fencefremde, replayte oder nicht verifizierbare Evidence MUSS abgelehnt werden und DARF `CANCELLED` NICHT begruenden.
5. Die finale Transaktion MUSS `background_jobs` samt Jobstatus, Jobversion, Project-/Jobbindung, Cancellation Request ID und -status, Cancellation- und Completion-Sequence, kanonischer Resultatbindung, Attempt-Anzahl und -Limit, allen terminalen Attempt-Outcomes, `nextRetryAt`, Runtime-Watermark, vorhandenen Evidence-Verifikationsentscheidungen und Consumption-Status, aktuellem Lease Owner, aktueller Lease Generation, Claim-ID und aktuellem Fencing Token lesen. Sie MUSS Jobversion, Zustand, Cancellation Sequence, aktuelle Lease Generation und aktuelles Fencing Token atomar per CAS vergleichen.
6. Fuer die Transition gilt die aktuelle Lease Generation und das aktuelle Fencing Token des Recovery-Claimants. Eine bereits committede `VALID` Evidence darf nach Abschnitt 6.2 an ihre damalige aktive Generation/Fence gebunden bleiben. Neu eingegangene historische Evidence MUSS zusaetzlich durch den aktuellen Claim verifiziert werden. Der historische Worker DARF NICHT committen.
7. Bei erfolgreichem CAS MUSS dieselbe Transaktion den Job und die WorkflowExecution auf `CANCEL_STUCK` setzen, die Jobversion und Aggregate Sequence genau einmal erhoehen, den Reason Code `RECOVERY_BUDGET_EXHAUSTED_WITHOUT_VALID_TERMINATION_EVIDENCE`, die Reconciliation-Watermarks und die geprueften Attempt-/Evidence-Referenzen speichern und genau ein AuditEvent `CANCEL_STUCK` schreiben.
8. Dieselbe Transaktion MUSS die ausloesende Inbox-/Idempotenz-Delivery mit ihrer `CANCEL_STUCK`-Entscheidung abschliessen, jeden noch geplanten automatischen Cancellation-Retry als durch die Stuck-Entscheidung ueberholt markieren und genau die idempotenten Outbox-Wirkungen `CancellationStuck` und `ProjectHold` erzeugen. Replay derselben Delivery MUSS `IDEMPOTENT_REPLAY` liefern und DARF kein zweites AuditEvent, keinen zweiten Hold und keinen weiteren Retry erzeugen.
9. `CANCEL_STUCK` behauptet weder `CANCELLED` noch `SUCCEEDED`, bindet kein kanonisches Resultat, publiziert kein Erfolgs- oder `JobCancelled`-Event und loest keine Erfolgsobligation aus.
10. `CANCEL_STUCK` DARF spaeter ausschliesslich durch einen atomaren Row-Lock/CAS-Commit zu `CANCELLED` verlassen werden, der passende `VALID` Evidence konsumiert, oder durch eine ausdruecklich autorisierte manuelle Recovery-Entscheidung zu `CANCELLING`, die einen neuen Recovery-Versuch persistent freigibt. Die manuelle Entscheidung DARF keine Evidence erzeugen und DARF NICHT unmittelbar `CANCELLED` oder `SUCCEEDED` setzen.
11. Aus `CANCEL_STUCK` sind `SUCCEEDED`, unbelegtes `CANCELLED`, automatische Rueckkehr zu `CANCELLING`, automatischer weiterer Cancel Attempt, Ueberschreiben eines terminalen Zustands und jede Mutation durch alten Owner, alte Lease Generation oder altes Fencing Token ausdruecklich verboten. Aus `SUCCEEDED` oder `CANCELLED` ist ein Uebergang nach `CANCEL_STUCK` ausdruecklich verboten.
12. Ein CAS-Verlust MUSS `REJECTED_STALE` ohne Teilwirkung liefern. Job, Workflow, Evidence-Consumption, Audit, Inbox, Outbox, Retry-Plan und ProjectHold MUESSEN dann unveraendert bleiben.

## 9. Wahrheitstabelle

In der Spalte Inbox/Outbox bedeutet `einmal` die bestehende Idempotenzregel; Audit ist immer append-only und projekt-/jobgebunden.

Die Evidence-Faelle WT-09, WT-10 und WT-16 bis WT-18 gelten sowohl fuer spaetere reale Evidence als auch fuer deterministische FakeRuntime-Kandidaten ueber dieselbe Verifier-Schnittstelle; Fake-Kandidaten muessen zusaetzlich die Environment-/Trust-Grenze aus Abschnitt 6.3 einhalten.

| ID | Fall und dauerhafte Ordnung | Autoritativer Zielzustand | Evidence-/Resultatbehandlung | Audit | Inbox/Outbox und Recovery |
|---|---|---|---|---|---|
| WT-01 | Completion committed zuerst, Cancel danach | Job `SUCCEEDED`; Workflow auf Erfolgspfad | kanonisches Ergebnis bleibt; keine Termination-Evidence erforderlich | `COMPLETED`, danach `CANCEL_REJECTED` mit Reason `CANCEL_REJECTED_TOO_LATE` | Cancel-Inbox als abgelehnt einmal; `CancellationRejectedTooLate`; kein Runtime-Cancel/Retry |
| WT-02 | Cancellation committed zuerst, Completion danach | `CANCELLING` | Ergebnis-Digest/Metadaten `LATE_RESULT_DISCARDED`, nicht publiziert | `CANCEL_REQUESTED`, `LATE_COMPLETION_DISCARDED` mit Disposition `LATE_RESULT_DISCARDED` | beide Deliveries einmal; Statusabfrage, Cancel/Recovery nach Budget |
| WT-03 | Gleichzeitiger CAS-Wettbewerb, Completion-Commit gewinnt | wie WT-01 | Cancel-CAS verliert und klassifiziert zu spaet | wie WT-01 | wartender Cancel laedt neu; keine blinde CAS-Wiederholung |
| WT-04 | Gleichzeitiger CAS-Wettbewerb, Cancellation-Commit gewinnt | wie WT-02 | Completion-CAS verliert und fuehrt Discard-Commit aus | wie WT-02 | wartende Completion laedt neu; kein Erfolgs-Retry |
| WT-05 | Runtime-Cancel liefert erfolgreich gueltige terminale Evidence | `CANCELLED` | Evidence `VALID`, unveraenderbar referenziert | `CANCEL_ATTEMPTED`, `EVIDENCE_VERIFIED`, `CANCEL_CONFIRMED`, `CANCELLED` | Attempt/Response einmal; `JobCancelled`; kein weiterer Retry |
| WT-06 | `runtime.cancelRun` schlaegt fehl | `CANCELLING` | keine terminale Evidence; Fehler persistent | `CANCEL_ATTEMPT_FAILED` mit `FAILED` | Retry-Outbox einmal fuer `nextRetryAt`; vor Retry Statusabfrage |
| WT-07 | `runtime.cancelRun` laeuft in Timeout | `CANCELLING` | Ergebnis unbekannt, keine synthetische Evidence | `CANCEL_ATTEMPT_FAILED` mit `TIMED_OUT` | Retry-Outbox einmal; zwingende Statusabfrage vor weiterem Cancel |
| WT-08 | Worker-Crash in `CANCELLING` | `CANCELLING`, sofern noch kein Endentscheid; spaeter nach Reconciliation | bereits committede Evidence/Attempts bleiben; uncommittete Wirkung existiert nicht | `RECLAIMED` und nachfolgende Recovery-Events | neuer Claim/Generation; Statusabfrage; kein doppelter Attempt/Outbox-Effekt |
| WT-09 | gueltige passende Termination-Evidence | `CANCELLED` | `VALID`, exakt einmal konsumiert | `EVIDENCE_VERIFIED`, `CANCEL_CONFIRMED`, `CANCELLED` | Evidence-Inbox einmal; `JobCancelled`; Retry entfaellt |
| WT-10 | schema-ungueltige, manipulierte oder nichtterminale Evidence | Zustand unveraendert (`CANCELLING`/`CANCEL_STUCK`) | `REJECTED` mit konkretem Reason | `EVIDENCE_REJECTED` | Inbox als rejected einmal; kein `JobCancelled`; sicherer Query/Recovery moeglich |
| WT-11 | keine Evidence vorhanden | `CANCELLING` bei Budget, sonst `CANCEL_STUCK` | keine Evidence-Referenz | Retry- oder `CANCEL_STUCK`-Audit | Statusabfrage; genau ein Retry oder Hold-Outbox-Ereignis |
| WT-12 | Retry-Limit erreicht, gueltige terminale Evidence vorhanden | `CANCELLED` | Evidence vor Limitentscheidung ausgewertet und konsumiert | `EVIDENCE_VERIFIED`, `CANCEL_CONFIRMED`, `CANCELLED`; kein `CANCEL_STUCK` | kein neuer Cancel; `JobCancelled` einmal |
| WT-13 | Retry-Limit erreicht, keine gueltige terminale Evidence | `CANCEL_STUCK` | keine Cancellation-Behauptung | `CANCEL_STUCK` mit Budget-/Reconciliation-Metadaten | `CancellationStuck`/ProjectHold einmal; manueller/spaeterer Recovery-Pfad offen |
| WT-14 | verspaetetes Runtime-`SUCCEEDED` nach Cancellation-Annahme | `CANCELLING`, mit gueltiger terminaler Evidence anschliessend `CANCELLED` | Ergebnis `LATE_RESULT_DISCARDED`; terminale Beobachtung separat durch Verifier | `LATE_COMPLETION_DISCARDED`; danach Evidence-Entscheid | kein Erfolgs-Outbox-Event; Status-/Evidence-Recovery statt Completion |
| WT-15 | Reclaim; alter Worker/Fencing Token mutiert oder liefert unverifizierte Evidence | Zustand unveraendert | alter Kandidat `REJECTED` (`LEASE_GENERATION_MISMATCH`/`FENCING_TOKEN_MISMATCH`) | `LEASE_LOST` oder trusted `EVIDENCE_REJECTED` | stale Inbox/Muation ohne Fachwirkung; aktueller Worker reconciliert |
| WT-16 | alte Evidence vor Cancellation-Watermark | Zustand unveraendert | `REJECTED`/`STALE` | `EVIDENCE_REJECTED` | kein `JobCancelled`; aktueller Status wird neu abgefragt |
| WT-17 | scopefremde Evidence (Projekt, Runtime, Run, Job, Workload oder Request) | Zustand unveraendert | passender Scope-Reason, niemals wiedergebunden | `EVIDENCE_REJECTED` | kein fachliches Outbox-Event ausser optionaler Security-Meldung; Recovery bleibt fail-closed |
| WT-18 | replayte Evidence | bei identischer bereits konsumierter Delivery unveraendert/idempotent; bei anderem Scope unveraendert/rejected | gleiche Consumption wird wiedergegeben; Cross-Scope `REPLAYED` | kein doppeltes `CANCELLED`; Cross-Scope `EVIDENCE_REJECTED` | keine doppelte Outbox; gespeichertes Resultat wird geliefert |
| WT-19 | doppelter/paralleler identischer Cancel Request | erster Commit entscheidet; Folgelieferungen geben ihn wieder | keine zusaetzliche Evidence | einmal `CANCEL_REQUESTED` oder `CANCEL_REJECTED` mit Reason `CANCEL_REJECTED_TOO_LATE` | eine Inbox-/Idempotenzwirkung, eine Outbox, kein doppelter Attempt |
| WT-20 | Crash nach Evidence-Commit, vor `CANCELLED`-Commit | zunaechst `CANCELLING`; Recovery dann `CANCELLED` | bereits `VALID` persistierte Evidence bleibt trotz Reclaim verwertbar | einmal Evidence-Verifikation, spaeter einmal `CANCELLED` | Recovery konsumiert bestehende Evidence; kein erneuter Runtime-Cancel |

## 10. Nummerierte Akzeptanztests fuer die spaetere Implementierung

Alle Tests verwenden kontrollierte Transaktionen/Barrieren, echte PostgreSQL-Row-Locks und explizite Versionen. Zeitliche Rennfaelle duerfen nicht durch zufaellige Sleeps entschieden werden.

| Test | Linearisierungspunkt und erlaubte Ausgangszustaende | Zielzustand und erforderliche Evidence | Erwartetes AuditEvent | Inbox-/Outbox-Verhalten | Retry-/Recovery-Verhalten |
|---|---|---|---|---|---|
| AT-01 Completion vor Cancel | Completion-Commit unter Job-Row-Lock aus `CLAIMED`/`RUNNING`; Cancel wartet | `SUCCEEDED`; keine Termination-Evidence | `COMPLETED`, `CANCEL_REJECTED` mit `CANCEL_REJECTED_TOO_LATE` | Completion und Ablehnung je einmal; kein Cancel-Outbox-Auftrag | kein Runtime-Cancel/Retry |
| AT-02 Cancel vor Completion | Cancellation-Commit aus `CLAIMED`/`RUNNING`; Completion wartet | `CANCELLING`; Resultat `LATE_RESULT_DISCARDED`; noch keine Evidence erforderlich | `CANCEL_REQUESTED`, `LATE_COMPLETION_DISCARDED` | je eine Inbox-Wirkung; kein Erfolgs-Event; Discard-Event einmal | Runtime-Statusabfrage und budgetierter Cancel |
| AT-03 simultaner CAS, Completion gewinnt | zwei kontrollierte Transaktionen auf gleicher Version; Completion committed zuerst | wie AT-01 | wie AT-01 | CAS-Verlierer laedt neu, keine Doppelwirkung | keine fachliche CAS-Wiederholung |
| AT-04 simultaner CAS, Cancellation gewinnt | zwei kontrollierte Transaktionen auf gleicher Version; Cancellation committed zuerst | wie AT-02 | wie AT-02 | Completion-Verlierer fuehrt genau einen Discard-Commit aus | kein Completion-Retry |
| AT-05 erfolgreicher Runtime-Cancel | Attempt aus `CANCELLING`; `CANCELLED`-Commit ist eigener Row-Lock/CAS-Punkt | `CANCELLED`; gueltige terminale Evidence zwingend | `CANCEL_ATTEMPTED`, `EVIDENCE_VERIFIED`, `CANCEL_CONFIRMED`, `CANCELLED` | Attempt und Evidence genau einmal; `JobCancelled` einmal | kein weiterer Retry |
| AT-06 Runtime-Cancel Fehler | Failure-Commit nach externem Aufruf aus `CANCELLING` | `CANCELLING`; keine Evidence | `CANCEL_ATTEMPT_FAILED`/`FAILED` | Fehler und `nextRetryAt` atomar; ein Retry-Event | vor Retry aktueller Status |
| AT-07 Runtime-Cancel Timeout | Timeout-Commit aus `CANCELLING` | `CANCELLING`; keine synthetische Evidence | `CANCEL_ATTEMPT_FAILED`/`TIMED_OUT` | unbekanntes Ergebnis und ein Retry-Event | zwingende Statusabfrage, dann erst moeglicher Retry |
| AT-08 Crash in `CANCELLING` | Crash vor beziehungsweise nach Attempt-Commit getrennt testen; Reclaim-Commit mit neuer Generation | kein uncommitteter Effekt; `CANCELLING` bis Reconciliation | `RECLAIMED`, danach passende Recovery-Events | keine doppelte Inbox/Outbox oder Attempt-Nummer | Statusabfrage, Budget und vorhandene Evidence aus DB laden |
| AT-09 gueltige Evidence | Evidence-Verifikations- und anschliessender `CANCELLED`-Commit aus `CANCELLING` oder `CANCEL_STUCK` | `CANCELLED`; alle Bindungen/Digest/Issuer/Frische gueltig | `EVIDENCE_VERIFIED`, `CANCEL_CONFIRMED`, `CANCELLED` | Evidence einmal konsumiert; `JobCancelled` einmal | aus `CANCELLING` wird ein geplanter Retry ueberholt; aus `CANCEL_STUCK` existiert kein automatischer Retry und der Stuck-Hold wird evidenzgebunden aufgeloest |
| AT-10 schema-ungueltige Evidence | Rejection-Commit aus `CANCELLING` oder `CANCEL_STUCK` | Ausgangszustand unveraendert; `MALFORMED` | `EVIDENCE_REJECTED` | Inbox rejected; keine Cancelled-Outbox | Statusabfrage/Recovery bleibt erlaubt; Stuck-Hold bleibt aktiv |
| AT-11 manipulierte Evidence | Digest-/Attestation-Pruefung vor Rejection-Commit aus `CANCELLING` oder `CANCEL_STUCK` | Ausgangszustand unveraendert; `DIGEST_MISMATCH` oder `UNTRUSTED_ISSUER` | `EVIDENCE_REJECTED` | keine Erfolgsoutbox | fail-closed, neuer trusted Query moeglich; Stuck-Hold bleibt aktiv |
| AT-12 alte Evidence | Frische-/Watermark-Pruefung gegen Cancellation Sequence aus `CANCELLING` oder `CANCEL_STUCK` | Ausgangszustand unveraendert; `STALE` | `EVIDENCE_REJECTED` | keine Erfolgsoutbox | aktuellen Runtime-Status abfragen; Stuck-Hold bleibt aktiv |
| AT-13 scopefremde Evidence | Scope-Pruefung vor jeder Consumption aus `CANCELLING` oder `CANCEL_STUCK` | Ausgangszustand unveraendert; exakter Scope-Reason | `EVIDENCE_REJECTED` | keine Cross-Project-/Cross-Job-Wirkung | betroffener Job bleibt im eigenen Recovery-Pfad; Stuck-Hold bleibt aktiv |
| AT-14 replayte Evidence | identische erneute Delivery nach erstem Consumption-Commit und Cross-Scope-Replay aus `CANCELLING`/`CANCEL_STUCK` separat | identischer Scope unveraendert/idempotent beziehungsweise bereits `CANCELLED`; Cross-Scope rejected, Ausgangszustand unveraendert | kein doppeltes `CANCELLED`; Cross-Scope `EVIDENCE_REJECTED` | keine doppelte Outbox; gespeicherte Antwort | kein zusaetzlicher Retry/Attempt; Stuck-Hold bleibt bei rejected Evidence aktiv |
| AT-15 fehlende Evidence bei Budget | Reconciliation-Commit aus `CANCELLING`, Attempts kleiner Limit | `CANCELLING` | Retry-Planung | genau ein Retry-Outbox-Event | Statusabfrage vor dem geplanten Attempt |
| AT-16 Retry-Limit mit Evidence | finale Reconciliation aus `CANCELLING` sperrt die Jobzeile; der autoritative `CANCELLED`-Commit unter CAS linearisiert, nachdem Evidence vor der Budgetentscheidung gefunden wurde | `CANCELLED`; gueltige Evidence | `EVIDENCE_VERIFIED`, `CANCEL_CONFIRMED`, `CANCELLED`, kein `CANCEL_STUCK` | `JobCancelled` einmal | kein weiterer Cancel |
| AT-17 Retry-Limit ohne Evidence | finale Reconciliation aus `CANCELLING` nach Statusquery und Event-Ingestion; der autoritative `CANCEL_STUCK`-Commit unter Job-Row-Lock/CAS linearisiert | `CANCEL_STUCK`; keine Evidence; Task- und Projektfortschritt sind durch den Stuck-Hold blockiert | `CANCEL_STUCK` mit vollstaendiger Checkliste | Hold-/Stuck-Outbox einmal; kein Success-/Cancelled-Event | automatisches Budget endet; Gate bleibt bis neuer gueltiger Evidence oder autorisierter manueller Recovery-Entscheidung geschlossen; manuell darf kein `CANCELLED` behauptet werden |
| AT-18 spaetes Runtime-SUCCEEDED | Cancellation ist bereits committed; Runtime-Event wird danach ingestiert | `CANCELLING`, spaeter ggf. `CANCELLED` nur mit verifizierter Termination; Ergebnis discarded | `LATE_COMPLETION_DISCARDED`, Evidence-Entscheid separat | nie ein Erfolgsoutbox-Event | terminale Beobachtung durch Verifier, kein Completion-Retry |
| AT-19 Reclaim und alter Fence | Reclaim-Commit aus `CANCELLING` macht die neue Generation/Fence autoritativ; danach werden Mutation und Evidence des alten Workers am Row-Lock/CAS-Guard abgelehnt | `CANCELLING` unter dem aktuellen Claim unveraendert; alte Mutation rejected, unverified Evidence generation-/fencefremd | `RECLAIMED`, `LEASE_LOST`, `EVIDENCE_REJECTED` | keine stale Fachwirkung/Outbox | nur aktueller Claim darf reconciliieren |
| AT-20 Crash nach Evidence-Verifikation | Evidence-Commit unter alter gueltiger Generation aus `CANCELLING`, Crash vor Jobtransition, dann Reclaim; der `CANCELLED`-Commit des aktuellen Claims unter Row-Lock/CAS linearisiert | Recovery `CANCELLED`; bereits verifizierte gleiche Evidence erforderlich | idempotente Re-Verifikation ohne zweite persistierte Entscheidung und ohne zweites `EVIDENCE_VERIFIED`; `RECLAIMED`, `CANCEL_CONFIRMED`, einmal `CANCELLED` | kein erneuter Runtime-Cancel; `JobCancelled` einmal | bestehende `VALID` Evidence vor Budget/Attempt gegen aktuellen Context pruefen und konsumieren |
| AT-21 terminale Monotonie | alte Completion/Cancel-Events gegen je einen committeden `SUCCEEDED`- und `CANCELLED`-Job | terminaler Zustand jeweils unveraendert | nur Rejection/Discard/Stale-Audit | keine gegensaetzliche Outbox | kein Recovery schreibt terminal um |
| AT-22 FakeRuntime-Verifier-Paritaet | identischer Verifier-Entry-Point wird mit deterministisch gueltigen, schema-ungueltigen, digest-/attestation-manipulierten, alten, projekt-/runtime-/run-/job-/workload-/request-scopefremden und replayten Fake-Kandidaten aus `CANCELLING` und `CANCEL_STUCK` ausgefuehrt | gueltig nur in Development/Test fuehrt wie AT-09 zu `CANCELLED`; jede ungueltige Variante behaelt wie AT-10 bis AT-14 den Ausgangszustand; Release-Candidate-/Production-Profil rejected Fake-Trust immer | je Variante `EVIDENCE_VERIFIED` oder exakter `EVIDENCE_REJECTED`-Reason; nie doppeltes `CANCELLED` | jede Candidate-Delivery idempotent; nur gueltige Dev-Evidence erzeugt einmal `JobCancelled`; ungueltige/replayte Variante nie | gleiche Statusquery-/Recovery-/Hold-Regeln wie AT-09 bis AT-14; Fake-Evidence kann ausschliesslich einen Development-Testjob abschliessen |
| AT-23 doppelter/paralleler Cancel | zwei identische Requests mit gleicher Message-ID/Idempotency Key und Digest konkurrieren aus `CLAIMED`/`RUNNING`; erster Row-Lock/CAS-Commit linearisiert | genau einmal `CANCELLING`; bei bereits vorher `SUCCEEDED` genau einmal `REJECTED_TOO_LATE`; keine Evidence erforderlich | genau einmal `CANCEL_REQUESTED` oder `CANCEL_REJECTED` mit Reason `CANCEL_REJECTED_TOO_LATE` | eine Inbox-/Idempotenzentscheidung und eine fachliche Outbox; Duplikate erhalten gespeicherte Antwort | hoechstens ein Statusquery-/Cancel-Intent und kein doppelter Attempt/Retry |

Jeder Test prueft zusaetzlich: keine Teilwirkung bei Rollback; konsistente Job-/Workflow-/Runtime-Projektion; exakt eine Aggregate Sequence pro fachlicher Transition; keine Resultatpublikation nach Cancellation; sowie Projekt-, Generation- und Fence-Isolation.

### 10.1 Vollstaendige formale Definitionen der beanstandeten Akzeptanztests

Die folgenden Definitionen sind normativ und vervollstaendigen die gleichnamigen Tabellenzeilen. `L=n/F=f` bezeichnet Lease Generation `n` und Fencing Token `f`. Jeder angegebene Endzustand ist der Zustand nach Commit aller in der Ereignisreihenfolge genannten autoritativen Operationen.

#### AT-09 - Gueltige gebundene Evidence beendet Cancellation

1. **Test-ID und Name:** `AT-09 - Gueltige gebundene Evidence beendet Cancellation`.
2. **Akzeptanzkriterium:** AC3, AC5, AC6 und AC8.
3. **Initialer persistenter Jobzustand:** Basisvariante C: Job `job-09` ist Version 41, `CANCELLING`; Request `cancel-09` ist `ACCEPTED` bei Cancellation Sequence 90; keine Completion Sequence und kein kanonisches Resultat; Retry 2 von 3 ist geplant. Variante S: derselbe gebundene Request und dieselbe Cancellation Sequence, aber Job Version 42 ist `CANCEL_STUCK`, der Stuck-Hold ist aktiv und es existiert gemaess AC8.8 und AC8.11 kein geplanter oder ausfuehrbarer automatischer Retry.
4. **Initialer Runtime-Zustand:** gebundene Workload ist terminal `TERMINATED`; Runtime-Watermark 301 ist persistiert.
5. **Lease Owner:** `recovery-worker-09`.
6. **Lease Generation:** 8.
7. **Fencing Token:** 108.
8. **Vorhandene Evidence:** ein noch nicht konsumierter Kandidat `RUNTIME_TERMINATION_ATTESTATION` bindet Projekt, Runtime, AgentRun, Attempt, `job-09`, `cancel-09`, Workload, Cancellation Sequence 90, `L=8/F=108` und Watermark 301; Digest, Issuer, Attestation, Frische und Environment sind gueltig. Ergebnis ist `VALID`, weder veraltet noch replayt.
9. **Exakte Ereignisreihenfolge:** Cancellation wurde vor jeder Completion dauerhaft angenommen; Runtime terminiert; Kandidat wird ingestiert und `VALID` committed; Transition sperrt danach `job-09`, vergleicht den aktuellen Stand, konsumiert die Evidence und committed `CANCELLED`. Nur in Basisvariante C wird der geplante Retry im selben Commit als ueberholt markiert; Variante S besitzt keinen automatischen Retry und loest ausschliesslich den evidenzgebundenen Stuck-Hold auf.
10. **Linearisierungspunkt:** Commit der `CANCELLED`-Transaktion unter `FOR UPDATE` und Jobversions-CAS.
11. **Ausgefuehrte Operation:** `verify` gefolgt von evidenzgebundener `confirmCancellation`-Transition. Basisvariante C markiert den geplanten Retry atomar als ueberholt. Variante S verarbeitet keinen Retry und loest ausschliesslich den bestehenden Hold evidenzgebunden auf.
12. **Erwartetes CAS-Ergebnis:** `APPLIED`; eine parallele zweite Consumption liefert `IDEMPOTENT_REPLAY` oder `REJECTED_STALE` ohne zweite Fachwirkung.
13. **Erwarteter Jobendzustand:** `CANCELLED`, Evidence-Referenz gebunden, kein kanonisches Resultat.
14. **Erwarteter Runtime-Endzustand:** terminal `TERMINATED`, unveraendert; Evidence-Disposition `CONSUMED`.
15. **Erwartete AuditEvents:** genau einmal `EVIDENCE_VERIFIED`, `CANCEL_CONFIRMED` und `CANCELLED`; in Variante S zusaetzlich genau einmal `PROJECT_HOLD_CLEARED`, keine zweite Evidence-Verifikation.
16. **Erwartete InboxEvents:** Evidence-Delivery genau einmal mit der gespeicherten `CANCELLED`-Entscheidung abgeschlossen; Duplikat gibt dieselbe Entscheidung wieder.
17. **Erwartete OutboxEvents:** genau einmal `JobCancelled`. In Basisvariante C erzeugt der als ueberholt markierte Retry keine weitere Runtime-Operation. Variante S besitzt keinen Retry und loest den bestehenden ProjectHold evidenzgebunden genau einmal auf.
18. **Retry-/Recovery-Verhalten:** In Basisvariante C wird der geplante Retry atomar als ueberholt markiert; kein weiterer Cancel Attempt wird ausgefuehrt. In Variante S existiert vor und nach der Transition kein automatischer Retry; Evidence-Recovery fuehrt unmittelbar zur evidenzgebundenen `CANCELLED`-Transition und Hold-Aufloesung.
19. **Verbotene Seiteneffekte:** kein Erfolgs-Event, keine Resultatpublikation, kein zweites Audit-, Inbox-, Outbox- oder Hold-Ereignis, kein Runtime-I/O in der Transition.
20. **Negative Assertions:** `SUCCEEDED`, `CANCELLING`, `CANCEL_STUCK` nach dem finalen Commit und `CANCELLED` ohne Consumption der `VALID` Evidence sind ausgeschlossen.
21. **Erforderliche Verifikation:** DB-Assertions fuer Jobversion, Aggregate Sequence, Evidence-Bindungen/Consumption, Audit, Inbox, Outbox und Hold; Replay und parallele Consumption werden separat ausgefuehrt.
22. **Erwartetes Gate-Ergebnis:** `PASS - DEVELOPMENT_ONLY`; jede fehlende Bindung, Doppelwirkung oder nichtatomare Hold-Aufloesung ist `BLOCK`.

#### AT-15 - Fehlende Evidence bei verbleibendem Budget

1. **Test-ID und Name:** `AT-15 - Fehlende Evidence bei verbleibendem Budget`.
2. **Akzeptanzkriterium:** AC5 und AC8.
3. **Initialer persistenter Jobzustand:** `job-15`, Version 51, `CANCELLING`; `cancel-15` `ACCEPTED` bei Sequence 100; Attempt 1 von Limit 3 ist mit `FAILED` abgeschlossen; kein Resultat, keine Completion Sequence, kein geplanter Retry.
4. **Initialer Runtime-Zustand:** `RUNNING`, Watermark 410.
5. **Lease Owner:** `recovery-worker-15`.
6. **Lease Generation:** 11.
7. **Fencing Token:** 211.
8. **Vorhandene Evidence:** keine Evidence und kein terminaler Kandidat.
9. **Exakte Ereignisreihenfolge:** Cancellation hat vor Completion gewonnen; Recovery liest den committeden Attempt; fragt ausserhalb der Transaktion Status `RUNNING` bis Watermark 411 ab; ingestiert keine Evidence; sperrt `job-15`; liest Budget und Guards erneut; plant genau Attempt 2.
10. **Linearisierungspunkt:** Commit der Retry-Planungs-Transaktion unter Job-Row-Lock/CAS.
11. **Ausgefuehrte Operation:** persistente Planung des naechsten Statusquery-/Cancel-Attempts mit eindeutiger Operation-ID und `nextRetryAt`.
12. **Erwartetes CAS-Ergebnis:** `APPLIED`; parallele Planung ist `REJECTED_STALE` oder `IDEMPOTENT_REPLAY`.
13. **Erwarteter Jobendzustand:** `CANCELLING`, Version und Aggregate Sequence genau einmal erhoeht.
14. **Erwarteter Runtime-Endzustand:** `RUNNING`; kein Cancel-Aufruf wurde in der Planungs-Transaktion ausgefuehrt.
15. **Erwartete AuditEvents:** genau einmal `CANCEL_RETRY_SCHEDULED` mit Attempt 2, Limit 3 und Watermark 411.
16. **Erwartete InboxEvents:** Recovery-Delivery genau einmal als Retry-Planung abgeschlossen.
17. **Erwartete OutboxEvents:** genau ein idempotenter Runtime-Statusquery-/Cancel-Intent fuer Attempt 2; kein `JobCancelled`, `CancellationStuck` oder Erfolgs-Event.
18. **Retry-/Recovery-Verhalten:** Attempt 2 darf erst nach `nextRetryAt` und erneuter Statusabfrage ausgefuehrt werden; Attempt 3 und `CANCEL_STUCK` sind noch nicht zulaessig.
19. **Verbotene Seiteneffekte:** kein `CANCELLED`, `CANCEL_STUCK`, `SUCCEEDED`, ProjectHold, Resultat oder unmittelbarer Runtime-Cancel innerhalb der DB-Transaktion.
20. **Negative Assertions:** keine Evidence-Referenz; keine doppelte Attempt-Nummer, Inbox-, Outbox- oder Auditwirkung; alter Owner/Fence kann nicht planen.
21. **Erforderliche Verifikation:** DB-Assertions fuer Status, Version, Attempt 2, Operation-ID, `nextRetryAt`, Watermark, Audit/Inbox/Outbox sowie parallele Replay-Probe.
22. **Erwartetes Gate-Ergebnis:** `PASS - DEVELOPMENT_ONLY`; ein vorzeitiges `CANCEL_STUCK` oder ein doppelter Retry ist `BLOCK`.

#### AT-16 - Retry-Limit mit vorliegender gueltiger Evidence

1. **Test-ID und Name:** `AT-16 - Retry-Limit mit vorliegender gueltiger Evidence`.
2. **Akzeptanzkriterium:** AC3, AC5 und AC8.
3. **Initialer persistenter Jobzustand:** `job-16`, Version 61, `CANCELLING`; `cancel-16` `ACCEPTED` bei Sequence 120; drei von drei Attempts terminal gespeichert; kein Completion-Commit, kein Resultat.
4. **Initialer Runtime-Zustand:** terminal `TERMINATED`, Watermark 501.
5. **Lease Owner:** `recovery-worker-16`.
6. **Lease Generation:** 12.
7. **Fencing Token:** 312.
8. **Vorhandene Evidence:** persistierter, nicht konsumierter `VALID`-Entscheid fuer `PROCESS_EXIT_ATTESTATION`, exakt an `job-16`, `cancel-16`, Workload, Sequence 120 und die gueltige damalige `L=11/F=311` gebunden; nach Abschnitt 6.2 weiter verwertbar, nicht veraltet und nicht replayt.
9. **Exakte Ereignisreihenfolge:** Cancellation gewann; letzter Attempt wurde committed; Runtime-Statusquery bestaetigt Watermark 501; Recovery findet und prueft die vorhandene terminale Evidence vor der Budgetentscheidung erneut; aktueller Claim sperrt die Zeile und committed Evidence-Consumption plus `CANCELLED`.
10. **Linearisierungspunkt:** Commit der evidenzgebundenen `CANCELLED`-Transition unter Row-Lock/CAS, nicht das Erreichen des Limits.
11. **Ausgefuehrte Operation:** finale Reconciliation und Consumption bereits persistierter `VALID` Evidence.
12. **Erwartetes CAS-Ergebnis:** `APPLIED` unter `L=12/F=312`.
13. **Erwarteter Jobendzustand:** `CANCELLED`; niemals `CANCEL_STUCK`.
14. **Erwarteter Runtime-Endzustand:** terminal `TERMINATED`; Evidence `CONSUMED`.
15. **Erwartete AuditEvents:** im gesamten Testverlauf genau einmal `EVIDENCE_VERIFIED`, danach genau einmal `CANCEL_CONFIRMED` und `CANCELLED`; kein `CANCEL_STUCK`.
16. **Erwartete InboxEvents:** finale Recovery-/Evidence-Delivery genau einmal als `CANCELLED` abgeschlossen.
17. **Erwartete OutboxEvents:** genau einmal `JobCancelled`; kein `CancellationStuck`, ProjectHold oder weiterer Cancel-Intent.
18. **Retry-/Recovery-Verhalten:** kein weiterer Cancel Attempt; Budgetentscheidung wird durch gueltige Evidence beendet.
19. **Verbotene Seiteneffekte:** keine Stuck-Transition, kein Hold, kein Erfolgs-Event, keine Wiederverifikation durch den alten Worker.
20. **Negative Assertions:** Limiterschoepfung darf `VALID` Evidence nicht uebergehen; historische, aber gueltig committede Evidence wird nicht allein wegen Reclaim abgelehnt.
21. **Erforderliche Verifikation:** kontrollierter Crash-/Reclaim-Kontext, Bindungs-/Frischepruefung, DB-Assertions fuer Consumption, CAS, Audit, Inbox und Outbox.
22. **Erwartetes Gate-Ergebnis:** `PASS - DEVELOPMENT_ONLY`; `CANCEL_STUCK` trotz passender `VALID` Evidence ist `BLOCK`.

#### AT-17 - Retry-Limit ohne verifizierbare Evidence

1. **Test-ID und Name:** `AT-17 - Retry-Limit ohne verifizierbare Evidence`.
2. **Akzeptanzkriterium:** AC5 und AC8.
3. **Initialer persistenter Jobzustand:** `job-17`, Version 71, `CANCELLING`; `cancel-17` `ACCEPTED` bei Sequence 130; Attempts 1 bis 3 von Limit 3 besitzen terminale Outcomes `FAILED`, `TIMED_OUT`, `REJECTED`; keine Completion Sequence, kein Resultat.
4. **Initialer Runtime-Zustand:** letzte verifizierbare Beobachtung `RUNNING`, Watermark 601; Termination ist nicht bewiesen.
5. **Lease Owner:** `recovery-worker-17`.
6. **Lease Generation:** 14.
7. **Fencing Token:** 414.
8. **Vorhandene Evidence:** kein `VALID`-Entscheid; ein Statusstring `CANCELLED` und ein Provider-Receipt liegen vor, sind aber keine Evidence und werden abgelehnt.
9. **Exakte Ereignisreihenfolge:** Cancellation gewann; alle drei Attempts wurden terminal committed; nach Attempt 3 fragt Recovery Status ab, ingestiert das Receipt und den Statusstring ohne sie als Evidence zu akzeptieren; sperrt die Jobzeile erneut; vergleicht alle AC8-Felder; committed `CANCEL_STUCK`.
10. **Linearisierungspunkt:** Commit der `CANCEL_STUCK`-Transition unter Row-Lock/CAS nach der finalen Status-/Evidence-Reconciliation.
11. **Ausgefuehrte Operation:** finale Budget- und Evidence-Entscheidung gemaess AC8.
12. **Erwartetes CAS-Ergebnis:** `APPLIED`; ein konkurrierender alter Claim ist `REJECTED_STALE` ohne Teilwirkung.
13. **Erwarteter Jobendzustand:** `CANCEL_STUCK`, kein kanonisches Resultat, Stuck-Hold aktiv.
14. **Erwarteter Runtime-Endzustand:** letzte verifizierbare Beobachtung bleibt `RUNNING`; die Jobtransition behauptet weder Termination noch spaetere Fortsetzung.
15. **Erwartete AuditEvents:** genau einmal `CANCEL_STUCK` mit Reason `RECOVERY_BUDGET_EXHAUSTED_WITHOUT_VALID_TERMINATION_EVIDENCE`, Attempt-Referenzen und Watermark 601; Statusstring und Receipt erzeugen kein `EVIDENCE_REJECTED`, weil sie keine Evidence-Kandidaten sind.
16. **Erwartete InboxEvents:** finale Recovery-Delivery genau einmal mit `CANCEL_STUCK` abgeschlossen; Replay ist `IDEMPOTENT_REPLAY`.
17. **Erwartete OutboxEvents:** genau einmal `CancellationStuck` und `ProjectHold`; kein `JobCancelled`, Erfolgs-Event oder weiterer automatischer Cancel-Intent.
18. **Retry-/Recovery-Verhalten:** automatisches Budget endet. Verlassen ist nur mit spaeter `VALID` Evidence nach `CANCELLED` oder autorisierter manueller Recovery nach `CANCELLING` erlaubt.
19. **Verbotene Seiteneffekte:** kein synthetisches `CANCELLED`, kein `SUCCEEDED`, kein Resultat, kein vierter automatischer Attempt, keine Hold-Aufloesung.
20. **Negative Assertions:** Statusstring und Receipt sind nicht Evidence; `CANCEL_STUCK` behauptet keine Termination; ein terminaler Job darf nicht zu `CANCEL_STUCK` wechseln.
21. **Erforderliche Verifikation:** DB-Assertions fuer alle AC8-Vorbedingungen, CAS, Version/Sequence, Reason, Audit/Inbox/Outbox/Hold; Replay, stale Fence und spaet eintreffende gueltige Evidence werden separat geprueft.
22. **Erwartetes Gate-Ergebnis:** `PASS - DEVELOPMENT_ONLY`; unbelegtes `CANCELLED`, fehlende finale Reconciliation oder vierter automatischer Attempt ist `BLOCK`.

#### AT-19 - Reclaim fenced alten Worker und alte Evidence

1. **Test-ID und Name:** `AT-19 - Reclaim fenced alten Worker und alte Evidence`.
2. **Akzeptanzkriterium:** AC1, AC5, AC6 und AC8.
3. **Initialer persistenter Jobzustand:** `job-19`, Version 81, `CANCELLING`; `cancel-19` `ACCEPTED` bei Sequence 150; Attempt 1 von 3 abgeschlossen; kein Resultat.
4. **Initialer Runtime-Zustand:** `RUNNING`, Watermark 701; alter Worker besitzt lokal einen uncommitted terminalen Kandidaten.
5. **Lease Owner:** initial `old-worker-19`, nach Reclaim `recovery-worker-19`.
6. **Lease Generation:** initial 20, danach aktuell 21.
7. **Fencing Token:** initial 520, danach aktuell 521.
8. **Vorhandene Evidence:** Kandidat des alten Workers bindet `L=20/F=520`, besitzt keine vor Reclaim committede `VALID`-Entscheidung und ist damit fuer eine Mutation durch den alten Worker veraltet; Verifier-Resultat unter dem aktuellen Kontext ist `REJECTED` mit `LEASE_GENERATION_MISMATCH` oder `FENCING_TOKEN_MISMATCH`.
9. **Exakte Ereignisreihenfolge:** Cancellation gewann; alte Lease endet; neuer Worker committed Reclaim auf `L=21/F=521`; danach versucht der alte Worker Completion, Evidence-Ingestion und Cancellation-Confirmation; anschliessend klassifiziert der aktuelle Worker den Kandidaten und reconciliert.
10. **Linearisierungspunkt:** Reclaim-Commit legt den aktuellen Claim fest; jeder spaetere Mutationsversuch linearisiert nur als Ablehnung am Row-Lock/CAS-Guard.
11. **Ausgefuehrte Operation:** Reclaim, drei stale Mutationsversuche, aktuelle Evidence-Rejection und Recovery-Planung.
12. **Erwartetes CAS-Ergebnis:** Reclaim `APPLIED`; alle alten Mutationen `REJECTED_STALE`; aktuelle Rejection/Recovery genau einmal `APPLIED`.
13. **Erwarteter Jobendzustand:** `CANCELLING` unter `recovery-worker-19`, `L=21/F=521`; kein Resultat und keine Evidence-Consumption.
14. **Erwarteter Runtime-Endzustand:** letzte autoritative Beobachtung `RUNNING`; alter lokaler Kandidat `REJECTED`.
15. **Erwartete AuditEvents:** genau einmal `RECLAIMED`; stale Mutation `LEASE_LOST` nach der trusted Klassifikation und genau einmal `EVIDENCE_REJECTED` mit exaktem Generation-/Fence-Reason; kein `COMPLETED`, `CANCELLED` oder `CANCEL_STUCK`.
16. **Erwartete InboxEvents:** stale Deliveries werden ohne Fachwirkung als abgelehnt abgeschlossen; aktuelle Recovery-Delivery genau einmal.
17. **Erwartete OutboxEvents:** keine stale Fachwirkung; hoechstens genau ein aktueller Recovery-/Statusquery-Intent, kein Erfolg oder `JobCancelled`.
18. **Retry-/Recovery-Verhalten:** ausschliesslich `recovery-worker-19` darf mit aktuellem Claim Budget und Runtime-Status reconciliieren.
19. **Verbotene Seiteneffekte:** kein Commit durch alten Owner, keine Cross-Generation-Consumption, keine Resultatpublikation, kein doppelter Attempt/Retry.
20. **Negative Assertions:** lokales Resultat oder lokaler Kandidat des alten Workers kann weder `SUCCEEDED` noch `CANCELLED` setzen; Reclaim allein erzeugt keine Termination-Evidence.
21. **Erforderliche Verifikation:** zwei kontrollierte DB-Sessions und Barrieren; Assertions fuer Claim/Fence, CAS-Rollback, Job/Resultat/Evidence/Audit/Inbox/Outbox vor und nach jedem Versuch.
22. **Erwartetes Gate-Ergebnis:** `PASS - DEVELOPMENT_ONLY`; jede stale Fachwirkung oder Evidence-Consumption ist `BLOCK`.

#### AT-20 - Crash nach Evidence-Verifikation vor Cancellation-Commit

1. **Test-ID und Name:** `AT-20 - Crash nach Evidence-Verifikation vor Cancellation-Commit`.
2. **Akzeptanzkriterium:** AC3, AC5, AC6 und AC8.
3. **Initialer persistenter Jobzustand:** `job-20`, Version 91, `CANCELLING`; `cancel-20` `ACCEPTED` bei Sequence 170; Attempt 3 von 3 abgeschlossen; keine Completion Sequence, kein Resultat.
4. **Initialer Runtime-Zustand:** terminal `TERMINATED`, Watermark 801.
5. **Lease Owner:** vor Crash `old-worker-20`, nach Reclaim `recovery-worker-20`.
6. **Lease Generation:** Evidence wurde gueltig unter 30 verifiziert; aktueller Reclaim hat Generation 31.
7. **Fencing Token:** Evidence wurde gueltig unter 630 verifiziert; aktueller Fence ist 631.
8. **Vorhandene Evidence:** `PROCESS_EXIT_ATTESTATION` ist vor dem Crash append-only mit `VALID`, Digest, allen Scope-Bindungen, Cancellation Sequence 170 und `L=30/F=630` committed, aber noch nicht konsumiert; sie ist gueltig, nicht replayt und nach Abschnitt 6.2 weiter verwertbar.
9. **Exakte Ereignisreihenfolge:** Cancellation gewann; letzter Attempt endete; alter Worker committed die Verifikationsentscheidung; crasht vor Jobtransition; Lease endet; neuer Worker committed Reclaim; fragt Status ab; laedt den unveraenderten Evidence-Kandidaten und die bestehende `VALID`-Entscheidung vor der Budgetentscheidung; ruft denselben Verifier mit dem aktuellen `expectedContext` auf; der Verifier prueft Kandidat, gespeicherte Entscheidung, Scope, Cancellation Sequence, historische Bindung sowie aktuelle Reclaim-Berechtigung erneut und liefert idempotent dieselbe `VALID`-Entscheidung mit identischer Evidence-ID und identischem Digest; danach sperrt der aktuelle Worker `job-20`, konsumiert die Evidence genau einmal und committed `CANCELLED`.
10. **Linearisierungspunkt:** erst der `CANCELLED`-Commit des aktuellen Workers unter Row-Lock/CAS; Evidence-Commit allein ist kein Jobzustandswechsel.
11. **Ausgefuehrte Operation:** Crash-Recovery, Reclaim, verpflichtende idempotente Re-Verifikation des vorhandenen Kandidaten gegen den aktuellen Context und anschliessende einmalige Consumption der bereits gueltig persistenten Evidence. Die Re-Verifikation erzeugt keine zweite persistierte Verifikationsentscheidung.
12. **Erwartetes CAS-Ergebnis:** Evidence-Commit und Reclaim jeweils `APPLIED`; finaler `CANCELLED`-Commit `APPLIED` unter `L=31/F=631`; alter Worker danach `REJECTED_STALE`.
13. **Erwarteter Jobendzustand:** `CANCELLED`, Evidence-Referenz konsumiert; niemals `CANCEL_STUCK`.
14. **Erwarteter Runtime-Endzustand:** terminal `TERMINATED`, Watermark mindestens 801.
15. **Erwartete AuditEvents:** im gesamten Testverlauf genau einmal `EVIDENCE_VERIFIED`, `RECLAIMED`, `CANCEL_CONFIRMED` und `CANCELLED`; die idempotente Re-Verifikation erzeugt kein zweites AuditEvent `EVIDENCE_VERIFIED`; kein `CANCEL_STUCK`.
16. **Erwartete InboxEvents:** ursprüngliche Evidence-Delivery bleibt mit ihrem `VALID`-Entscheid abgeschlossen; Recovery-Delivery wird genau einmal als `CANCELLED` abgeschlossen.
17. **Erwartete OutboxEvents:** genau einmal `JobCancelled`; kein erneuter Runtime-Cancel, `CancellationStuck`, Hold oder Erfolgs-Event.
18. **Retry-/Recovery-Verhalten:** Recovery MUSS den bestehenden Kandidaten vor Limit-/Attempt-Entscheidung ueber denselben Verifier gegen den aktuellen Context idempotent erneut pruefen und die bestaetigte bestehende `VALID`-Entscheidung danach konsumieren; kein vierter Attempt.
19. **Verbotene Seiteneffekte:** keine Ablehnung nur wegen Reclaim, keine zweite persistierte Verifikationsentscheidung, kein zweites `EVIDENCE_VERIFIED`-AuditEvent, keine zweite Consumption, kein Stuck-Hold, kein Resultat. Die durch AC8.3 verlangte idempotente Re-Verifikation selbst ist ausdruecklich erforderlich und nicht verboten.
20. **Negative Assertions:** Evidence-Commit allein setzt Job nicht `CANCELLED`; Crash verliert committede Evidence nicht; alter Worker darf nach Reclaim nicht transitionieren.
21. **Erforderliche Verifikation:** deterministischer Crashpunkt zwischen Evidence- und Jobcommit, neuer Claim, Nachweis des erneuten Aufrufs desselben Verifiers mit aktuellem `expectedContext` und identischer Rueckgabeentscheidung sowie DB-Assertions, dass Evidence-Entscheidungszeile, `EVIDENCE_VERIFIED`-Audit, Generation/Fence, Consumption, Inbox und Outbox keine Doppelwirkung besitzen.
22. **Erwartetes Gate-Ergebnis:** `PASS - DEVELOPMENT_ONLY`; `CANCEL_STUCK`, vierter Attempt oder verlorene/zweifach konsumierte Evidence ist `BLOCK`.

### 10.2 Vollstaendige Traceability-Matrix

#### Akzeptanzkriterien zu positiven und negativen Tests

| Akzeptanzkriterium | Positive Tests | Negative Tests |
|---|---|---|
| AC1 gemeinsame Row-Lock-/CAS-Linearisierung | AT-01, AT-02, AT-03, AT-04 | AT-03, AT-04, AT-21 |
| AC2 Gewinnerfolgen fuer Completion/Cancellation | AT-01, AT-02 | AT-18, AT-21 |
| AC3 strukturierte verifizierte Evidence | AT-05, AT-09, AT-16, AT-20 | AT-10, AT-11, AT-12, AT-13, AT-14, AT-22 |
| AC4 FakeRuntime-Paritaet und Trust-Grenze | AT-22 | AT-22 mit jeder ungueltigen Variante und Production-Profil |
| AC5 Fehler, Timeout, Recovery und `CANCEL_STUCK` | AT-06, AT-07, AT-08, AT-15, AT-16, AT-17, AT-20 | AT-07, AT-17, AT-19 |
| AC6 terminale Monotonie | AT-21 | AT-18, AT-19, AT-21 |
| AC7 vollstaendige Wahrheitstabelle | AT-01 bis AT-20 und AT-23 | AT-03, AT-04, AT-10 bis AT-14, AT-19, AT-21, AT-22 |
| AC8 formal vollstaendige Akzeptanztests | AT-01 bis AT-23; insbesondere AT-09, AT-15, AT-16, AT-17, AT-19, AT-20 | AT-10 bis AT-14, AT-17, AT-19, AT-21, AT-22 |
| AC9 gemeinsamer Review-Gate-Ausgang | positive Suite AT-01 bis AT-23 auf einem fixierten Digest plus Architect-, Reviewer- und Security-PASS | jede Abweichung eines Tests oder Reviews ergibt `BLOCK` |

AC8 wird insbesondere durch die positiven Evidence-/Recovery-Faelle AT-09, AT-15, AT-16 und AT-20 sowie durch die fail-closed Faelle AT-10 bis AT-14, AT-17, AT-19, AT-21 und AT-22 abgedeckt. AT-16 und AT-20 beweisen, dass `VALID` Evidence vor der Retry-Limit-Entscheidung gewinnt; AT-17 beweist `CANCEL_STUCK` GENAU DANN ohne solche Evidence; AT-15 beweist, dass verbleibendes Budget `CANCEL_STUCK` verbietet.

#### Wahrheitstabellenzeilen zu Akzeptanztests

| Wahrheitstabellenzeile | AT-ID | Dauerhafter Gewinner und Ziel |
|---|---|---|
| WT-01 | AT-01 | Completion; `SUCCEEDED`, danach `CANCEL_REJECTED_TOO_LATE` |
| WT-02 | AT-02 | Cancellation; `CANCELLING`, `LATE_RESULT_DISCARDED` |
| WT-03 | AT-03 | Completion-CAS; `SUCCEEDED` |
| WT-04 | AT-04 | Cancellation-CAS; `CANCELLING` |
| WT-05 | AT-05 | Cancellation plus `VALID` Evidence; `CANCELLED` |
| WT-06 | AT-06 | Cancellation bleibt wirksam; `CANCELLING` |
| WT-07 | AT-07 | Cancellation bleibt wirksam; `CANCELLING` |
| WT-08 | AT-08 | Cancellation bleibt wirksam; `CANCELLING` bis Reconciliation |
| WT-09 | AT-09 | Cancellation plus `VALID` Evidence; `CANCELLED` |
| WT-10 | AT-10, AT-11 | Cancellation bleibt wirksam; Ausgangszustand unveraendert |
| WT-11 | AT-15, AT-17 | bei Budget `CANCELLING`, ohne Budget `CANCEL_STUCK` |
| WT-12 | AT-16 | `VALID` Evidence gewinnt vor Limit; `CANCELLED` |
| WT-13 | AT-17 | Cancellation ohne Evidence nach Limit; `CANCEL_STUCK` |
| WT-14 | AT-18 | Cancellation; `CANCELLING`, Resultat `LATE_RESULT_DISCARDED` |
| WT-15 | AT-19 | aktueller Reclaim; `CANCELLING`, stale Wirkung abgelehnt |
| WT-16 | AT-12 | Cancellation bleibt wirksam; Ausgangszustand unveraendert |
| WT-17 | AT-13 | Cancellation bleibt wirksam; Ausgangszustand unveraendert |
| WT-18 | AT-14 | erste Consumption; identischer Replay idempotent, Cross-Scope rejected |
| WT-19 | AT-23 | erster Cancel- oder vorheriger Completion-Commit; gespeicherte Entscheidung unveraendert |
| WT-20 | AT-20 | Cancellation plus committede `VALID` Evidence; `CANCELLED` |

#### Jede AT-ID zu eindeutigem Zielzustand und Gate-Ausgang

| AT-ID | Exakt definierter Zielzustand | Erwarteter Gate-Ausgang |
|---|---|---|
| AT-01 | `SUCCEEDED`; Request `REJECTED_TOO_LATE` | `PASS - DEVELOPMENT_ONLY` |
| AT-02 | `CANCELLING`; Resultat `LATE_RESULT_DISCARDED` | `PASS - DEVELOPMENT_ONLY` |
| AT-03 | `SUCCEEDED`; Cancel-CAS ohne Fachwirkung | `PASS - DEVELOPMENT_ONLY` |
| AT-04 | `CANCELLING`; Completion discarded | `PASS - DEVELOPMENT_ONLY` |
| AT-05 | `CANCELLED` mit konsumierter `VALID` Evidence | `PASS - DEVELOPMENT_ONLY` |
| AT-06 | `CANCELLING` | `PASS - DEVELOPMENT_ONLY` |
| AT-07 | `CANCELLING` | `PASS - DEVELOPMENT_ONLY` |
| AT-08 | `CANCELLING` bis nachfolgender evidenz-/budgetabhaengiger Reconciliation | `PASS - DEVELOPMENT_ONLY` |
| AT-09 | `CANCELLED` aus `CANCELLING`; Variante S `CANCELLED` aus `CANCEL_STUCK` | `PASS - DEVELOPMENT_ONLY` |
| AT-10 | jeweiliger initialer `CANCELLING`- oder `CANCEL_STUCK`-Zustand unveraendert | `PASS - DEVELOPMENT_ONLY` |
| AT-11 | jeweiliger initialer `CANCELLING`- oder `CANCEL_STUCK`-Zustand unveraendert | `PASS - DEVELOPMENT_ONLY` |
| AT-12 | jeweiliger initialer `CANCELLING`- oder `CANCEL_STUCK`-Zustand unveraendert | `PASS - DEVELOPMENT_ONLY` |
| AT-13 | jeweiliger initialer `CANCELLING`- oder `CANCEL_STUCK`-Zustand unveraendert | `PASS - DEVELOPMENT_ONLY` |
| AT-14 | Same-Scope-Replay bleibt `CANCELLED`; Cross-Scope-Variante behaelt ihren initialen `CANCELLING`- oder `CANCEL_STUCK`-Zustand | `PASS - DEVELOPMENT_ONLY` |
| AT-15 | `CANCELLING`, Attempt 2 geplant | `PASS - DEVELOPMENT_ONLY` |
| AT-16 | `CANCELLED`, kein `CANCEL_STUCK` | `PASS - DEVELOPMENT_ONLY` |
| AT-17 | `CANCEL_STUCK` | `PASS - DEVELOPMENT_ONLY` |
| AT-18 | `CANCELLING`; Resultat `LATE_RESULT_DISCARDED` | `PASS - DEVELOPMENT_ONLY` |
| AT-19 | `CANCELLING` unter aktuellem Claim; stale Wirkungen abgelehnt | `PASS - DEVELOPMENT_ONLY` |
| AT-20 | `CANCELLED` mit der vor Crash committeden `VALID` Evidence | `PASS - DEVELOPMENT_ONLY` |
| AT-21 | initial `SUCCEEDED` beziehungsweise `CANCELLED` jeweils unveraendert | `PASS - DEVELOPMENT_ONLY` |
| AT-22 | gueltige Dev/Test-Variante `CANCELLED`; jede ungueltige Variante behaelt ihren initialen Zustand | `PASS - DEVELOPMENT_ONLY` |
| AT-23 | erster Commit: `CANCELLING` oder, bei vorherigem Completion-Commit, `SUCCEEDED` plus `REJECTED_TOO_LATE` | `PASS - DEVELOPMENT_ONLY` |

Die AT-IDs bilden die lueckenlose Menge `AT-01` bis `AT-23`; jede ID ist genau einmal als primaere Tabellenzeile vergeben. Varianten innerhalb einer ID sind durch ihren initialen Zustand getrennt und besitzen oben jeweils einen eindeutigen Zielzustand. Keine Variante erlaubt einen anderen dauerhaften Gewinner als die zugeordnete Wahrheitstabellenzeile.

## 11. Dokumentierte Auswirkungen auf eine spaetere Implementierung

Diese Entscheidung implementiert nichts. Ein separater neuer Task mit neuem Arbeitsvertrag muss spaeter mindestens:

- eine additive persistente Evidence-/Verification-/Consumption-Struktur und die oben definierte Verifier-Grenze schaffen;
- die derzeitige stringbasierte `confirmCancelled`-Berechtigung entfernen oder so absichern, dass ohne `VALID` Evidence-Referenz kein `CANCELLED` committed werden kann;
- Runtime-Snapshot-Beobachtung und autoritative Job-Completion samt `LATE_RESULT_DISCARDED` trennen;
- Completion und Cancellation nach demselben Row-Lock/CAS-/Version-Vertrag implementieren;
- Recovery vor jedem Retry und vor `CANCEL_STUCK` zur vollstaendigen Reconciliation verpflichten;
- alle Akzeptanztests dieses Dokuments sowie die dann geltenden Projekt-Pflichtgates ausfuehren.

Die bestehenden Enum-Werte `PROCESS_TERMINATED` und `RECOVERY_CONFIRMED` bleiben ohne strukturierte Evidence unzureichend. Der aktuelle Code- und Migrationsstand ist durch diese Dokumentationsentscheidung nicht repariert und bleibt blockiert.

## 12. Referenzen

- `AGENTS.md`
- `PROJECT_STATE.md`
- `docs/architecture/workflow-state-machine.md`
- `docs/architecture/worker-fake-runtime-01.md`
- `docs/architecture/worker-concurrency-hardening-01.md`
- `docs/architecture/postgres-worker-transaction-fix-01.md`
- `docs/architecture/persistent-cancellation-semantics-01.md`
- `docs/architecture/data-model.md`
- bestehende Zustands-, Repository-, Runtime- und Migrationsdefinitionen unter `packages/**/src`, `apps/worker/src` und `packages/database/migrations`

## 13. Review- und Abschlussprotokoll

Architect: `PASS - DEVELOPMENT_ONLY`.

Architect-Begruendung: Der erfolgreiche PostgreSQL-Commit der autoritativen Jobtransition unter gemeinsamem Row-Lock und CAS ist der alleinige Linearisierungspunkt. Ein Runtime-Snapshot ist eine Beobachtung, Runtime-Beobachtung und fachliche Disposition sind getrennt, `CANCELLED` verlangt verifizierte Evidence, und die definierte Reconciliation loest die bekannten Architekturblocker widerspruchsfrei auf.

Reviewer: `BLOCK` auf dem reparierten normativen Digest `74bcbed5da6a70b5c4539a77cbb2dbeecc6547a9ed44033a797e6a47e794cf1e`.

Reviewer-Begruendung: Linearisierung, Evidence-Vertrag, Zustandssemantik, Wahrheitstabelle und Referenzdiffs sind inhaltlich widerspruchsfrei. Akzeptanzkriterium 8 ist formal nicht vollstaendig erfuellt, weil einzelne nummerierte Akzeptanztests noch nicht in jeder Tabellenzelle alle verlangten expliziten Angaben enthalten.

Security: `PASS - DEVELOPMENT_ONLY` auf demselben reparierten normativen Digest.

Security-Begruendung: Der Vertrag bleibt fail-closed gegen falsches `CANCELLED`, manipulierte, alte, scopefremde und replayte Evidence, Fake-Evidence ausserhalb Development/Test, stale Generation/Fence, Resultatpublikation nach Cancellation und unbelegte Recovery. Die Reparatur hat keine neue Security-Luecke eingefuehrt.

Repair ordinal: `1/1`.

Gepruefter Stand:

- Normative Abschnitte 1 bis 12, SHA-256 `74bcbed5da6a70b5c4539a77cbb2dbeecc6547a9ed44033a797e6a47e794cf1e`.
- Whole-file vor Abschlussprotokoll-Finalisierung, SHA-256 `f4d24d7bf2eb26020566d9f113012a2b8c228d9b0f385a326457fbe73f903ab1`.
- Referenzierende Dokumentationsaenderungen in `PROJECT_STATE.md`, `docs/architecture/workflow-state-machine.md`, `docs/architecture/data-model.md` und `docs/architecture/persistent-cancellation-semantics-01.md`.
- Keine Aenderung an Anwendungscode, Tests, Migrationen, generierten Artefakten oder Laufzeitkonfiguration.

Ausgefuehrte Pruefungen:

- Architect read-only: `PASS - DEVELOPMENT_ONLY`.
- Reviewer read-only Erstpruefung: dokumentarischer Repair erforderlich.
- Dokumentations-Repair ordinal `1/1`: Fake-Evidence-Matrix, Evidence aus `CANCEL_STUCK`, parallele identische Cancels, exakte Owner-Freigabeformel und Stuck-Hold-Gate ergaenzt.
- Reviewer read-only Re-Review: `BLOCK` nur fuer Akzeptanzkriterium 8.
- Security read-only Erstpruefung und Re-Review: jeweils `PASS - DEVELOPMENT_ONLY`.
- `git diff --check`: bestanden.
- Test, Typecheck, Lint und Build: nicht ausgefuehrt, weil der Task ausschliesslich Dokumentation aendert und Anwendungscode ausdruecklich nicht veraendert werden durfte.
- Legal-Review: gemaess Owner-Auftrag nicht ausgefuehrt.

### Strukturierter Blocker

- Nicht erfuelltes Akzeptanzkriterium: Arbeitsvertrag AC8. Jeder nummerierte Akzeptanztest muss Linearisierungspunkt, erlaubte Ausgangszustaende, Zielzustand, Evidence, AuditEvent, Inbox-/Outbox- sowie Retry-/Recovery-Verhalten explizit dokumentieren.
- Reproduzierbare Evidenz im normativen Digest: AT-15 benennt das AuditEvent nur als `Retry-Planung` statt als eindeutigen Event-Typ; AT-16 und AT-17 benennen weder den erlaubten Ausgangszustand `CANCELLING` noch den jeweiligen autoritativen Row-Lock/CAS-Transition-Commit; AT-19 benennt fuer Reclaim/altes Fencing Token weder den autoritativen Ausgangs- noch den konkreten unveraenderten Zielzustand; AT-09 laesst gegenueber WT-09 `CANCEL_CONFIRMED` im erwarteten Audit aus; AT-20 benennt fuer Recovery nach dem Evidence-Crash weder den erlaubten Ausgangszustand noch den autoritativen Row-Lock/CAS-Commit.
- Betroffener Scope: ausschliesslich Abschnitt 10 dieses Dokumentes; keine inhaltliche Aenderung des bestaetigten Linearisierungs-, Evidence-, Recovery- oder Security-Vertrags erforderlich.
- Verbrauchter Reparaturdurchlauf: `1/1`.
- Erforderliche manuelle Entscheidung: Der Owner muss einen neuen dokumentationsbasierten Task mit neuem unveraenderlichem Arbeitsvertrag autorisieren oder ausdruecklich entscheiden, wie die verbleibenden formalen Akzeptanztest-Luecken behandelt werden. Eine zweite automatische Reparatur in diesem Task ist verboten.
- Zielmeilenstein: unmittelbarer dokumentationsbasierter Folge-Task vor jeder erneuten Implementierung von Persistent Cancellation Semantics.
- Freigabewirkung: keine Implementierungs-, Release-Candidate- oder Produktionsfreigabe. Der bestehende Implementierungsstand bleibt blockiert. Production deployment bleibt `DISABLED`.

Abschlussstatus: `BLOCKED`.

`CANCELLATION CONTRACT NEEDS OWNER DECISION`

## 14. Formalisierungsprotokoll `CANCELLATION-CONTRACT-FORMALIZATION-02`

Dieser Abschnitt protokolliert den neuen, vom historischen Abschluss in Abschnitt 13 getrennten Formalisierungs-Task. Er gehoert nicht zum Hashbereich der normativen Abschnitte 1 bis 12.

- Abschlussstatus: `PASSED`.
- Writer-Identitaet: ausschliesslich `writer`; Writer-Zugriff ist mit dieser Abschlussdokumentation beendet.
- Repair ordinal: `1/1`; der einzige zulaessige Dokumentations-Reparaturdurchlauf wurde fuer die eindeutige Trennung des AT-09-Retry-Verhaltens und der idempotenten AT-20-Re-Verifikation verbraucht.
- Gepruefter normativer Stand: Abschnitte 1 bis 12, beginnend mit Byte 0 und endend unmittelbar vor der Zeile `## 13. Review- und Abschlussprotokoll`.
- Kanonisierung fuer den Digest: UTF-8 ohne BOM; Zeilenenden auf LF normalisiert; der Endstand des Hashbereichs einschliesslich der Leerzeilen unmittelbar vor Abschnitt 13 wird verwendet.
- SHA-256 des normativen Vertrags: `58e44fe0a3638d25bdf34dc5aff8551872796486c343904923cb4f41150a4b9f`.
- Formale Eigenpruefung: AT-09, AT-15, AT-16, AT-17, AT-19 und AT-20 besitzen jeweils exakt 22 nummerierte Felder; die primaere AT-Menge ist lueckenlos und eindeutig `AT-01` bis `AT-23`; alle 20 Wahrheitstabellenzeilen sind mindestens einer AT-ID zugeordnet; jede AT-ID besitzt einen definierten Zielzustand und Gate-Ausgang.
- Konsistenzpruefung: keine normativen offenen Markierungen, Platzhalter oder unbestimmten Formulierungen; AuditEvent-, Status-, Dispositions- und Reason-Code-Schreibweisen sind getrennt definiert.
- Dateiscope: ausschliesslich `docs/architecture/cancellation-contract-decision-01.md` und, nach vollstaendigem Review-PASS, `PROJECT_STATE.md` geaendert; kein Anwendungscode, Testcode, Datenbankschema, keine Migration und keine Completion-ID-Aenderung.
- Pflichtpruefung: `git diff --check` bestanden. Test, Typecheck, Lint und Build wurden nicht ausgefuehrt, weil der unveraenderliche Task ausschliesslich Dokumentation erlaubt.
- Architect: `PASS - DEVELOPMENT_ONLY`; die bereits akzeptierte Semantik blieb unveraendert.
- Security: `PASS - DEVELOPMENT_ONLY`; die bereits akzeptierte fail-closed Semantik blieb unveraendert.
- Reviewer: `PASS`; AC8, AT-09, AT-15, AT-16, AT-17, AT-19, AT-20 und die Traceability-Matrix sind formal vollstaendig.
- Legal-Review: gemaess Owner-Auftrag nicht ausgefuehrt.
- Freigabe: `APPROVED - DEVELOPMENT ONLY`. Diese Vertragsfreigabe ist keine Implementierungs-, Release-Candidate- oder Produktionsfreigabe. Production deployment bleibt `DISABLED`.
