import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PG_ENTRY, claudeConfigPath, writeEditorConfig, editorConfigs } from "../scripts/postinstall.mjs";

const tempDirs: string[] = [];

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "pgautopilot-postinstall-"));
    tempDirs.push(dir);
    return dir;
}

afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe("writeEditorConfig", () => {
    it("creates a new config file when none exists", () => {
        const file = join(tempDir(), "mcp.json");
        expect(writeEditorConfig(file, "mcpServers", PG_ENTRY)).toBe("created");
        const parsed = JSON.parse(readFileSync(file, "utf-8"));
        expect(parsed.mcpServers.pgautopilot).toEqual(PG_ENTRY);
    });

    it("merges into an existing config and preserves other servers", () => {
        const file = join(tempDir(), "mcp.json");
        writeFileSync(
            file,
            JSON.stringify({ servers: { other: { type: "stdio", command: "echo", args: ["hi"] } } }),
        );
        const entry = { type: "stdio", ...PG_ENTRY };
        expect(writeEditorConfig(file, "servers", entry)).toBe("merged");
        const parsed = JSON.parse(readFileSync(file, "utf-8"));
        expect(parsed.servers.other).toEqual({ type: "stdio", command: "echo", args: ["hi"] });
        expect(parsed.servers.pgautopilot).toEqual(entry);
    });

    it("preserves unrelated top-level keys when merging", () => {
        const file = join(tempDir(), "mcp.json");
        writeFileSync(file, JSON.stringify({ globalAgent: { mode: "x" }, servers: {} }));
        writeEditorConfig(file, "servers", PG_ENTRY);
        const parsed = JSON.parse(readFileSync(file, "utf-8"));
        expect(parsed.globalAgent).toEqual({ mode: "x" });
        expect(parsed.servers.pgautopilot).toEqual(PG_ENTRY);
    });

    it("leaves an unparseable config untouched", () => {
        const file = join(tempDir(), "mcp.json");
        writeFileSync(file, "{ not json ");
        expect(writeEditorConfig(file, "mcpServers", PG_ENTRY)).toBe("unparseable");
        expect(readFileSync(file, "utf-8")).toBe("{ not json ");
    });

    it("is idempotent when pgautopilot is already present", () => {
        const file = join(tempDir(), "mcp.json");
        writeFileSync(
            file,
            JSON.stringify({ mcpServers: { pgautopilot: { command: "npx", args: [] } } }),
        );
        writeEditorConfig(file, "mcpServers", PG_ENTRY);
        const parsed = JSON.parse(readFileSync(file, "utf-8"));
        expect(parsed.mcpServers.pgautopilot).toEqual(PG_ENTRY);
    });
});

describe("editorConfigs", () => {
    it("includes a project-scoped Claude config", () => {
        const claude = editorConfigs.find((c) => c.rel === "claude/mcp.json");
        expect(claude).toBeDefined();
        if (claude) {
            expect(claude.key).toBe("mcpServers");
            expect(claude.entry).toEqual({ command: "pgautopilot" });
        }
    });

    it("generates a valid Claude project config", () => {
        const file = join(tempDir(), "claude", "mcp.json");
        const claude = editorConfigs.find((c) => c.rel === "claude/mcp.json");
        expect(claude).toBeDefined();
        if (claude) {
            expect(writeEditorConfig(file, claude.key, claude.entry)).toBe("created");
            const parsed = JSON.parse(readFileSync(file, "utf-8"));
            expect(parsed.mcpServers.pgautopilot).toEqual({ command: "pgautopilot" });
        }
    });
});

describe("claudeConfigPath", () => {
    it("returns a Claude Desktop config path", () => {
        const path = claudeConfigPath();
        expect(path.length).toBeGreaterThan(0);
        expect(path).toContain("claude_desktop_config.json");
    });
});
