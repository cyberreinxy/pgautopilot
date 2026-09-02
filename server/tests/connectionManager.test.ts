import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConnectionManager, buildDatabaseEntry } from "../src/connectionManager.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(name: string, overrides: Partial<Parameters<typeof buildDatabaseEntry>[2]> = {}) {
  return buildDatabaseEntry(
    name,
    `postgresql://user:pass@localhost:5432/${name}`,
    {
      readonly: true,
      schemas: ["public"],
      statementTimeoutMs: 10000,
      poolMax: 5,
      ...overrides,
    },
    {},
  );
}

// ---------------------------------------------------------------------------
// ConnectionManager
// ---------------------------------------------------------------------------

describe("ConnectionManager", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = new ConnectionManager();
  });

  // --- Registration ---

  describe("register", () => {
    it("registers a database entry", () => {
      manager.register("db1", makeEntry("db1"));
      expect(manager.has("db1")).toBe(true);
      expect(manager.has("db2")).toBe(false);
    });

    it("sets first registered as default", () => {
      manager.register("db1", makeEntry("db1"));
      manager.register("db2", makeEntry("db2"));
      expect(manager.getDefaultName()).toBe("db1");
    });

    it("does not overwrite default on subsequent registrations", () => {
      manager.register("db1", makeEntry("db1"));
      manager.register("db2", makeEntry("db2"));
      expect(manager.getDefaultName()).toBe("db1");
    });
  });

  // --- Default ---

  describe("setDefault", () => {
    it("changes the default database", () => {
      manager.register("db1", makeEntry("db1"));
      manager.register("db2", makeEntry("db2"));
      manager.setDefault("db2");
      expect(manager.getDefaultName()).toBe("db2");
    });

    it("throws for unknown database", () => {
      manager.register("db1", makeEntry("db1"));
      expect(() => manager.setDefault("nope")).toThrow(/not configured/);
    });
  });

  // --- resolve ---

  describe("resolve", () => {
    it("returns the provided name", () => {
      manager.register("db1", makeEntry("db1"));
      manager.register("db2", makeEntry("db2"));
      expect(manager.resolve("db2")).toBe("db2");
    });

    it("returns default when undefined", () => {
      manager.register("db1", makeEntry("db1"));
      expect(manager.resolve(undefined)).toBe("db1");
    });

    it("throws when no default and no name", () => {
      expect(() => manager.resolve(undefined)).toThrow(/No database specified/);
    });
  });

  // --- list ---

  describe("list", () => {
    it("returns all registered databases", () => {
      manager.register("db1", makeEntry("db1"));
      manager.register("db2", makeEntry("db2"));
      const list = manager.list();
      expect(list).toHaveLength(2);
      expect(list.map((d) => d.name)).toEqual(["db1", "db2"]);
    });

    it("shows correct status and readonly", () => {
      const entry = makeEntry("db1");
      entry.readonly = false;
      manager.register("db1", entry);
      const list = manager.list();
      expect(list[0]?.readonly).toBe(false);
      expect(list[0]?.status).toBe("not_connected");
      expect(list[0]?.connected).toBe(false);
    });
  });

  // --- get (lazy connect) ---

  describe("get", () => {
    it("throws for unknown database", async () => {
      await expect(manager.get("nope")).rejects.toThrow(/not configured/);
    });

    it("returns entry if already connected", async () => {
      const entry = makeEntry("db1");
      // Simulate connected state
      (entry as { status: string }).status = "connected";
      (entry as { pool: unknown }).pool = { query: async () => ({ rows: [] }) };
      manager.register("db1", entry);
      const result = await manager.get("db1");
      expect(result.status).toBe("connected");
    });
  });

  // --- closeAll ---

  describe("closeAll", () => {
    it("closes all connected pools", async () => {
      const closed: string[] = [];
      const entry1 = makeEntry("db1");
      (entry1 as { status: string }).status = "connected";
      (entry1 as { pool: unknown }).pool = {
        query: async () => ({ rows: [] }),
        end: async () => { closed.push("db1"); },
      };
      const entry2 = makeEntry("db2");
      (entry2 as { status: string }).status = "connected";
      (entry2 as { pool: unknown }).pool = {
        query: async () => ({ rows: [] }),
        end: async () => { closed.push("db2"); },
      };

      manager.register("db1", entry1);
      manager.register("db2", entry2);
      await manager.closeAll();
      expect(closed).toEqual(["db1", "db2"]);
    });

    it("does nothing when no pools are connected", async () => {
      manager.register("db1", makeEntry("db1"));
      await manager.closeAll(); // should not throw
    });
  });
});

// ---------------------------------------------------------------------------
// buildDatabaseEntry
// ---------------------------------------------------------------------------

describe("buildDatabaseEntry", () => {
  it("uses defaults when no overrides", () => {
    const entry = buildDatabaseEntry("test", "postgresql://user:pass@localhost:5432/test", {
      readonly: true,
      schemas: ["public"],
      statementTimeoutMs: 10000,
      poolMax: 5,
    });
    expect(entry.name).toBe("test");
    expect(entry.readonly).toBe(true);
    expect(entry.schemas).toEqual(["public"]);
    expect(entry.statementTimeoutMs).toBe(10000);
    expect(entry.pool).toBeNull();
    expect(entry.status).toBe("not_connected");
  });

  it("applies overrides", () => {
    const entry = buildDatabaseEntry(
      "test",
      "postgresql://user:pass@localhost:5432/test",
      { readonly: true, schemas: ["public"], statementTimeoutMs: 10000, poolMax: 5 },
      { readonly: false, schemas: ["public", "auth"], statement_timeout_ms: 30000 },
    );
    expect(entry.readonly).toBe(false);
    expect(entry.schemas).toEqual(["public", "auth"]);
    expect(entry.statementTimeoutMs).toBe(30000);
  });

  it("creates safety state with blocked and sensitive columns", () => {
    const entry = buildDatabaseEntry(
      "test",
      "postgresql://user:pass@localhost:5432/test",
      { readonly: true, schemas: ["public"], statementTimeoutMs: 10000, poolMax: 5 },
      { blocked_tables: ["audit"], sensitive_columns: ["token"] },
    );
    expect(entry.safety.blockedTables.has("audit")).toBe(true);
    expect(entry.safety.sensitiveColumns.has("token")).toBe(true);
    // Should also have defaults
    expect(entry.safety.sensitiveColumns.has("password")).toBe(true);
  });

  it("pool config includes connection string and SSL", () => {
    const entry = buildDatabaseEntry(
      "test",
      "postgresql://user:pass@localhost:5432/test",
      { readonly: true, schemas: ["public"], statementTimeoutMs: 10000, poolMax: 5 },
    );
    expect(entry.poolConfig.connectionString).toBe("postgresql://user:pass@localhost:5432/test");
    // localhost should get SSL disabled (no SSL)
    expect(entry.poolConfig.ssl).toBe(false);
  });

  it("pool config applies statement timeout", () => {
    const entry = buildDatabaseEntry(
      "test",
      "postgresql://user:pass@localhost:5432/test",
      { readonly: true, schemas: ["public"], statementTimeoutMs: 30000, poolMax: 5 },
    );
    expect(entry.poolConfig.options).toContain("statement_timeout=30000");
  });
});
