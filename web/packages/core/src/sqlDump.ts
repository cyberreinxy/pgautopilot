import type { Pool } from "pg";

const BATCH_SIZE = 2000;

export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "'NaN'";
    if (value === Infinity) return "'Infinity'";
    if (value === -Infinity) return "'-Infinity'";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString("hex")}'`;
  if (Array.isArray(value)) return `'${arrayLiteral(value)}'`;
  if (typeof value === "object") return `'${escapeString(JSON.stringify(value))}'`;
  return `'${escapeString(String(value))}'`;
}

function escapeString(value: string): string {
  return value.replaceAll("'", "''");
}

function arrayElement(value: unknown): string {
  if (value === null) return "NULL";
  if (Array.isArray(value)) return arrayLiteral(value);
  if (value instanceof Date) return `"${value.toISOString()}"`;
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function arrayLiteral(value: unknown[]): string {
  return `{${value.map((v) => arrayElement(v)).join(",")}}`;
}

interface TableColumn {
  name: string;
  identity: string;
}

async function tableColumns(pool: Pool, table: string): Promise<TableColumn[]> {
  const result = await pool.query<TableColumn>(
    `SELECT a.attname AS name,
            a.attidentity AS identity
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = $1
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND a.attgenerated = ''
     ORDER BY a.attnum`,
    [table],
  );
  return result.rows;
}

export async function buildSqlDataDump(
  pool: Pool,
  tables: string[],
  options: { pageSize?: number } = {},
): Promise<string> {
  const pageSize = options.pageSize ?? BATCH_SIZE;
  const statements: string[] = [];

  for (const table of tables) {
    const columns = await tableColumns(pool, table);
    if (columns.length === 0) continue;
    const colList = columns.map((c) => `"${c.name}"`).join(", ");
    const hasAlwaysIdentity = columns.some((c) => c.identity === "a");
    const override = hasAlwaysIdentity ? " OVERRIDING SYSTEM VALUE" : "";

    let offset = 0;
    for (;;) {
      const result = await pool.query(
        `SELECT * FROM "${table}" ORDER BY 1 LIMIT $1 OFFSET $2`,
        [pageSize, offset],
      );
      const rows = result.rows;
      if (rows.length === 0) break;
      for (const row of rows) {
        const values = columns
          .map((c) => (row[c.name] === undefined ? "NULL" : sqlLiteral(row[c.name])))
          .join(", ");
        statements.push(`INSERT INTO "${table}"${override} (${colList}) VALUES (${values});`);
      }
      if (rows.length < pageSize) break;
      offset += rows.length;
    }

    const identityColumns = columns.filter((c) => c.identity === "a" || c.identity === "d");
    for (const column of identityColumns) {
      statements.push(
        `SELECT setval(pg_get_serial_sequence('"${table}"', '${column.name}'), (SELECT COALESCE(MAX("${column.name}"), 1) FROM "${table}"));`,
      );
    }
  }

  return statements.join("\n");
}