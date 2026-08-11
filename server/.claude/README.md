# Claude Desktop

Not file-based in the repo — configure globally in Claude → Settings → Developer → Edit Config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pgautopilot": { "command": "pgautopilot" }
  }
}
```

For reference, a local `.claude/mcp.json` is provided in this folder if Claude ever adds project-level MCP support.
