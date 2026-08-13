# Windsurf

Config: `config/windsurf/mcp_config.json` → copy to **`.codeium/windsurf/mcp_config.json`** at your project root.

```json
{
  "mcpServers": {
    "pgautopilot": { "command": "pgautopilot" }
  }
}
```

## Setup

1. Copy `mcp_config.json` from this folder to `.codeium/windsurf/mcp_config.json` in your project root.
2. Reload Windsurf. The `pgautopilot` server appears in the MCP list.

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