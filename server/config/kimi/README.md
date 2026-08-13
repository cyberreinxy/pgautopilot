# Kimi CLI

Config: `config/kimi/mcp.json` → copy to **`~/.kimi/mcp.json`** (user).

```json
{
  "mcpServers": {
    "pgautopilot": {
      "command": "npx",
      "args": ["-y", "pgautopilot"]
    }
  }
}
```

## Setup

Copy `mcp.json` from this folder to `~/.kimi/mcp.json` (or the project-local
config your Kimi build reads) and restart the CLI. Uses the Claude-style
`mcpServers` shape. Set `DATABASE_URL` in your environment or `.env` so the
server connects.