# Software Builder

Dieses Repository enthält das startfähige technische Grundgerüst des Software Builders. Es ist als TypeScript-Monorepo mit npm Workspaces aufgebaut.

## Voraussetzungen

- Node.js 24 oder neuer
- npm 11 oder neuer

## Installation und Start

```bash
npm install
npm run dev
```

Die Web-Anwendung läuft anschließend standardmäßig unter `http://127.0.0.1:3000`. Die Startseite zeigt **Software Builder**, die Health-Seite ist unter `http://127.0.0.1:3000/health` erreichbar. Unter `http://127.0.0.1:3000/api/health` gibt es denselben Status als JSON.

Der separate Worker lauscht nur auf `127.0.0.1`. Sein Health-Check ist standardmäßig unter `http://127.0.0.1:3001/health` erreichbar. Der Port lässt sich mit `WORKER_PORT` konfigurieren; andere Werte für `WORKER_HOST` werden im FOUNDATION-Meilenstein abgelehnt.

## Struktur

- `apps/web`: Next.js-Webanwendung mit App Router, TypeScript, Tailwind CSS und ESLint
- `apps/worker`: einfacher Node.js-Worker mit TypeScript
- `packages/core`: gemeinsame Grundtypen
- `packages/database`: PostgreSQL-18-Persistenz, Migrationen, Repository-Schicht und Tests; siehe `docs/database.md`
- `packages/agent-runtime`: Schnittstelle für eine spätere Agent-Laufzeit
- `packages/workflow-engine`: grundlegende Workflow-Statusdefinitionen
- `packages/agent-registry`: grundlegende Rollendefinitionen
- `packages/project-workspace`: Schnittstelle für spätere Projekt-Workspaces
- `packages/github`: Schnittstelle für eine spätere GitHub-Anbindung
- `packages/security-gates`: fail-closed Schnittstelle für spätere Security-Entscheidungen
- `packages/legal-gates`: fail-closed Schnittstelle für spätere Legal-Entscheidungen

## Befehle

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm test
```

## Bewusste Grenzen des FOUNDATION-Meilensteins

Die PostgreSQL-18-Persistenz des DATABASE-Meilensteins ist vorhanden. Es gibt weiterhin keine Codex-SDK-Integration, keine GitHub-Anmeldung, keine echten Agenten, keinen Workflow-Worker und keine automatische Softwareerstellung. Security- und Legal-Gates besitzen ebenfalls noch keine Auswertung. Produktionsdeployment ist nicht vorgesehen und bleibt deaktiviert.

Die genehmigte Architektur nennt in der älteren Stackentscheidung D-005 `pnpm`. Für diesen FOUNDATION-Schritt wird davon begründet abgewichen, weil die aktuelle, ausdrückliche Nutzeranforderung npm Workspaces verlangt. Die fachliche Architektur und ihre Sicherheitsgrenzen bleiben unverändert; die Architekturdokumente werden dabei nicht umgeschrieben.
