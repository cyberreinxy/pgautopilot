# Cline

Config: `config/cline/cline_mcp_settings.json` → copy to **`.cline/cline_mcp_settings.json`** at your project root.

```json
{
  "mcpServers": {
    "pgautopilot": {
      "command": "npx",
      "args": ["-y", "pgautopilot"],
      "env": {},
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## VS Code extension (project scope)

Copy `cline_mcp_settings.json` from this folder to `.cline/cline_mcp_settings.json`
in your workspace root. The extension picks it up automatically. To add it
through the UI instead: open the Cline panel → MCP Servers → Configure → add
the `pgautopilot` entry above.

## Cline CLI

```bash
cline mcp add pgautopilot -- npx -y pgautopilot
```

Or edit `~/.cline/mcp.json` (newer builds read
`~/.cline/data/settings/cline_mcp_settings.json`) with the same `mcpServers`
shape. The CLI and the extension keep separate configs.

`autoApprove` is intentionally empty. Keep it that way so every PGAutoPilot
tool call (especially writes) still asks for confirmation.