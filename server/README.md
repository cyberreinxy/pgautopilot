# PGAutoPilot

![PGAutoPilot](https://raw.githubusercontent.com/cyberreinxy/pgautopilot/main/server/assets/banner.svg)

[![MIT License](https://img.shields.io/badge/MIT_License-111111?style=for-the-badge&logo=opensourceinitiative&logoColor=33FF99)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node_18+-111111?style=for-the-badge&logo=nodedotjs&logoColor=33FF99)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-111111?style=for-the-badge&logo=typescript&logoColor=33FF99)](tsconfig.json)
[![MCP](https://img.shields.io/badge/MCP-111111?style=for-the-badge)](https://modelcontextprotocol.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-111111?style=for-the-badge&logo=postgresql&logoColor=33FF99)](https://www.postgresql.org)
[![pgautopilot MCP server](https://glama.ai/mcp/servers/cyberreinxy/pgautopilot/badges/score.svg)](https://glama.ai/mcp/servers/cyberreinxy/pgautopilot)

**The PostgreSQL MCP server.** Talk to any database through any AI assistant.

<a href="https://github.com/sponsors/cyberreinxy"><iframe src="https://github.com/sponsors/cyberreinxy/button" title="Sponsor cyberreinxy" height="32" width="114" style="border: 0; border-radius: 6px;"></iframe></a>

`npx pgautopilot` · `npm install -g pgautopilot`

---

PGAutoPilot is a production-ready PostgreSQL MCP server that lets any AI
assistant safely interact with PostgreSQL in natural language — schema-aware
query generation, enterprise safety controls, and minimal config in a single
executable.

Most database MCP servers expose raw SQL directly and leave destructive
operations largely unguarded. PGAutoPilot takes the opposite stance: it's
**schema-aware** (validates every identifier against your live database),
**production-first** (every write path is guarded by multiple configurable
safety layers), and **model-agnostic** (works identically with Claude, GPT-4o,
Gemini, DeepSeek, Copilot, and open-source models). Developers get
plain-English queries from their editor; DBAs and security teams get
read-only mode, blocked tables, redacted secrets, and an audit-ready design.

```text
Model-agnostic  PostgreSQL-optimized  Safe writes  Read-only mode
Minimal config  Single executable    Docker       Cloud databases
Connection pool Production-ready     SSL          Schema inspection
```

```text
You: "Show me customers that spent more than $500."
  -> db_aggregate(table="orders", by="customer_id", _sum="total",
       orderBy={"_sum/total": "desc"}, take=5)
  <- 23 customers found
```

---

## Contents

- [Install](#install)
- [Supported MCP Clients](#supported-mcp-clients)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Safety & Security](#safety--security)
- [Tools](#tools)
- [Examples](#examples)
- [Docker](#docker)
- [Run your own PostgreSQL (no Docker)](#run-your-own-postgresql-no-docker)
- [Configuration](#configuration)
- [Performance](#performance)
- [Compatibility](#compatibility)
- [Software Signing](#software-signing)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Roadmap](#roadmap)
- [Contributing & License](#contributing--license)

---

## Install

**Requirements:** Node.js 18+ · PostgreSQL 12+ (local, remote, Docker, or cloud) · any MCP-compatible client.

**npm:**

```bash
npm install -g pgautopilot
```

**No npm — one-line installer** (clones, adds to PATH; re-run to update):

| Platform  | Command                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------- |
| Linux/mac | `curl -fsSL https://raw.githubusercontent.com/cyberreinxy/pgautopilot/main/install.sh \| bash` |
| Windows   | `irm https://raw.githubusercontent.com/cyberreinxy/pgautopilot/main/install.ps1 \| iex`        |

**Download & run:** `node pgautopilot.bundle.cjs`

**Clone & run:** `git clone https://github.com/cyberreinxy/pgautopilot.git && cd pgautopilot && node dist/pgautopilot.bundle.cjs`

**Uninstall:**

| Platform  | Command                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------ |
| Linux/mac | `curl -fsSL https://raw.githubusercontent.com/cyberreinxy/pgautopilot/main/uninstall.sh \| bash` |
| Windows   | `irm https://raw.githubusercontent.com/cyberreinxy/pgautopilot/main/uninstall.ps1 \| iex`        |

Installs are idempotent and signed — see [Software Signing](#software-signing).

---

## Supported MCP Clients

Claude Desktop · Cursor · VS Code + Copilot · Gemini CLI · Windsurf · Zed · JetBrains · Continue · Cline · Roo Code · Neovim.

---

## Quick Start

Create a `.env` anywhere on your machine (PGAutoPilot finds it automatically):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/yourdb
```

Connect your AI assistant — identical config for VS Code, Cursor, Windsurf,
Claude Desktop, Zed, JetBrains, Neovim:

```json
{ "mcpServers": { "postgres": { "command": "pgautopilot" } } }
```

Then just ask: _"Show me all tables."_ · _"How many users signed up this month?"_ · _"Find orders over $500 by customer."_ · _"Add a product called 'Widget Pro' at $29.99."_

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
|                                    |
|  Schema Discovery                 |
|  Identifier Validation            |
|  Safety Policy Engine     <----+  |
|  SQL Builder                   |  |
|  Connection Pool               |  |
|  Tool Handlers (14 tools)      |  |
+---------------------------------+ |
        |                          |
        v                          |
   PostgreSQL          Everything passes through safety
```

Every request flows: natural language → MCP tool call → Zod parameter
validation → live schema lookup → identifier validation → safety policy
evaluation → parameterized SQL generation → time-limited execution →
formatted response. Deterministic at every step. No hidden state, no side
effects.

---

## Safety & Security

### Threat model

PGAutoPilot runs on your machine and connects over the PostgreSQL wire
protocol. The AI assistant communicates only through MCP, and every request
passes the safety layer before reaching PostgreSQL. The `DATABASE_URL`
credential is the sole authentication boundary.

### Safety features

| Threat                 | Protection                                         |
| ---------------------- | -------------------------------------------------- |
| SQL injection          | Parameterized queries (never string interpolation) |
| Accidental delete-all  | `confirmAll: true` required                        |
| Full table update      | Warning on >10 rows affected                       |
| Secret exposure        | Automatic redaction on read + strip on write       |
| Unknown table/column   | Live schema validation before query build          |
| Slow queries           | Configurable statement timeout (default 10s)       |
| Connection exhaustion  | Configurable pool limit (default 5)                |
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
- Never bypasses schema validation or exceeds `PGPOOL_MAX`

### Production recommendations

- `--readonly` for read replicas and analytics environments
- `BLOCKED_TABLES` / `SENSITIVE_COLUMNS` to protect sensitive data
- `PGSSLMODE=require` (or `verify-full`) for cloud databases
- A dedicated, minimal-permission database role (below)
- `PG_STATEMENT_TIMEOUT_MS` matched to your SLA; `--mode=production` to suppress logs

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

### Security

- **Responsible disclosure** — report vulnerabilities privately via [GitHub Security Advisories](https://github.com/cyberreinxy/pgautopilot/security/advisories).
- **Signed releases** — every release is SHA-256 checksummed and GPG-signed.
- **Zero runtime dependencies** in the bundled build.
- **Logging policy** — connection strings are never logged; per-request logging off in `--mode=production`.
- **Authentication** — entirely the `DATABASE_URL` credential; PGAutoPilot doesn't manage users or tokens.

---

## Tools

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

| Tool             | Use when...                     | Safety                                          |
| ---------------- | ------------------------------- | ----------------------------------------------- |
| `db_create`      | "Add a new user"                | Dry-run supported, schema-validated             |
| `db_upsert`      | "Create or update this product" | Dry-run supported, conflict-safe                |
| `db_update_many` | "Update all shipped orders"     | Warns on >10 rows, dry-run supported            |
| `db_delete_many` | "Delete old logs"               | Warns on >10 rows, `confirmAll` for full clears |

### Maintenance tools

| Tool        | Use when...            | Output                      |
| ----------- | ---------------------- | --------------------------- |
| `db_backup` | "Back up the database" | Full SQL dump via `pg_dump` |

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

## Docker

Run PGAutoPilot alongside a fresh PostgreSQL instance, or point it at a database you already have:

```bash
docker compose up --build          # PostgreSQL 16 + MCP server together
docker run -e DATABASE_URL=... pgautopilot   # Connect to an existing DB
```

---

## Run your own PostgreSQL (no Docker)

Don't use Docker for your database? Install PostgreSQL directly on your machine
and manage it yourself with `psql` or pgAdmin.

### 1. Install

| Platform              | How                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Windows               | [EDB installer](https://www.postgresql.org/download/windows/). Note the superuser password it prompts for. |
| macOS                 | `brew install postgresql@16` → `brew services start postgresql@16`                                         |
| Linux (Debian/Ubuntu) | `sudo apt install postgresql` → `sudo systemctl enable --now postgresql`                                   |
| Linux (Fedora)        | `sudo dnf install postgresql-server`                                                                       |

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
| `BLOCKED_TABLES`          | -             | Tables to block writes on (comma-separated)             |
| `HIGH_RISK_TABLES`        | -             | Tables that warn but allow writes (comma-separated)     |
| `SENSITIVE_COLUMNS`       | -             | Extra columns to redact (comma-separated)               |
| `PG_SCHEMAS`              | `public`      | PostgreSQL schemas to introspect (comma-separated)      |
| `NODE_ENV`                | `development` | `production` disables per-request logging               |

**Connection string examples:**

| Where                | URL                                                                 |
| -------------------- | ------------------------------------------------------------------- |
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
your database and network — with a zero-dependency single-file executable and
configurable pool size and statement timeouts. Full benchmarks will be
published once the project reaches a stable release.

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

| Method         | How to verify                                                         |
| -------------- | --------------------------------------------------------------------- |
| SHA-256 hashes | `npm run verify` or `node scripts/verify.mjs`                         |
| GPG signature  | `npm run verify:gpg` (public key: [`PUBLIC_KEY.asc`](PUBLIC_KEY.asc)) |

Install scripts verify `checksums.txt` automatically after cloning. On mismatch, installation aborts. Bypass with `--skip-verify` (not recommended).

---

## FAQ

**Do I need to restart after schema changes?** No — identifiers are validated against the live schema on every request.

**Can PGAutoPilot modify my database automatically?** Only through explicit tool calls; every write is deliberate, and dry-run-before-write is the default.

**Does it work with Supabase?** Yes — use the Supabase connection string and `PGSSLMODE=require`.

**Does it require npm?** No — npm, the one-line installer, or the single-file bundle all work.

**Does it support SSL?** Yes — auto-detected or via `PGSSLMODE`.

**Can I disable writes entirely?** Yes — `pgautopilot --readonly`.

**Can I expose it publicly?** No — designed for local/private network use; no auth layer or HTTP server.

**Is it safe for production?** Yes — every write path is guarded. See [Safety & Security](#safety--security).

---

## Troubleshooting

| Error                         | Likely cause                        | How to verify           | Fix                                                   |
| ----------------------------- | ----------------------------------- | ----------------------- | ----------------------------------------------------- |
| `DATABASE_URL is not set`     | `.env` not found or missing         | `echo $DATABASE_URL`    | Create `.env` in the working directory                |
| `Connection refused`          | PostgreSQL not running or wrong URL | `pg_isready`            | Check host/port, Docker port mapping                  |
| `SSL connection error`        | Cloud DB requires SSL               | Check provider docs     | Set `PGSSLMODE=require`                               |
| `Unknown table` / column      | Typo or wrong schema                | Run `db_overview` first | Use exact names from schema                           |
| `Only SELECT queries allowed` | Using `db_raw_query` for writes     | N/A                     | Use `db_create`, `db_update_many`, etc.               |
| `pg_dump failed`              | `pg_dump` not installed             | `which pg_dump`         | Install `postgresql-client` or set `DOCKER_CONTAINER` |

---

## Development

### Repository layout

```text
src/
  index.ts           Entry point, MCP server initialization
  config.ts          Environment variable loading and validation
  db.ts              PostgreSQL connection pool management
  schema.ts          Live schema introspection via information_schema
  sqlBuilder.ts      Parameterized, safe SQL query builder
  safety.ts          Redaction engine, write access control, warnings
  toolDefinitions.ts Zod schemas for all 14 tools
  toolHandlers.ts    Tool implementations, one handler per tool
```

### Commands

| Command             | What it does                                           |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Start the dev server with hot-reload                   |
| `npm run build`     | Compile TypeScript and bundle into a single executable |
| `npm start`         | Run the compiled version                               |
| `npm run typecheck` | Full TypeScript type checking                          |
| `npm run lint`      | TypeScript type-check + ESLint                         |
| `npm run format`    | Auto-format source files with Prettier                 |

---

## Roadmap

- Authentication plugins (API key, JWT)
- Streaming query results · Schema migration tools
- Prometheus metrics / OpenTelemetry
- Multi-database support (read replicas, shards)
- Query explain and optimization suggestions

---

## Contributing & License

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

[MIT](LICENSE) &copy; 2026 [Cyber Reinxy](https://github.com/cyberreinxy)
