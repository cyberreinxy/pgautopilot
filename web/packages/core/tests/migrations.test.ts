import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import {
  listMigrations,
  applyPendingMigrations,
  applyMigrations,
  revertMigrations,
  readMigrationContent,
} from "../src/migrations.js";

function createStubPool(tableExists: boolean): { pool: Pool; calls: string[] } {
  let ensureCalled = false;
  const calls: string[] = [];
  const pool = {
    query: async (text: string) => {
      calls.push(text);
      if (/CREATE TABLE IF NOT EXISTS schema_migrations/.test(text)) {
        ensureCalled = true;
        return { rows: [], rowCount: 0 };
      }
      if (/SELECT version, applied_at FROM schema_migrations/.test(text)) {
        if (!ensureCalled && !tableExists) {
          const err = new Error('relation "schema_migrations" does not exist') as Error & {
            code?: string;
          };
          err.code = "42P01";
          throw err;
        }
        return {
          rows: [{ version: 1, applied_at: new Date("2024-01-01T00:00:00Z") }],
          rowCount: 1,
        };
      }
      throw new Error(`unexpected query: ${text}`);
    },
    connect: async () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release: () => undefined,
    }),
  } as unknown as Pool;
  return { pool, calls };
}

describe("migrations read-only handling", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "migrations-test-"));
    await writeFile(join(dir, "1_init.sql"), "SELECT 1;");
    await writeFile(join(dir, "2_seed.sql"), "SELECT 2;");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("performs no DDL and returns files as unapplied when read-only", async () => {
    const { pool, calls } = createStubPool(false);
    const migrations = await listMigrations(pool, dir, { readonly: true });
    expect(migrations).toHaveLength(2);
    expect(migrations.every((m) => m.appliedAt === null)).toBe(true);
    expect(calls.some((sql) => sql.includes("CREATE TABLE"))).toBe(false);
  });

  it("reads an existing table without DDL when read-only", async () => {
    const { pool, calls } = createStubPool(true);
    const migrations = await listMigrations(pool, dir, { readonly: true });
    expect(migrations[0]!.appliedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(calls.some((sql) => sql.includes("CREATE TABLE"))).toBe(false);
  });

  it("ensures the table when not read-only", async () => {
    const { pool, calls } = createStubPool(false);
    const migrations = await listMigrations(pool, dir, { readonly: false });
    expect(migrations[0]!.appliedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(calls.some((sql) => sql.includes("CREATE TABLE"))).toBe(true);
  });

  it("rejects applyPendingMigrations when read-only", async () => {
    const { pool } = createStubPool(false);
    await expect(applyPendingMigrations(pool, dir, { readonly: true })).rejects.toThrow(
      /read-only/,
    );
  });

  it("rejects applyMigrations when read-only", async () => {
    const { pool } = createStubPool(false);
    await expect(applyMigrations(pool, dir, [1], { readonly: true })).rejects.toThrow(/read-only/);
  });
});

function createRevertStub(appliedVersions: number[]): Pool {
  let ensureCalled = false;
  return {
    query: async (text: string) => {
      if (/CREATE TABLE IF NOT EXISTS schema_migrations/.test(text)) {
        ensureCalled = true;
        return { rows: [], rowCount: 0 };
      }
      if (/SELECT version FROM schema_migrations WHERE version = ANY/.test(text)) {
        if (!ensureCalled) throw new Error("table not ensured");
        return {
          rows: appliedVersions.map((version) => ({ version })),
          rowCount: appliedVersions.length,
        };
      }
      throw new Error(`unexpected query: ${text}`);
    },
    connect: async () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release: () => undefined,
    }),
  } as unknown as Pool;
}

