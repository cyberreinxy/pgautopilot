# Claude Desktop / Claude Code

Config: `config/claude/mcp.json` → copy to **`.claude/mcp.json`** (project, Claude Code).

```json
{
  "mcpServers": {
    "pgautopilot": { "command": "pgautopilot" }
  }
}
```

## Claude Code (project scope)

Copy `mcp.json` from this folder to `.claude/mcp.json` in your project root.
Claude Code reads it per-project.

## Claude Desktop (global)

Claude Desktop is not file-based in the repo. Configure it globally in
**Claude → Settings → Developer → Edit Config** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pgautopilot": { "command": "pgautopilot" }
  }
}
```

The local `.claude/mcp.json` in this folder is provided for reference / Claude
Code project-level support.