# Changelog

## 2.4.0 (2026-09-02)

### New Tools

- **Added:** `db_explain` — runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` on SELECT
  queries and auto-analyzes the plan for: sequential scans on large tables, low
  selectivity filters, external sorts, high-cost hash joins, low buffer cache hit
  rate, and temp file usage. No extensions required.

### Expanded Health Checks

- **Added:** Buffer cache hit rate check — warns when below 90%, reports blks_hit
  and blks_read for diagnosis.
- **Added:** Constraint health check — finds invalid constraints (e.g., after failed
  recovery or interrupted `ALTER TABLE`).
- **Added:** Per-database health checks in multi-DB mode — runs full vacuum,
  replication, indexes, sequences, buffer cache, and constraint checks per database
  (not just `SELECT 1`).
- **Added:** PostgreSQL version detection at startup and per-database in multi-DB
  mode. Version included in `db_health` results and `pgautopilot://status` resource.

### MCP Resources & Prompts

- **Added:** `pgautopilot://status` resource — server name, version, mode, PostgreSQL
  version, database list with connection status.
- **Added:** `pgautopilot://schema` resource — points to `db_schema` tool.
- **Added:** `explore-database` prompt — guided workflow: overview → schema →
  relationships → summary.
- **Added:** `diagnose-query` prompt — guided workflow: get query → db_explain →
  analyze plan → suggest fixes.

### HTTP Transport

- **Added:** `--transport=http --port=3000` flag for Streamable HTTP mode. Each
  session gets its own McpServer instance. CORS headers for browser access. `/health`
  endpoint for monitoring.

### Project-Scoped Setup

- **Fixed:** All 13 MCP configs now include `cwd: "${workspaceFolder}"` so the
  server starts in the project root where `.env` and `pgautopilot.json` live.
- **Fixed:** Postinstall script generates all configs with `cwd`.
- **Changed:** README Quick Start rewritten as 4-step project-scoped walkthrough.
  Removed global install, one-line installer, and download-and-run sections.

### Bug Fixes

- **Fixed:** `ALLOW_WRITES` env var and `--readonly` flag now correctly propagate
  to multi-database defaults. Previously, `defaults.readonly` was hardcoded to `true`
  and the env/flag was silently ignored.

### Type Safety

- **Added:** `safeQueryOne<T>` helper — eliminates `[0]` array indexing with
  `noUncheckedIndexedAccess`. Returns `T | null` with proper runtime narrowing.
- **Added:** `getPgVersion()` helper — centralized PostgreSQL version detection,
  replaces 4 scattered `as string` casts with a single typed function.
- **Removed:** 2 unnecessary `as unknown as` casts in `dbDiagnostics.ts` — `Pool`
  already extends `EventEmitter` and has `totalCount`/`idleCount`/`waitingCount`.
- **Improved:** All health check queries now use typed interfaces (`VacuumRow`,
  `ReplicationRow`, `CacheRow`, `ConstraintRow`, etc.) instead of `unknown[]`.

### Agent Skills

- **Added:** 7 agent skills following the Agent Skills Specification (`SKILL.md`):
  `pgautopilot`, `query-optimization`, `database-health`, `safe-writes`,
  `multi-database`, `connection-troubleshooting`, `backup-restore`.
- **Added:** `skills.json` manifest and `merge-skills-lock.mjs` script for smart
  merging into existing `skills-lock.json` files (matches `npx skills` format).
- **Added:** Postinstall auto-merges skills into project lock file.

### Tool Definitions

- **Improved:** All 18 tool descriptions rewritten for Glama TDQS scoring — expanded
  with Purpose Clarity, Usage Guidelines, Behavioral Transparency, Parameter
  Semantics, and Contextual Completeness.

### Documentation

- **Added:** `docs/COMPETITIVE_ANALYSIS.md` — deep analysis of crystaldba/postgres-mcp,
  timescale/pg-aiguide, and pgEdge/pgedge-postgres-mcp.
- **Updated:** `pgautopilot.example.json` — realistic multi-DB config with
  `app_production`, `analytics`, `app_staging`, `audit_log` databases.
- **Updated:** `pgautopilot.schema.json` — updated examples to match.
- **Added:** `glama.json` for MCP server listing ownership.

### Tests

- **Added:** Tests for `db_explain` — rejects non-SELECT, returns plan with analysis,
  strips semicolons, detects hash joins.
- **Added:** Tests for expanded `db_health` — TXID wraparound, unused indexes,
  sequences, replica lag, buffer cache (high/low/empty), constraints.
- **Total:** 137 tests, all passing.

## 2.3.0 (2026-09-02)

### Multi-Database Support

