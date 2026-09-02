import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { resolve } from "path";
import { loadMultiDbConfig } from "../src/config.js";

const CONFIG_FILE = resolve("pgautopilot.json");

function writeConfig(obj: unknown) {
  writeFileSync(CONFIG_FILE, JSON.stringify(obj, null, 2), "utf-8");
}

function cleanup() {
  if (existsSync(CONFIG_FILE)) unlinkSync(CONFIG_FILE);
}

describe("loadMultiDbConfig", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("returns null when no config file exists", () => {
    cleanup();
    expect(loadMultiDbConfig()).toBeNull();
  });

  it("parses a valid config", () => {
    writeConfig({
      databases: {
        db1: { url: "postgresql://user:pass@localhost:5432/db1" },
        db2: { url: "postgresql://user:pass@localhost:5432/db2" },
      },
      defaults: { readonly: true },
    });
    const config = loadMultiDbConfig();
    expect(config).not.toBeNull();
    expect(Object.keys(config!.databases)).toEqual(["db1", "db2"]);
    expect(config!.databases.db1!.url).toBe("postgresql://user:pass@localhost:5432/db1");
    expect(config!.defaults.readonly).toBe(true);
    expect(config!.defaults.schemas).toEqual(["public"]);
    expect(config!.defaults.statement_timeout_ms).toBe(10000);
  });

  it("applies default values for defaults section", () => {
    writeConfig({
      databases: {
        db1: { url: "postgresql://user:pass@localhost:5432/db1" },
      },
    });
    const config = loadMultiDbConfig();
    expect(config!.defaults.readonly).toBe(true);
    expect(config!.defaults.schemas).toEqual(["public"]);
    expect(config!.defaults.statement_timeout_ms).toBe(10000);
    expect(config!.defaults.pool_max).toBe(5);
  });

  it("respects custom defaults", () => {
    writeConfig({
      databases: {
        db1: { url: "postgresql://user:pass@localhost:5432/db1" },
      },
      defaults: {
        readonly: false,
        schemas: ["public", "auth"],
        statement_timeout_ms: 30000,
        pool_max: 10,
      },
    });
    const config = loadMultiDbConfig();
    expect(config!.defaults.readonly).toBe(false);
    expect(config!.defaults.schemas).toEqual(["public", "auth"]);
    expect(config!.defaults.statement_timeout_ms).toBe(30000);
    expect(config!.defaults.pool_max).toBe(10);
  });

  it("resolves $VAR environment variable interpolation", () => {
    process.env.TEST_DB_URL = "postgresql://user:pass@test-host:5432/testdb";
    writeConfig({
      databases: {
        db1: { url: "$TEST_DB_URL" },
      },
    });
    const config = loadMultiDbConfig();
    expect(config!.databases.db1!.url).toBe("postgresql://user:pass@test-host:5432/testdb");
    delete process.env.TEST_DB_URL;
  });

  it("resolves ${VAR} environment variable interpolation", () => {
    process.env.TEST_DB_HOST = "myhost.example.com";
    writeConfig({
      databases: {
        db1: { url: "postgresql://user:pass@${TEST_DB_HOST}:5432/db1" },
      },
    });
    const config = loadMultiDbConfig();
    expect(config!.databases.db1!.url).toBe("postgresql://user:pass@myhost.example.com:5432/db1");
    delete process.env.TEST_DB_HOST;
  });

  it("keeps literal when env var is not set", () => {
    delete process.env.NONEXISTENT_VAR_XYZ;
    writeConfig({
      databases: {
        db1: { url: "$NONEXISTENT_VAR_XYZ" },
      },
    });
    const config = loadMultiDbConfig();
    expect(config!.databases.db1!.url).toBe("$NONEXISTENT_VAR_XYZ");
  });

  // --- Validation errors ---

  it("rejects non-JSON", () => {
    writeFileSync(CONFIG_FILE, "{ invalid json", "utf-8");
    expect(() => loadMultiDbConfig()).toThrow(/Failed to parse/);
  });

  it("rejects missing databases key", () => {
    writeConfig({ other: {} });
    expect(() => loadMultiDbConfig()).toThrow(/must contain a "databases" object/);
  });

  it("rejects empty databases", () => {
    writeConfig({ databases: {} });
    expect(() => loadMultiDbConfig()).toThrow(/must define at least one database/);
  });

  it("rejects database with missing url", () => {
    writeConfig({ databases: { db1: {} } });
    expect(() => loadMultiDbConfig()).toThrow(/must have a non-empty "url" field/);
  });

  it("rejects database with empty url", () => {
    writeConfig({ databases: { db1: { url: "" } } });
    expect(() => loadMultiDbConfig()).toThrow(/must have a non-empty "url" field/);
  });

  it("rejects invalid database name (spaces)", () => {
    writeConfig({
      databases: {
        "my db": { url: "postgresql://localhost/db" },
      },
    });
    expect(() => loadMultiDbConfig()).toThrow(/is invalid/);
  });

  it("rejects invalid database name (starts with number)", () => {
    writeConfig({
      databases: {
        "1db": { url: "postgresql://localhost/db" },
      },
    });
    expect(() => loadMultiDbConfig()).toThrow(/is invalid/);
  });

  it("accepts valid database names", () => {
    writeConfig({
      databases: {
        my_db: { url: "postgresql://localhost/db1" },
        "my-db": { url: "postgresql://localhost/db2" },
        _private: { url: "postgresql://localhost/db3" },
        db123: { url: "postgresql://localhost/db4" },
      },
    });
    const config = loadMultiDbConfig();
    expect(Object.keys(config!.databases)).toEqual(["my_db", "my-db", "_private", "db123"]);
  });

  it("rejects invalid URL protocol", () => {
    writeConfig({
      databases: {
        db1: { url: "mysql://localhost/db" },
      },
    });
    expect(() => loadMultiDbConfig()).toThrow(/must use postgresql:\/\/ or postgres:\/\//);
  });

  it("rejects URL without hostname", () => {
    writeConfig({
      databases: {
        db1: { url: "postgresql:///db" },
      },
    });
    expect(() => loadMultiDbConfig()).toThrow(/missing a hostname/);
  });

  it("accepts valid postgresql URLs", () => {
    writeConfig({
      databases: {
        db1: { url: "postgresql://user:pass@localhost:5432/db1" },
        db2: { url: "postgres://user@host/db2" },
      },
    });
    const config = loadMultiDbConfig();
    expect(config).not.toBeNull();
  });

  it("skips URL validation for env var references", () => {
    writeConfig({
      databases: {
        db1: { url: "$SOME_VAR" },
      },
    });
    const config = loadMultiDbConfig();
    expect(config).not.toBeNull();
  });

  it("per-database overrides work", () => {
    writeConfig({
      databases: {
        db1: {
          url: "postgresql://localhost/db1",
          readonly: false,
          schemas: ["public", "auth"],
          blocked_tables: ["audit"],
          sensitive_columns: ["token"],
          statement_timeout_ms: 5000,
          pool_max: 10,
        },
      },
    });
    const config = loadMultiDbConfig();
    const db1 = config!.databases.db1!;
    expect(db1.readonly).toBe(false);
    expect(db1.schemas).toEqual(["public", "auth"]);
    expect(db1.blocked_tables).toEqual(["audit"]);
    expect(db1.sensitive_columns).toEqual(["token"]);
    expect(db1.statement_timeout_ms).toBe(5000);
    expect(db1.pool_max).toBe(10);
  });

  // --- globalReadonly propagation (bug fix: ALLOW_WRITES ignored in multi-db) ---

  it("globalReadonly=false makes all databases writable when no JSON override", () => {
    writeConfig({
      databases: {
        db1: { url: "postgresql://localhost/db1" },
        db2: { url: "postgresql://localhost/db2" },
      },
    });
    const config = loadMultiDbConfig(false); // globalReadonly=false (ALLOW_WRITES=true)
    expect(config!.defaults.readonly).toBe(false);
  });

  it("globalReadonly=true keeps databases readonly when no JSON override", () => {
    writeConfig({
      databases: {
        db1: { url: "postgresql://localhost/db1" },
      },
    });
    const config = loadMultiDbConfig(true); // globalReadonly=true (--readonly or no ALLOW_WRITES)
    expect(config!.defaults.readonly).toBe(true);
  });

  it("JSON defaults.readonly wins over globalReadonly", () => {
    writeConfig({
      databases: {
        db1: { url: "postgresql://localhost/db1" },
      },
      defaults: { readonly: true },
    });
    const config = loadMultiDbConfig(false); // globalReadonly=false but JSON says readonly:true
    expect(config!.defaults.readonly).toBe(true); // JSON wins
  });

  it("JSON defaults.readonly=false wins over globalReadonly=true", () => {
    writeConfig({
      databases: {
        db1: { url: "postgresql://localhost/db1" },
      },
      defaults: { readonly: false },
    });
    const config = loadMultiDbConfig(true); // globalReadonly=true but JSON says readonly:false
    expect(config!.defaults.readonly).toBe(false); // JSON wins
  });

  it("per-database readonly wins over globalReadonly and defaults", () => {
    writeConfig({
      databases: {
        db1: { url: "postgresql://localhost/db1", readonly: true },
        db2: { url: "postgresql://localhost/db2", readonly: false },
      },
      defaults: { readonly: false },
    });
    const config = loadMultiDbConfig(true); // globalReadonly=true
    // defaults.readonly=false from JSON, but per-DB overrides take precedence
    expect(config!.databases.db1!.readonly).toBe(true);  // per-DB wins
    expect(config!.databases.db2!.readonly).toBe(false); // per-DB wins
  });

  it("falls back to hardcoded true when no globalReadonly and no JSON override", () => {
    writeConfig({
      databases: {
        db1: { url: "postgresql://localhost/db1" },
      },
    });
    const config = loadMultiDbConfig(); // no globalReadonly param
    expect(config!.defaults.readonly).toBe(true); // hardcoded default
  });
});
