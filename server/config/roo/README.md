# Roo Code

Config: `config/roo/mcp.json` → copy to **`.roo/mcp.json`** (project) · global via VS Code settings `mcp_settings.json`.

```json
{
  "mcpServers": {
    "pgautopilot": {
      "command": "npx",
      "args": ["-y", "pgautopilot"],
      "env": {},
      "alwaysAllow": [],
      "disabled": false
    }
  }
}
```

## Setup

1. Copy `mcp.json` from this folder to `.roo/mcp.json` in your workspace root.
2. Open the Roo Code panel → ⚙️ → **MCP Servers**, or paste the same entry via
   **Edit Global MCP** (writes `mcp_settings.json`).

`alwaysAllow` is intentionally empty so every PGAutoPilot tool call still asks
for approval. For an HTTP/remote server use `"type": "streamable-http"` with
`"url"` instead of `command`.