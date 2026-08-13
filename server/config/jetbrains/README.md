# JetBrains (IntelliJ IDEA, WebStorm, PyCharm, GoLand, …)

Config: `config/jetbrains/mcp.json` → copy to **`.idea/mcp.json`** (project) · global via JetBrains AI Assistant config.

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

## Setup (2025.1+)

1. Copy `mcp.json` from this folder to `.idea/mcp.json` in your project root, **or**
2. **Settings → Tools → AI Assistant → Model Context Protocol (MCP)** → **Add** and paste the JSON (or use **Import from Claude**).
3. Set the **Working directory** to the folder containing your `.env` (PGAutoPilot finds `DATABASE_URL` automatically).

Committing `.idea/mcp.json` shares the config with your team. The global
location is `~/Library/Application Support/JetBrains/AIAssistant/mcp.json`
(macOS), `%APPDATA%\JetBrains\AIAssistant\mcp.json` (Windows), or
`~/.config/JetBrains/AIAssistant/mcp.json` (Linux).