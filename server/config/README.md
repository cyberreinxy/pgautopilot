# PGAutoPilot - Editor & CLI Configs

This folder holds ready-to-use MCP configurations for every supported client.
It keeps the project root clean: **nothing here is read automatically**. Pick
the folder for your IDE/extension/CLI, copy the config file to where your
client expects it, and customize paths to your project.

## What to do

1. Find your client below.
2. Copy the config file(s) to the **Target** location shown.
3. Adjust anything project-specific (absolute paths, `cwd`, `env`, server name).
4. Set `DATABASE_URL` in that location's `.env` (PGAutoPilot auto-detects it).
5. Reload/restart your client. The `pgautopilot` server auto-starts.

## Clients

| Client | Folder | File(s) | Target location |
| ------ | ------ | ------- | --------------- |
| Cursor | [`cursor/`](cursor/README.md) | `mcp.json` | `.cursor/mcp.json` |
| VS Code + Copilot | [`vscode/`](vscode/README.md) | `mcp.json` | `.vscode/mcp.json` |
| Windsurf | [`windsurf/`](windsurf/README.md) | `mcp_config.json` | `.codeium/windsurf/mcp_config.json` |
| Claude Desktop / Code | [`claude/`](claude/README.md) | `mcp.json` | `.claude/mcp.json` (or global Claude config) |
| opencode | [`opencode/`](opencode/README.md) | `opencode.json` | `.opencode/opencode.json` |
| Cline | [`cline/`](cline/README.md) | `cline_mcp_settings.json` | `.cline/cline_mcp_settings.json` |
| Kilo Code | [`kilo/`](kilo/README.md) | `kilo.json` | `.kilo/kilo.json` |
| Roo Code | [`roo/`](roo/README.md) | `mcp.json` | `.roo/mcp.json` |
| JetBrains (IDEA/WebStorm/PyCharm/…) | [`jetbrains/`](jetbrains/README.md) | `mcp.json` | `.idea/mcp.json` |
| Zed | [`zed/`](zed/README.md) | `settings.json` | `.zed/settings.json` |
| Continue | [`continue/`](continue/README.md) | `mcpServers/mcp.json` | `.continue/mcpServers/mcp.json` |
| Gemini CLI | [`gemini/`](gemini/README.md) | `settings.json` | `.gemini/settings.json` |
| OpenAI Codex CLI | [`codex/`](codex/README.md) | `config.toml` | `.codex/config.toml` |
| GitHub Copilot CLI | [`copilot/`](copilot/README.md) | `mcp-config.json` | `.copilot/mcp-config.json` |
| Kimi CLI | [`kimi/`](kimi/README.md) | `mcp.json` | `~/.kimi/mcp.json` |

## Command conventions

- **Global install (recommended):** `npx -y pgautopilot`. Uses the published
  npm package, nothing to build.
- **From source (development):** `npx tsx src/index.ts` with
  `cwd: "<repo>/server"`. Tracks local code changes.

## Customizing

- **Server name:** every snippet uses `pgautopilot`; rename it in one place
  and all tools stay grouped under that name in your client.
- **Working directory:** for source/dev setups, point `cwd` at the folder that
  contains your `.env` (PGAutoPilot reads `DATABASE_URL` from there).
- **Permissions:** `autoApprove` / `alwaysAllow` are left empty on purpose.
  Every write tool still asks for confirmation. Add specific safe tools only
  if you want to skip prompts.
- **Environment:** secrets go in `env` blocks or the client's `.env`; never
  hardcode them in committed configs.

## Installer

`npm install pgautopilot` runs a postinstall that regenerates this whole
folder (creating/merging every client config) into your project's root. See
[`server/scripts/postinstall.mjs`](../scripts/postinstall.mjs).