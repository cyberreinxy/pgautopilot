# opencode

Config: `config/opencode/opencode.json` → copy to **`.opencode/opencode.json`** (or `opencode.json`) at your project root.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "pgautopilot": {
      "type": "local",
      "command": ["npx", "-y", "pgautopilot"],
      "enabled": true
    }
  }
}
```

## Setup

1. Copy `opencode.json` from this folder to `.opencode/opencode.json` (or `opencode.json`) at your project root.
2. Open the folder in opencode. The `pgautopilot` MCP server auto-starts. Run `opencode mcp list` to verify.
3. Quit and restart opencode after editing the file. Config is loaded at startup.

opencode reads the file from your project root (or `.opencode/`) and walks up
to the worktree root, so you can drop it in any folder you open with opencode.

## Running from source (development)

```json
{
  "mcp": {
    "pgautopilot": {
      "type": "local",
      "command": ["npx", "tsx", "src/index.ts"],
      "cwd": "server",
      "enabled": true
    }
  }
}
```

Set `DATABASE_URL` in the working directory first (see the root README).