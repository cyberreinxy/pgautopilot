# Changelog

## 2.1.0 (2026-08-11)

- **Security:** `db_raw_query` writes are blocked in read-only mode (`--readonly`), even with `ALLOW_RAW_WRITES=true`.
- **Security:** new `HIGH_RISK_TABLES` env var — warn-but-allow writes with a `[HIGH-RISK]` warning.
- Added: `PG_SCHEMAS` env var (default `public`) to introspect non-`public` schemas; tables are schema-qualified in multi-schema setups.
- Improved: `db_overview` hybrid row counts (`reltuples` estimate → exact `COUNT(*)` fallback).
- Improved: per-table error isolation in schema introspection; descriptive FK constraint names in relationship output.

## 2.0.1 (2026-08-11)

- Patch release: bug fixes and stability improvements over 2.0.0.

## 2.0.0 (2026-08-11)

- Breaking: redesigned MCP server — tool names, input schemas, and behavior changed from v1.0.0; update MCP client configs.
- Breaking: restructured config and environment variable handling.
- Rebuilt safety model: redaction, blocked tables, read-only guards.
- Added: schema-aware validation, model-agnostic design, single-executable bundle (`npx pgautopilot`), Docker support.

## 1.0.0 (2026-07-??)

- Initial release: basic PostgreSQL MCP server for querying and managing databases.