This is a major feature release. PGAutoPilot can now connect to multiple PostgreSQL
databases simultaneously. Single-database users: your existing `.env` setup works
unchanged — no breaking changes.

- **Added:** `ConnectionManager` — manages multiple named database connections with lazy
  connect, per-database safety policies, and automatic reconnect on broken pools.
- **Added:** `pgautopilot.json` config file — define multiple databases with per-database
  `url`, `readonly`, `schemas`, `blocked_tables`, `sensitive_columns`, `statement_timeout_ms`,
  and `pool_max`. Supports `$VAR` and `${VAR}` environment variable interpolation.
- **Added:** `database` parameter on all 15 tools — query any database by name without
  restarting the server. Example: `db_find_many(table="orders", database="analytics")`.
- **Added:** `db_list_databases` tool — discover all configured databases with status,
  connection info, and read-only setting.
- **Added:** `db_use_database` tool — switch the default database at runtime.
- **Added:** `--database=<name>` CLI flag — set the default database at startup.
- **Added:** `db_health` multi-database mode — parallel health checks with 5s per-DB
  timeout. Omit `database` param to check all databases.
- **Added:** Config hot-reload — watches `pgautopilot.json` for changes, adds new
  databases without restart.
- **Added:** JSON Schema (`pgautopilot.schema.json`) for `pgautopilot.json` validation.
- **Added:** Startup connectivity check — probes all configured databases at boot.

### Bug Fixes

- **Fixed:** `db_backup` now uses the resolved pool's connection string instead of
  hardcoded `process.env.DATABASE_URL` — works correctly in multi-DB mode.
- **Fixed:** Schema cache is now per-pool (WeakMap) — switching databases no longer
  serves stale schema data from the previous database.
- **Fixed:** `setSchemas()` is now scoped per-pool — different databases can have
  different schema lists without interfering.
- **Fixed:** `resolveSsl` applied to per-database pool configs — each database
  respects `PGSSLMODE` independently.
- **Fixed:** `db_raw_query` uses per-database `statementTimeoutMs` instead of the
  global config value.
- **Fixed:** Race condition in `ConnectionManager.get()` — concurrent connect attempts
  for the same database are deduplicated.
- **Fixed:** `db_health` sequential checks replaced with parallel checks + 5s
  per-database timeout — one slow database no longer blocks all others.
- **Fixed:** `configWatcher` uses proper ESM import instead of `require("fs")`.
- **Fixed:** `configWatcher` reload handles per-database errors gracefully — one
  bad entry no longer kills the entire reload.
- **Fixed:** `buildDatabaseEntry` catches invalid URLs with clear error messages
  instead of crashing.

### Reliability

- **Added:** Exponential backoff in `waitForConnection` — retries at 2s, 4s, 8s
  instead of fixed intervals. Helps with flaky cloud databases.
- **Added:** Connection reconnect — `ConnectionManager.get()` verifies pool health
  with `SELECT 1` and automatically reconnects broken pools.

### IDE Configs

- **Fixed:** Removed empty `env: {}` from Cline, Roo, Zed, and Continue configs
  that was silently blocking environment variable inheritance.

### Postinstall

- **Fixed:** Deep merge in `writeEditorConfig` — preserves user customizations
  (env vars, disabled flags, custom args) instead of overwriting.
- **Fixed:** Template deep clone — prevents shared references between config entries.
- **Fixed:** JSON validation before every write — corrupt output is caught.
- **Fixed:** `.env.example` template updated with multi-database documentation.
- **Fixed:** Install banner mentions multi-database support.

### Documentation

- **Added:** `docs/MULTI-DATABASE.md` — complete user guide with quick start,
  config format, examples (monorepo, dev/staging/prod, read replicas),
  security, troubleshooting, and migration guide.
- **Updated:** `README.md` — added Multi-Database section with config example,
  tool table, and link to full guide.
- **Updated:** `config/README.md` — added Multi-Database Mode section.
- **Updated:** `.env.example` — added multi-database configuration comments.

### Tests

- **Added:** `tests/connectionManager.test.ts` — 19 tests for register, resolve,
  list, closeAll, buildDatabaseEntry, safety state.
- **Added:** `tests/multiDbConfig.test.ts` — 20 tests for config parsing, env var
  interpolation, validation errors (invalid names, URLs, protocols).
- **Added:** `tests/multiDbIntegration.test.ts` — 12 tests for full multi-DB flow:
  list, switch, health, per-DB routing, write safety enforcement.
- **Updated:** `tests/postinstall.test.ts` — added deep merge preservation test.
- **Updated:** `tests/schema.test.ts` — updated for per-pool schema signatures.
- **Updated:** `tests/toolHandlers.test.ts` — updated for per-pool invalidateSchemaCache.
- **Total:** 112 tests, all passing.

