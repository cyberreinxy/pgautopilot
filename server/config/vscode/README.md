# VS Code + Copilot

Config: `config/vscode/mcp.json` → copy to **`.vscode/mcp.json`** at your project root.

```json
{
  "servers": {
    "pgautopilot": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "${workspaceFolder}/server"
    }
  }
}
```

## Setup

1. Copy `mcp.json` from this folder to `.vscode/mcp.json` in your project root.
2. Reload the window (Command Palette → **Reload Window**). VS Code discovers it automatically.

Two options:

- **`.vscode/mcp.json` (shown above)**. Runs from source via `npx tsx src/index.ts`, so it always tracks the latest local code. Good for development.
- **Global install.** Launch the installed `pgautopilot` command instead for a consistent experience across editors:

```json
{
  "servers": {
    "pgautopilot": { "type": "stdio", "command": "pgautopilot" }
  }
}
```

Note: VS Code uses the `servers` key with explicit `type`, unlike most other clients that use `mcpServers`.