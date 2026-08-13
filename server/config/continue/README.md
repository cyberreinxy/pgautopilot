# Continue

Config: `config/continue/mcpServers/mcp.json` → copy to **`.continue/mcpServers/mcp.json`** (project).

```json
{
  "mcpServers": {
    "pgautopilot": {
      "command": "npx",
      "args": ["-y", "pgautopilot"],
      "env": {}
    }
  }
}
```

## Setup

1. Create the folder `.continue/mcpServers/` at your workspace root and copy
   this file in. Continue auto-discovers every JSON/YAML file there.
2. Reload the Continue extension, then use PGAutoPilot tools in **Agent**
   mode (MCP is available only in agent mode).

Continue also accepts the equivalent block inside `config.yaml`:

```yaml
mcpServers:
  - name: pgautopilot
    command: npx
    args:
      - "-y"
      - pgautopilot
    env:
      DATABASE_URL: ${DATABASE_URL}
```

Set `DATABASE_URL` before starting so the server connects to PostgreSQL.