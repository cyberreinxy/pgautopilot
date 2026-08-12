import { describe, it, expect, beforeEach } from "vitest";
import type { Pool } from "pg";
import { createHandlers } from "../src/toolHandlers.js";
import { buildSafetyState } from "../src/safety.js";
import { invalidateSchemaCache } from "../src/schema.js";
import type { AppConfig } from "../src/config.js";

const CONFIG: AppConfig = {
  poolConfig: {},
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
};

function createStubPool(rowsForQuery: (text: string) => unknown[] = () => []): Pool {
  const client = {
    query: async (text: string) => ({ rows: rowsForQuery(String(text)), rowCount: 0 }),
    release: () => undefined,
  };
  return {
    connect: async () => client,
    query: async (text: string) => {
      const sql = String(text);
      if (/information_schema\.tables/.test(sql)) {
        return { rows: [{ table_schema: "public", table_name: "users" }], rowCount: 1 };
      }
      if (/information_schema\.columns/.test(sql)) {
        return {
          rows: [
            { column_name: "id", data_type: "integer", is_nullable: "NO", column_default: null },
            {
              column_name: "email",
              data_type: "text",
              is_nullable: "YES",
              column_default: null,
            },
            {
              column_name: "password",
              data_type: "text",
              is_nullable: "YES",
              column_default: null,
            },
          ],
          rowCount: 3,
        };
      }
      if (/constraint_type = 'PRIMARY KEY'/.test(sql)) {
        return { rows: [{ column_name: "id" }], rowCount: 1 };
      }
      if (/FOREIGN KEY/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/PRIMARY KEY', 'UNIQUE/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: rowsForQuery(sql), rowCount: 0 };
    },
  } as unknown as Pool;
}

function developmentSafety() {
  return buildSafetyState(false, "development", new Set(), new Set());
}

function readonlySafety() {
  return buildSafetyState(true, "development", new Set(), new Set());
}

function firstText(result: { content: { type: string; text: string }[] }): unknown {
  return JSON.parse(result.content[0]?.text ?? "");
}

describe("db_raw_query validation", () => {
  beforeEach(() => invalidateSchemaCache());

  it("rejects multi-statement SQL", async () => {
    const handlers = createHandlers(createStubPool(), developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "SELECT 1; SELECT 2", confirmed: false }),
    ).rejects.toThrow(/Multi-statement/);
  });

  it("rejects non-SELECT SQL", async () => {
    const handlers = createHandlers(createStubPool(), developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "DELETE FROM users", confirmed: false }),
    ).rejects.toThrow(/Only SELECT/);
  });

  it("blocks authentication catalog queries", async () => {
    const handlers = createHandlers(createStubPool(), developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "SELECT * FROM pg_authid LIMIT 1", confirmed: false }),
    ).rejects.toThrow(/authentication catalogs/);
  });

  it("rejects dangerous functions", async () => {
    const handlers = createHandlers(createStubPool(), developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "SELECT pg_sleep(10) LIMIT 1", confirmed: false }),
    ).rejects.toThrow(/Dangerous/);
  });

  it("requires a terminal LIMIT clause", async () => {
    const handlers = createHandlers(createStubPool(), developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "SELECT * FROM users", confirmed: false }),
    ).rejects.toThrow(/LIMIT/);
  });

  it("does not accept a fake LIMIT inside a string literal", async () => {
    const handlers = createHandlers(createStubPool(), developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "SELECT 'LIMIT 1' FROM users", confirmed: false }),
    ).rejects.toThrow(/LIMIT/);
  });

  it("rejects LIMIT above the cap", async () => {
    const handlers = createHandlers(createStubPool(), developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "SELECT * FROM users LIMIT 99999", confirmed: false }),
    ).rejects.toThrow(/exceeds maximum/);
  });

  it("blocks raw writes in read-only mode even when confirmed and enabled", async () => {
    const config = { ...CONFIG, allowRawWrites: true };
    const handlers = createHandlers(createStubPool(), readonlySafety(), config);
    await expect(
      handlers.db_raw_query({ sql: "UPDATE users SET email='x'", confirmed: true }),
    ).rejects.toThrow(/read-only/);
  });

  it("accepts a valid SELECT with terminal LIMIT", async () => {
    const handlers = createHandlers(createStubPool(), developmentSafety(), CONFIG);
    const result = await handlers.db_raw_query({
      sql: "SELECT id FROM users LIMIT 5",
      confirmed: false,
    });
    expect(result.content[0]?.type).toBe("text");
  });
});

describe("db_aggregate redaction", () => {
  beforeEach(() => invalidateSchemaCache());

  it("redacts group-by and aggregate columns derived from sensitive columns", async () => {
    const pool = createStubPool((text) => {
      if (String(text).startsWith("SELECT")) {
        return [{ password: "hunter2", count: 3, min_password: "aaa" }];
      }
      return [];
    });
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_aggregate({
      table: "users",
      by: "password",
      min: "password",
    });
    const payload = firstText(result) as {
      data: { password: string; count: number; min_password: string }[];
    };
    expect(payload.data).toEqual([
      { password: "***REDACTED***", count: 3, min_password: "***REDACTED***" },
    ]);
  });
});

describe("db_update_many confirmAll gate", () => {
  beforeEach(() => invalidateSchemaCache());

  it("refuses to update all rows without confirmAll", async () => {
    const handlers = createHandlers(createStubPool(), developmentSafety(), CONFIG);
    await expect(
      handlers.db_update_many({
        table: "users",
        where: "{}",
        data: '{"email":"a@b.com"}',
        dryRun: false,
        confirmAll: false,
      }),
    ).rejects.toThrow(/Refusing to update ALL rows/);
  });

  it("allows updating all rows with confirmAll", async () => {
    const handlers = createHandlers(createStubPool(), developmentSafety(), CONFIG);
    const result = await handlers.db_update_many({
      table: "users",
      where: "{}",
      data: '{"email":"a@b.com"}',
      dryRun: false,
      confirmAll: true,
    });
    expect(result.content[0]?.type).toBe("text");
  });
});

describe("db_create high-risk warning", () => {
  beforeEach(() => invalidateSchemaCache());

  it("surfaces a HIGH-RISK warning on dry-run writes", async () => {
    const safety = buildSafetyState(false, "development", new Set(), new Set(), new Set(["users"]));
    const handlers = createHandlers(createStubPool(), safety, CONFIG);
    const result = await handlers.db_create({
      table: "users",
      data: '{"email":"a@b.com"}',
      dryRun: true,
    });
    const payload = firstText(result) as { warnings?: string[] };
    expect(payload.warnings).toEqual([expect.stringContaining("HIGH-RISK")]);
  });
});
