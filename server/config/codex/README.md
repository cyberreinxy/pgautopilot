# OpenAI Codex CLI

Config: `config/codex/config.toml` → copy to **`.codex/config.toml`** (project, trusted repos only) · `~/.codex/config.toml` (user).

```toml
[mcp_servers.pgautopilot]
command = "npx"
args = ["-y", "pgautopilot"]
```

## Setup

Codex is the one MCP client that uses **TOML**, not JSON. Copy `config.toml`
from this folder to `.codex/config.toml` (project-scoped only loads for
trusted projects) or `~/.codex/config.toml`.

```bash
codex mcp add pgautopilot -- npx -y pgautopilot
```

Verify with `codex mcp list`. Optional fields you can add per server:
`env = { "DATABASE_URL" = "postgresql://..." }`, `cwd`, `enabled = true`,
`startup_timeout_sec = 10`.