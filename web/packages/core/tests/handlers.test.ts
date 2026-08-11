import { describe, it, expect, beforeEach } from "vitest";
import type { Pool } from "pg";
import { toolArgsSchema } from "@pgautopilot/contracts";
import { createHandlers } from "../src/handlers.js";
import { buildSafetyState } from "../src/safety.js";
import { getSchema, invalidateSchemaCache } from "../src/schema.js";

const CORE_OPTIONS = {
  statementTimeoutMs: 10000,
  backupDir: "./backups",
  dockerContainer: null,
  databaseUrl: "postgres://user:pass@localhost:5432/db",
  allowRawWrites: false,
};

function createStubPool(): Pool {
  return {
    connect: async () => ({
      query: async () => ({ rows: [] as unknown[], rowCount: 0 }),
      release: () => undefined,
    }),
    query: async (text: string) => {
      if (/information_schema\.tables/.test(text)) {
        return { rows: [{ table_name: "users" }], rowCount: 1 };
      }
      if (/information_schema\.columns/.test(text)) {
        return {
          rows: [
            {
              column_name: "id",
              data_type: "integer",
              is_nullable: "NO",
              column_default: null,
            },
            {
              column_name: "email",
              data_type: "text",
              is_nullable: "YES",
              column_default: null,
            },
          ],
          rowCount: 2,
        };
      }
      if (/constraint_type = 'PRIMARY KEY'/.test(text)) {
        return { rows: [{ column_name: "id" }], rowCount: 1 };
      }
      if (/FOREIGN KEY/.test(text)) {
        return { rows: [], rowCount: 0 };
      }
      if (/PRIMARY KEY', 'UNIQUE/.test(text)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [{ count: 2 }], rowCount: 1 };
    },
  } as unknown as Pool;
}

function readonlySafety() {
  return buildSafetyState(true, "development", new Set(), new Set());
}

function writableSafety() {
  return buildSafetyState(false, "development", new Set(), new Set());
}

describe("createHandlers read-only gate", () => {
  beforeEach(() => {
    invalidateSchemaCache();
  });

  const writeTools = [
    ["db_create", { table: "users", data: { id: 1 } }],
    ["db_upsert", { table: "users", data: { id: 1 } }],
    ["db_update_many", { table: "users", where: { id: 1 }, data: { name: "x" } }],
    ["db_delete_many", { table: "users", where: { id: 1 } }],
  ] as const;

  for (const [tool, args] of writeTools) {
    it(`blocks ${tool} when read-only`, async () => {
      const handlers = createHandlers(createStubPool(), readonlySafety(), CORE_OPTIONS);
      await expect(handlers[tool](args)).rejects.toThrow(/READ-ONLY/);
    });
  }

  it("blocks db_backup when read-only before any file writes", async () => {
    const handlers = createHandlers(createStubPool(), readonlySafety(), CORE_OPTIONS);
    await expect(handlers.db_backup({ label: "nightly" })).rejects.toThrow(/READ-ONLY/);
  });

  it("allows write tools when not read-only", async () => {
    const handlers = createHandlers(createStubPool(), writableSafety(), CORE_OPTIONS);
    await expect(
      handlers.db_delete_many({ table: "users", where: { id: 1 } }),
    ).resolves.toMatchObject({ deleted: 1 });
  });

  it("keeps read tools functional when read-only", async () => {
    const handlers = createHandlers(createStubPool(), readonlySafety(), CORE_OPTIONS);
    const result = await handlers.db_count({ table: "users" });
    expect(result).toMatchObject({ table: "users", count: 2 });
  });

  it("rejects read/write mode overrides in scripts when read-only", async () => {
    const handlers = createHandlers(createStubPool(), readonlySafety(), CORE_OPTIONS);
    await expect(
      handlers.db_run_script({ sql: "SELECT 1; SET TRANSACTION READ WRITE;" }),
    ).rejects.toThrow(/read\/write mode/);
    await expect(
      handlers.db_run_script({ sql: "SET SESSION default_transaction_read_only = off" }),
    ).rejects.toThrow(/read\/write mode/);
  });

  it("applies a session-level read-only transaction for scripts when read-only", async () => {
    const queries: string[] = [];
    const pool = {
      ...createStubPool(),
      connect: async () => ({
        query: async (text: string) => {
          queries.push(text);
          return { rows: [] as unknown[], rowCount: 0 };
        },
        release: () => undefined,
      }),
    } as unknown as Pool;
    const handlers = createHandlers(pool, readonlySafety(), CORE_OPTIONS);
    await handlers.db_run_script({ sql: "SELECT 1" });
    expect(queries).toContain("SET SESSION default_transaction_read_only = on");
    expect(queries).toContain("SET SESSION default_transaction_read_only = off");
  });

  it("does not apply a read-only transaction for scripts when writable", async () => {
    const queries: string[] = [];
    const pool = {
      ...createStubPool(),
      connect: async () => ({
        query: async (text: string) => {
          queries.push(text);
          return { rows: [] as unknown[], rowCount: 0 };
        },
        release: () => undefined,
      }),
    } as unknown as Pool;
    const handlers = createHandlers(pool, writableSafety(), CORE_OPTIONS);
    await handlers.db_run_script({ sql: "INSERT INTO logs VALUES (1)", confirmed: true });
    expect(queries).not.toContain("SET SESSION default_transaction_read_only = on");
  });
});

