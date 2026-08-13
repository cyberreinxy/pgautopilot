# Kilo Code

Config: `config/kilo/kilo.json` → copy to **`.kilo/kilo.json`** (project) · `~/.config/kilo/kilo.json` (global).

```json
{
  "mcp": {
    "pgautopilot": {
      "type": "local",
      "command": ["npx", "-y", "pgautopilot"],
      "enabled": true
    }
  }
}
```

Kilo uses the opencode-style config format (top-level `mcp` key, `command` as
an array, `enabled` boolean). Both the CLI and the VS Code/JetBrains
extensions read the same files.

- **Project:** copy to `.kilo/kilo.json` (or `kilo.json`) in your project root (`.kilo/` takes priority).
- **Global:** copy to `~/.config/kilo/kilo.json`. Applies to every workspace.

## VS Code extension (legacy project file)

Older Kilo Code builds read `.kilocode/mcp.json` instead:

```json
{
  "mcpServers": {
    "pgautopilot": {
      "command": "npx",
      "args": ["-y", "pgautopilot"],
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

## CLI

```bash
kilo mcp add pgautopilot -- npx -y pgautopilot
```

The CLI writes to the same `.kilo/kilo.json` files. Restart after editing.