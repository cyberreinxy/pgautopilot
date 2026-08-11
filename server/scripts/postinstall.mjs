#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const projectRoot = findProjectRoot(__dirname);
if (!projectRoot) {
    process.exit(0);
}

const editorConfigs = {
    ".cursor/mcp.json": {
        mcpServers: {
            pgautopilot: { command: "npx", args: ["pgautopilot"] },
        },
    },
    ".vscode/mcp.json": {
        servers: {
            pgautopilot: {
                type: "stdio",
                command: "npx",
                args: ["pgautopilot"],
            },
        },
    },
    ".codeium/windsurf/mcp_config.json": {
        mcpServers: {
            pgautopilot: { command: "npx", args: ["pgautopilot"] },
        },
    },
};

let created = 0;
let skipped = 0;

for (const [relPath, content] of Object.entries(editorConfigs)) {
    const filePath = resolve(projectRoot, relPath);
    if (existsSync(filePath)) {
        skipped++;
        continue;
    }
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(content, null, 2) + "\n");
    created++;
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
if (skipped > 0) {
    console.log(`  ${skipped} config(s) already existed \u2014 left untouched`);
}
if (!envExists) {
    console.log("  .env.example created \u2014 copy to .env and fill in DATABASE_URL");
}

if (envExists) {
    console.log("  .env found \u2014 DATABASE_URL will be loaded automatically");
} else {
    console.log("");
    console.log("  Next step:");
    console.log("    cp .env.example .env");
    console.log("    # edit .env with your PostgreSQL connection string");
}

console.log("  Then reload your editor \u2014 pgautopilot auto-starts.");
console.log(`${separator}\n`);
