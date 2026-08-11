import { describe, expect, it } from "vitest";
import {
  buildDelete,
  buildInsert,
  buildOrderBy,
  buildUpdate,
  buildUpsert,
  buildWhere,
  quoteIdent,
} from "../src/sqlBuilder.js";

const cols = new Set(["id", "name", "status", "role"]);

describe("quoteIdent", () => {
  it("rejects identifiers that could escape a quoted literal", () => {
    expect(() => quoteIdent('name"; DROP TABLE users; --')).toThrow(/Invalid identifier/);
    expect(() => quoteIdent("org!d")).toThrow(/Invalid identifier/);
    expect(() => quoteIdent("schema.table")).toThrow(/Invalid identifier/);
  });
});

describe("buildWhere", () => {
  it("parameterizes values so they can never be spliced as SQL", () => {
    const { text, values } = buildWhere({ name: "bob'; DROP TABLE users; --" }, cols, 1);
    expect(values[0]).toBe("bob'; DROP TABLE users; --");
    expect(text).not.toContain("DROP TABLE");
  });

  it("supports whitelisted operators only", () => {
    expect(() => buildWhere({ id: { dangerous: 1 } }, cols, 1)).toThrow(
      /Unsupported filter operator/,
    );
  });

  it("offsets placeholders correctly", () => {
    const { text, values } = buildWhere({ status: "a", role: "b" }, cols, 3);
    expect(text).toContain("$3");
    expect(text).toContain("$4");
    expect(values).toHaveLength(2);
  });
});

describe("buildInsert", () => {
  it("sends values as parameters, never inline", () => {
    const { text, values } = buildInsert(
      "users",
      { name: "x'; DROP TABLE users; --", status: "active" },
      cols,
    );
    expect(text).toContain("VALUES ($1, $2)");
    expect(values).toEqual(["x'; DROP TABLE users; --", "active"]);
    expect(text).not.toContain("DROP TABLE");
  });

  it("rejects unknown columns", () => {
    expect(() => buildInsert("users", { evil: "1" }, cols)).toThrow(/Unknown column/);
  });
});

describe("buildUpdate", () => {
  it("keeps both SET and WHERE values parameterized", () => {
    const { text, values } = buildUpdate("users", { name: "new'--" }, { id: 7 }, cols);
    expect(text).toContain('SET "name" = $1');
    expect(text).toContain('WHERE "id" = $2');
    expect(values).toEqual(["new'--", 7]);
  });
});

describe("buildUpsert", () => {
  it("parameterizes insert and update values", () => {
    const { text, values } = buildUpsert(
      "users",
      { id: 1, name: "v'" },
      { name: "u'" },
      ["id"],
      cols,
    );
    expect(text).toContain("$1");
    expect(text).toContain("$2");
    expect(text).toContain("$3");
    expect(values).toEqual([1, "v'", "u'"]);
  });
});

describe("buildDelete", () => {
  it("parameterizes the where clause", () => {
    const { text, values } = buildDelete("users", { status: "bogus'" }, cols);
    expect(text).toContain('WHERE "status" = $1');
    expect(values).toEqual(["bogus'"]);
  });
});

describe("buildOrderBy", () => {
  it("emits ASC and DESC for basic directions", () => {
    expect(buildOrderBy({ name: "asc" }, cols)).toBe('ORDER BY "name" ASC');
    expect(buildOrderBy({ name: "desc" }, cols)).toBe('ORDER BY "name" DESC');
  });

  it("emits explicit NULLS clauses for null-aware tokens", () => {
    expect(buildOrderBy({ name: "asc_nulls_last" }, cols)).toBe('ORDER BY "name" ASC NULLS LAST');
    expect(buildOrderBy({ name: "desc_nulls_first" }, cols)).toBe(
      'ORDER BY "name" DESC NULLS FIRST',
    );
  });

  it("supports multi-column ordering in insertion order", () => {
    expect(buildOrderBy({ status: "asc", name: "desc_nulls_first" }, cols)).toBe(
      'ORDER BY "status" ASC, "name" DESC NULLS FIRST',
    );
  });

  it("is case-insensitive for direction tokens", () => {
    expect(buildOrderBy({ status: "DESC" }, cols)).toBe('ORDER BY "status" DESC');
  });

  it("returns empty string when no ordering is provided", () => {
    expect(buildOrderBy(undefined, cols)).toBe("");
    expect(buildOrderBy({}, cols)).toBe("");
  });

  it("rejects unknown columns", () => {
    expect(() => buildOrderBy({ evil: "asc" }, cols)).toThrow(/Unknown column/);
  });

  it("rejects unknown direction tokens", () => {
    expect(() => buildOrderBy({ name: "sideways" }, cols)).toThrow(
      /Invalid sort direction "sideways"/,
    );
  });
});

