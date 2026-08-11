import type { Pool } from "pg";
import { getSchema } from "./schema.js";

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export interface SqlSnapshot {
  sql: string;
  note?: string;
}

export async function createSqlSnapshot(pool: Pool): Promise<SqlSnapshot> {
  const tables = await getSchema(pool);
  const chunks: string[] = [
    "-- SqlSnapshot: schema created from information_schema (no pg_dump required)",
    "BEGIN;",
  ];

  for (const table of tables) {
    const cols = table.columns;
    const lines: string[] = [];
    for (const col of cols) {
      let def = `  ${quoteIdent(col.name)} ${col.dataType}`;
      if (col.default !== null) def += ` DEFAULT ${col.default}`;
      if (!col.nullable && !col.isPrimaryKey) def += " NOT NULL";
      lines.push(def);
    }
    const pk = cols.filter((c) => c.isPrimaryKey).map((c) => quoteIdent(c.name));
    if (pk.length) lines.push(`  PRIMARY KEY (${pk.join(", ")})`);
    chunks.push(`CREATE TABLE IF NOT EXISTS ${quoteIdent(table.name)} (\n${lines.join(",\n")}\n);`);
  }

  for (const table of tables) {
    const cols = table.columns.map((c) => quoteIdent(c.name)).join(", ");
    const { rows } = await pool.query(`SELECT ${cols} FROM ${quoteIdent(table.name)}`);
    if (rows.length === 0) continue;
    const rowLines = rows.map((row) => {
      const values = table.columns.map((c) => toLiteral(row[c.name]));
      return `(${values.join(", ")})`;
    });
    chunks.push(`INSERT INTO ${quoteIdent(table.name)} (${cols}) VALUES\n${rowLines.join(",\n")};`);
  }

  chunks.push("COMMIT;");
  return { sql: chunks.join("\n\n") };
}

export function toLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (Buffer.isBuffer(value)) return `decode('${value.toString("hex")}', 'hex')`;
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}
