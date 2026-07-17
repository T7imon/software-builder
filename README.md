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

Der separate Worker lauscht nur auf `127.0.0.1`. Sein Health-Check ist standardmäßig unter `http://127.0.0.1:3001/health` erreichbar. Der Port lässt sich mit `WORKER_PORT` konfigurieren; andere Werte für `WORKER_HOST` werden weiterhin fail-closed abgelehnt.

## Struktur

- `apps/web`: Next.js-Webanwendung mit App Router, TypeScript, Tailwind CSS und ESLint
- `apps/worker`: einfacher Node.js-Worker mit TypeScript
- `packages/core`: gemeinsame Grundtypen
- `packages/database`: PostgreSQL-18-Persistenz, Migrationen, Repository-Schicht und Tests; siehe `docs/database.md`
- `packages/agent-runtime`: Agent-Runtime-Vertrag mit `FakeAgentRuntime` und bestandenem read-only Codex-Runtime-Adapter über die lokale `codex exec`-CLI
- `packages/workflow-engine`: Workflow-Zustände sowie bestandene Planning- und Implementation-Orchestrierung; die Implementation ist derzeit synthetisch
- `packages/agent-registry`: Agent Registry und Agent Assignment, jeweils `DEVELOPMENT_ONLY` bestanden
- `packages/project-workspace`: isolierter lokaler Project Workspace, `DEVELOPMENT_ONLY` bestanden
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

## Aktueller Entwicklungsstand und bewusste Grenzen

`CODEX_RUNTIME_ADAPTER_MVP` ist `PASSED - DEVELOPMENT ONLY`. Ein echter read-only PLANNER-Smoke über die gepinnte lokale `codex exec`-CLI bestand mit `SMOKE_EXIT=0`. Agent Registry, Agent Assignment und Planning Orchestrator sind ebenfalls `DEVELOPMENT_ONLY` bestanden. Der Implementation Orchestrator ist bestanden, arbeitet derzeit aber synthetisch; auch der Project Workspace ist nur `DEVELOPMENT_ONLY` freigegeben.

Der nächste verbindliche Meilenstein ist `REAL_RUNTIME_HARDENING`, beginnend mit `COMPLETION-ID-HARDENING-01`. Bis zu seinem vollständigen Closeout bleiben schreibende echte Codex-Executors und die allgemeine operative Aktivierung von `AGENT_RUNTIME=codex` fail-closed. GitHub-Integration und automatische Projektausführung bleiben `NO`; Production deployment bleibt für Builder V1 `DISABLED`. Die bestandenen Komponenten sind weder eine `RELEASE_CANDIDATE`- noch eine Produktionsfreigabe.

Historischer Stackhinweis: Die genehmigte Architektur nannte in der älteren Entscheidung D-005 `pnpm`; das FOUNDATION-Grundgerüst wurde aufgrund der damaligen ausdrücklichen Anforderung mit npm Workspaces umgesetzt. Diese Abweichung änderte die fachliche Architektur und ihre Sicherheitsgrenzen nicht.
