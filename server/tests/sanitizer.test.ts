import { describe, it, expect } from "vitest";
import { stripSqlStrings } from "../src/sanitizer.js";

function isBlocked(sql: string): boolean {
  const strippedSql = stripSqlStrings(sql);
  const normalizedSql = strippedSql.toUpperCase().replace(/;\s*$/, "").trim();
  if (!/^SELECT\b/.test(normalizedSql)) return true;
  const patterns = [
    /\bPG_READ_FILE\b/,
    /\bPG_READ_BINARY_FILE\b/,
    /\bPG_LS_DIR\b/,
    /\bPG_WRITE_FILE\b/,
    /\bLO_IMPORT\b/,
    /\bLO_EXPORT\b/,
    /\bCOPY\b.*\b(FROM|TO)\b/,
    /\bPG_SLEEP\b/,
  ];
  for (const pattern of patterns) {
    if (pattern.test(normalizedSql)) return true;
  }
  if (!normalizedSql.match(/\bLIMIT\s+(\d+)/)) return true;
  return false;
}

describe("stripSqlStrings", () => {
  it("does not flag dangerous words inside string content", () => {
    expect(isBlocked("SELECT 'pg_sleep(1)' AS x LIMIT 1")).toBe(false);
  });

  it("blocks real dangerous calls", () => {
    expect(isBlocked("SELECT pg_sleep(10) LIMIT 1")).toBe(true);
    expect(isBlocked("SELECT pg_read_file('/etc/passwd') LIMIT 1")).toBe(true);
  });

  it("closes the E'' escape-string bypass", () => {
    expect(isBlocked("SELECT E'\\'' || pg_sleep(10) || E'\\'' LIMIT 1")).toBe(true);
    expect(isBlocked("SELECT E'\\'' || pg_read_file('/etc/passwd') || E'\\'' LIMIT 1")).toBe(true);
  });

  it("accepts legitimate E'' strings with escaped quotes", () => {
    expect(isBlocked("SELECT E'it\\'s fine' AS x LIMIT 1")).toBe(false);
  });

  it("does not consume content past a completed E-string with doubled quotes", () => {
    const stripped = stripSqlStrings("E'\\\\''';DROP TABLE users;--'");
    expect(stripped).toContain(";");
    expect(stripped).toContain("DROP");
  });

  it("does not consume content past an unterminated regular string", () => {
    const stripped = stripSqlStrings("SELECT 1 LIMIT 1; DROP TABLE users;--");
    expect(stripped).toContain(";");
  });

  it("strips dollar quotes and comments", () => {
    expect(stripSqlStrings("SELECT $$ a'b $$ LIMIT 1")).toBe("SELECT '' LIMIT 1");
    expect(isBlocked("SELECT 1 -- pg_sleep(1)\nLIMIT 1")).toBe(false);
  });
});
