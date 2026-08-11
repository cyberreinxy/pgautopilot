import { describe, expect, it } from "vitest";
import { sqlLiteral } from "../src/sqlDump.js";

describe("sqlLiteral", () => {
  it("renders null and undefined as NULL", () => {
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(undefined)).toBe("NULL");
  });

  it("renders numbers without quoting", () => {
    expect(sqlLiteral(42)).toBe("42");
    expect(sqlLiteral(3.5)).toBe("3.5");
    expect(sqlLiteral(-1)).toBe("-1");
  });

  it("renders booleans", () => {
    expect(sqlLiteral(true)).toBe("true");
    expect(sqlLiteral(false)).toBe("false");
  });

  it("escapes single quotes in strings", () => {
    expect(sqlLiteral("it's a test")).toBe("'it''s a test'");
    expect(sqlLiteral("100% ready")).toBe("'100% ready'");
  });

  it("renders dates as ISO timestamps", () => {
    expect(sqlLiteral(new Date("2026-08-08T12:00:00.000Z"))).toBe("'2026-08-08T12:00:00.000Z'");
  });

  it("renders bytea buffers as hex literals", () => {
    expect(sqlLiteral(Buffer.from([0xde, 0xad]))).toBe("'\\xdead'");
  });

  it("renders arrays as PostgreSQL array literals", () => {
    expect(sqlLiteral([1, 2, 3])).toBe("'{\"1\",\"2\",\"3\"}'");
    expect(sqlLiteral(["a", "b"])).toBe("'{\"a\",\"b\"}'");
    expect(sqlLiteral([null, "x"])).toBe("'{NULL,\"x\"}'");
  });

  it("serializes objects as quoted JSON", () => {
    expect(sqlLiteral({ id: 1 })).toBe("'{\"id\":1}'");
  });
});
