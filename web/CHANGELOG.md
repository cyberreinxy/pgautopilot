# Changelog

## 0.2.1 (2026-08-12)

**Security patch** — mirrors the 2.1.3 MCP-core security fixes.

- **Security:** read-only is now the default. Write tools require `ALLOW_WRITES=true`; `READONLY=true` still forces read-only even then.
- **Security:** new `DISABLED_TOOLS` env var (comma-separated tool names) — disabled tools are removed from `GET /api/tools` and rejected with `403` on invocation.
- Fixed: `Date` values were serialized as `{}` in read tool output; now rendered as ISO-8601 strings. `Buffer`/bytea values now render as hex.
- Kept the safety model in sync with the MCP core (`web/packages/core/src/safety.ts`).

## 0.2.0 (2026-08-12)

- **Security:** `db_raw_query` writes are blocked in read-only mode, even with `ALLOW_RAW_WRITES=true`.
- **Security:** new `HIGH_RISK_TABLES` env var - warn-but-allow writes with a `[HIGH-RISK]` warning on create, upsert, update, and delete.
- Added: `HIGH_RISK_TABLES` is exposed in `/api/config` and shown in the Settings Safety panel.
- Mirrored the safety model with the MCP core (`server`) so both entry points enforce identical read-only, blocked-table, and high-risk guarantees.

## 0.1.0

- Initial dashboard: HTTP API (`@pgautopilot/api`) + React UI (`@pgautopilot/web`) built on the `@pgautopilot/core` tool/safety layer.
- Tools: schema overview, CRUD, raw query, migrations, snapshots/backups, health.
- Safety: read-only mode, blocked tables, sensitive-column redaction, bulk-operation warnings.
