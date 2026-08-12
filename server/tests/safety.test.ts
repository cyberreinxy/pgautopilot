import { describe, it, expect } from "vitest";
import {
  buildSafetyState,
  redactRow,
  redactRows,
  sanitizeWriteData,
  checkWriteAccess,
} from "../src/safety.js";

function writableSafety() {
  return buildSafetyState(false, "development", new Set(["secret_table"]), new Set());
}

function readonlySafety() {
  return buildSafetyState(true, "development", new Set(), new Set());
}

describe("redactRow", () => {
  it("redacts sensitive top-level columns", () => {
    expect(redactRow({ id: 1, password: "hunter2" }, writableSafety())).toEqual({
      id: 1,
      password: "***REDACTED***",
    });
  });

  it("redacts sensitive keys nested in JSON columns", () => {
    const row = redactRow(
      { id: 1, profile: { api_key: "sk-123", name: "Ada", tokens: ["abc"] } },
      writableSafety(),
    );
    expect(row).toEqual({
      id: 1,
      profile: { api_key: "***REDACTED***", name: "Ada", tokens: ["abc"] },
    });
  });

  it("redacts sensitive keys inside arrays", () => {
    const row = redactRow({ items: [{ token: "t1" }, { token: "t2" }] }, writableSafety());
    expect(row.items).toEqual([{ token: "***REDACTED***" }, { token: "***REDACTED***" }]);
  });

  it("redacts sensitive keys nested under non-sensitive keys", () => {
    const row = redactRow({ session: { token: "x", sub: 1 } }, writableSafety());
    expect(row.session).toEqual({ token: "***REDACTED***", sub: 1 });
  });

  it("serializes Date values instead of collapsing them to {}", () => {
    const date = new Date("2026-08-12T00:00:00.000Z");
    expect(redactRow({ id: 1, created_at: date }, writableSafety())).toEqual({
      id: 1,
      created_at: "2026-08-12T00:00:00.000Z",
    });
  });
});

describe("redactRows", () => {
  it("redacts an array of rows", () => {
    expect(redactRows([{ token: "x" }, { name: "Ada" }], writableSafety())).toEqual([
      { token: "***REDACTED***" },
      { name: "Ada" },
    ]);
  });
});

describe("sanitizeWriteData", () => {
  it("strips sensitive columns on write and keeps others", () => {
    const { cleaned, stripped } = sanitizeWriteData(
      { name: "Ada", password_hash: "h" },
      writableSafety(),
    );
    expect(cleaned).toEqual({ name: "Ada" });
    expect(stripped).toEqual(["password_hash"]);
  });

  it("strips sensitive keys nested in objects on write", () => {
    const { cleaned, stripped } = sanitizeWriteData(
      { profile: { name: "Ada", api_key: "k" } },
      writableSafety(),
    );
    expect(cleaned).toEqual({ profile: { name: "Ada" } });
    expect(stripped).toContain("api_key");
  });

  it("strips sensitive keys nested in arrays of objects on write", () => {
    const { cleaned } = sanitizeWriteData(
      { sessions: [{ id: 1, refresh_token: "t" }, { id: 2 }] },
      writableSafety(),
    );
    expect(cleaned).toEqual({ sessions: [{ id: 1 }, { id: 2 }] });
  });
});

describe("checkWriteAccess", () => {
  it("blocks blocked tables", () => {
    expect(checkWriteAccess("secret_table", "update", writableSafety()).blocked).toBe(true);
  });

  it("blocks every write in read-only mode", () => {
    expect(checkWriteAccess("users", "update", readonlySafety()).blocked).toBe(true);
  });

  it("allows writes on writable tables", () => {
    expect(checkWriteAccess("users", "update", writableSafety()).blocked).toBe(false);
  });

  it("warns but allows high-risk tables", () => {
    const safety = buildSafetyState(false, "development", new Set(), new Set(), new Set(["users"]));
    const result = checkWriteAccess("users", "update", safety);
    expect(result).toMatchObject({ blocked: false, warning: expect.stringContaining("HIGH-RISK") });
  });

  it("blocks a table listed as both blocked and high-risk", () => {
    const safety = buildSafetyState(
      false,
      "development",
      new Set(["secret_table"]),
      new Set(),
      new Set(["secret_table"]),
    );
    expect(checkWriteAccess("secret_table", "update", safety).blocked).toBe(true);
  });
});
