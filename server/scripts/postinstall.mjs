import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { homedir, platform } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PG_ENTRY = { command: "npx", args: ["pgautopilot"] };
export const OPENCODE_ENTRY = { type: "local", command: ["npx", "-y", "pgautopilot"], enabled: true };
export const CLINE_ENTRY = { command: "npx", args: ["-y", "pgautopilot"], env: {}, disabled: false, autoApprove: [] };
export const ROO_ENTRY = { command: "npx", args: ["-y", "pgautopilot"], env: {}, alwaysAllow: [], disabled: false };
export const ZED_ENTRY = { command: "npx", args: ["-y", "pgautopilot"], env: {} };
export const CONFIG_DIR = "config";

export const editorConfigs = [
    {
        rel: "cursor/mcp.json",
        key: "mcpServers",
        entry: { ...PG_ENTRY },
    },
    {
        rel: "vscode/mcp.json",
        key: "servers",
        entry: { type: "stdio", ...PG_ENTRY },
    },
    {
        rel: "windsurf/mcp_config.json",
        key: "mcpServers",
        entry: { ...PG_ENTRY },
    },
    {
        rel: "claude/mcp.json",
        key: "mcpServers",
        entry: { command: "pgautopilot" },
    },
    {
        rel: "opencode/opencode.json",
        key: "mcp",
        entry: { ...OPENCODE_ENTRY },
        template: { $schema: "https://opencode.ai/config.json", mcp: {} },
    },
    {
        rel: "cline/cline_mcp_settings.json",
        key: "mcpServers",
        entry: { ...CLINE_ENTRY },
    },
    {
        rel: "kilo/kilo.json",
        key: "mcp",
        entry: { ...OPENCODE_ENTRY },
    },
    {
        rel: "roo/mcp.json",
        key: "mcpServers",
        entry: { ...ROO_ENTRY },
    },
    {
        rel: "jetbrains/mcp.json",
        key: "mcpServers",
        entry: { ...PG_ENTRY },
    },
    {
        rel: "zed/settings.json",
        key: "context_servers",
        entry: { ...ZED_ENTRY },
    },
    {
        rel: "continue/mcpServers/mcp.json",
        key: "mcpServers",
        entry: { ...PG_ENTRY, env: {} },
    },
    {
        rel: "gemini/settings.json",
        key: "mcpServers",
        entry: { ...PG_ENTRY },
    },
    {
        rel: "copilot/mcp-config.json",
        key: "mcpServers",
        entry: { ...PG_ENTRY },
    },
    {
        rel: "kimi/mcp.json",
        key: "mcpServers",
        entry: { ...PG_ENTRY },
    },
];

export const CODEX_ENTRY =
    '[mcp_servers.pgautopilot]\ncommand = "npx"\nargs = ["-y", "pgautopilot"]\n';

export function claudeConfigPath() {
    const home = homedir();
    if (platform() === "win32") {
        return join(process.env.APPDATA || home, "Claude", "claude_desktop_config.json");
    }
    if (platform() === "darwin") {
        return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    }
    return join(home, ".config", "Claude", "claude_desktop_config.json");
}

export function writeEditorConfig(filePath, key, entry, template) {
    if (existsSync(filePath)) {
        let config = {};
        try {
            config = JSON.parse(readFileSync(filePath, "utf-8"));
        } catch {
            return "unparseable";
        }
        if (typeof config !== "object" || config === null || Array.isArray(config)) {
            return "unparseable";
        }
        if (typeof config[key] !== "object" || config[key] === null || Array.isArray(config[key])) {
            config[key] = {};
        }
        config[key].pgautopilot = entry;
        writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
        return "merged";
    }
    const config = template ? { ...template } : {};
    config[key] = config[key] || {};
    config[key].pgautopilot = entry;
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
    return "created";
}

export function writeTomlEntry(filePath, tomlBlock) {
    if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8");
        if (content.includes("[mcp_servers.pgautopilot]")) {
            return "merged";
        }
        const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
        writeFileSync(filePath, content + separator + tomlBlock, "utf-8");
        return "merged";
    }
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, tomlBlock, "utf-8");
    return "created";
}

function findProjectRoot(startDir) {
    let dir = startDir;
    while (true) {
        const parent = resolve(dir, "..");
        if (parent === dir) return null;
        if (
            !dir.includes("node_modules") &&
            existsSync(resolve(dir, "package.json"))
        ) {
            return dir;
        }
        dir = parent;
    }
}

function run() {
    const projectRoot = findProjectRoot(__dirname);
    if (!projectRoot) {
        process.exit(0);
    }

    const configDir = resolve(projectRoot, CONFIG_DIR);

    let created = 0;
    let merged = 0;
    let skipped = 0;

    for (const cfg of editorConfigs) {
        const filePath = resolve(configDir, cfg.rel);
        const result = writeEditorConfig(filePath, cfg.key, cfg.entry, cfg.template);
        if (result === "created") created++;
        else if (result === "merged") merged++;
        else skipped++;
    }

    const codexPath = resolve(configDir, "codex/config.toml");
    const codexResult = writeTomlEntry(codexPath, CODEX_ENTRY);
    if (codexResult === "created") created++;
    else if (codexResult === "merged") merged++;
    else skipped++;

    const claudePath = claudeConfigPath();
    const claudeSnippet = JSON.stringify({ mcpServers: { pgautopilot: PG_ENTRY } }, null, 2);
    if (existsSync(claudePath)) {
        const result = writeEditorConfig(claudePath, "mcpServers", { ...PG_ENTRY });
        if (result === "created") created++;
        else if (result === "merged") merged++;
        else skipped++;
    }

    const envExample = resolve(projectRoot, ".env.example");
    if (!existsSync(envExample)) {
        writeFileSync(
            envExample,
            [
                "DATABASE_URL=postgresql://user:password@localhost:5432/mydb",
                "",
                "# Remote database (Neon, Supabase, RDS):",
                "# DATABASE_URL=postgresql://user:password@host.example.com:5432/mydb",
                "# PGSSLMODE=require",
                "",
                "# Safety: block writes to specific tables",
                "# BLOCKED_TABLES=audit_log,secrets",
                "",
            ].join("\n"),
        );
    }

    const envExists = existsSync(resolve(projectRoot, ".env"));
    const separator = "\u2500".repeat(50);

    console.log(`\n${separator}`);
    console.log("PGAutoPilot ready");

    if (created > 0) {
        console.log(`  ${created} editor MCP config(s) created in ${CONFIG_DIR}/`);
    }
    if (merged > 0) {
        console.log(`  ${merged} existing config(s) updated with pgautopilot`);
    }
    if (skipped > 0) {
        console.log(`  ${skipped} config(s) could not be updated automatically`);
    }
    console.log("");
    console.log(`  All client configs live in ${CONFIG_DIR}/ - copy the one you need to its target location (see ${CONFIG_DIR}/README.md).`);
    console.log("");
    console.log("  Claude Desktop (add to claude_desktop_config.json if not auto-configured):");
    console.log("  " + claudePath);
    console.log(claudeSnippet.split("\n").map((l) => "  " + l).join("\n"));
    if (!envExists) {
        console.log("  .env.example created - copy to .env and fill in DATABASE_URL");
    }

    if (envExists) {
        console.log("  .env found - DATABASE_URL will be loaded automatically");
    } else {
        console.log("");
        console.log("  Next step:");
        console.log("    cp .env.example .env");
        console.log("    # edit .env with your PostgreSQL connection string");
    }

    console.log("  Then copy the config for your editor/CLI into place and reload - pgautopilot auto-starts.");
    console.log(`${separator}\n`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    run();
}
