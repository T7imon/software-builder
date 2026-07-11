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

Die Web-Anwendung läuft anschließend standardmäßig unter `http://localhost:3000`. Die Startseite zeigt **Software Builder**, die Health-Seite ist unter `http://localhost:3000/health` erreichbar. Der Worker startet parallel und schreibt seinen Health-Status in die Konsole.

## Struktur

- `apps/web`: Next.js-Webanwendung mit App Router, TypeScript, Tailwind CSS und ESLint
- `apps/worker`: einfacher Node.js-Worker mit TypeScript
- `packages/core`: gemeinsame Grundtypen
- `packages/database`: Schnittstelle für eine spätere Datenbankanbindung
- `packages/agent-runtime`: Schnittstelle für eine spätere Agent-Laufzeit
- `packages/workflow-engine`: grundlegende Workflow-Statusdefinitionen
- `packages/agent-registry`: grundlegende Rollendefinitionen
- `packages/project-workspace`: Schnittstelle für spätere Projekt-Workspaces
- `packages/github`: Schnittstelle für eine spätere GitHub-Anbindung

## Befehle

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm test
```

## Bewusste Grenzen des FOUNDATION-Meilensteins

Es gibt noch keine Datenbank, keine Codex-SDK-Integration, keine GitHub-Anmeldung und keine automatische Softwareerstellung. Die zugehörigen Pakete definieren ausschließlich stabile Grenzen für spätere Meilensteine.

Die genehmigte Architektur nennt in der älteren Stackentscheidung D-005 `pnpm`. Für diesen FOUNDATION-Schritt wird davon begründet abgewichen, weil die aktuelle, ausdrückliche Nutzeranforderung npm Workspaces verlangt. Die fachliche Architektur und ihre Sicherheitsgrenzen bleiben unverändert; die Architekturdokumente werden dabei nicht umgeschrieben.
