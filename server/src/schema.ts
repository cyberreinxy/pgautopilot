import type { Pool } from "pg";

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
}

export interface ForeignKeyInfo {
  column: string;
  referencesTable: string;
  referencesColumn: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  uniqueColumnSets: string[][];
}

interface SchemaCache {
  tables: TableSchema[];
  at: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: SchemaCache | null = null;

async function fetchTables(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  return result.rows.map((r) => r.table_name);
}

async function fetchColumns(pool: Pool, table: string): Promise<ColumnInfo[]> {
  const columnsResult = await pool.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );

  const pkResult = await pool.query<{ column_name: string }>(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'`,
    [table],
  );
  const pkColumns = new Set(pkResult.rows.map((r) => r.column_name));

  return columnsResult.rows.map((row) => ({
    name: row.column_name,
    dataType: row.data_type,
    nullable: row.is_nullable === "YES",
    default: row.column_default,
    isPrimaryKey: pkColumns.has(row.column_name),
  }));
}

async function fetchForeignKeys(pool: Pool, table: string): Promise<ForeignKeyInfo[]> {
  const result = await pool.query<{
    column_name: string;
    references_table: string;
    references_column: string;
  }>(
    `SELECT
       kcu.column_name,
       ccu.table_name AS references_table,
       ccu.column_name AS references_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'`,
    [table],
  );
  return result.rows.map((row) => ({
    column: row.column_name,
    referencesTable: row.references_table,
    referencesColumn: row.references_column,
  }));
}

async function fetchUniqueColumnSets(pool: Pool, table: string): Promise<string[][]> {
  const result = await pool.query<{
    constraint_name: string;
    column_name: string;
  }>(
    `SELECT tc.constraint_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = $1
       AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
     ORDER BY tc.constraint_name, kcu.ordinal_position`,
    [table],
  );

  const grouped = new Map<string, string[]>();
  for (const row of result.rows) {
    const existing = grouped.get(row.constraint_name) ?? [];
    existing.push(row.column_name);
    grouped.set(row.constraint_name, existing);
  }
  return [...grouped.values()];
}

async function loadSchema(pool: Pool): Promise<TableSchema[]> {
  const tableNames = await fetchTables(pool);
  const tables: TableSchema[] = [];
  for (const name of tableNames) {
    const [columns, foreignKeys, uniqueColumnSets] = await Promise.all([
      fetchColumns(pool, name),
      fetchForeignKeys(pool, name),
      fetchUniqueColumnSets(pool, name),
    ]);
    tables.push({ name, columns, foreignKeys, uniqueColumnSets });
  }
  return tables;
}

export async function getSchema(pool: Pool, forceRefresh = false): Promise<TableSchema[]> {
  if (!forceRefresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.tables;
  }
  const tables = await loadSchema(pool);
  cache = { tables, at: Date.now() };
  return tables;
}

export function invalidateSchemaCache(): void {
  cache = null;
}

export async function resolveTableName(pool: Pool, input: string): Promise<TableSchema> {
  const tables = await getSchema(pool);

  const exact = tables.find((t) => t.name === input);
  if (exact) return exact;

  const lower = input.toLowerCase();
  const matches = tables.filter((t) => t.name.toLowerCase() === lower);
  const unique = matches.length === 1 ? matches[0] : undefined;
  if (unique) return unique;
  if (matches.length > 1) {
    throw new Error(
      `Table name "${input}" is ambiguous (${matches.map((t) => t.name).join(", ")}). Use the exact case.`,
    );
  }

  const suggestions = tables
    .filter((t) => t.name.toLowerCase().includes(lower))
    .slice(0, 3)
    .map((t) => t.name);
  const hint = suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : "";
  throw new Error(
    `Table "${input}" not found. Available: ${tables.map((t) => t.name).join(", ")}.${hint}`,
  );
}

export function schemaToText(tables: TableSchema[]): string {
  const lines = ["DATABASE SCHEMA", "===============", ""];
  for (const table of tables) {
    lines.push(`[TABLE] ${table.name}`);
    for (const col of table.columns) {
      const badges: string[] = [];
      if (col.isPrimaryKey) badges.push("PK");
      if (!col.nullable && !col.isPrimaryKey) badges.push("required");
      const fk = table.foreignKeys.find((f) => f.column === col.name);
      if (fk) badges.push(`-> ${fk.referencesTable}.${fk.referencesColumn}`);
      const badge = badges.length ? ` [${badges.join(", ")}]` : "";
      lines.push(`  - ${col.name}: ${col.dataType}${badge}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function relationsToText(tables: TableSchema[]): string {
  const lines = ["RELATIONSHIPS", "============", ""];
  let hasAny = false;
  for (const table of tables) {
    if (table.foreignKeys.length === 0) continue;
    hasAny = true;
    lines.push(table.name);
    for (const fk of table.foreignKeys) {
      lines.push(`  -> ${fk.column} -> ${fk.referencesTable}.${fk.referencesColumn}`);
    }
    lines.push("");
  }
  return hasAny ? lines.join("\n") : "No foreign key relationships found.";
}

export interface TableStats {
  table: string;
  approxRowCount: number;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
  estimatedSize: string;
}

export async function getTableStats(pool: Pool, table: TableSchema): Promise<TableStats> {
  const [sizeResult, countResult, indexResult] = await Promise.all([
    pool.query<{ size: string }>(
      `SELECT pg_size_pretty(pg_total_relation_size($1::regclass)) AS size`,
      [`"${table.name}"`],
    ),
    pool.query<{ estimate: number }>(
      `SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = $1`,
      [table.name],
    ),
    pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1`,
      [table.name],
    ),
  ]);

  const indexes: IndexInfo[] = indexResult.rows.map((row) => {
    const colMatch = row.indexdef.match(/\(([^)]+)\)/);
    const columns = colMatch?.[1] ? colMatch[1].split(",").map((c) => c.trim()) : [];
    return {
      name: row.indexname,
      columns,
      unique: row.indexdef.includes("UNIQUE INDEX"),
    };
  });

  return {
    table: table.name,
    approxRowCount: Math.max(0, Number(countResult.rows[0]?.estimate ?? 0)),
    columns: table.columns,
    foreignKeys: table.foreignKeys,
    indexes,
    estimatedSize: sizeResult.rows[0]?.size ?? "unknown",
  };
}
