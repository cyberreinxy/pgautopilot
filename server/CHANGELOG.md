# Changelog

## 2.0.0 (2026-08-11)

### Breaking Changes

- Complete redesign of the MCP server architecture — tool names, input schemas, and behaviors have changed from v1.0.0. MCP client configurations (Claude Desktop, Cursor, Copilot, etc.) that worked with v1.0.0 will need to be updated.
- Config format and environment variable handling restructured.
- Safety model rebuilt with new redaction, blocked-tables, and read-only guard layers.

### Added

- Schema-aware query validation against live database.
- Production-first safety controls on every write path.
- Model-agnostic design — works identically across Claude, GPT-4o, Gemini, DeepSeek, Copilot, and open-source models.
- Single-executable bundle via `npx pgautopilot`.
- Docker support.

## 1.0.0 (2026-07-??)

- Initial release.
- Basic PostgreSQL MCP server with tool definitions for querying and managing databases.
