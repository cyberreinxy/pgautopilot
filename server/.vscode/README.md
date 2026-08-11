# VS Code + Copilot

Two options:

- `.mcp.json` — runs from source via `npx tsx src/index.ts`, so it always tracks the latest local code. Good for development.
- `.vscode/mcp.json` — launches the globally installed `pgautopilot` command instead. Use this when you want the same behavior as the other editors (a consistent `command` across all of them).

VS Code discovers either when the workspace opens. Reload the window after changes if the server doesn't appear.
