<!-- markdownlint-disable MD033 MD041 -->
<p align="center">
  <img src="./assets/banner.svg" alt="PGAutoPilot Dashboard" width="600">
</p>

<p align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/MIT_License-111111?style=for-the-badge&logo=opensourceinitiative&logoColor=33FF99" alt="MIT License">
  </a>
  <a href="package.json">
    <img src="https://img.shields.io/badge/Node_18+-111111?style=for-the-badge&logo=nodedotjs&logoColor=33FF99" alt="Node.js 18+">
  </a>
  <a href="https://react.dev">
    <img src="https://img.shields.io/badge/React_18-111111?style=for-the-badge&logo=react&logoColor=33FF99" alt="React 18">
  </a>
  <a href="https://expressjs.com">
    <img src="https://img.shields.io/badge/Express-111111?style=for-the-badge&logo=express&logoColor=33FF99" alt="Express">
  </a>
  <a href="https://www.postgresql.org">
    <img src="https://img.shields.io/badge/PostgreSQL-111111?style=for-the-badge&logo=postgresql&logoColor=33FF99" alt="PostgreSQL">
  </a>
  <a href="https://tailwindcss.com">
    <img src="https://img.shields.io/badge/Tailwind_v4-111111?style=for-the-badge&logo=tailwindcss&logoColor=33FF99" alt="Tailwind CSS v4">
  </a>
</p>

<p align="center">
  <strong>The PGAutoPilot dashboard.</strong> A hardened database management interface built on the same safety model as the MCP server.
</p>

<p align="center">
  <code>pnpm dev</code> &nbsp;·&nbsp; <code>pnpm build</code> &nbsp;·&nbsp; <code>pnpm start</code>
</p>
<!-- markdownlint-enable MD033 MD041 -->

---

The PGAutoPilot dashboard is a production-grade PostgreSQL management
interface — a React + Vite + Tailwind CSS v4 app backed by a hardened Express
API. It's an isolated pnpm workspace that reuses the MCP server's safety
layer (redaction, blocked tables, read-only mode, the dangerous-function
gate) through an HTTP-friendly port of `packages/core`, so every action the
dashboard takes is subject to the exact same guarantees as the MCP tools.

```text
Tables       Tools          SQL editor    Schema
Migrations   Settings       Health        Read-only mode
Token auth   Localhost-first              Versioned SQL migrations
```

---

## Contents

