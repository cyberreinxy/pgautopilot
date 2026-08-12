import { describe, it, expect } from "vitest";
import { buildSafetyState, redactRow, redactRows, sanitizeWriteData } from "../src/safety.js";

function safety() {
  return buildSafetyState(false, "development", new Set(), new Set());
}

describe("redactRow", () => {
  it("redacts sensitive top-level columns", () => {
    const row = { id: 1, email: "a@b.com", password_hash: "secret" };
    const out = redactRow(row, safety());
    expect(out.password_hash).toBe("***REDACTED***");
    expect(out.id).toBe(1);
    expect(out.email).toBe("a@b.com");
  });

  it("redacts sensitive keys nested in objects", () => {
    const row = { id: 1, profile: { name: "Jane", api_key: "k123" } };
    const out = redactRow(row, safety());
    expect(out).toEqual({ id: 1, profile: { name: "Jane", api_key: "***REDACTED***" } });
  });

  it("redacts sensitive keys inside arrays of objects", () => {
    const row = { tokens: [{ scope: "r", reset_token: "abc" }, { scope: "w" }] };
    const out = redactRow(row, safety());
    expect(out.tokens).toEqual([{ scope: "r", reset_token: "***REDACTED***" }, { scope: "w" }]);
  });

  it("serializes Date values instead of collapsing them to {}", () => {
    const date = new Date("2026-08-12T00:00:00.000Z");
    const out = redactRow({ id: 1, created_at: date }, safety());
    expect(out).toEqual({ id: 1, created_at: "2026-08-12T00:00:00.000Z" });
  });
});

describe("redactRows", () => {
  it("redacts each row recursively", () => {
    const rows = [{ id: 1, meta: { ssn: "123" } }];
    const out = redactRows(rows, safety());
    const first = out[0] as { meta?: { ssn?: unknown } } | undefined;
    expect(first?.meta?.ssn).toBe("***REDACTED***");
  });
});

describe("sanitizeWriteData", () => {
  it("strips sensitive top-level fields", () => {
    const { cleaned, stripped } = sanitizeWriteData({ name: "Jane", password_hash: "x" }, safety());
    expect(cleaned).toEqual({ name: "Jane" });
    expect(stripped).toContain("password_hash");
  });

  it("strips sensitive keys nested in objects", () => {
    const { cleaned, stripped } = sanitizeWriteData(
      { profile: { name: "Jane", api_key: "k" } },
      safety(),
    );
    expect(cleaned).toEqual({ profile: { name: "Jane" } });
    expect(stripped).toContain("api_key");
  });

  it("strips sensitive keys nested in arrays of objects", () => {
    const { cleaned } = sanitizeWriteData(
      { sessions: [{ id: 1, refresh_token: "t" }, { id: 2 }] },
      safety(),
    );
    expect(cleaned).toEqual({ sessions: [{ id: 1 }, { id: 2 }] });
  });
});

