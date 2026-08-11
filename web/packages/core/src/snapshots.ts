import type { Pool } from "pg";
import { execFile as execFileCb } from "node:child_process";
import type { ExecFileOptions } from "node:child_process";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { SnapshotEntry } from "@pgautopilot/contracts";
import { buildSqlDataDump } from "./sqlDump.js";

const INDEX_FILE = "index.json";
const EXCLUDED_TABLES = new Set(["schema_migrations"]);

export interface SnapshotOptions {
  dir: string;
  databaseUrl: string;
  dockerContainer: string | null;
}

export interface CreateSnapshotInput {
  options: SnapshotOptions;
  label: string;
  source: "manual" | "pre-migration";
  migrationVersion?: number;
}

export interface RestoreResult {
  id: string;
  label: string;
  tables: string[];
  rowsRestored: number;
}

export interface RestoreSnapshotInput {
  options: SnapshotOptions;
  id: string;
}

function execFileAsync(file: string, args: string[], options: ExecFileOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    execFileCb(file, args, { encoding: "utf8", ...options }, (err, stdout) => {
      if (err) reject(err);
      else resolve(typeof stdout === "string" ? stdout : stdout.toString("utf8"));
    });
  });
}

function snapshotId(now = new Date()): string {
  const ts = now.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  return `snap-${ts}`;
}

function dumpErrorHint(options: SnapshotOptions): string {
  if (options.dockerContainer) {
    return ` If local pg_dump is unavailable, install postgresql-client or ensure the "${options.dockerContainer}" container is running.`;
  }
  return " The built-in SQL fallback was not usable — the snapshot uses pg_dump when available; install postgresql-client for full-fidelity dumps.";
}

function isMissingBinary(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

async function readIndex(dir: string): Promise<SnapshotEntry[]> {
  try {
    const raw = await readFile(join(dir, INDEX_FILE), "utf-8");
    const parsed = JSON.parse(raw) as { snapshots?: SnapshotEntry[] };
    return Array.isArray(parsed.snapshots) ? parsed.snapshots : [];
  } catch {
    return [];
  }
}

async function writeIndex(dir: string, snapshots: SnapshotEntry[]): Promise<void> {
  const tmp = join(dir, `${INDEX_FILE}.tmp`);
  const payload = JSON.stringify({ snapshots }, null, 2) + "\n";
  await writeFile(tmp, payload, "utf-8");
  await rename(tmp, join(dir, INDEX_FILE));
}

export async function snapshotTableNames(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  return result.rows.map((r) => r.table_name).filter((name) => !EXCLUDED_TABLES.has(name));
}

async function estimateRowCounts(pool: Pool, tables: string[]): Promise<number> {
  if (tables.length === 0) return 0;
  const result = await pool.query<{ total: number | null }>(
    `SELECT COALESCE(SUM(c.reltuples::bigint), 0)::int AS total
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
    [tables],
  );
  return result.rows[0]?.total ?? 0;
}

function dumpCommand(
  options: SnapshotOptions,
  tables: string[],
): { command: string; args: string[] } {
  const pgDumpArgs: string[] = [
    ...tables.flatMap((t) => ["-t", t]),
    "--data-only",
    "--column-inserts",
    "--no-owner",
    "--no-privileges",
    options.databaseUrl,
  ];
  if (options.dockerContainer) {
    return {
      command: "docker",
      args: ["exec", options.dockerContainer, "pg_dump", ...pgDumpArgs],
    };
  }
  return { command: "pg_dump", args: pgDumpArgs };
}

export async function createSnapshot(
  pool: Pool,
  input: CreateSnapshotInput,
): Promise<SnapshotEntry> {
  if (!input.options.databaseUrl) {
    throw new Error("DATABASE_URL is not set — required to create snapshots (pg_dump).");
  }
  await mkdir(input.options.dir, { recursive: true });

  const tables = await snapshotTableNames(pool);
  if (tables.length === 0) {
    throw new Error("No user tables found — nothing to snapshot.");
  }

  const now = new Date();
  const id = snapshotId(now);
  const file = `${id}.sql`;
  const { command, args } = dumpCommand(input.options, tables);

  let dump: string;
  let format: SnapshotEntry["format"] = "pg_dump";
  let pgDumpMissing = false;
  try {
    dump = await execFileAsync(command, args, {
      maxBuffer: 512 * 1024 * 1024,
      timeout: 120_000,
    });
  } catch (err) {
    pgDumpMissing = isMissingBinary(err);
    if (pgDumpMissing) {
      dump = await buildSqlDataDump(pool, tables);
      format = "sql";
    } else {
      throw new Error(
        `${command} failed.${dumpErrorHint(input.options)} ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  if (dump.trim().length === 0) {
    throw new Error("Snapshot dump is empty — nothing was captured.");
  }
  if (pgDumpMissing) {
    console.warn(
      "[pgautopilot] pg_dump not found — snapshot created with the built-in SQL fallback (data only, no schema).",
    );
  }

  await writeFile(join(input.options.dir, file), dump, "utf-8");

  const entry: SnapshotEntry = {
    id,
    file,
    label: input.label || id,
    createdAt: now.toISOString(),
    tables,
    rows: await estimateRowCounts(pool, tables),
    source: input.source,
    migrationVersion: input.migrationVersion ?? null,
    format,
  };

  const snapshots = await readIndex(input.options.dir);
  snapshots.unshift(entry);
  await writeIndex(input.options.dir, snapshots);
  return entry;
}

export async function listSnapshots(options: SnapshotOptions): Promise<SnapshotEntry[]> {
  await mkdir(options.dir, { recursive: true });
  const snapshots = await readIndex(options.dir);
  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readSnapshotContent(
  options: SnapshotOptions,
  id: string,
  maxChars = 250_000,
): Promise<{ snapshot: SnapshotEntry; content: string; truncated: boolean }> {
  const snapshot = (await listSnapshots(options)).find((s) => s.id === id);
  if (!snapshot) throw new Error(`Snapshot "${id}" not found.`);
  const dump = await readFile(join(options.dir, snapshot.file), "utf-8");
  const truncated = dump.length > maxChars;
  return {
    snapshot,
    content: truncated ? dump.slice(0, maxChars) : dump,
    truncated,
  };
}

export async function restoreSnapshot(
  pool: Pool,
  input: RestoreSnapshotInput,
): Promise<RestoreResult> {
  const snapshots = await listSnapshots(input.options);
  const snapshot = snapshots.find((s) => s.id === input.id);
  if (!snapshot) {
    throw new Error(`Snapshot "${input.id}" not found.`);
  }
  const dump = await readFile(join(input.options.dir, snapshot.file), "utf-8");
  const tables = snapshot.tables ?? [];
  if (tables.length === 0) {
    throw new Error("Snapshot has no tables to restore.");
  }

  const client = await pool.connect();
  let rowsRestored = 0;
  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
    await client.query(dump);
    rowsRestored = (dump.match(/\bINSERT INTO\b/gi) ?? []).length;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw new Error(
      `Restore failed — databases were not modified. ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    client.release();
  }
  return {
    id: snapshot.id,
    label: snapshot.label,
    tables,
    rowsRestored,
  };
}