describe("db_update_many confirmAll", () => {
  it("contract accepts confirmAll for db_update_many", () => {
    const args = toolArgsSchema.db_update_many.parse({
      table: "users",
      where: {},
      data: { role: "member" },
      confirmAll: true,
    });
    expect(args.confirmAll).toBe(true);
  });

  it("refuses to update all rows without confirmAll", async () => {
    const handlers = createHandlers(createStubPool(), writableSafety(), CORE_OPTIONS);
    await expect(
      handlers.db_update_many({ table: "users", where: {}, data: { email: "a@b.com" } }),
    ).rejects.toThrow(/Refusing to update ALL rows/);
  });

  it("allows updating all rows with confirmAll", async () => {
    const handlers = createHandlers(createStubPool(), writableSafety(), CORE_OPTIONS);
    const result = await handlers.db_update_many({
      table: "users",
      where: {},
      data: { email: "a@b.com" },
      confirmAll: true,
    });
    expect(result).toMatchObject({ table: "users", matched: 1 });
  });
});

describe("db_run_script confirmation", () => {
  it("rejects non-SELECT scripts without confirmed when writable", async () => {
    const handlers = createHandlers(createStubPool(), writableSafety(), CORE_OPTIONS);
    await expect(handlers.db_run_script({ sql: "INSERT INTO logs VALUES (1)" })).rejects.toThrow(
      /requires explicit user confirmation/,
    );
  });

  it("allows read-only scripts without confirmed when writable", async () => {
    const handlers = createHandlers(createStubPool(), writableSafety(), CORE_OPTIONS);
    const result = await handlers.db_run_script({
      sql: "BEGIN; SELECT 1; COMMIT;",
    });
    expect(result).toBeDefined();
  });

  it("allows non-SELECT scripts with confirmed when writable", async () => {
    const handlers = createHandlers(createStubPool(), writableSafety(), CORE_OPTIONS);
    const result = await handlers.db_run_script({
      sql: "INSERT INTO logs VALUES (1)",
      confirmed: true,
    });
    expect(result).toBeDefined();
  });

  it("allows non-SELECT scripts without confirmed when read-only", async () => {
    const handlers = createHandlers(createStubPool(), readonlySafety(), CORE_OPTIONS);
    const result = await handlers.db_run_script({ sql: "SET SESSION foo = 'x'" });
    expect(result).toBeDefined();
  });
});

describe("schema cache invalidation after writes", () => {
  function countingPool() {
    const pool = createStubPool();
    let tablesQueries = 0;
    const base = pool.query;
    pool.query = (async (text: string) => {
      if (/information_schema\.tables/.test(text)) tablesQueries += 1;
      return base(text);
    }) as Pool["query"];
    return { pool, countTablesQueries: () => tablesQueries };
  }

  it("refetches schema after a confirmed db_run_script write", async () => {
    const { pool, countTablesQueries } = countingPool();
    invalidateSchemaCache();
    await getSchema(pool);
    const warmed = countTablesQueries();

    const handlers = createHandlers(pool, writableSafety(), CORE_OPTIONS);
    await handlers.db_run_script({ sql: "DROP TABLE users", confirmed: true });

    await getSchema(pool);
    expect(countTablesQueries()).toBeGreaterThan(warmed);
  });

  it("also invalidates after a read-only db_run_script (scripts can hide writes)", async () => {
    const { pool, countTablesQueries } = countingPool();
    invalidateSchemaCache();
    await getSchema(pool);
    const warmed = countTablesQueries();

    const handlers = createHandlers(pool, writableSafety(), CORE_OPTIONS);
    await handlers.db_run_script({ sql: "SELECT 1" });

    await getSchema(pool);
    expect(countTablesQueries()).toBeGreaterThan(warmed);
  });
});

