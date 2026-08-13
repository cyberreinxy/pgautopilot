# Changelog

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
