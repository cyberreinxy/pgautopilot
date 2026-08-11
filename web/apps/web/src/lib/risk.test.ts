import { describe, it, expect } from "vitest";
import { classifySqlRisk } from "./risk";

describe("classifySqlRisk", () => {
  it("returns null for read-only scripts", () => {
    expect(classifySqlRisk("SELECT * FROM users LIMIT 10")).toBeNull();
    expect(classifySqlRisk("BEGIN; SELECT 1; COMMIT;")).toBeNull();
  });

  it("flags drop statements as destructive", () => {
    expect(classifySqlRisk("DROP TABLE users")).toBe("drop");
  });

  it("flags truncate statements", () => {
    expect(classifySqlRisk("TRUNCATE users")).toBe("truncate");
  });

  it("flags DELETE/UPDATE without WHERE as bulk-write", () => {
    expect(classifySqlRisk("DELETE FROM users")).toBe("bulk-write");
    expect(classifySqlRisk("UPDATE users SET role = 'member'")).toBe("bulk-write");
  });

  it("flags scoped DELETE/UPDATE as write", () => {
    expect(classifySqlRisk("DELETE FROM users WHERE id = 1")).toBe("write");
    expect(classifySqlRisk("UPDATE users SET role = 'member' WHERE id = 1")).toBe("write");
  });

  it("flags INSERT and other DML as write", () => {
    expect(classifySqlRisk("INSERT INTO users (name) VALUES ('Jane')")).toBe("write");
    expect(classifySqlRisk("MERGE INTO users USING ...")).toBe("write");
  });

  it("flags DDL as write or structure", () => {
    expect(classifySqlRisk("CREATE TABLE t (id int)")).toBe("write");
    expect(classifySqlRisk("ALTER TABLE users ADD COLUMN x int")).toBe("structure");
  });

  it("ignores strings that merely mention keywords", () => {
    expect(classifySqlRisk("SELECT 'DROP TABLE users'")).toBeNull();
  });
});