## 2.2.2 (2026-09-01)

- **Fixed:** bump `zod` to `^3.25.28 || ^4.0.0` to satisfy `@modelcontextprotocol/sdk@1.30.0` (`zod@"^3.25 || ^4.0"`) and `zod-to-json-schema@3.25.2` (`zod@"^3.25.28 || ^4"`) peers — removes `pnpm install` unmet peer `found 3.23.8` warning when consumed by projects on `zod@4.4.3` (e.g. `StudentsManagemenSystem`).

## 2.2.1 (2026-08-13)

- **Added:** `glama.json` at the repo root to claim the MCP server listing on Glama.
- **Added:** Glama score badge to the README.
- **Fixed:** Docker build — the image now copies `tsconfig.build.json` and `scripts/` in the build stage, and the runtime stage installs production deps with `--ignore-scripts` (the Docker build previously failed because `tsc -p tsconfig.build.json` and `postbuild` could not find their inputs).
- **Added:** root `Dockerfile` that builds `server/`, so Glama's release pipeline (which only auto-detects a root-level Dockerfile) can build the server.

## 2.2.0 (2026-08-13)

- **Added:** ready-to-use MCP configs for opencode, Cline, Kilo Code, Roo Code, JetBrains, Zed, Continue, Gemini CLI, OpenAI Codex CLI, GitHub Copilot CLI, and Kimi CLI, alongside the existing Cursor, VS Code/Copilot, Windsurf, and Claude configs.
- **Changed:** all client configs now live in a single `config/` folder (one subfolder per client, each with a README explaining where to copy it). The project root stays clean.
- **Changed:** `postinstall` regenerates the whole `config/` folder into the installing project, including TOML support for Codex and an opencode template with the JSON schema reference.
- **Security:** `autoApprove` / `alwaysAllow` are left empty in every config so write tools always require confirmation.

## 2.1.3 (2026-08-12)

**Security patch** — resolves the open items from the v2.1.1 security review.

- **Security:** read-only is now the default. Write tools require `ALLOW_WRITES=true` in both entry points; `--readonly` still forces read-only even then.
- **Security:** new `DISABLED_TOOLS` env var (comma-separated tool names) gate individual write/raw tools per-server — read tools stay available.
- **Security:** postinstall no longer skips existing editor configs — it merges the `pgautopilot` entry into `.cursor/mcp.json`, `.vscode/mcp.json`, and `.codeium/windsurf/mcp_config.json`, and adds Claude Desktop support (`.claude/mcp.json` + `claude_desktop_config.json`).
- Fixed: `Date` values were serialized as `{}` in `find_many` / `find_first` output; now rendered as ISO-8601 strings. `Buffer`/bytea values now render as hex.
- Mirrored all safety changes in the dashboard core (`web/packages/core/src/safety.ts`).

## 2.1.2 (2026-08-12)

- **Security:** fix the npm package banner path so the README image resolves correctly.
- Chore: add `npm run security` audit gate, `SECURITY.md`, CI workflow, and Dependabot updates.

## 2.1.1 (2026-08-12)

- **Security:** bump `@modelcontextprotocol/sdk` to `^1.30.0` to fix three known advisories in the bundled runtime (instance-reuse data leak, DNS rebinding, ReDoS).
- Docs: corrected the supported-clients note in the README.

## 2.1.0 (2026-08-11)

- **Security:** `db_raw_query` writes are blocked in read-only mode (`--readonly`), even with `ALLOW_RAW_WRITES=true`.
- **Security:** new `HIGH_RISK_TABLES` env var - warn-but-allow writes with a `[HIGH-RISK]` warning.
- Added: `PG_SCHEMAS` env var (default `public`) to introspect non-`public` schemas; tables are schema-qualified in multi-schema setups.
- Improved: `db_overview` hybrid row counts (`reltuples` estimate → exact `COUNT(*)` fallback).
- Improved: per-table error isolation in schema introspection; descriptive FK constraint names in relationship output.

## 2.0.1 (2026-08-11)

- Patch release: bug fixes and stability improvements over 2.0.0.

## 2.0.0 (2026-08-11)

- Breaking: redesigned MCP server - tool names, input schemas, and behavior changed from v1.0.0; update MCP client configs.
- Breaking: restructured config and environment variable handling.
- Rebuilt safety model: redaction, blocked tables, read-only guards.
- Added: schema-aware validation, model-agnostic design, single-executable bundle (`npx pgautopilot`), Docker support.

## 1.0.0 (2026-07-??)

- Initial release: basic PostgreSQL MCP server for querying and managing databases.
