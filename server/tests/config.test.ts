import { describe, it, expect } from "vitest";
import { maskCredentials, detectDatabaseUrlConflict } from "../src/config.js";

const A = "postgresql://user:pass1@localhost:5432/db_a";
const B = "postgresql://user:pass2@localhost:5432/db_b";

function envFile(url?: string) {
  return { envFilePath: "C:\\project\\.env", values: url ? { DATABASE_URL: url } : {} };
}

describe("maskCredentials", () => {
  it("masks the password", () => {
    expect(maskCredentials(A)).not.toContain("pass1");
    expect(maskCredentials(A)).toContain("****");
  });

  it("masks the username", () => {
    const masked = maskCredentials("postgresql://admin:secret@localhost:5432/db");
    expect(masked).not.toContain("admin");
  });

  it("keeps host and database visible", () => {
    expect(maskCredentials(A)).toContain("localhost:5432");
    expect(maskCredentials(A)).toContain("db_a");
  });

  it("returns the input unchanged when it is not a valid URL", () => {
    expect(maskCredentials("not-a-url")).toBe("not-a-url");
  });
});

describe("detectDatabaseUrlConflict", () => {
  it("picks the process env URL when only it is set", () => {
    const result = detectDatabaseUrlConflict(envFile(), { DATABASE_URL: A });
    expect(result.url).toBe(A);
  });

  it("picks the .env URL when only it is set", () => {
    const result = detectDatabaseUrlConflict(envFile(A), {});
    expect(result.url).toBe(A);
  });

  it("uses identical URLs from both sources without error", () => {
    const result = detectDatabaseUrlConflict(envFile(A), { DATABASE_URL: A });
    expect(result.url).toBe(A);
    expect(result.from).toHaveLength(2);
  });

  it("throws when the two sources conflict", () => {
    expect(() => detectDatabaseUrlConflict(envFile(A), { DATABASE_URL: B })).toThrow(
      /Conflicting DATABASE_URL/,
    );
  });
});