- [Install](#install)
- [Workspace layout](#workspace-layout)
- [Features](#features)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API](#api)
- [Migrations](#migrations)
- [Security](#security)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

---

## Install

**Requirements:** Node.js 18+ · pnpm 9+ · PostgreSQL 12+ (local, remote, Docker, or cloud) · any modern browser.

```bash
pnpm install
```

---

## Workspace layout

```text
web/
  apps/api            Express API (auth, tool gateway, schema, migrations)
  apps/web             React + Vite + Tailwind v4 SPA
  packages/contracts   zod schemas + request/response DTOs shared across the wire
  packages/api-client  typed fetch client generated against packages/contracts
  packages/ui          presentational component library (design system)
  packages/core        HTTP-friendly port of the MCP tool/safety layer
  packages/config      shared tsconfig + eslint presets
```

Dependency direction is strictly inward: `apps/* -> packages/*` — packages never depend on apps.

---

## Features

| Category   | Features                                                   |
| ---------- | ---------------------------------------------------------- |
| Tables     | Browse, filter, paginate, and inspect live table data      |
| Tools      | Run the safe MCP tools with params, pretty/raw JSON output |
| SQL editor | Write, format, and execute SELECT queries against the DB   |
| Schema     | Explore tables, columns, constraints, and relations        |
| Migrations | List and apply versioned SQL migrations                    |
| Settings   | Connection, safety, and runtime configuration              |
| Health     | Live API + database diagnostics                            |
| Safety     | Read-only mode, token auth, redaction, blocked tables      |

---

## Quick Start

**1. Install** — `pnpm install`

**2. Point it at your database:**

```bash
cp .env.example .env
```

```env
DATABASE_URL=postgresql://user:password@localhost:5432/yourdb
PORT=3000
HOST=127.0.0.1
```

No Docker? See [Run your own PostgreSQL (no Docker)](../README.md#run-your-own-postgresql-no-docker)
in the main README for native setup plus pgAdmin/`psql` guidance.

**3. Run in development:**

```bash
pnpm dev
```

Starts the API (default `http://127.0.0.1:3000`) and the Vite dev server with hot reload, proxying `/api` to the backend.

**4. Open the dashboard** — served by Vite in development. After `pnpm build`, the API also serves `apps/web/dist` directly, so the full app runs monolithically at the API port.

---

## Configuration

### API (`apps/api`)

| Variable                    | Default        | What it does                                              |
| --------------------------- | -------------- | --------------------------------------------------------- |
| `DATABASE_URL`              | _(required)_   | PostgreSQL connection string                              |
| `PORT`                      | `3000`         | Port the API binds to                                     |
| `HOST`                      | `127.0.0.1`    | Bind address (localhost by default)                       |
| `DASHBOARD_TOKEN`           | -              | Bearer token required on all `/api/*` routes when set     |
| `ALLOW_NO_AUTH`             | `false`        | Allow production start without a token                    |
| `PG_STATEMENT_TIMEOUT_MS`   | `10000`        | Max time for a single query (ms)                          |
| `MIGRATIONS_DIR`            | `./migrations` | Directory holding versioned SQL migrations                |
| `BACKUPS_DIR`               | `./backups`    | Where `db_backup` saves files                             |
| `DOCKER_CONTAINER`          | -              | Docker container name for `pg_dump` fallback              |
| `BLOCKED_TABLES`            | -              | Tables to block writes on (comma-separated)               |
| `HIGH_RISK_TABLES`          | -              | Tables that warn but allow writes (comma-separated)       |
| `SENSITIVE_COLUMNS`         | -              | Extra columns to redact (comma-separated)                 |
| `ALLOW_WRITES`              | -              | Set `true` to enable write tools (read-only by default)   |
| `DISABLED_TOOLS`            | -              | Tools to disable entirely (comma-separated)               |
| `READONLY`                  | `false`        | `true` blocks every write, even with `ALLOW_WRITES=true`  |
| `NODE_ENV`                  | `development`  | `production` masks errors and disables per-request logs   |
| `RATE_LIMIT_MAX`            | -              | Requests per window for tool/migration endpoints          |
| `RATE_LIMIT_WINDOW_MS`      | `60000`        | Rate-limit window                                         |
| `AUTH_RATE_LIMIT_MAX`       | `30`           | Failed-auth throttle when token auth is on                |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `60000`        | Failed-auth throttle window                               |
| `TRUST_PROXY`               | -              | Proxy trust when deployed behind a reverse proxy          |

### Web (`apps/web`)

| Variable               | Default | What it does                                             |
| ---------------------- | ------- | -------------------------------------------------------- |
| `VITE_API_BASE`        | `/api`  | Base URL for the API (same-origin proxy by default)      |
| `VITE_DASHBOARD_TOKEN` | -       | Bearer token sent on every request (match the API token) |

---

## API

All endpoints are mounted under `/api`. Token auth, rate limiting, and error masking apply when configured.

| Method | Path                             | What it does                           |
| ------ | -------------------------------- | -------------------------------------- |
| GET    | `/api/health`                    | API + database diagnostics             |
| GET    | `/api/tools`                     | List the safe MCP tools                |
| POST   | `/api/tools/:name`               | Execute a tool with validated params   |
| GET    | `/api/schema`                    | Live schema introspection              |
| GET    | `/api/migrations`                | List applied + pending migrations      |
| POST   | `/api/migrations/apply`          | Apply all pending migrations           |
| POST   | `/api/migrations/apply-selected` | Apply specific migrations by version   |
| POST   | `/api/migrations/apply/:version` | Apply a single migration               |
| GET    | `/api/config`                    | Current safety/read-only/version state |

Tool execution passes through `packages/core`: sensitive-column redaction, blocked-table checks, read-only enforcement, the raw-query dangerous-function gate, and write confirmation requirements.

---

## Migrations

Versioned SQL migrations live in `apps/api/migrations` (default `MIGRATIONS_DIR`). Applied versions are tracked in the `schema_migrations` table.

| File                     | What it does                                        |
| ------------------------ | --------------------------------------------------- |
| `001_initial_schema.sql` | Base schema: organizations, users, orders, invoices |
| `002_seed_demo_data.sql` | Demo dataset for the dashboard views                |

Apply pending migrations through the UI, the API (`POST /api/migrations/apply`), or the migration runner in `packages/core`. In read-only mode, all apply endpoints are blocked.

---

## Security

- **Localhost-first** — the API binds to `127.0.0.1` by default; set `DASHBOARD_TOKEN` to require `Authorization: Bearer <token>` on all `/api/*` routes.
- **Same safety model as the MCP server** — every tool call passes through `packages/core`: redaction, blocked tables, read-only mode, the raw-query gate.
- **No CORS by default** — the web app is served same-origin through the Vite proxy; enable and constrain CORS explicitly only if a cross-origin deployment is needed.
- **Masked errors** — production mode returns generic errors so schema details never leak.
- **Rate limiting** — tool execution, migrations, and failed authentication are throttled when configured.

---

## Development

### Commands

| Command          | What it does                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm dev`       | Free conflicting web (5173) / API (3000) ports, then run API + web with hot reload (Turborepo) |
| `pnpm precheck`  | Check the API/web ports and kill processes using them                                          |
| `pnpm build`     | Build all workspace packages                                                                   |
| `pnpm start`     | Build, then run the bundled API (`dist/index.cjs`)                                             |
| `pnpm typecheck` | Full TypeScript type checking across the workspace                                             |
| `pnpm lint`      | ESLint across the workspace                                                                    |
| `pnpm test`      | Unit tests across the workspace                                                                |
| `pnpm format`    | Format all source with Prettier                                                                |

**Verification gate** — run from `web/` before merging:

```bash
pnpm -r typecheck
pnpm -r test
pnpm -r lint
pnpm build
```

**Branch strategy** — dashboard work happens on `main` (or short-lived feature branches merged back after the verification gate), like the rest of the repository. Stage deliberately (`git add <specific files>`), never `git add -A`. Nothing is pushed until tested and approved.

---

## Roadmap

- Authentication and session management UI
- SQL editor with syntax highlighting and safe-query checks
- Schema explorer with constraints and relations
- Table and row management (browse, filter, edit, insert, delete)
- Backups UI (trigger and download `pg_dump` output)
- AI-assisted workflows (natural language to safe SQL, explain/optimize)
- Role-based access control and audit log
- Realtime monitoring (pool stats, slow queries, active sessions)

---

## License

[MIT](LICENSE) &copy; 2026 [Cyber Reinxy](https://github.com/cyberreinxy)
