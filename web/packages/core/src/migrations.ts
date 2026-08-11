import type { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MigrationEntry } from "@pgautopilot/contracts";
import { invalidateSchemaCache } from "./schema.js";
import { createSnapshot, snapshotTableNames } from "./snapshots.js";
import type { SnapshotOptions } from "./snapshots.js";

export interface ApplyResult {
  applied: MigrationEntry[];
}

export interface ApplyOptions {
  readonly: boolean;
  force?: boolean;
  snapshot?: SnapshotOptions;
}

const FILE_PATTERN = /^(\d+)_(.+)\.sql$/;
const DOWN_FILE_PATTERN = /^(\d+)_(.+)\.down\.sql$/;

export async function readMigrationContent(
  dir: string,
  version: number,
): Promise<{ file: string; content: string; downContent: string | null }> {
  const files = await readMigrationFiles(dir);
  const migration = files.find((m) => m.version === version);
  if (!migration) throw new Error(`Migration version ${version} not found.`);
  const content = await readFile(join(dir, migration.file), "utf8");
  if (!migration.hasDown) return { file: migration.file, content, downContent: null };
  const downPath = migration.file.replace(/\.sql$/, ".down.sql");
  try {
    const downContent = await readFile(join(dir, downPath), "utf8");
    return { file: migration.file, content, downContent };
  } catch {
    return { file: migration.file, content, downContent: null };
  }
}

