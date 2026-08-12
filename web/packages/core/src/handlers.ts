import type { Pool } from "pg";
import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { ToolName } from "@pgautopilot/contracts";
import { friendlyDbError, relationNameFromError } from "./errors.js";
import { stripSqlStrings } from "./sanitizer.js";
import {
  getSchema,
  invalidateSchemaCache,
  resolveTableName,
  schemaToText,
  relationsToText,
  getTableStats,
} from "./schema.js";
import type { TableSchema } from "./schema.js";
import {
  redactRow,
  redactRows,
  sanitizeWriteData,
  checkWriteAccess,
  bulkWarning,
} from "./safety.js";
import type { SafetyState } from "./safety.js";
import {
  buildWhere,
  buildOrderBy,
  buildSelectColumns,
  buildInsert,
  buildUpdate,
  buildDelete,
  buildUpsert,
  buildCount,
  quoteIdent,
} from "./sqlBuilder.js";
import { createSqlSnapshot } from "./sqlSnapshot.js";

export interface ChangeEvent {
  table: string;
  action: "create" | "upsert" | "update" | "delete" | "script";
  entityId?: string;
}

export interface CoreOptions {
  statementTimeoutMs: number;
  backupDir: string;
  dockerContainer: string | null;
  databaseUrl: string;
  allowRawWrites: boolean;
  onChange?: (event: ChangeEvent) => void;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
export type HandlerMap = Record<ToolName, ToolHandler>;

const MAX_TAKE = 500;
const MAX_RAW_TAKE = 5000;

const READ_WRITE_OVERRIDE_RE = /\bREAD\s+WRITE\b|default_transaction_read_only\s*=\s*(off|false)/i;

const AUTH_CATALOG_RE = /\b(PG_AUTHID|PG_SHADOW|PG_AUTH_MEMBERS|PG_ROLES|PG_USER|PG_GROUP)\b/;

const DANGEROUS_PATTERNS = [
  /\bPG_READ_FILE\b/,
  /\bPG_READ_BINARY_FILE\b/,
  /\bPG_LS_DIR\b/,
  /\bPG_WRITE_FILE\b/,
  /\bLO_IMPORT\b/,
  /\bLO_EXPORT\b/,
  /\bCOPY\b.*\b(FROM|TO)\b/,
  /\bPG_SLEEP\b/,
];

function findPgDump(): string {
  if (process.platform === "win32") {
    const roots = [
      process.env["ProgramFiles"] || "C:\\Program Files",
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    ];
    const versions = [18, 17, 16, 15, 14, 13, 12];
    for (const root of roots) {
      for (const version of versions) {
        const candidate = `${root}\\PostgreSQL\\${version}\\bin\\pg_dump.exe`;
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return "pg_dump";
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function redactAggregateRows(
  rows: Record<string, unknown>[],
  safety: SafetyState,
  groupCols: string[],
  aggregates: { label: string; cols: string[] }[],
): Record<string, unknown>[] {
  const sensitiveKeys = new Set<string>();
  for (const col of groupCols) {
    if (safety.sensitiveColumns.has(col.toLowerCase())) sensitiveKeys.add(col);
  }
  for (const agg of aggregates) {
    for (const col of agg.cols) {
      if (safety.sensitiveColumns.has(col.toLowerCase())) sensitiveKeys.add(`${agg.label}_${col}`);
    }
  }
  if (sensitiveKeys.size === 0) return rows;
  return rows.map((row) => {
    const cleaned = { ...row };
    for (const key of sensitiveKeys) {
      if (key in cleaned) cleaned[key] = "***REDACTED***";
    }
    return cleaned;
  });
}

function decodePgError(err: unknown, mode: "development" | "production"): string {
  const friendly = friendlyDbError(err, mode === "development");
  if (friendly) return friendly;
  if (!err || typeof err !== "object") {
    return mode === "development" ? String(err) : "Database error";
  }
  const message = (err as { message?: string }).message;
  return mode === "development" ? (message ?? String(err)) : "Database error";
}

function tableNameFromSql(sql: string): string | null {
  const withoutStrings = stripSqlStrings(sql);
  const fromMatch = /\bFROM\s+([^\s,;()]+)/i.exec(withoutStrings);
  if (!fromMatch) return null;
  const raw = fromMatch[1] ?? "";
  const trimmed = raw.replace(/^["']|["']$/g, "");
  if (trimmed.includes(".")) {
    const parts = trimmed.split(".");
    return parts[parts.length - 1] ?? null;
  }
  return trimmed || null;
}

async function suggestDbNames(pool: Pool, err: unknown, sql?: string): Promise<string | null> {
  const code = (err as { code?: unknown }).code;
  if (code !== "42P01" && code !== "42703") return null;
  try {
    if (code === "42P01") {
      const tables = await getSchema(pool);
      if (tables.length === 0) return null;
      const wanted = relationNameFromError(err);
      const match = wanted
        ? tables.find((t) => t.name.toLowerCase() === wanted.toLowerCase())
        : null;
      if (match && match.name !== wanted) {
        return `Did you mean "${match.name}"? PostgreSQL folds unquoted identifiers to lowercase — quote the table name as "${match.name}".`;
      }
      const names = tables.map((t) => t.name);
      const shown = names.slice(0, 20).join(", ");
      return `Available tables: ${shown}${names.length > 20 ? `, and ${names.length - 20} more` : ""}.`;
    }
    const table = (err as { table?: unknown }).table;
    const tableName =
      typeof table === "string" && table.length > 0
        ? table
        : (relationNameFromError(err) ?? (sql ? tableNameFromSql(sql) : null));
    if (!tableName) return null;
    const resolved = await resolveTableName(pool, tableName);
    const columns = resolved.columns.map((c) => c.name);
    const shown = columns.slice(0, 20).join(", ");
    return `Available columns on "${resolved.name}": ${shown}${columns.length > 20 ? `, and ${columns.length - 20} more` : ""}.`;
  } catch {
    return null;
  }
}

function columnSet(table: TableSchema): Set<string> {
  return new Set(table.columns.map((c) => c.name));
}

export function createHandlers(pool: Pool, safety: SafetyState, options: CoreOptions): HandlerMap {
  const startTime = Date.now();
  let requestCount = 0;
  const { onChange } = options;

  const db_overview: ToolHandler = async (args) => {
    const tables = args.table
      ? [await resolveTableName(pool, String(args.table))]
      : await getSchema(pool);
    const names = tables.map((t) => t.name);

    const estimateResult = names.length
      ? await pool.query<{ relname: string; estimate: number }>(
          `SELECT relname, GREATEST(reltuples::bigint, 0) AS estimate FROM pg_class WHERE relname = ANY($1)`,
          [names],
        )
      : { rows: [] as { relname: string; estimate: number }[] };
    const estimates = new Map(estimateResult.rows.map((r) => [r.relname, Number(r.estimate)]));
    const totalRows = [...estimates.values()].reduce((sum, n) => sum + n, 0);

    return {
      text: [
        "PostgreSQL Database Overview",
        "",
        `Mode: ${safety.mode} | ${safety.readonly ? "READ-ONLY" : "Read-Write"}`,
        "",
        `TABLES (${tables.length}, ~${totalRows.toLocaleString()} rows total, estimates)`,
        ...tables.map(
          (t) => `  ${t.name.padEnd(28)} ~${String(estimates.get(t.name) ?? 0).padStart(8)} rows`,
        ),
        "",
        relationsToText(tables),
        "SAFETY",
        `  Sensitive columns redacted: ${[...safety.sensitiveColumns].join(", ")}`,
        `  Blocked tables: ${safety.blockedTables.size ? [...safety.blockedTables].join(", ") : "none"}`,
        "",
        "Use db_schema for full column detail, db_table_info for exact counts and indexes.",
      ].join("\n"),
    };
  };

  const db_schema: ToolHandler = async (args) => {
    const tables = args.table
      ? [await resolveTableName(pool, String(args.table))]
      : await getSchema(pool);
    return { text: schemaToText(tables) + "\n" + relationsToText(tables) };
  };

  const db_health: ToolHandler = async (args) => {
    requestCount++;
    try {
      const table = args.table ? await resolveTableName(pool, String(args.table)) : null;
      const probe = table ? `SELECT 1 FROM ${quoteIdent(table.name)} LIMIT 1` : "SELECT 1";
      await pool.query(probe);
      return {
        status: "connected",
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        totalRequests: requestCount,
        readonly: safety.readonly,
        mode: safety.mode,
      };
    } catch (err) {
      return {
        status: "disconnected",
        error: decodePgError(err, safety.mode),
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        totalRequests: requestCount,
      };
    }
  };

  const db_table_info: ToolHandler = async (args) => {
    const table = await resolveTableName(pool, String(args.table));
    return getTableStats(pool, table);
  };

  const db_find_many: ToolHandler = async (args) => {
    const table = await resolveTableName(pool, String(args.table));
    const validColumns = columnSet(table);
    const where = (args.where ?? undefined) as Record<string, unknown> | undefined;
    const select = args.select as string[] | undefined;
    const orderBy = (args.orderBy ?? undefined) as Record<string, string> | undefined;
    const take = Math.min(toNonNegativeInt(args.take, 50), MAX_TAKE);
    const skip = toNonNegativeInt(args.skip, 0);

    const columns = buildSelectColumns(select, validColumns);
    const whereFragment = buildWhere(where, validColumns, 1);
    const orderClause = buildOrderBy(orderBy, validColumns);

    const sql = `SELECT ${columns} FROM ${quoteIdent(table.name)} ${whereFragment.text} ${orderClause} LIMIT ${take} OFFSET ${skip}`;
    const countFragment = buildCount(table.name, where, validColumns);

    const [rowsResult, countResult] = await Promise.all([
      pool.query(sql, whereFragment.values),
      pool.query<{ count: number }>(countFragment.text, countFragment.values),
    ]);

    const total = countResult.rows[0]?.count ?? 0;
    return {
      table: table.name,
      count: rowsResult.rows.length,
      total,
      page: skip > 0 ? Math.floor(skip / take) + 1 : 1,
      pageSize: take,
      hasMore: skip + rowsResult.rows.length < total,
      data: redactRows(rowsResult.rows, safety),
    };
  };

  const db_find_first: ToolHandler = async (args) => {
    const table = await resolveTableName(pool, String(args.table));
    const validColumns = columnSet(table);
    const where = (args.where ?? undefined) as Record<string, unknown> | undefined;
    const select = args.select as string[] | undefined;
    const columns = buildSelectColumns(select, validColumns);
    const whereFragment = buildWhere(where, validColumns, 1);

    const sql = `SELECT ${columns} FROM ${quoteIdent(table.name)} ${whereFragment.text} LIMIT 1`;
    const result = await pool.query(sql, whereFragment.values);
    return result.rows[0] ? redactRow(result.rows[0], safety) : null;
  };

  const db_count: ToolHandler = async (args) => {
    const table = await resolveTableName(pool, String(args.table));
    const validColumns = columnSet(table);
    const where = (args.where ?? undefined) as Record<string, unknown> | undefined;
    const fragment = buildCount(table.name, where, validColumns);
    const result = await pool.query<{ count: number }>(fragment.text, fragment.values);
    return { table: table.name, count: result.rows[0]?.count ?? 0 };
  };

  const db_aggregate: ToolHandler = async (args) => {
    const table = await resolveTableName(pool, String(args.table));
    const validColumns = columnSet(table);

    const groupCols = String(args.by)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (groupCols.length === 0) throw new Error("At least one 'by' column is required");
    groupCols.forEach((c) => {
      if (!validColumns.has(c)) {
        throw new Error(`Unknown column "${c}". Available: ${[...validColumns].join(", ")}`);
      }
    });

    const selectExprs = groupCols.map((c) => quoteIdent(c));
    selectExprs.push("COUNT(*)::int AS count");

    const aggregates: { label: string; cols: string[] }[] = [];
    for (const [label, fn] of [
      ["sum", "SUM"],
      ["avg", "AVG"],
      ["min", "MIN"],
      ["max", "MAX"],
    ] as const) {
      const raw = args[label];
      if (typeof raw !== "string" || raw.length === 0) continue;
      const cols = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const col of cols) {
        if (!validColumns.has(col)) {
          throw new Error(`Unknown column "${col}". Available: ${[...validColumns].join(", ")}`);
        }
        selectExprs.push(`${fn}(${quoteIdent(col)}) AS ${label}_${col}`);
      }
      aggregates.push({ label, cols });
    }

    const where = (args.where ?? undefined) as Record<string, unknown> | undefined;
    const whereFragment = buildWhere(where, validColumns, 1);
    const orderBy = (args.orderBy ?? undefined) as Record<string, string> | undefined;

    let orderClause = "";
    if (orderBy && Object.keys(orderBy).length > 0) {
      const parts: string[] = [];
      for (const [key, direction] of Object.entries(orderBy)) {
        const column = key === "_count" ? "count" : key;
        if (column !== "count" && !groupCols.includes(column)) {
          throw new Error(`orderBy column "${key}" must be a group-by column or "_count"`);
        }
        if (typeof direction !== "string") {
          throw new Error(`Invalid sort direction for "${key}". Use "asc" or "desc".`);
        }
        const ident = column === "count" ? "count" : quoteIdent(column);
        parts.push(`${ident} ${direction.toLowerCase() === "desc" ? "DESC" : "ASC"}`);
      }
      orderClause = `ORDER BY ${parts.join(", ")}`;
    }

    const take = Math.min(toNonNegativeInt(args.take, 50), MAX_TAKE);
    const groupClause = groupCols.map((c) => quoteIdent(c)).join(", ");
    const sql = `SELECT ${selectExprs.join(", ")} FROM ${quoteIdent(table.name)} ${whereFragment.text} GROUP BY ${groupClause} ${orderClause} LIMIT ${take}`;

    const result = await pool.query(sql, whereFragment.values);
    return {
      table: table.name,
      groupBy: groupCols,
      count: result.rows.length,
      data: redactAggregateRows(result.rows, safety, groupCols, aggregates),
    };
  };

  const db_raw_query: ToolHandler = async (args) => {
    const sql = String(args.sql).trim();
    const confirmed = args.confirmed === true;

    const strippedSql = stripSqlStrings(sql).trim();
    if (
      strippedSql.includes(";") &&
      (strippedSql.indexOf(";") !== strippedSql.length - 1 || strippedSql.split(";").length > 2)
    ) {
      throw new Error("Multi-statement queries are not allowed. Use a single statement.");
    }

    const normalizedSql = strippedSql.toUpperCase().replace(/;\s*$/, "").trim();
    const isSelect = /^SELECT\b/.test(normalizedSql);

    if (AUTH_CATALOG_RE.test(normalizedSql)) {
      throw new Error("Querying PostgreSQL authentication catalogs is not permitted.");
    }

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(normalizedSql)) {
        throw new Error("Dangerous function detected. This query is not permitted.");
      }
    }

    if (isSelect) {
      const limitMatch = /\bLIMIT\s+(\d+)(?:\s+OFFSET\s+\d+)?\s*$/i.exec(normalizedSql);
      if (!limitMatch) {
        throw new Error("All raw queries must end with a LIMIT clause.");
      }
      const limitValue = parseInt(limitMatch[1] ?? "0", 10);
      if (limitValue > MAX_RAW_TAKE) {
        throw new Error(
          `LIMIT value (${limitValue}) exceeds maximum allowed (${MAX_RAW_TAKE}). Use a smaller limit or paginate.`,
        );
      }
    } else if (safety.readonly) {
      throw new Error("Raw write statements are blocked while the server is read-only.");
    } else if (!confirmed) {
      throw new Error(
        "Only SELECT queries are allowed via db_raw_query. A non-SELECT statement requires explicit user confirmation (confirmed: true) and a server with ALLOW_RAW_WRITES enabled.",
      );
    } else if (!options.allowRawWrites) {
      throw new Error(
        "Raw write statements are disabled on this server. An operator must set ALLOW_RAW_WRITES=true to enable confirmed writes.",
      );
    }

    const execSql = sql.replace(/;\s*$/, "").trim();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL statement_timeout = ${options.statementTimeoutMs}`);
      if (isSelect) {
        await client.query("SET LOCAL default_transaction_read_only = on");
      }
      const result = await client.query(execSql);
      await client.query("COMMIT");
      if (isSelect) {
        return redactRows(result.rows, safety);
      }
      invalidateSchemaCache();
      return {
        command: result.command ?? "STATEMENT",
        rowCount: result.rowCount ?? 0,
        message: `${result.command ?? "Statement"} executed: ${result.rowCount ?? 0} row(s) affected.`,
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      const suggestion =
        safety.mode === "development" ? await suggestDbNames(pool, err, execSql) : null;
      const message = decodePgError(err, safety.mode);
      throw new Error(suggestion ? `${message} ${suggestion}` : message);
    } finally {
      client.release();
    }
  };

  const db_run_script: ToolHandler = async (args) => {
    const sql = String(args.sql ?? "").trim();
    if (!sql) {
      throw new Error("No SQL provided.");
    }
    const confirmed = args.confirmed === true;

    const strippedSql = stripSqlStrings(sql);
    const normalizedSql = strippedSql.toUpperCase();

    if (AUTH_CATALOG_RE.test(normalizedSql)) {
      throw new Error("Querying PostgreSQL authentication catalogs is not permitted.");
    }

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(normalizedSql)) {
        throw new Error("Dangerous function detected. This script is not permitted.");
      }
    }

    if (safety.readonly && READ_WRITE_OVERRIDE_RE.test(normalizedSql)) {
      throw new Error(
        "Changing the transaction read/write mode is not permitted while the server is read-only.",
      );
    }

    if (!safety.readonly && !confirmed) {
      const statements = normalizedSql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      const readOnlyScript =
        statements.length > 0 &&
        statements.every((s) =>
          /^(SELECT|WITH|SHOW|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET|RESET|VACUUM|ANALYZE|DECLARE)\b/.test(
            s,
          ),
        );
      if (!readOnlyScript) {
        throw new Error(
          "Only read-only scripts are allowed via db_run_script. A script that writes requires explicit user confirmation (confirmed: true).",
        );
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL statement_timeout = ${options.statementTimeoutMs}`);
      if (safety.readonly) {
        await client.query("SET SESSION default_transaction_read_only = on");
      }
      const result = await client.query(sql);
      await client.query("COMMIT");
      invalidateSchemaCache();
      onChange?.({ table: tableNameFromSql(sql) ?? "unknown", action: "script" });
      const rows = Array.isArray(result.rows) ? result.rows : [];
      return {
        command: result.command ?? "SCRIPT",
        rowCount: typeof result.rowCount === "number" ? result.rowCount : rows.length,
        rows: redactRows(rows, safety),
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      const message = decodePgError(err, safety.mode);
      throw new Error(message);
    } finally {
      if (safety.readonly) {
        await client
          .query("SET SESSION default_transaction_read_only = off")
          .catch(() => undefined);
      }
      client.release();
    }
  };

  const db_create: ToolHandler = async (args) => {
    const tableName = String(args.table);
    const access = checkWriteAccess(tableName, "create", safety);
    if (access.blocked) throw new Error(access.message);
    const warnings = access.warning ? [access.warning] : [];
    const table = await resolveTableName(pool, tableName);

    const data = (args.data ?? {}) as Record<string, unknown>;
    const { cleaned, stripped } = sanitizeWriteData(data, safety);

    if (args.dryRun) {
      return {
        dryRun: true,
        table: table.name,
        wouldCreate: cleaned,
        ...(stripped.length > 0 && { strippedFields: stripped }),
        ...(warnings.length > 0 && { warnings }),
      };
    }

    const validColumns = columnSet(table);
    const fragment = buildInsert(table.name, cleaned, validColumns);
    try {
      const result = await pool.query(fragment.text, fragment.values);
      invalidateSchemaCache();
      const createdRow = result.rows[0] as Record<string, unknown> | undefined;
      onChange?.({
        table: table.name,
        action: "create",
        ...(createdRow && createdRow.id !== undefined ? { entityId: String(createdRow.id) } : {}),
      });
      return {
        created: redactRow(result.rows[0], safety),
        ...(stripped.length > 0 && { strippedFields: stripped }),
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (err) {
      throw new Error(decodePgError(err, safety.mode));
    }
  };

  const db_upsert: ToolHandler = async (args) => {
    const tableName = String(args.table);
    const access = checkWriteAccess(tableName, "upsert", safety);
    if (access.blocked) throw new Error(access.message);
    const warnings = access.warning ? [access.warning] : [];
    const table = await resolveTableName(pool, tableName);

    const where = (args.where ?? {}) as Record<string, unknown>;
    const createData = (args.create ?? {}) as Record<string, unknown>;
    const updateData = (args.update as Record<string, unknown> | undefined) ?? createData;

    const whereKeys = Object.keys(where).sort();
    const matched = table.uniqueColumnSets.find((set) => {
      const sorted = [...set].sort();
      return sorted.length === whereKeys.length && sorted.every((c, i) => c === whereKeys[i]);
    });
    if (!matched) {
      const available = table.uniqueColumnSets.map((s) => s.join("+")).join(", ") || "none";
      throw new Error(
        `where columns (${whereKeys.join(", ")}) don't match a unique constraint on "${table.name}". Available: ${available}`,
      );
    }

    const fullInsert = { ...where, ...createData };
    const { cleaned: cleanedInsert, stripped: strippedInsert } = sanitizeWriteData(
      fullInsert,
      safety,
    );
    const { cleaned: cleanedUpdate, stripped: strippedUpdate } = sanitizeWriteData(
      updateData,
      safety,
    );
    const stripped = [...new Set([...strippedInsert, ...strippedUpdate])];

    if (args.dryRun) {
      return {
        dryRun: true,
        table: table.name,
        wouldInsert: cleanedInsert,
        wouldUpdate: cleanedUpdate,
        ...(stripped.length > 0 && { strippedFields: stripped }),
        ...(warnings.length > 0 && { warnings }),
      };
    }

    const validColumns = columnSet(table);
    const fragment = buildUpsert(table.name, cleanedInsert, cleanedUpdate, matched, validColumns);
    try {
      const result = await pool.query(fragment.text, fragment.values);
      invalidateSchemaCache();
      onChange?.({ table: table.name, action: "upsert" });
      return {
        upserted: redactRow(result.rows[0], safety),
        ...(stripped.length > 0 && { strippedFields: stripped }),
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (err) {
      throw new Error(decodePgError(err, safety.mode));
    }
  };

  const db_update_many: ToolHandler = async (args) => {
    const tableName = String(args.table);
    const access = checkWriteAccess(tableName, "update", safety);
    if (access.blocked) throw new Error(access.message);
    const table = await resolveTableName(pool, tableName);

    const where = (args.where ?? undefined) as Record<string, unknown> | undefined;
    const data = (args.data ?? {}) as Record<string, unknown>;
    const { cleaned, stripped } = sanitizeWriteData(data, safety);

    const validColumns = columnSet(table);
    const countFragment = buildCount(table.name, where, validColumns);
    const countResult = await pool.query<{ count: number }>(
      countFragment.text,
      countFragment.values,
    );
    const matched = countResult.rows[0]?.count ?? 0;
    const bw = bulkWarning(matched, "update");
    const warnings = [access.warning, bw].filter((w): w is string => Boolean(w));

    if (args.dryRun) {
      return {
        dryRun: true,
        table: table.name,
        matched,
        wouldSet: cleaned,
        ...(stripped.length > 0 && { strippedFields: stripped }),
        ...(warnings.length > 0 && { warnings }),
      };
    }

    if (!where || Object.keys(where).length === 0) {
      if (!args.confirmAll) {
        throw new Error(
          "Refusing to update ALL rows. Pass confirmAll: true, or use a specific where filter.",
        );
      }
    }

    const fragment = buildUpdate(table.name, cleaned, where, validColumns);
    try {
      const result = await pool.query(fragment.text, fragment.values);
      invalidateSchemaCache();
      onChange?.({ table: table.name, action: "update" });
      return {
        table: table.name,
        matched: result.rowCount ?? 0,
        ...(stripped.length > 0 && { strippedFields: stripped }),
        ...(warnings.length > 0 && { warnings }),
        message: `${result.rowCount ?? 0} row(s) updated.`,
      };
    } catch (err) {
      throw new Error(decodePgError(err, safety.mode));
    }
  };

  const db_delete_many: ToolHandler = async (args) => {
    const tableName = String(args.table);
    const access = checkWriteAccess(tableName, "delete", safety);
    if (access.blocked) throw new Error(access.message);
    const table = await resolveTableName(pool, tableName);

    const where = (args.where ?? undefined) as Record<string, unknown> | undefined;
    const validColumns = columnSet(table);

    const countFragment = buildCount(table.name, where, validColumns);
    const countResult = await pool.query<{ count: number }>(
      countFragment.text,
      countFragment.values,
    );
    const matched = countResult.rows[0]?.count ?? 0;
    const bw = bulkWarning(matched, "delete");
    const warnings = [access.warning, bw].filter((w): w is string => Boolean(w));

    if (args.dryRun) {
      return {
        dryRun: true,
        table: table.name,
        wouldDelete: matched,
        ...(warnings.length > 0 && { warnings }),
      };
    }

    if (!where || Object.keys(where).length === 0) {
      if (!args.confirmAll) {
        throw new Error(
          "Refusing to delete ALL rows. Pass confirmAll: true, or use a specific where filter.",
        );
      }
    }

    const fragment = buildDelete(table.name, where, validColumns);
    try {
      const result = await pool.query(fragment.text, fragment.values);
      invalidateSchemaCache();
      onChange?.({ table: table.name, action: "delete" });
      return {
        table: table.name,
        deleted: result.rowCount ?? 0,
        ...(warnings.length > 0 && { warnings }),
        message: `${result.rowCount ?? 0} row(s) deleted.`,
      };
    } catch (err) {
      throw new Error(decodePgError(err, safety.mode));
    }
  };

  const db_backup: ToolHandler = async (args) => {
    const access = checkWriteAccess("backup", "backup", safety);
    if (access.blocked) throw new Error(access.message);
    if (args.confirmed !== true) {
      throw new Error(
        "Refusing to create a backup without explicit user confirmation. Pass confirmed: true.",
      );
    }

    if (!options.databaseUrl)
      throw new Error("DATABASE_URL is not set -- required to run pg_dump.");

    if (!existsSync(options.backupDir)) {
      mkdirSync(options.backupDir, { recursive: true });
    }

    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const label = args.label ? `-${String(args.label).replace(/[^a-zA-Z0-9_-]/g, "_")}` : "";
    const filename = `backup-${ts}${label}.sql`;
    const filepath = resolve(options.backupDir, filename);

    const pgDumpBin = findPgDump();
    let dump: string;
    let note: string | undefined;
    const url = new URL(options.databaseUrl);
    try {
      dump = execFileSync(
        pgDumpBin,
        [
          "-h",
          url.hostname,
          "-p",
          url.port || "5432",
          "-U",
          decodeURIComponent(url.username || "postgres"),
          "-d",
          url.pathname.replace(/^\//, "") || "postgres",
          "--clean",
          "--if-exists",
        ],
        {
          env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password || "") },
          encoding: "utf-8",
          timeout: 30000,
          maxBuffer: 1024 * 1024 * 100,
        },
      );
    } catch (_localErr) {
      if (!options.dockerContainer) {
        const snapshot = await createSqlSnapshot(pool);
        dump = snapshot.sql;
        note =
          "Used portable SQL snapshot (pg_dump unavailable). Everything works, but consider enabling DOCKER_CONTAINER for full pg_dump fidelity.";
      } else {
        try {
          const user = decodeURIComponent(url.username || "postgres");
          const dbName = url.pathname.replace(/^\//, "") || "postgres";
          dump = execFileSync(
            "docker",
            [
              "exec",
              options.dockerContainer,
              "pg_dump",
              "-U",
              user,
              "-d",
              dbName,
              "--clean",
              "--if-exists",
            ],
            { encoding: "utf-8", timeout: 30000, maxBuffer: 1024 * 1024 * 100 },
          );
        } catch (_dockerErr) {
          const snapshot = await createSqlSnapshot(pool);
          note =
            "pg_dump failed locally and via docker; fell back to portable SQL snapshot (schema via information_schema, may not capture every object/type).";
          dump = snapshot.sql;
        }
      }
    }

    writeFileSync(filepath, dump, "utf-8");
    const sizeKB = (Buffer.byteLength(dump, "utf-8") / 1024).toFixed(1);

    return {
      backup: filename,
      path: filepath,
      sizeKB: `${sizeKB} KB`,
      timestamp: now.toISOString(),
      message: `${note ?? ""}${note ? " " : ""}Backup saved: ${filename} (${sizeKB} KB)`.trim(),
      ...(note ? { mode: "sql-snapshot" } : { mode: "pg_dump" }),
    };
  };

  return {
    db_overview,
    db_schema,
    db_health,
    db_table_info,
    db_find_many,
    db_find_first,
    db_count,
    db_aggregate,
    db_raw_query,
    db_run_script,
    db_backup,
    db_create,
    db_upsert,
    db_update_many,
    db_delete_many,
  };
}
