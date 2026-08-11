import { describe, it, expect, beforeEach } from "vitest";
import type { Pool } from "pg";
import {
  getSchema,
  setSchemas,
  getSchemas,
  tableDisplayName,
  resolveTableName,
  getOverviewRowCounts,
  invalidateSchemaCache,
} from "../src/schema.js";

function stubPool(tables: { table_schema: string; table_name: string }[]): Pool {
  return {
    query: async (text: string) => {
      const sql = String(text);
      if (/information_schema\.tables/.test(sql)) {
        return { rows: tables, rowCount: tables.length };
      }
      if (/information_schema\.columns/.test(sql)) {
        return {
          rows: [
            { column_name: "id", data_type: "integer", is_nullable: "NO", column_default: null },
          ],
          rowCount: 1,
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
      if (/pg_class/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/COUNT\(\*\)/.test(sql)) {
        return { rows: [{ count: 42 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
}

describe("schema configuration", () => {
  beforeEach(() => {
    invalidateSchemaCache();
    setSchemas(["public"]);
  });

  it("defaults to public when nothing is configured", () => {
    setSchemas([]);
    expect(getSchemas()).toEqual(["public"]);
  });

  it("keeps configured schemas", () => {
    setSchemas(["public", "auth"]);
    expect(getSchemas()).toEqual(["public", "auth"]);
  });

  it("shows bare names for public-only and qualified names otherwise", () => {
    setSchemas(["public"]);
    expect(tableDisplayName("public", "users")).toBe("users");
    setSchemas(["public", "auth"]);
    expect(tableDisplayName("public", "users")).toBe("public.users");
    expect(tableDisplayName("auth", "users")).toBe("auth.users");
  });
});

describe("resolveTableName", () => {
  beforeEach(() => {
    invalidateSchemaCache();
    setSchemas(["public", "auth"]);
  });

  it("resolves a unique bare name across schemas", async () => {
    const pool = stubPool([
      { table_schema: "public", table_name: "users" },
      { table_schema: "auth", table_name: "sessions" },
    ]);
    const table = await resolveTableName(pool, "users");
    expect(table.schema).toBe("public");
    expect(table.name).toBe("users");
  });

  it("resolves a schema-qualified name", async () => {
    const pool = stubPool([
      { table_schema: "public", table_name: "users" },
      { table_schema: "auth", table_name: "users" },
    ]);
    const table = await resolveTableName(pool, "auth.users");
    expect(table.schema).toBe("auth");
  });

  it("rejects ambiguous bare names", async () => {
    const pool = stubPool([
      { table_schema: "public", table_name: "users" },
      { table_schema: "auth", table_name: "users" },
    ]);
    await expect(resolveTableName(pool, "users")).rejects.toThrow(/ambiguous/);
  });
});

describe("getOverviewRowCounts", () => {
  beforeEach(() => {
    invalidateSchemaCache();
    setSchemas(["public", "auth"]);
  });

  it("falls back to exact COUNT when the planner estimate is zero", async () => {
    const pool = stubPool([
      { table_schema: "public", table_name: "users" },
      { table_schema: "auth", table_name: "sessions" },
    ]);
    const tables = await getSchema(pool);
    const counts = await getOverviewRowCounts(pool, tables);
    expect(counts.get("public.users")).toEqual({ count: 42, exact: true });
    expect(counts.get("auth.sessions")).toEqual({ count: 42, exact: true });
  });
});