async function takePreChangeSnapshot(
  pool: Pool,
  options: ApplyOptions,
  label: string,
  migrationVersion?: number,
): Promise<void> {
  if (!options.snapshot?.dir) return;
  try {
    const tables = await snapshotTableNames(pool);
    if (tables.length === 0) return;
    await createSnapshot(pool, {
      options: options.snapshot,
      label,
      source: "pre-migration",
      migrationVersion,
    });
  } catch (err) {
    console.warn(
      `[pgautopilot] snapshot skipped (migrations continue): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function assertNonEmptyMigration(version: number, name: string, sql: string): void {
  if (sql.trim().length === 0) {
    throw new Error(`Migration ${version}_${name} is empty. Add SQL before applying it.`);
  }
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function readMigrationFiles(dir: string): Promise<MigrationEntry[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const downBases = new Set<string>();
  for (const file of files) {
    const match = DOWN_FILE_PATTERN.exec(file);
    if (match) downBases.add(`${match[1]}_${match[2]}`);
  }
  const entries: MigrationEntry[] = [];
  for (const file of files) {
    if (file.endsWith(".down.sql")) continue;
    const match = FILE_PATTERN.exec(file);
    if (!match) continue;
    entries.push({
      version: Number(match[1]),
      name: match[2]!,
      file,
      appliedAt: null,
      hasDown: downBases.has(`${match[1]}_${match[2]}`),
    });
  }
  entries.sort((a, b) => a.version - b.version);
  return entries;
}

async function appliedVersions(pool: Pool, versions: number[]): Promise<Set<number>> {
  if (versions.length === 0) return new Set();
  const { rows } = await pool.query<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version = ANY($1::int[])",
    [versions],
  );
  return new Set(rows.map((row) => row.version));
}

export async function listMigrations(
  pool: Pool,
  dir: string,
  options: { readonly: boolean },
): Promise<MigrationEntry[]> {
  if (!options.readonly) {
    await ensureMigrationsTable(pool);
  }
  const files = await readMigrationFiles(dir);
  if (files.length === 0) return [];
  const versions = files.map((file) => file.version);
  try {
    const { rows } = await pool.query<{ version: number; applied_at: Date }>(
      "SELECT version, applied_at FROM schema_migrations WHERE version = ANY($1::int[])",
      [versions],
    );
    const applied = new Map(rows.map((row) => [row.version, row.applied_at.toISOString()]));
    return files.map((file) => ({ ...file, appliedAt: applied.get(file.version) ?? null }));
  } catch (err) {
    if (options.readonly && isMissingRelation(err)) {
      return files.map((file) => ({ ...file, appliedAt: null }));
    }
    throw err;
  }
}

function isMissingRelation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "42P01";
}

export async function applyPendingMigrations(
  pool: Pool,
  dir: string,
  options: ApplyOptions,
): Promise<ApplyResult> {
  if (options.readonly) {
    throw new Error("Migrations cannot be applied while the server is read-only.");
  }
  await ensureMigrationsTable(pool);
  const files = await readMigrationFiles(dir);
  const appliedSet = await appliedVersions(
    pool,
    files.map((file) => file.version),
  );
  const pending = files.filter((file) => !appliedSet.has(file.version));

  const applied: MigrationEntry[] = [];
  if (pending.length === 0) return { applied };

  await takePreChangeSnapshot(
    pool,
    options,
    `Before applying ${pending.map((m) => `${m.version}_${m.name}`).join(", ")}`,
    pending[0]?.version,
  );

  const client = await pool.connect();
  try {
    for (const migration of pending) {
      const sql = await readFile(join(dir, migration.file), "utf8");
      assertNonEmptyMigration(migration.version, migration.name, sql);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [
          migration.version,
          migration.name,
        ]);
        await client.query("COMMIT");
        invalidateSchemaCache();
        applied.push({ ...migration, appliedAt: new Date().toISOString() });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw new Error(
          `Migration ${migration.version}_${migration.name} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  } finally {
    client.release();
  }
  return { applied };
}

export async function applyMigrations(
  pool: Pool,
  dir: string,
  versions: number[],
  options: ApplyOptions,
): Promise<ApplyResult> {
  if (options.readonly) {
    throw new Error("Migrations cannot be applied while the server is read-only.");
  }
  if (versions.length === 0) return { applied: [] };

  await ensureMigrationsTable(pool);
  const files = await readMigrationFiles(dir);
  const fileByVersion = new Map(files.map((f) => [f.version, f]));
  const appliedSet = await appliedVersions(
    pool,
    files.map((file) => file.version),
  );

  const missing = versions.filter((v) => !fileByVersion.has(v));
  if (missing.length > 0) {
    throw new Error(`Migration versions not found: ${missing.join(", ")}`);
  }

  const alreadyApplied = versions.filter((v) => appliedSet.has(v));
  if (alreadyApplied.length > 0) {
    throw new Error(`Migration versions already applied: ${alreadyApplied.join(", ")}`);
  }

  const sorted = [...versions].sort((a, b) => a - b);
  await takePreChangeSnapshot(
    pool,
    options,
    `Before applying ${sorted.map((v) => fileByVersion.get(v)!.name).join(", ")}`,
    sorted[0],
  );
  const client = await pool.connect();
  try {
    const applied: MigrationEntry[] = [];
    for (const version of sorted) {
      const migration = fileByVersion.get(version)!;
      const sql = await readFile(join(dir, migration.file), "utf8");
      assertNonEmptyMigration(migration.version, migration.name, sql);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [
          migration.version,
          migration.name,
        ]);
        await client.query("COMMIT");
        invalidateSchemaCache();
        applied.push({ ...migration, appliedAt: new Date().toISOString() });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw new Error(
          `Migration ${migration.version}_${migration.name} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { applied };
  } finally {
    client.release();
  }
}

export async function revertMigrations(
  pool: Pool,
  dir: string,
  versions: number[],
  options: ApplyOptions,
): Promise<ApplyResult> {
  if (options.readonly) {
    throw new Error("Migrations cannot be reverted while the server is read-only.");
  }
  if (versions.length === 0) return { applied: [] };

  await ensureMigrationsTable(pool);
  const files = await readMigrationFiles(dir);
  const fileByVersion = new Map(files.map((f) => [f.version, f]));

  const missing = versions.filter((v) => !fileByVersion.has(v));
  if (missing.length > 0) {
    throw new Error(`Migration versions not found: ${missing.join(", ")}`);
  }

  const appliedSet = await appliedVersions(pool, versions);
  const notApplied = versions.filter((v) => !appliedSet.has(v));
  if (notApplied.length > 0) {
    throw new Error(`Migration versions not applied: ${notApplied.join(", ")}`);
  }

  const noDown = versions.filter((v) => !fileByVersion.get(v)!.hasDown);
  if (noDown.length > 0 && !options.force) {
    throw new Error(
      `No down migration found for version(s): ${noDown.join(", ")}. Add a NNNN_name.down.sql file to revert safely, or pass force to re-apply without reverting.`,
    );
  }

  const sorted = [...versions].sort((a, b) => b - a);
  await takePreChangeSnapshot(
    pool,
    options,
    `Before rerunning ${sorted.map((v) => `${v}_${fileByVersion.get(v)!.name}`).join(", ")}`,
    sorted[0],
  );
  const client = await pool.connect();
  try {
    const applied: MigrationEntry[] = [];
    for (const version of sorted) {
      const migration = fileByVersion.get(version)!;
      const downSql = migration.hasDown
        ? await readFile(join(dir, migration.file.replace(/\.sql$/, ".down.sql")), "utf8")
        : null;
      const upSql = await readFile(join(dir, migration.file), "utf8");
      assertNonEmptyMigration(migration.version, migration.name, upSql);
      await client.query("BEGIN");
      try {
        if (downSql !== null) await client.query(downSql);
        await client.query("DELETE FROM schema_migrations WHERE version = $1", [migration.version]);
        await client.query(upSql);
        await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [
          migration.version,
          migration.name,
        ]);
        await client.query("COMMIT");
        invalidateSchemaCache();
        applied.push({ ...migration, appliedAt: new Date().toISOString() });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw new Error(
          `${migration.hasDown ? "Revert & re-apply" : "Reset & re-apply"} ${
            migration.version
          }_${migration.name} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { applied };
  } finally {
    client.release();
  }
}
