# Cursor

Config: `config/cursor/mcp.json` → copy to **`.cursor/mcp.json`** at your project root.

```json
{
  "mcpServers": {
    "pgautopilot": { "command": "pgautopilot" }
  }
}
```

## Setup

1. Copy `mcp.json` from this folder to `.cursor/mcp.json` in your project root.
2. Open Cursor in that folder → **Settings → MCP**. The `pgautopilot` server should appear.
3. If not, add it manually with the same `command`.

Set `DATABASE_URL` in your project's `.env` first. PGAutoPilot auto-detects it.

## From source (development)

```json
{
  "mcpServers": {
    "pgautopilot": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "${workspaceFolder}/server"
    }
  }
}
```

Use this to track local changes instead of the published `pgautopilot` package.