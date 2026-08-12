import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { homedir, platform } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PG_ENTRY = { command: "npx", args: ["pgautopilot"] };

export const editorConfigs = [
    { rel: ".cursor/mcp.json", key: "mcpServers", entry: { ...PG_ENTRY } },
    { rel: ".vscode/mcp.json", key: "servers", entry: { type: "stdio", ...PG_ENTRY } },
    {
        rel: ".codeium/windsurf/mcp_config.json",
        key: "mcpServers",
        entry: { ...PG_ENTRY },
    },
    { rel: ".claude/mcp.json", key: "mcpServers", entry: { command: "pgautopilot" } },
];

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

export function writeEditorConfig(filePath, key, entry) {
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
    const config = { [key]: { pgautopilot: entry } };
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
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

    let created = 0;
    let merged = 0;
    let skipped = 0;

    for (const cfg of editorConfigs) {
        const result = writeEditorConfig(resolve(projectRoot, cfg.rel), cfg.key, cfg.entry);
        if (result === "created") created++;
        else if (result === "merged") merged++;
        else skipped++;
    }

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
        console.log(`  ${created} editor MCP config(s) created`);
    }
    if (merged > 0) {
        console.log(`  ${merged} existing config(s) updated with pgautopilot`);
    }
    if (skipped > 0) {
        console.log(`  ${skipped} config(s) could not be updated automatically`);
    }
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

    console.log("  Then reload your editor - pgautopilot auto-starts.");
    console.log(`${separator}\n`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    run();
}
