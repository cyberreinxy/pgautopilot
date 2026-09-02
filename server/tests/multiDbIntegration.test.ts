import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { resolve } from "path";
import type { Pool } from "pg";
import { ConnectionManager, buildDatabaseEntry } from "../src/connectionManager.js";
import { createHandlers } from "../src/toolHandlers.js";
import { buildSafetyState } from "../src/safety.js";
import { invalidateSchemaCache, setSchemas } from "../src/schema.js";
import type { AppConfig } from "../src/config.js";

// ---------------------------------------------------------------------------
// Helpers: stub pools that simulate different databases
// ---------------------------------------------------------------------------

function stubPool(
  dbName: string,
  tables: { table_schema: string; table_name: string }[] = [],
): Pool {
  return {
    query: async (text: string, _values?: unknown[]) => {
      const sql = String(text);
      if (/SELECT 1/.test(sql)) return { rows: [{ "?column?": 1 }], rowCount: 1 };
      if (/information_schema\.tables/.test(sql)) return { rows: tables, rowCount: tables.length };
      if (/information_schema\.columns/.test(sql)) {
        return {
          rows: [
            { column_name: "id", data_type: "integer", is_nullable: "NO", column_default: null },
            { column_name: "name", data_type: "text", is_nullable: "YES", column_default: null },
          ],
          rowCount: 2,
        };
      }
      if (/constraint_type = 'PRIMARY KEY'/.test(sql)) {
        return { rows: [{ column_name: "id" }], rowCount: 1 };
      }
      if (/FOREIGN KEY/.test(sql)) return { rows: [], rowCount: 0 };
      if (/PRIMARY KEY', 'UNIQUE/.test(sql)) return { rows: [], rowCount: 0 };
      if (/pg_class/.test(sql)) return { rows: [{ estimate: 100 }], rowCount: 1 };
      if (/COUNT\(\*\)/.test(sql)) return { rows: [{ count: 42 }], rowCount: 1 };
      if (/pg_size_pretty/.test(sql)) return { rows: [{ size: "8192 bytes" }], rowCount: 1 };
      if (/pg_indexes/.test(sql)) return { rows: [], rowCount: 0 };
      // For SELECT queries, return rows tagged with the DB name
      if (/SELECT/.test(sql)) {
        return { rows: [{ db: dbName, id: 1, name: `from_${dbName}` }], rowCount: 1 };
      }
      // For INSERT/UPDATE/DELETE, return a mock result row
      if (/INSERT|UPDATE|DELETE|UPSERT/i.test(sql)) {
        return { rows: [{ id: 1, name: `inserted_in_${dbName}` }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    connect: async () => ({
      query: async (text: string) => ({ rows: [], rowCount: 0 }),
      release: () => undefined,
    }),
    end: async () => undefined,
    get totalCount() { return 1; },
    get idleCount() { return 1; },
    get waitingCount() { return 0; },
  } as unknown as Pool;
}

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    poolConfig: { connectionString: "" },
    readonly: false,
    mode: "development",
    backupDir: "./backups",
    dockerContainer: null,
    blockedTables: new Set(),
    highRiskTables: new Set(),
    extraSensitiveColumns: new Set(),
    statementTimeoutMs: 10000,
    allowRawWrites: false,
    schemas: ["public"],
    disabledTools: new Set(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Integration: full multi-DB flow
// ---------------------------------------------------------------------------

describe("Multi-database integration", () => {
  let manager: ConnectionManager;
  let poolA: Pool;
  let poolB: Pool;

  beforeEach(() => {
    manager = new ConnectionManager();
  poolA = stubPool("db_a", [{ table_schema: "public", table_name: "users_a" }]);
  poolB = stubPool("db_b", [{ table_schema: "public", table_name: "orders_b" }]);

    // Register two databases with pre-built pools
    const entryA = buildDatabaseEntry("db_a", "postgresql://localhost/db_a", {
      readonly: false,
      schemas: ["public"],
      statementTimeoutMs: 10000,
      poolMax: 5,
    });
    const entryB = buildDatabaseEntry("db_b", "postgresql://localhost/db_b", {
      readonly: true,
      schemas: ["public"],
      statementTimeoutMs: 15000,
      poolMax: 5,
    });

    // Simulate connected state
    (entryA as { pool: Pool; status: string }).pool = poolA;
    (entryA as { pool: Pool; status: string }).status = "connected";
    (entryB as { pool: Pool; status: string }).pool = poolB;
    (entryB as { pool: Pool; status: string }).status = "connected";

    manager.register("db_a", entryA);
    manager.register("db_b", entryB);
    manager.setDefault("db_a");
  });

  // --- db_list_databases ---

  describe("db_list_databases", () => {
    it("returns all databases with correct info", async () => {
      const handlers = createHandlers(poolA, buildSafetyState(false, "development", new Set(), new Set()), makeConfig(), manager);
      const result = await handlers.db_list_databases({});
      const data = JSON.parse(result.content[0]!.text) as {
        mode: string;
        current_default: string;
        databases: Array<{ name: string; status: string; readonly: boolean }>;
      };
      expect(data.mode).toBe("multi-database");
      expect(data.current_default).toBe("db_a");
      expect(data.databases).toHaveLength(2);
      expect(data.databases.find((d) => d.name === "db_a")?.readonly).toBe(false);
      expect(data.databases.find((d) => d.name === "db_b")?.readonly).toBe(true);
    });
  });

  // --- db_use_database ---

  describe("db_use_database", () => {
    it("switches the default database", async () => {
      const handlers = createHandlers(poolA, buildSafetyState(false, "development", new Set(), new Set()), makeConfig(), manager);
      const result = await handlers.db_use_database({ database: "db_b" });
      const data = JSON.parse(result.content[0]!.text) as {
        success: boolean;
        current: string;
      };
      expect(data.success).toBe(true);
      expect(data.current).toBe("db_b");
      expect(manager.getDefaultName()).toBe("db_b");
    });

    it("throws for unknown database", async () => {
      const handlers = createHandlers(poolA, buildSafetyState(false, "development", new Set(), new Set()), makeConfig(), manager);
      await expect(
        handlers.db_use_database({ database: "nope" }),
      ).rejects.toThrow(/not configured/);
    });
  });

  // --- db_health multi-DB ---

  describe("db_health", () => {
    it("returns stats for all databases when no param given", async () => {
      const handlers = createHandlers(poolA, buildSafetyState(false, "development", new Set(), new Set()), makeConfig(), manager);
      const result = await handlers.db_health({});
      const data = JSON.parse(result.content[0]!.text) as {
        mode: string;
        databases: Record<string, { status: string }>;
      };
      expect(data.mode).toBe("multi-database");
      expect(data.databases.db_a?.status).toBe("connected");
      expect(data.databases.db_b?.status).toBe("connected");
    });

    it("returns stats for a specific database", async () => {
      const handlers = createHandlers(poolA, buildSafetyState(false, "development", new Set(), new Set()), makeConfig(), manager);
      const result = await handlers.db_health({ database: "db_b" });
      const data = JSON.parse(result.content[0]!.text) as {
        mode: string;
        databases: Record<string, { status: string }>;
      };
      expect(data.databases.db_b).toBeDefined();
      expect(data.databases.db_a).toBeUndefined();
    });
  });

  // --- Per-DB tool routing ---

  describe("per-DB tool routing", () => {
    it("db_find_many routes to the correct database", async () => {
      const handlers = createHandlers(poolA, buildSafetyState(false, "development", new Set(), new Set()), makeConfig(), manager);
      const result = await handlers.db_find_many({
        table: "orders_b",
        database: "db_b",
      });
      const data = JSON.parse(result.content[0]!.text) as {
        data: Array<{ db: string }>;
      };
      // The stub pool returns rows tagged with the DB name
      expect(data.data[0]?.db).toBe("db_b");
    });

    it("db_count routes to the correct database", async () => {
      const handlers = createHandlers(poolA, buildSafetyState(false, "development", new Set(), new Set()), makeConfig(), manager);
      const result = await handlers.db_count({
        table: "orders_b",
        database: "db_b",
      });
      const data = JSON.parse(result.content[0]!.text) as { count: number };
      expect(data.count).toBe(42);
    });

    it("write tools respect per-DB readonly", async () => {
      const handlers = createHandlers(poolA, buildSafetyState(false, "development", new Set(), new Set()), makeConfig(), manager);
      // db_b is readonly — should reject writes
      await expect(
        handlers.db_create({
          table: "orders_b",
          data: '{"name":"test"}',
          database: "db_b",
          dryRun: false,
        }),
      ).rejects.toThrow(/READ-ONLY/);
    });

    it("write tools allow writes on non-readonly databases", async () => {
      const handlers = createHandlers(poolA, buildSafetyState(false, "development", new Set(), new Set()), makeConfig(), manager);
      // db_a is not readonly — should allow writes
      const result = await handlers.db_create({
        table: "users_a",
        data: '{"name":"Alice"}',
        database: "db_a",
        dryRun: false,
      });
      expect(result.content[0]?.type).toBe("text");
    });
  });

  // --- ConnectionManager resolve ---

  describe("ConnectionManager resolve", () => {
    it("resolves provided name", () => {
      expect(manager.resolve("db_b")).toBe("db_b");
    });

    it("resolves default when undefined", () => {
      expect(manager.resolve(undefined)).toBe("db_a");
    });

    it("lists both databases", () => {
      const list = manager.list();
      expect(list).toHaveLength(2);
      expect(list.map((d) => d.name)).toContain("db_a");
      expect(list.map((d) => d.name)).toContain("db_b");
    });
  });
});
