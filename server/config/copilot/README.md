# GitHub Copilot CLI

Config: `config/copilot/mcp-config.json` → copy to **`.copilot/mcp-config.json`** (project) · `~/.copilot/mcp-config.json` (user).

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

1. Copy `mcp-config.json` from this folder to `.copilot/` (project) or
   `~/.copilot/` (user).
2. Restart the Copilot CLI (`gh copilot` / the Copilot agent).
3. The `pgautopilot` tools become available to the agent.

The file uses the Claude-style `mcpServers` shape. For secrets, reference
environment variables instead of hardcoding them (PGAutoPilot reads
`DATABASE_URL` from `.env` automatically).