describe("migration down files", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "migrations-down-test-"));
    await writeFile(join(dir, "1_init.sql"), "CREATE TABLE init (id int);");
    await writeFile(join(dir, "1_init.down.sql"), "DROP TABLE init;");
    await writeFile(join(dir, "2_seed.sql"), "SELECT 2;");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("flags hasDown from sibling .down.sql files", async () => {
    const { pool } = createStubPool(false);
    const migrations = await listMigrations(pool, dir, { readonly: true });
    const byVersion = new Map(migrations.map((m) => [m.version, m]));
    expect(byVersion.get(1)?.hasDown).toBe(true);
    expect(byVersion.get(2)?.hasDown).toBe(false);
  });

  it("excludes down files from the migration list", async () => {
    const { pool } = createStubPool(false);
    const migrations = await listMigrations(pool, dir, { readonly: true });
    expect(migrations.map((m) => m.file)).toEqual(["1_init.sql", "2_seed.sql"]);
  });

  it("rejects revertMigrations when read-only", async () => {
    const { pool } = createStubPool(false);
    await expect(revertMigrations(pool, dir, [1], { readonly: true })).rejects.toThrow(/read-only/);
  });

  it("throws when the version has no down migration", async () => {
    const pool = createRevertStub([2]);
    await expect(revertMigrations(pool, dir, [2], { readonly: false })).rejects.toThrow(
      /No down migration/,
    );
  });

  it("throws when the version is not applied", async () => {
    const pool = createRevertStub([]);
    await expect(revertMigrations(pool, dir, [1], { readonly: false })).rejects.toThrow(
      /not applied/,
    );
  });

  it("runs down, deletes the version row, re-applies up, and re-inserts", async () => {
    const calls: string[] = [];
    let ensureCalled = false;
    const pool = {
      query: async (text: string) => {
        calls.push(text);
        if (/CREATE TABLE IF NOT EXISTS schema_migrations/.test(text)) {
          ensureCalled = true;
          return { rows: [], rowCount: 0 };
        }
        if (/SELECT version FROM schema_migrations WHERE version = ANY/.test(text)) {
          if (!ensureCalled) throw new Error("table not ensured");
          return { rows: [{ version: 1 }], rowCount: 1 };
        }
        throw new Error(`unexpected query: ${text}`);
      },
      connect: async () => ({
        query: async (text: string) => {
          calls.push(text);
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined,
      }),
    } as unknown as Pool;

    const result = await revertMigrations(pool, dir, [1], { readonly: false });
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]?.version).toBe(1);
    expect(result.applied[0]?.hasDown).toBe(true);
    const joined = calls.join("\n");
    expect(joined).toContain("DROP TABLE init;");
    expect(joined).toContain("DELETE FROM schema_migrations WHERE version = $1");
    expect(joined).toContain("CREATE TABLE init (id int);");
    expect(joined).toContain("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)");
    expect(joined).toContain("COMMIT");
  });

  it("re-applies without a down migration when forced", async () => {
    const calls: string[] = [];
    const pool = {
      query: async (text: string) => {
        calls.push(text);
        if (/CREATE TABLE IF NOT EXISTS schema_migrations/.test(text)) {
          return { rows: [], rowCount: 0 };
        }
        if (/SELECT version FROM schema_migrations WHERE version = ANY/.test(text)) {
          return { rows: [{ version: 2 }], rowCount: 1 };
        }
        throw new Error(`unexpected query: ${text}`);
      },
      connect: async () => ({
        query: async (text: string) => {
          calls.push(text);
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined,
      }),
    } as unknown as Pool;

    const result = await revertMigrations(pool, dir, [2], { readonly: false, force: true });
    expect(result.applied).toHaveLength(1);
    const joined = calls.join("\n");
    expect(joined).not.toContain("DROP TABLE");
    expect(joined).toContain("DELETE FROM schema_migrations WHERE version = $1");
    expect(joined).toContain("SELECT 2;");
    expect(joined).toContain("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)");
  });
});

describe("empty migration files", () => {
  function applyStub(applied: number[]): Pool {
    let ensureCalled = false;
    return {
      query: async (text: string) => {
        if (/CREATE TABLE IF NOT EXISTS schema_migrations/.test(text)) {
          ensureCalled = true;
          return { rows: [], rowCount: 0 };
        }
        if (/SELECT version FROM schema_migrations WHERE version = ANY/.test(text)) {
          if (!ensureCalled) throw new Error("table not ensured");
          return {
            rows: applied.map((version) => ({ version })),
            rowCount: applied.length,
          };
        }
        throw new Error(`unexpected query: ${text}`);
      },
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
    } as unknown as Pool;
  }

  it("rejects applyPendingMigrations when a migration file is empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "migrations-empty-test-"));
    try {
      await writeFile(join(dir, "3_empty.sql"), "   \n  ");
      const pool = applyStub([]);
      await expect(applyPendingMigrations(pool, dir, { readonly: false })).rejects.toThrow(
        /3_empty is empty/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects applyMigrations when a migration file is empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "migrations-empty-test-"));
    try {
      await writeFile(join(dir, "3_empty.sql"), "");
      const pool = applyStub([]);
      await expect(applyMigrations(pool, dir, [3], { readonly: false })).rejects.toThrow(
        /3_empty is empty/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects revertMigrations when the up file is empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "migrations-empty-test-"));
    try {
      await writeFile(join(dir, "4_broken.sql"), "");
      const pool = applyStub([4]);
      await expect(
        revertMigrations(pool, dir, [4], { readonly: false, force: true }),
      ).rejects.toThrow(/4_broken is empty/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("readMigrationContent", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "migrations-content-test-"));
    await writeFile(join(dir, "1_init.sql"), "CREATE TABLE init (id int);");
    await writeFile(join(dir, "1_init.down.sql"), "DROP TABLE init;");
    await writeFile(join(dir, "2_seed.sql"), "SELECT 2;");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns the up content and the down content when a down file exists", async () => {
    const result = await readMigrationContent(dir, 1);
    expect(result.file).toBe("1_init.sql");
    expect(result.content).toBe("CREATE TABLE init (id int);");
    expect(result.downContent).toBe("DROP TABLE init;");
  });

  it("returns a null downContent when no down file exists", async () => {
    const result = await readMigrationContent(dir, 2);
    expect(result.file).toBe("2_seed.sql");
    expect(result.content).toBe("SELECT 2;");
    expect(result.downContent).toBeNull();
  });

  it("throws when the version does not exist", async () => {
    await expect(readMigrationContent(dir, 99)).rejects.toThrow(/not found/);
  });
});

