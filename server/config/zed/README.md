# Zed

Config: `config/zed/settings.json` → copy to **`.zed/settings.json`** (project) · `~/.config/zed/settings.json` (global).

```json
{
  "context_servers": {
    "pgautopilot": {
      "command": "npx",
      "args": ["-y", "pgautopilot"],
      "env": {}
    }
  }
}
```

## Setup

1. Copy `settings.json` from this folder to `.zed/settings.json` in your project root, **or**
2. **Settings → AI → MCP Servers** → **Add Local Server** with the config above.

Notes:
- Zed uses `context_servers` (not `mcpServers`).
- `command` is a plain string plus a separate `args` array, and `args` is
  required. Keep it present even when empty.
- Set `DATABASE_URL` (in `.env`) in the workspace root so the server finds it.