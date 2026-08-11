# PGAutoPilot

![PGAutoPilot](server/assets/banner.svg)

[![MIT License](https://img.shields.io/badge/MIT_License-111111?style=for-the-badge&logo=opensourceinitiative&logoColor=33FF99)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node_18+-111111?style=for-the-badge&logo=nodedotjs&logoColor=33FF99)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-111111?style=for-the-badge&logo=typescript&logoColor=33FF99)](https://www.typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-111111?style=for-the-badge)](https://modelcontextprotocol.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-111111?style=for-the-badge&logo=postgresql&logoColor=33FF99)](https://www.postgresql.org)
[![React](https://img.shields.io/badge/React_18-111111?style=for-the-badge&logo=react&logoColor=33FF99)](https://react.dev)
[![Express](https://img.shields.io/badge/Express-111111?style=for-the-badge&logo=express&logoColor=33FF99)](https://expressjs.com)
[![Tailwind](https://img.shields.io/badge/Tailwind_v4-111111?style=for-the-badge&logo=tailwindcss&logoColor=33FF99)](https://tailwindcss.com)

**Model-agnostic PostgreSQL access for AI assistants, plus a hardened web dashboard.**

PGAutoPilot lets any AI assistant safely explore, query, and manage a
PostgreSQL database in natural language through an MCP server, and gives you a
full management UI through an optional dashboard. Both entry points share the
**exact same safety model** (redaction, blocked tables, read-only mode, the
dangerous-function gate), so every action — whether from an editor or the web
UI — is subject to the same guarantees.

```text
Model-agnostic  PostgreSQL-optimized  Safe writes  Read-only mode
Minimal config  Single executable    Docker       Cloud databases
Connection pool Production-ready     SSL          Schema inspection
```

---

## Contents

- [What is PGAutoPilot?](#what-is-pgautopilot)
- [Repository layout](#repository-layout)
- [The two entry points](#the-two-entry-points)
- [Install](#install)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Safety & Security](#safety--security)
- [Tools](#tools-mcp-server)
- [Examples](#examples)
- [API (dashboard)](#api-dashboard)
- [Migrations (dashboard)](#migrations-dashboard)
- [Docker](#docker)
- [Run your own PostgreSQL (no Docker)](#run-your-own-postgresql-no-docker)
- [Configuration](#configuration)
- [Performance](#performance)
- [Compatibility](#compatibility)
- [Software Signing](#software-signing)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Verification before shipping](#verification-before-shipping)
- [Roadmap](#roadmap)
- [Contributing & License](#contributing--license)

---

## What is PGAutoPilot?

Most database MCP servers expose raw SQL directly and leave destructive
operations largely unguarded. PGAutoPilot takes the opposite stance:

- **Schema-aware** — every identifier is validated against your live database.
- **Production-first** — every write path is guarded by multiple configurable safety layers.
- **Model-agnostic** — works identically with Claude, GPT-4o, Gemini, DeepSeek, Copilot, and open-source models.
- **Two surfaces, one safety model** — the MCP server and the dashboard share the same redaction, blocked-tables, and read-only guarantees.

```text
You: "Show me customers that spent more than $500."
  -> db_aggregate(table="orders", by="customer_id", _sum="total",
       orderBy={"_sum/total": "desc"}, take=5)
  <- 23 customers found
```

---

## Repository layout

The repo is a monorepo with two independent halves — the **MCP server** and
the **dashboard** — each with its own toolchain, kept separate but unified
under one repo and one shared safety model.

```text
root/
│
├─ server/                        MCP core — PostgreSQL MCP server (npm, single executable)
│  ├─ src/
│  │  ├─ index.ts                 MCP server entry point / initialization
│  │  ├─ config.ts                Env loading + validation
│  │  ├─ db.ts                    PostgreSQL connection pool
│  │  ├─ schema.ts                Live schema introspection (information_schema)
│  │  ├─ sqlBuilder.ts            Parameterized, safe SQL builder
│  │  ├─ safety.ts                Redaction, write access, warnings
│  │  ├─ toolDefinitions.ts       Zod schemas for all 14 tools
│  │  ├─ toolHandlers.ts          Tool implementations
│  │  ├─ sqlDump.ts               Backups via pg_dump
│  │  └─ *test.ts                 Colocated vitest tests
│  ├─ dist/                       Compiled + bundled artifact (pgautopilot.bundle.cjs)
│  ├─ scripts/                    bundle / sign / verify installers
│  ├─ docker-compose.yml          PostgreSQL 16 + MCP server
│  └─ package.json                npm package `pgautopilot`
│
└─ web/                           Dashboard — pnpm/Turborepo workspace
   ├─ apps/
   │  ├─ api/                     Express API (auth, tool gateway, schema, migrations, snapshots)
   │  └─ web/                     React + Vite + Tailwind v4 single-page app
   └─ packages/
      ├─ contracts/               Zod schemas + DTOs shared across the wire
      ├─ api-client/              Typed fetch client generated against contracts
      ├─ ui/                      Presentational component library (design system)
      ├─ core/                    HTTP-friendly port of the MCP tool/safety layer
      └─ config/                  Shared tsconfig + eslint presets
```

**Two halves, one safety model.** The `web/` workspace is isolated (its own
`pnpm-lock.yaml`, Turborepo, packages) and depends strictly inward
(`apps/* -> packages/*` — packages never depend on apps). `web/packages/core`
is an HTTP-friendly port of the MCP core's safety layer (`server/src/safety.ts`),
so both entry points enforce identical guarantees. A change to one safety layer
**must** be mirrored in the other, or the two surfaces diverge.

Each half has its own README stub pointing here, and each has its own
verification gate — see [Development](#development) and
[Verification before shipping](#verification-before-shipping).

---

## The two entry points

| Entry point | What it is | Built for |
| ----------- | ---------- | --------- |
| **MCP server** (`server/`) | A single-executable MCP server (`pgautopilot`) that AI assistants talk to over stdio | Running queries/tools from your editor (VS Code, Cursor, Claude Desktop, Zed, …) |
| **Dashboard** (`web/`) | A hardened web UI (React + Express) with tables, tools, SQL editor, schema, migrations, snapshots | Managing the database in a browser, on top of the same safety layer |

The **MCP server** is the primary, fully self-contained artifact. The
**dashboard** is an optional extension that connects to a database through the
same gatekeeping logic.

---

## Install

**Requirements:** Node.js 18+ · PostgreSQL 12+ (local, remote, Docker, or cloud) · any MCP-compatible client (for the server) or a modern browser (for the dashboard).

### MCP server (`server/`)

**npm:**

```bash
npm install -g pgautopilot
```

**No npm — one-line installer** (clones, adds to PATH; re-run to update):

| Platform   | Command                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------- |
| Linux/mac  | `curl -fsSL https://raw.githubusercontent.com/cyberreinxy/pgautopilot/main/install.sh \| bash` |
| Windows    | `irm https://raw.githubusercontent.com/cyberreinxy/pgautopilot/main/install.ps1 \| iex`        |

**Download & run:** `node pgautopilot.bundle.cjs`

**Clone & run:** `git clone https://github.com/cyberreinxy/pgautopilot.git && cd pgautopilot && node server/dist/pgautopilot.bundle.cjs`

**Uninstall:**

| Platform   | Command                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------- |
| Linux/mac  | `curl -fsSL https://raw.githubusercontent.com/cyberreinxy/pgautopilot/main/uninstall.sh \| bash`    |
| Windows    | `irm https://raw.githubusercontent.com/cyberreinxy/pgautopilot/main/uninstall.ps1 \| iex`           |

### Dashboard (`web/`)

```bash
pnpm install
```

Installs are idempotent and signed — see [Software Signing](#software-signing).

---

## Quick Start

### 1. MCP server (AI assistants)

Create a `.env` anywhere on your machine (PGAutoPilot finds it automatically):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/yourdb
```

Connect your AI assistant — identical config for VS Code, Cursor, Windsurf,
Claude Desktop, Zed, JetBrains, Neovim:

```json
{ "mcpServers": { "postgres": { "command": "pgautopilot" } } }
```

Then just ask: _"Show me all tables."_ · _"How many users signed up this month?"_ ·
_"Find orders over $500 by customer."_ · _"Add a product called 'Widget Pro' at $29.99."_

### 2. Dashboard (web UI)

From `web/`:

```bash
pnpm install
cp .env.example .env   # set DATABASE_URL, PORT, HOST, DASHBOARD_TOKEN
pnpm dev               # API on 127.0.0.1:3000 + Vite on :5173 (hot reload)
```

After `pnpm build`, the API also serves the built SPA directly, so the full app
runs monolithically on the API port.

> Without Docker? Get a local database running in minutes with
> [Run your own PostgreSQL (no Docker)](#run-your-own-postgresql-no-docker).

---

## Architecture

```text
AI Assistant
     (Claude / Cursor / GPT / Gemini)
        |
        v
   MCP Protocol
        |
        v
+----------------------------------+
|          PGAutoPilot              |
|                                  |
|  Schema Discovery                 |
|  Identifier Validation            |
|  Safety Policy Engine     <----+  |
|  SQL Builder                   |  |
|  Connection Pool               |  |
|  Tool Handlers (14 tools)      |  |
+---------------------------------+ |
        |                          |
        v                          |
   PostgreSQL      Everything passes through safety
```

Every MCP request flows: natural language → MCP tool call → Zod parameter
validation → live schema lookup → identifier validation → safety policy
evaluation → parameterized SQL generation → time-limited execution →
formatted response. Deterministic at every step. No hidden state, no side effects.

The dashboard follows the same flow through its API: browser → Express →
tool gateway → `packages/core` (a port of the same safety layer) → PostgreSQL.

---

## Safety & Security

### Threat model

PGAutoPilot runs on your machine and connects over the PostgreSQL wire
protocol. The AI assistant communicates only through MCP, and every request
passes the safety layer before reaching PostgreSQL. The `DATABASE_URL`
credential is the sole authentication boundary for the MCP server; the
dashboard adds optional bearer-token auth and binds to `127.0.0.1` by default.

The safety model is shared by both entry points (`server/src/safety.ts` and
`web/packages/core/src/safety.ts`) — a change to one must be mirrored in the
other, or the two surfaces diverge.

### Safety features

| Threat                 | Protection                                         |
| ---------------------- | -------------------------------------------------- |
| SQL injection          | Parameterized queries (never string interpolation) |
| Accidental delete-all  | `confirmAll: true` required                        |
| Full table update      | Warning on >10 rows affected                       |
| Secret exposure        | Automatic redaction on read + strip on write       |
| Unknown table/column   | Live schema validation before query build          |
| Slow queries           | Configurable statement timeout (default 10s)       |
| Connection exhaustion  | Configurable pool limit                            |
| Arbitrary SQL          | `db_raw_query` is SELECT-only, single-statement    |
| Dangerous Postgres fns | Blocked: `pg_read_file`, `COPY`, `pg_sleep`, etc.  |
| Bulk data loss         | Dry-run support on every write tool                |

### Operational guarantees

- Never logs `DATABASE_URL` (hostname only in the startup banner)
- Never exposes redacted fields (passwords, tokens, keys → `***REDACTED***`)
- Never runs multiple SQL statements in one call
- Never `UPDATE`s without live identifier validation
- Never `DELETE`s all rows without `confirmAll: true`
- Never runs raw `INSERT`/`UPDATE`/`DELETE` (use the structured tools)
- Never bypasses schema validation or exceeds the pool max

### Sensitive columns

Columns matching `password`, `token`, `secret`, `api_key`, `private_key`, `ssn`,
`credit_card`, `cvv` (and variants) are auto-redacted on read and stripped on
write. Extend via `SENSITIVE_COLUMNS`.

### Least-privilege database role

Do not connect with a superuser or the application's primary role. Create a
dedicated role per connection mode and point `DATABASE_URL` at it — the Postgres
role is the security boundary, not the client.

```sql
CREATE ROLE mcp_readonly LOGIN PASSWORD 'generate-a-strong-password';
GRANT CONNECT ON DATABASE yourdb TO mcp_readonly;
GRANT USAGE ON SCHEMA public TO mcp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mcp_readonly;
```

For a read/write connection, additionally grant `INSERT`, `UPDATE`, `DELETE` on
the tables the agent may touch. Never grant `SUPERUSER`. For non-loopback hosts,
prefer `PGSSLMODE=verify-full`.

### Dashboard security

- **Localhost-first** — the API binds to `127.0.0.1` by default; set `DASHBOARD_TOKEN` to require `Authorization: Bearer <token>` on all `/api/*` routes.
- **Same safety model as the MCP server** — every tool call passes through `packages/core`.
- **No CORS by default** — the web app is served same-origin through the Vite proxy.
- **Masked errors** — production mode returns generic errors so schema details never leak.
- **Rate limiting** — tool execution, migrations, and failed authentication are throttled when configured.

### Security

- **Responsible disclosure** — report vulnerabilities privately via [GitHub Security Advisories](https://github.com/cyberreinxy/pgautopilot/security/advisories).
- **Signed releases** — every release is SHA-256 checksummed and GPG-signed.
- **Zero runtime dependencies** in the bundled MCP server build.
- **Logging policy** — connection strings are never logged; per-request logs off in `--mode=production`.

---

## Tools (MCP server)

### Read tools

| Tool            | Use when...                                      | Returns                                               |
| --------------- | ------------------------------------------------ | ----------------------------------------------------- |
| `db_overview`   | "What's in this database?"                       | All tables, row counts, relationships                 |
| `db_schema`     | "What columns does each table have?"             | Full column/type/constraint map                       |
| `db_health`     | "Is the connection working?"                     | Pool usage, uptime, latency                           |
| `db_table_info` | "Tell me about the orders table"                 | Columns, indexes, row estimates, size                 |
| `db_find_many`  | "Show recent orders", "Find inactive users"      | Filtered, sorted, paginated rows                      |
| `db_find_first` | "Get user with ID 42"                            | Single matching row                                   |
| `db_count`      | "How many users signed up this week?"            | Row count (all or filtered)                           |
| `db_aggregate`  | "Total sales by category", "Average order value" | Grouped aggregates (count, sum, avg, min, max)        |
| `db_raw_query`  | "I need a custom SELECT"                         | Raw query results (SELECT-only, limited to 5000 rows) |

### Write tools

| Tool             | Use when...                      | Safety                                          |
| ---------------- | --------------------------------- | ----------------------------------------------- |
| `db_create`      | "Add a new user"                  | Dry-run supported, schema-validated             |
| `db_upsert`      | "Create or update this product"   | Dry-run supported, conflict-safe                |
| `db_update_many` | "Update all shipped orders"       | Warns on >10 rows, dry-run supported            |
| `db_delete_many` | "Delete old logs"                 | Warns on >10 rows, `confirmAll` for full clears |

### Maintenance tools

| Tool         | Use when...            | Output                      |
| ------------ | ----------------------- | ---------------------------- |
| `db_backup`  | "Back up the database"  | Full SQL dump via `pg_dump`  |

---

## Examples

**Find recent orders for a customer:**

```text
Prompt: "Show me the last 10 orders for customer 42"
Tool:   db_find_many(table="orders", where={"customer_id": 42}, select=["id","total","status","created_at"], orderBy={"created_at":"desc"}, take=10)
```

**Count products by category:**

```text
Prompt: "How many products in each category?"
Tool:   db_aggregate(table="products", by="category", _count="*", take=5, orderBy={"_count": "desc"})
        -> Electronics: 142, Clothing: 89, Books: 54, ...
```

**Add a record (dry run first, then commit):**

```text
Prompt: "Add Jane Doe with email jane@example.com"
Tool:   db_create(table="users", data={"email":"jane@example.com","name":"Jane Doe"}, dryRun=true)
        -> "Dry run: valid. Proceed?" -> Row inserted with id 105
```

**Bulk delete with confirmation:**

```text
Prompt: "Delete logs from before 2025"
Tool:   db_delete_many(table="logs", where={"created_at":{"lt":"2025-01-01"}}, dryRun=true)
        -> "1,204 rows would be deleted. Confirm? [yes/no]"
```

Every write tool is dry-run capable, and every query produces the exact
parameterized SQL that runs — nothing touches your database silently.

---

## API (dashboard)

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

Tool execution passes through `packages/core`: sensitive-column redaction,
blocked-table checks, read-only enforcement, the raw-query dangerous-function
gate, and write confirmation requirements.

---

## Migrations (dashboard)

Versioned SQL migrations live in `web/apps/api/migrations` (default
`MIGRATIONS_DIR`). Applied versions are tracked in the `schema_migrations` table.

| File                     | What it does                                        |
| ------------------------ | --------------------------------------------------- |
| `001_initial_schema.sql` | Base schema: organizations, users, orders, invoices |
| `002_seed_demo_data.sql` | Demo dataset for the dashboard views                |

Apply pending migrations through the UI, the API (`POST /api/migrations/apply`),
or the migration runner in `packages/core`. In read-only mode, all apply
endpoints are blocked. `001_initial_schema.sql` is idempotent; `002_seed_demo_data.sql`
is not — never assume both are safely re-runnable.

---

## Docker

Run PGAutoPilot alongside a fresh PostgreSQL instance, or point it at a database you already have:

```bash
cd server
docker compose up --build          # PostgreSQL 16 + MCP server together
docker run -e DATABASE_URL=... pgautopilot   # Connect to an existing DB
```

---

## Run your own PostgreSQL (no Docker)

Don't use Docker for your database? Install PostgreSQL directly on your machine
and manage it yourself with `psql` or pgAdmin.

### 1. Install

| Platform                | How                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Windows                 | [EDB installer](https://www.postgresql.org/download/windows/). Note the superuser password it prompts for. |
| macOS                   | `brew install postgresql@16` → `brew services start postgresql@16`                                        |
| Linux (Debian/Ubuntu)   | `sudo apt install postgresql` → `sudo systemctl enable --now postgresql`                                  |
| Linux (Fedora)          | `sudo dnf install postgresql-server`                                                                      |

### 2. Set the `postgres` password

(Needed for TCP login; Windows/macOS set it at install time — skip to step 3):

```bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'mypass';"
```

### 3. Create a database

`createdb mydb` (or `CREATE DATABASE mydb;` via `psql`).

### 4. Verify

`pg_isready -h localhost -p 5432` should say `accepting connections`. Then:

```env
DATABASE_URL=postgresql://postgres:mypass@localhost:5432/mydb
```

### 5. Inspect with pgAdmin (optional)

New server: Host `localhost` · Port `5432` · Maintenance DB `postgres` · Username `postgres` · your password. Browse tables and run queries while PGAutoPilot works against the same database.

> **Backups** need `pg_dump` — bundled with PostgreSQL on Windows; install the client tools (`postgresql-client` / `libpq`) on macOS/Linux. See [Troubleshooting](#troubleshooting).
>
> **Tip:** for production, create a dedicated least-privilege role for PGAutoPilot (see [Safety & Security](#safety--security)) and keep your `postgres` login for pgAdmin/psql.

---

## Configuration

### MCP server (`server/`)

```bash
pgautopilot --readonly                              # block every write
pgautopilot --mode=production                       # suppress per-request logs
pgautopilot --readonly --mode=production
```

| Variable                  | Default       | What it does                                            |
| ------------------------- | ------------- | ------------------------------------------------------- |
| `DATABASE_URL`            | _(required)_  | PostgreSQL connection string                            |
| `PGSSLMODE`               | auto          | SSL mode: `disable`, `prefer`, `require`, `verify-full` |
| `PGPOOL_MAX`              | `5`           | Maximum simultaneous database connections               |
| `PG_CONNECT_TIMEOUT_MS`   | `10000`       | Connection timeout (ms)                                 |
| `PG_IDLE_TIMEOUT_MS`      | `30000`       | Idle-connection timeout (ms)                            |
| `PG_STATEMENT_TIMEOUT_MS` | `10000`       | Max single-query time (ms)                              |
| `BACKUPS_DIR`             | `./backups`   | Where `db_backup` saves files                           |
| `DOCKER_CONTAINER`        | -             | Docker container name for `pg_dump` fallback            |
| `BLOCKED_TABLES`          | -             | Tables to block writes on (comma-separated)              |
| `HIGH_RISK_TABLES`        | -             | Tables that warn but allow writes (comma-separated)      |
| `SENSITIVE_COLUMNS`       | -             | Extra columns to redact (comma-separated)                |
| `PG_SCHEMAS`              | `public`      | PostgreSQL schemas to introspect (comma-separated)       |
| `NODE_ENV`                | `development` | `production` disables per-request logging                 |

### Dashboard — API (`web/apps/api`)

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
| `READONLY`                  | `false`        | `true` blocks every write operation, including migrations |
| `NODE_ENV`                  | `development`  | `production` masks errors and disables per-request logs   |
| `RATE_LIMIT_MAX`            | -              | Requests per window for tool/migration endpoints          |
| `RATE_LIMIT_WINDOW_MS`      | `60000`        | Rate-limit window                                         |
| `AUTH_RATE_LIMIT_MAX`       | `30`           | Failed-auth throttle when token auth is on                |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `60000`        | Failed-auth throttle window                               |
| `TRUST_PROXY`               | -              | Proxy trust when deployed behind a reverse proxy          |

### Dashboard — Web (`web/apps/web`)

| Variable               | Default | What it does                                             |
| ---------------------- | ------- | -------------------------------------------------------- |
| `VITE_API_BASE`        | `/api`  | Base URL for the API (same-origin proxy by default)      |
| `VITE_DASHBOARD_TOKEN` | -       | Bearer token sent on every request (match the API token) |

**Connection string examples:**

| Where                | URL                                                                  |
| -------------------- | -------------------------------------------------------------------- |
| Localhost            | `postgresql://postgres:mypass@localhost:5432/mydb`                  |
| Remote server        | `postgresql://admin:secret@db.mycompany.com:5432/production`        |
| Docker (port-mapped) | `postgresql://user:pass@localhost:5433/mydb`                        |
| Neon                 | `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb`      |
| Supabase             | `postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres`       |
| AWS RDS              | `postgresql://admin:pass@xxx.us-east-1.rds.amazonaws.com:5432/mydb` |
| Render               | `postgresql://user:pass@host.render.com:5432/mydb`                  |

**Cloud SSL:** cloud providers (Neon, Supabase, RDS, Render) need SSL — set
`PGSSLMODE=require` (stronger: `verify-full`); auto-detected for most providers.

---

## Performance

PGAutoPilot adds minimal overhead over a direct connection — latency depends on
your database and network — with a zero-dependency single-file executable for
the MCP server and configurable pool sizes and statement timeouts. Full benchmarks
will be published once the project reaches a stable release.

---

## Compatibility

| Platform | Support      |
| -------- | ------------ |
| Windows  | Yes (native) |
| macOS    | Yes (native) |
| Linux    | Yes (native) |
| Docker   | Yes          |
| WSL      | Yes          |
| ARM64    | Yes          |
| x64      | Yes          |
| Node 18  | Yes          |
| Node 20  | Yes          |
| Node 22  | Yes          |

---

## Software Signing

| Method         | How to verify                                                               |
| -------------- | --------------------------------------------------------------------------- |
| SHA-256 hashes | `npm run verify` or `node scripts/verify.mjs` (from `server/`)              |
| GPG signature  | `npm run verify:gpg` (public key: [`server/PUBLIC_KEY.asc`](server/PUBLIC_KEY.asc)) |

```bash
cd server
npm run sign:gpg     # signs dist/checksums.txt -> dist/checksums.txt.sig
npm run verify:gpg   # verifies the signature + all checksums
```

Install scripts verify `checksums.txt` automatically after cloning. On mismatch,
installation aborts. Bypass with `--skip-verify` (not recommended).

---

## FAQ

**Do I need to restart after schema changes?** No — identifiers are validated against the live schema on every request.

**Can PGAutoPilot modify my database automatically?** Only through explicit tool calls; every write is deliberate, and dry-run-before-write is the default.

**Does it work with Supabase?** Yes — use the Supabase connection string and `PGSSLMODE=require`.

**Does it require npm?** No — npm, the one-line installer, or the single-file bundle all work.

**Does it support SSL?** Yes — auto-detected or via `PGSSLMODE`.

**Can I disable writes entirely?** Yes — `pgautopilot --readonly`.

**Can I expose it publicly?** No — the MCP server is designed for local/private network use (no auth layer or HTTP server); the dashboard binds to `127.0.0.1` by default.

**Is it safe for production?** Yes — every write path is guarded. See [Safety & Security](#safety--security).

---

## Troubleshooting

| Error                         | Likely cause                         | How to verify           | Fix                                                   |
| ----------------------------- | ------------------------------------ | ----------------------- | ------------------------------------------------------ |
| `DATABASE_URL is not set`     | `.env` not found or missing          | `echo $DATABASE_URL`    | Create `.env` in the working directory                |
| `Connection refused`          | PostgreSQL not running or wrong URL  | `pg_isready`            | Check host/port, Docker port mapping                  |
| `SSL connection error`        | Cloud DB requires SSL                | Check provider docs     | Set `PGSSLMODE=require`                               |
| `Unknown table` / column      | Typo or wrong schema                 | Run `db_overview` first | Use exact names from schema                           |
| `Only SELECT queries allowed` | Using `db_raw_query` for writes      | N/A                     | Use `db_create`, `db_update_many`, etc.               |
| `pg_dump failed`              | `pg_dump` not installed              | `which pg_dump`         | Install `postgresql-client` or set `DOCKER_CONTAINER` |

---

## Development

### MCP server (`server/`) — source layout

```text
server/src/
  index.ts           Entry point, MCP server initialization
  config.ts          Environment variable loading and validation
  db.ts              PostgreSQL connection pool management
  schema.ts          Live schema introspection via information_schema
  sqlBuilder.ts      Parameterized, safe SQL query builder
  safety.ts          Redaction engine, write access control, warnings
  toolDefinitions.ts Zod schemas for all 14 tools
  toolHandlers.ts    Tool implementations, one handler per tool
```

| Command             | What it does                                           |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Start the dev server with hot-reload                   |
| `npm run build`     | Compile TypeScript and bundle into a single executable |
| `npm start`         | Run the compiled version                                |
| `npm run typecheck` | Full TypeScript type checking                           |
| `npm run lint`      | TypeScript type-check + ESLint                          |
| `npm run test`      | Unit tests (vitest)                                     |
| `npm run format`    | Auto-format source files with Prettier                  |

### Dashboard (`web/`)

| Command          | What it does                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| `pnpm dev`       | Free conflicting ports, then run API + web with hot reload (Turborepo)         |
| `pnpm precheck`  | Check the API/web ports and kill processes using them                           |
| `pnpm build`     | Build all workspace packages                                                    |
| `pnpm start`     | Build, then run the bundled API (`apps/api/dist/index.cjs`)                     |
| `pnpm typecheck` | Full TypeScript type checking across the workspace                              |
| `pnpm lint`      | ESLint across the workspace                                                     |
| `pnpm test`      | Unit tests across the workspace                                                 |
| `pnpm test:e2e`  | Playwright E2E smoke test (from `web/apps/web`)                                  |
| `pnpm format`    | Format all source with Prettier                                                  |

**Dashboard source layout:**

```text
web/apps/api/src/        Express API (routes, middleware, services)
web/apps/web/src/        React SPA (app, components, features, routes)
web/packages/contracts/  zod schemas + DTOs
web/packages/core/       HTTP-friendly port of the MCP safety layer
web/packages/ui/         design system components
web/packages/config/     shared tsconfig + eslint presets
```

---

## Verification before shipping

Run the full gate before merging or publishing:

```bash
# MCP core
cd server
npm run typecheck && npm run lint && npm run test && npm run build && npm run verify:gpg

# Dashboard
cd ../web
pnpm typecheck && pnpm lint && pnpm test && pnpm build
cd apps/web && pnpm test:e2e
```

The E2E smoke test (`web/apps/web/e2e/smoke.spec.ts`) boots the app and asserts
the tool runner renders. Run a full integration test against a live API +
Postgres if you need deeper coverage, since the smoke test starts only the web
server.

---

## Roadmap

- Authentication plugins / session management UI (API key, JWT)
- SQL editor with syntax highlighting and safe-query checks
- Backups UI (trigger and download `pg_dump` output)
- AI-assisted workflows (natural language to safe SQL, explain/optimize)
- Role-based access control and audit log
- Realtime monitoring (pool stats, slow queries, active sessions)

---

## Contributing & License

See [server/CONTRIBUTING.md](server/CONTRIBUTING.md) for contribution guidelines.

[MIT](LICENSE) &copy; 2026 [Cyber Reinxy](https://github.com/cyberreinxy)
