import type { Pool } from "pg";
import { qualifiedTable } from "./sqlBuilder.js";

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
}

export interface ForeignKeyInfo {
  column: string;
  referencesSchema: string;
  referencesTable: string;
  referencesColumn: string;
  constraintName: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface TableSchema {
  schema: string;
  name: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  uniqueColumnSets: string[][];
  loadError?: string;
}

interface SchemaCache {
  tables: TableSchema[];
  at: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: SchemaCache | null = null;
let schemas: string[] = ["public"];

export function setSchemas(next: string[]): void {
  schemas = next.length > 0 ? next : ["public"];
}

export function getSchemas(): string[] {
  return schemas;
}

async function fetchTables(pool: Pool): Promise<{ schema: string; name: string }[]> {
  const result = await pool.query<{ table_schema: string; table_name: string }>(
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_schema = ANY($1) AND table_type = 'BASE TABLE'
     ORDER BY table_schema, table_name`,
    [schemas],
  );
  return result.rows.map((r) => ({ schema: r.table_schema, name: r.table_name }));
}

async function fetchColumns(pool: Pool, schema: string, table: string): Promise<ColumnInfo[]> {
  const columnsResult = await pool.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table],
  );

  const pkResult = await pool.query<{ column_name: string }>(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'`,
    [schema, table],
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

async function fetchForeignKeys(
  pool: Pool,
  schema: string,
  table: string,
): Promise<ForeignKeyInfo[]> {
  const result = await pool.query<{
    column_name: string;
    references_schema: string;
    references_table: string;
    references_column: string;
    constraint_name: string;
  }>(
    `SELECT
       kcu.column_name,
       ccu.table_schema AS references_schema,
       ccu.table_name AS references_table,
       ccu.column_name AS references_column,
       tc.constraint_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'FOREIGN KEY'`,
    [schema, table],
  );
  return result.rows.map((row) => ({
    column: row.column_name,
    referencesSchema: row.references_schema,
    referencesTable: row.references_table,
    referencesColumn: row.references_column,
    constraintName: row.constraint_name,
  }));
}

async function fetchUniqueColumnSets(
  pool: Pool,
  schema: string,
  table: string,
): Promise<string[][]> {
  const result = await pool.query<{
    constraint_name: string;
    column_name: string;
  }>(
    `SELECT tc.constraint_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = $1 AND tc.table_name = $2
       AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
     ORDER BY tc.constraint_name, kcu.ordinal_position`,
    [schema, table],
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
  const tablesInfo = await fetchTables(pool);
  const tables: TableSchema[] = [];
  for (const { schema, name } of tablesInfo) {
    try {
      const [columns, foreignKeys, uniqueColumnSets] = await Promise.all([
        fetchColumns(pool, schema, name),
        fetchForeignKeys(pool, schema, name),
        fetchUniqueColumnSets(pool, schema, name),
      ]);
      tables.push({ schema, name, columns, foreignKeys, uniqueColumnSets });
    } catch (err) {
      tables.push({
        schema,
        name,
        columns: [],
        foreignKeys: [],
        uniqueColumnSets: [],
        loadError: err instanceof Error ? err.message : String(err),
      });
    }
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
  countCache.clear();
}

export interface RowCount {
  count: number | null;
  exact: boolean;
}

const COUNT_CACHE_TTL_MS = 5 * 60 * 1000;
const countCache = new Map<string, { count: number | null; at: number }>();

export async function getOverviewRowCounts(
  pool: Pool,
  tables: TableSchema[],
): Promise<Map<string, RowCount>> {
  const result = new Map<string, RowCount>();
  if (tables.length === 0) return result;

  const estimateResult = await pool.query<{
    nspname: string;
    relname: string;
    estimate: number;
  }>(
    `SELECT n.nspname, c.relname, GREATEST(c.reltuples::bigint, 0) AS estimate
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1) AND c.relname = ANY($2)`,
    [schemas, tables.map((t) => t.name)],
  );
  const estimates = new Map(
    estimateResult.rows.map((r) => [`${r.nspname}.${r.relname}`, Number(r.estimate)]),
  );

  await Promise.all(
    tables.map(async (t) => {
      const key = `${t.schema}.${t.name}`;
      const estimate = estimates.get(key) ?? 0;
      if (estimate > 0) {
        result.set(key, { count: estimate, exact: false });
        return;
      }
      const cached = countCache.get(key);
      if (cached && Date.now() - cached.at < COUNT_CACHE_TTL_MS) {
        result.set(key, { count: cached.count, exact: cached.count !== null });
        return;
      }
      let exact: number | null = null;
      try {
        const r = await pool.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM ${qualifiedTable(t.schema, t.name)}`,
        );
        exact = r.rows[0]?.count ?? 0;
      } catch {
        exact = null;
      }
      countCache.set(key, { count: exact, at: Date.now() });
      result.set(key, { count: exact, exact: exact !== null });
    }),
  );

  return result;
}

function assertLoadable(table: TableSchema): TableSchema {
  if (table.loadError) {
    throw new Error(
      `Table "${tableDisplayName(table.schema, table.name)}" could not be fully introspected: ${table.loadError}`,
    );
  }
  return table;
}

export function tableDisplayName(schema: string, name: string): string {
  return schemas.length === 1 && schemas[0] === "public" ? name : `${schema}.${name}`;
}

export async function resolveTableName(pool: Pool, input: string): Promise<TableSchema> {
  const tables = await getSchema(pool);

  const exactQualified = tables.filter((t) => `${t.schema}.${t.name}` === input);
  if (exactQualified.length > 1) {
    throw new Error(
      `Table name "${input}" is ambiguous (${exactQualified.map((t) => tableDisplayName(t.schema, t.name)).join(", ")}). Use the exact or schema-qualified name.`,
    );
  }
  const exact = exactQualified[0];
  if (exact) return assertLoadable(exact);

  const lower = input.toLowerCase();
  const matches = tables.filter(
    (t) => t.name.toLowerCase() === lower || `${t.schema}.${t.name}`.toLowerCase() === lower,
  );
  const unique = matches[0];
  if (unique && matches.length === 1) return assertLoadable(unique);
  if (matches.length > 1) {
    throw new Error(
      `Table name "${input}" is ambiguous (${matches.map((t) => tableDisplayName(t.schema, t.name)).join(", ")}). Use the exact or schema-qualified name.`,
    );
  }

  const suggestions = tables
    .filter(
      (t) =>
        `${t.schema}.${t.name}`.toLowerCase().includes(lower) ||
        t.name.toLowerCase().includes(lower),
    )
    .slice(0, 3)
    .map((t) => tableDisplayName(t.schema, t.name));
  const hint = suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : "";
  throw new Error(
    `Table "${input}" not found. Available: ${tables.map((t) => tableDisplayName(t.schema, t.name)).join(", ")}.${hint}`,
  );
}

export function schemaToText(tables: TableSchema[]): string {
  const lines = ["DATABASE SCHEMA", "===============", ""];
  for (const table of tables) {
    lines.push(`[TABLE] ${tableDisplayName(table.schema, table.name)}`);
    for (const col of table.columns) {
      const badges: string[] = [];
      if (col.isPrimaryKey) badges.push("PK");
      if (!col.nullable && !col.isPrimaryKey) badges.push("required");
      const fk = table.foreignKeys.find((f) => f.column === col.name);
      if (fk) badges.push(`-> ${referenceDisplay(fk)}`);
      const badge = badges.length ? ` [${badges.join(", ")}]` : "";
      lines.push(`  - ${col.name}: ${col.dataType}${badge}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function referenceDisplay(fk: ForeignKeyInfo): string {
  const table =
    schemas.length > 1 ? `${fk.referencesSchema}.${fk.referencesTable}` : fk.referencesTable;
  return `${table}.${fk.referencesColumn}`;
}

function semanticRelationLabel(fk: ForeignKeyInfo): string {
  const constraint = fk.constraintName ?? "";
  if (constraint === "" || /_fkey$/i.test(constraint)) {
    return `${fk.column} -> ${referenceDisplay(fk)}`;
  }
  return `${fk.column} -> ${referenceDisplay(fk)} [${constraint}]`;
}

export function relationsToText(tables: TableSchema[]): string {
  const lines = ["RELATIONSHIPS", "============", ""];
  let hasAny = false;
  for (const table of tables) {
    if (table.foreignKeys.length === 0) continue;
    hasAny = true;
    lines.push(tableDisplayName(table.schema, table.name));
    for (const fk of table.foreignKeys) {
      lines.push(`  -> ${semanticRelationLabel(fk)}`);
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
      [`"${table.schema}"."${table.name}"`],
    ),
    pool.query<{ estimate: number }>(
      `SELECT GREATEST(c.reltuples::bigint, 0) AS estimate
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2`,
      [table.schema, table.name],
    ),
    pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = ANY($1) AND tablename = $2`,
      [schemas, table.name],
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
    table: tableDisplayName(table.schema, table.name),
    approxRowCount: Math.max(0, Number(countResult.rows[0]?.estimate ?? 0)),
    columns: table.columns,
    foreignKeys: table.foreignKeys,
    indexes,
    estimatedSize: sizeResult.rows[0]?.size ?? "unknown",
  };
}
