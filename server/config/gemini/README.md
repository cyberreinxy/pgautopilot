# Gemini CLI

Config: `config/gemini/settings.json` → copy to **`.gemini/settings.json`** (project) · `~/.gemini/settings.json` (user).

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

```bash
gemini mcp add pgautopilot npx -- -y pgautopilot          # project scope (default)
gemini mcp add pgautopilot npx -- -y pgautopilot -s user  # user scope
```

Or copy `settings.json` from this folder to `.gemini/settings.json` (project)
or `~/.gemini/settings.json` (user). Project config takes precedence over user
config. Verify with `gemini mcp list`.

To keep secrets out of the file, reference env vars in `env`:

```json
{
  "mcpServers": {
    "pgautopilot": {
      "command": "npx",
      "args": ["-y", "pgautopilot"],
      "env": { "DATABASE_URL": "$DATABASE_URL" }
    }
  }
}
```