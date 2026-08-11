import type { Pool } from "pg";
import { execFile as execFileCb } from "node:child_process";
import type { ExecFileOptions } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

function execFileAsync(file: string, args: string[], options: ExecFileOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    execFileCb(file, args, options, (err, stdout) => {
      if (err) reject(err);
      else resolve(String(stdout));
    });
  });
}
import type { z } from "zod";
import {
  FindManyArgs,
  FindFirstArgs,
  CountArgs,
  CreateArgs,
  UpdateArgs,
  DeleteArgs,
  RawQueryArgs,
  BackupArgs,
  UpsertArgs,
  AggregateArgs,
  TableInfoArgs,
} from "./toolDefinitions.js";
import {
  getSchema,
  resolveTableName,
  schemaToText,
  relationsToText,
  getTableStats,
  getOverviewRowCounts,
  invalidateSchemaCache,
  setSchemas,
  tableDisplayName,
} from "./schema.js";
import type { TableSchema } from "./schema.js";
import { buildSqlDataDump } from "./sqlDump.js";
import {
  redactRow,
  redactRows,
  sanitizeWriteData,
  checkWriteAccess,
  bulkWarning,
  type SafetyState,
} from "./safety.js";
import { stripSqlStrings } from "./sanitizer.js";
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
  qualifiedTable,
} from "./sqlBuilder.js";
import { poolStats } from "./db.js";
import type { AppConfig } from "./config.js";
import { log } from "./logger.js";

const MAX_TAKE = 500;
const MAX_RAW_TAKE = 5000;

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

function parseJsonObject(
  input: string | undefined,
  label: string,
): Record<string, unknown> | undefined {
  if (!input || input === "{}") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    throw new Error(`Invalid JSON for ${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function parseJsonArray(input: string | undefined, label: string): string[] | undefined {
  if (!input) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    throw new Error(`Invalid JSON for ${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) {
    throw new Error(`${label} must be a JSON array of strings`);
  }
  return parsed;
}

function columnSet(table: TableSchema): Set<string> {
  return new Set(table.columns.map((c) => c.name));
}

function decodePgError(err: unknown, mode: "development" | "production"): string {
  if (!err || typeof err !== "object")
    return mode === "development" ? String(err) : "Database error";
  const e = err as {
    code?: string;
    detail?: string;
    message?: string;
    constraint?: string;
    column?: string;
    table?: string;
  };
  const detail = mode === "development" && e.detail ? ` ${e.detail}` : "";
  switch (e.code) {
    case "23505":
      return `Unique constraint violation${e.constraint ? ` on "${e.constraint}"` : ""}.${detail || " A matching row already exists."}`;
    case "23503":
      return `Foreign key constraint failed${e.constraint ? ` on "${e.constraint}"` : ""}.${detail || " Referenced row does not exist."}`;
    case "23502":
      return `Null constraint violation.${detail || " A required column was left empty."}`;
    case "22001":
      return `Value too long for column.${detail}`;
    case "42703": {
      const column = e.column;
      const table = e.table;
      if (column && table) return `Column "${column}" doesn't exist on table "${table}".`;
      if (column) return `Column "${column}" doesn't exist.`;
      return mode === "development"
        ? `Column doesn't exist. ${e.message ?? ""}`.trim()
        : "Column doesn't exist.";
    }
    case "42P01":
      return e.table
        ? `Table "${e.table}" doesn't exist in the database.`
        : mode === "development"
          ? `Table doesn't exist. ${e.message ?? ""}`.trim()
          : "Table doesn't exist.";
    default:
      return mode === "development" ? (e.message ?? String(err)) : "Database error";
  }
}

async function suggestDbNames(pool: Pool, err: unknown): Promise<string | null> {
  const code = (err as { code?: unknown }).code;
  if (code !== "42P01" && code !== "42703") return null;
  try {
    if (code === "42P01") {
      const tables = await getSchema(pool);
      if (tables.length === 0) return null;
      const names = tables.map((t) => t.name);
      const shown = names.slice(0, 20).join(", ");
      return `Available tables: ${shown}${names.length > 20 ? `, and ${names.length - 20} more` : ""}.`;
    }
    const table = (err as { table?: unknown }).table;
    if (typeof table !== "string" || table.length === 0) return null;
    const resolved = await resolveTableName(pool, table);
    const columns = resolved.columns.map((c) => c.name);
    const shown = columns.slice(0, 20).join(", ");
    return `Available columns on "${resolved.name}": ${shown}${columns.length > 20 ? `, and ${columns.length - 20} more` : ""}.`;
  } catch {
    return null;
  }
}

function textResponse(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function createHandlers(pool: Pool, safety: SafetyState, config: AppConfig) {
  setSchemas(config.schemas);
  const startTime = Date.now();
  let requestCount = 0;
  let lastSuccessAt: number | null = null;
  let lastErrorAt: number | null = null;
  let lastError: string | null = null;

  function logRequest(tool: string, durationMs: number) {
    requestCount++;
    if (safety.mode === "development") {
      log.info(`#${requestCount} ${tool}  ${durationMs}ms`);
    }
  }

  return {
    db_overview: async () => {
      const t0 = Date.now();
      const tables = await getSchema(pool);

      const counts = await getOverviewRowCounts(pool, tables);
      let total = 0;
      const tableLines = tables.map((t) => {
        const key = `${t.schema}.${t.name}`;
        const row = counts.get(key);
        const label = row?.exact
          ? `${row.count!.toLocaleString().padStart(9)} rows`
          : row && row.count !== null
            ? `~${row.count.toLocaleString().padStart(8)} rows (estimate)`
            : `        ? rows (count unavailable)`;
        if (row && row.count !== null) total += row.count;
        const err = t.loadError ? `  (Error: ${t.loadError})` : "";
        return `  ${tableDisplayName(t.schema, t.name).padEnd(28)} ${label}${err}`;
      });

      const lines = [
        "PostgreSQL Database Overview",
        "",
        `Mode: ${safety.mode} | ${safety.readonly ? "READ-ONLY" : "Read-Write"}`,
        "",
        `TABLES (${tables.length}, ~${total.toLocaleString()} rows total)`,
        ...tableLines,
        "",
        relationsToText(tables),
        "SAFETY",
        `  Sensitive columns redacted: ${[...safety.sensitiveColumns].join(", ")}`,
        `  Blocked tables: ${safety.blockedTables.size ? [...safety.blockedTables].join(", ") : "none"}`,
        `  High-risk tables: ${safety.highRiskTables.size ? [...safety.highRiskTables].join(", ") : "none"}`,
        "",
        "Use db_schema for full column detail, db_table_info for exact counts and indexes on one table.",
      ];

      logRequest("db_overview", Date.now() - t0);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },

    db_schema: async () => {
      const t0 = Date.now();
      const tables = await getSchema(pool);
      const text = schemaToText(tables) + "\n" + relationsToText(tables);
      logRequest("db_schema", Date.now() - t0);
      return { content: [{ type: "text" as const, text }] };
    },

    db_health: async () => {
      const t0 = Date.now();
      try {
        await pool.query("SELECT 1");
        const latencyMs = Date.now() - t0;
        lastSuccessAt = Date.now();
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        logRequest("db_health", latencyMs);
        return textResponse({
          status: "connected",
          uptimeSeconds: uptime,
          totalRequests: requestCount,
          pool: poolStats(pool),
          mode: safety.mode,
          readonly: safety.readonly,
          lastCheckLatencyMs: latencyMs,
          lastSuccessAt: lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null,
          lastErrorAt: lastErrorAt ? new Date(lastErrorAt).toISOString() : null,
          lastError,
        });
      } catch (err) {
        const latencyMs = Date.now() - t0;
        lastErrorAt = Date.now();
        lastError = decodePgError(err, safety.mode);
        logRequest("db_health", latencyMs);
        return textResponse({
          status: "disconnected",
          error: decodePgError(err, safety.mode),
          uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
          totalRequests: requestCount,
          lastCheckLatencyMs: latencyMs,
          lastSuccessAt: lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null,
          lastErrorAt: lastErrorAt ? new Date(lastErrorAt).toISOString() : null,
          lastError,
        });
      }
    },

    db_table_info: async (args: z.infer<typeof TableInfoArgs>) => {
      const t0 = Date.now();
      const table = await resolveTableName(pool, args.table);
      const stats = await getTableStats(pool, table);
      logRequest("db_table_info", Date.now() - t0);
      return textResponse(stats);
    },

    db_find_many: async (args: z.infer<typeof FindManyArgs>) => {
      const t0 = Date.now();
      const table = await resolveTableName(pool, args.table);
      const validColumns = columnSet(table);

      const where = parseJsonObject(args.where, "where");
      const select = parseJsonArray(args.select, "select");
      const orderBy = parseJsonObject(args.orderBy, "orderBy") as
        Record<string, string> | undefined;
      const take = Math.min(toNonNegativeInt(args.take, 50), MAX_TAKE);
      const skip = toNonNegativeInt(args.skip, 0);

      const columns = buildSelectColumns(select, validColumns);
      const whereFragment = buildWhere(where, validColumns, 1);
      const orderClause = buildOrderBy(orderBy, validColumns);

      const sql = `SELECT ${columns} FROM ${qualifiedTable(table.schema, table.name)} ${whereFragment.text} ${orderClause} LIMIT ${take} OFFSET ${skip}`;
      const countFragment = buildCount(
        qualifiedTable(table.schema, table.name),
        where,
        validColumns,
      );

      const [rowsResult, countResult] = await Promise.all([
        pool.query(sql, whereFragment.values),
        pool.query<{ count: number }>(countFragment.text, countFragment.values),
      ]);

      const total = countResult.rows[0]?.count ?? 0;
      logRequest("db_find_many", Date.now() - t0);

      return textResponse({
        table: tableDisplayName(table.schema, table.name),
        count: rowsResult.rows.length,
        total,
        page: skip > 0 ? Math.floor(skip / take) + 1 : 1,
        pageSize: take,
        hasMore: skip + rowsResult.rows.length < total,
        data: redactRows(rowsResult.rows, safety),
      });
    },

    db_find_first: async (args: z.infer<typeof FindFirstArgs>) => {
      const t0 = Date.now();
      const table = await resolveTableName(pool, args.table);
      const validColumns = columnSet(table);

      const where = parseJsonObject(args.where, "where");
      const select = parseJsonArray(args.select, "select");
      const columns = buildSelectColumns(select, validColumns);
      const whereFragment = buildWhere(where, validColumns, 1);

      const sql = `SELECT ${columns} FROM ${qualifiedTable(table.schema, table.name)} ${whereFragment.text} LIMIT 1`;
      const result = await pool.query(sql, whereFragment.values);

      logRequest("db_find_first", Date.now() - t0);
      return textResponse(result.rows[0] ? redactRow(result.rows[0], safety) : null);
    },

    db_count: async (args: z.infer<typeof CountArgs>) => {
      const t0 = Date.now();
      const table = await resolveTableName(pool, args.table);
      const validColumns = columnSet(table);
      const where = parseJsonObject(args.where, "where");

      const fragment = buildCount(qualifiedTable(table.schema, table.name), where, validColumns);
      const result = await pool.query<{ count: number }>(fragment.text, fragment.values);

      logRequest("db_count", Date.now() - t0);
      return textResponse({
        table: tableDisplayName(table.schema, table.name),
        count: result.rows[0]?.count ?? 0,
      });
    },

    db_aggregate: async (args: z.infer<typeof AggregateArgs>) => {
      const t0 = Date.now();
      const table = await resolveTableName(pool, args.table);
      const validColumns = columnSet(table);

      const groupCols = args.by
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
        const raw = (args as Record<string, unknown>)[label];
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

      const where = parseJsonObject(args.where, "where");
      const whereFragment = buildWhere(where, validColumns, 1);

      const orderBy = parseJsonObject(args.orderBy, "orderBy") as
        Record<string, string> | undefined;
      let orderClause = "";
      if (orderBy && Object.keys(orderBy).length > 0) {
        const parts: string[] = [];
        for (const [key, direction] of Object.entries(orderBy)) {
          const column = key === "_count" ? "count" : key;
          if (column !== "count" && !groupCols.includes(column)) {
            throw new Error(`orderBy column "${key}" must be a group-by column or "_count"`);
          }
          const ident = column === "count" ? "count" : quoteIdent(column);
          parts.push(`${ident} ${direction.toLowerCase() === "desc" ? "DESC" : "ASC"}`);
        }
        orderClause = `ORDER BY ${parts.join(", ")}`;
      }

      const take = Math.min(toNonNegativeInt(args.take, 50), MAX_TAKE);
      const groupClause = groupCols.map((c) => quoteIdent(c)).join(", ");
      const sql = `SELECT ${selectExprs.join(", ")} FROM ${qualifiedTable(table.schema, table.name)} ${whereFragment.text} GROUP BY ${groupClause} ${orderClause} LIMIT ${take}`;

      const result = await pool.query(sql, whereFragment.values);
      logRequest("db_aggregate", Date.now() - t0);
      return textResponse({
        table: tableDisplayName(table.schema, table.name),
        groupBy: groupCols,
        count: result.rows.length,
        data: redactAggregateRows(result.rows, safety, groupCols, aggregates),
      });
    },

    db_raw_query: async (args: z.infer<typeof RawQueryArgs>) => {
      const t0 = Date.now();
      const sql = args.sql.trim();

      const strippedSql = stripSqlStrings(sql).trim();
      if (
        strippedSql.includes(";") &&
        (strippedSql.indexOf(";") !== strippedSql.length - 1 || strippedSql.split(";").length > 2)
      ) {
        throw new Error("Multi-statement queries are not allowed. Use a single statement.");
      }

      const normalizedSql = strippedSql.toUpperCase().replace(/;\s*$/, "").trim();
      const isSelect = /^SELECT\b/.test(normalizedSql);

      if (
        /\b(PG_AUTHID|PG_SHADOW|PG_AUTH_MEMBERS|PG_ROLES|PG_USER|PG_GROUP)\b/.test(normalizedSql)
      ) {
        throw new Error("Querying PostgreSQL authentication catalogs is not permitted.");
      }

      const dangerousPatterns = [
        /\bPG_READ_FILE\b/i,
        /\bPG_READ_BINARY_FILE\b/i,
        /\bPG_LS_DIR\b/i,
        /\bPG_WRITE_FILE\b/i,
        /\bLO_IMPORT\b/i,
        /\bLO_EXPORT\b/i,
        /\bCOPY\b.*\b(FROM|TO)\b/i,
        /\bPG_SLEEP\b/i,
      ];
      for (const pattern of dangerousPatterns) {
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
        throw new Error(
          "Raw write statements are blocked while the server is read-only (--readonly).",
        );
      } else if (!args.confirmed) {
        throw new Error(
          "Only SELECT queries are allowed via db_raw_query. A non-SELECT statement requires explicit user confirmation (confirmed: true) and a server with ALLOW_RAW_WRITES enabled.",
        );
      } else if (!config.allowRawWrites) {
        throw new Error(
          "Raw write statements are disabled on this server. An operator must set ALLOW_RAW_WRITES=true to enable confirmed writes.",
        );
      }

      const execSql = sql.replace(/;\s*$/, "").trim();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL statement_timeout = ${config.statementTimeoutMs}`);
        if (isSelect) {
          await client.query("SET LOCAL default_transaction_read_only = on");
        }
        const result = await client.query(execSql);
        await client.query("COMMIT");
        logRequest("db_raw_query", Date.now() - t0);
        if (isSelect) {
          return textResponse(redactRows(result.rows, safety));
        }
        invalidateSchemaCache();
        return textResponse({
          command: result.command ?? "STATEMENT",
          rowCount: result.rowCount ?? 0,
          message: `${result.command ?? "Statement"} executed: ${result.rowCount ?? 0} row(s) affected.`,
        });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        const suggestion = safety.mode === "development" ? await suggestDbNames(pool, err) : null;
        const message = decodePgError(err, safety.mode);
        throw new Error(suggestion ? `${message} ${suggestion}` : message);
      } finally {
        client.release();
      }
    },

    db_create: async (args: z.infer<typeof CreateArgs>) => {
      const table = await resolveTableName(pool, args.table);
      const access = checkWriteAccess(table.name, "create", safety);
      if (access.blocked) throw new Error(access.message);
      const warnings = access.warning ? [access.warning] : [];

      const data = parseJsonObject(args.data, "data");
      if (!data) throw new Error("data parameter is required");
      const { cleaned, stripped } = sanitizeWriteData(data, safety);

      if (args.dryRun) {
        return textResponse({
          dryRun: true,
          table: tableDisplayName(table.schema, table.name),
          wouldCreate: cleaned,
          ...(stripped.length > 0 && { strippedFields: stripped }),
          ...(warnings.length > 0 && { warnings }),
          message: "DRY RUN -- nothing was created.",
        });
      }

      const validColumns = columnSet(table);
      const fragment = buildInsert(qualifiedTable(table.schema, table.name), cleaned, validColumns);
      try {
        const result = await pool.query(fragment.text, fragment.values);
        invalidateSchemaCache();
        return textResponse({
          created: redactRow(result.rows[0], safety),
          ...(stripped.length > 0 && { strippedFields: stripped }),
          ...(warnings.length > 0 && { warnings }),
        });
      } catch (err) {
        throw new Error(decodePgError(err, safety.mode));
      }
    },

    db_upsert: async (args: z.infer<typeof UpsertArgs>) => {
      const table = await resolveTableName(pool, args.table);
      const access = checkWriteAccess(table.name, "upsert", safety);
      if (access.blocked) throw new Error(access.message);
      const warnings = access.warning ? [access.warning] : [];

      const where = parseJsonObject(args.where, "where");
      if (!where) throw new Error("where parameter is required for upsert");
      const createData = parseJsonObject(args.create, "create");
      if (!createData) throw new Error("create data is required for upsert");
      const updateData = parseJsonObject(args.update, "update") ?? createData;

      const whereKeys = Object.keys(where).sort();
      const matched = table.uniqueColumnSets.find((set) => {
        const sorted = [...set].sort();
        return sorted.length === whereKeys.length && sorted.every((c, i) => c === whereKeys[i]);
      });
      if (!matched) {
        const available = table.uniqueColumnSets.map((s) => s.join("+")).join(", ") || "none";
        throw new Error(
          `where columns (${whereKeys.join(", ")}) don't match a unique constraint on "${tableDisplayName(table.schema, table.name)}". Available: ${available}`,
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
        return textResponse({
          dryRun: true,
          table: tableDisplayName(table.schema, table.name),
          wouldInsert: cleanedInsert,
          wouldUpdate: cleanedUpdate,
          ...(stripped.length > 0 && { strippedFields: stripped }),
          ...(warnings.length > 0 && { warnings }),
          message: "DRY RUN -- nothing was upserted.",
        });
      }

      const validColumns = columnSet(table);
      const fragment = buildUpsert(
        qualifiedTable(table.schema, table.name),
        cleanedInsert,
        cleanedUpdate,
        matched,
        validColumns,
      );
      try {
        const result = await pool.query(fragment.text, fragment.values);
        invalidateSchemaCache();
        return textResponse({
          upserted: redactRow(result.rows[0], safety),
          ...(stripped.length > 0 && { strippedFields: stripped }),
          ...(warnings.length > 0 && { warnings }),
        });
      } catch (err) {
        throw new Error(decodePgError(err, safety.mode));
      }
    },

    db_update_many: async (args: z.infer<typeof UpdateArgs>) => {
      const table = await resolveTableName(pool, args.table);
      const access = checkWriteAccess(table.name, "update", safety);
      if (access.blocked) throw new Error(access.message);

      const where = parseJsonObject(args.where, "where");
      const data = parseJsonObject(args.data, "data");
      if (!data) throw new Error("data parameter is required");
      const { cleaned, stripped } = sanitizeWriteData(data, safety);

      const validColumns = columnSet(table);
      const countFragment = buildCount(
        qualifiedTable(table.schema, table.name),
        where,
        validColumns,
      );
      const countResult = await pool.query<{ count: number }>(
        countFragment.text,
        countFragment.values,
      );
      const matched = countResult.rows[0]?.count ?? 0;
      const bw = bulkWarning(matched, "update");
      const warnings = [access.warning, bw].filter((w): w is string => Boolean(w));

      if (args.dryRun) {
        return textResponse({
          dryRun: true,
          table: tableDisplayName(table.schema, table.name),
          matched,
          wouldSet: cleaned,
          ...(stripped.length > 0 && { strippedFields: stripped }),
          ...(warnings.length > 0 && { warnings }),
          message: `DRY RUN -- ${matched} row(s) would be updated.`,
        });
      }

      if (!where || Object.keys(where).length === 0) {
        if (!args.confirmAll) {
          throw new Error(
            "Refusing to update ALL rows. Pass confirmAll: true, or use a specific where filter.",
          );
        }
      }

      const fragment = buildUpdate(
        qualifiedTable(table.schema, table.name),
        cleaned,
        where,
        validColumns,
      );
      try {
        const result = await pool.query(fragment.text, fragment.values);
        invalidateSchemaCache();
        return textResponse({
          table: tableDisplayName(table.schema, table.name),
          matched: result.rowCount ?? 0,
          ...(stripped.length > 0 && { strippedFields: stripped }),
          ...(warnings.length > 0 && { warnings }),
          message: `${result.rowCount ?? 0} row(s) updated.`,
        });
      } catch (err) {
        throw new Error(decodePgError(err, safety.mode));
      }
    },

    db_delete_many: async (args: z.infer<typeof DeleteArgs>) => {
      const table = await resolveTableName(pool, args.table);
      const access = checkWriteAccess(table.name, "delete", safety);
      if (access.blocked) throw new Error(access.message);

      const where = parseJsonObject(args.where, "where");
      const validColumns = columnSet(table);

      const countFragment = buildCount(
        qualifiedTable(table.schema, table.name),
        where,
        validColumns,
      );
      const countResult = await pool.query<{ count: number }>(
        countFragment.text,
        countFragment.values,
      );
      const matched = countResult.rows[0]?.count ?? 0;
      const bw = bulkWarning(matched, "delete");
      const warnings = [access.warning, bw].filter((w): w is string => Boolean(w));

      if (args.dryRun) {
        return textResponse({
          dryRun: true,
          table: tableDisplayName(table.schema, table.name),
          wouldDelete: matched,
          ...(warnings.length > 0 && { warnings }),
          message: `DRY RUN -- ${matched} row(s) would be deleted.`,
        });
      }

      if (!where || Object.keys(where).length === 0) {
        if (!args.confirmAll) {
          throw new Error(
            "Refusing to delete ALL rows. Pass confirmAll: true, or use a specific where filter.",
          );
        }
      }

      const fragment = buildDelete(qualifiedTable(table.schema, table.name), where, validColumns);
      try {
        const result = await pool.query(fragment.text, fragment.values);
        invalidateSchemaCache();
        return textResponse({
          table: tableDisplayName(table.schema, table.name),
          deleted: result.rowCount ?? 0,
          ...(warnings.length > 0 && { warnings }),
          message: `${result.rowCount ?? 0} row(s) deleted.`,
        });
      } catch (err) {
        throw new Error(decodePgError(err, safety.mode));
      }
    },

    db_backup: async (args: z.infer<typeof BackupArgs>) => {
      const access = checkWriteAccess("backup", "backup", safety);
      if (access.blocked) throw new Error(access.message);
      if (!args.confirmed) {
        throw new Error(
          "Refusing to create a backup without explicit user confirmation. Pass confirmed: true.",
        );
      }

      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) throw new Error("DATABASE_URL is not set -- required to run pg_dump.");

      if (!existsSync(config.backupDir)) {
        mkdirSync(config.backupDir, { recursive: true });
      }

      const now = new Date();
      const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const label = args.label ? `-${args.label.replace(/[^a-zA-Z0-9_-]/g, "_")}` : "";
      const filename = `backup-${ts}${label}.sql`;
      const filepath = resolve(config.backupDir, filename);

      const url = new URL(databaseUrl);
      const pgDumpArgs = [
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
      ];
      const dumpEnv = {
        ...process.env,
        PGPASSWORD: decodeURIComponent(url.password || ""),
      };

      let dump: string;
      let fallback = false;
      try {
        dump = await execFileAsync("pg_dump", pgDumpArgs, {
          encoding: "utf-8",
          timeout: 30000,
          maxBuffer: 1024 * 1024 * 100,
          env: dumpEnv,
        });
      } catch (err) {
        const missingBinary =
          typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
        if (config.dockerContainer && !missingBinary) {
          try {
            const user = decodeURIComponent(url.username || "postgres");
            const dbName = url.pathname.replace(/^\//, "") || "postgres";
            dump = await execFileAsync(
              "docker",
              [
                "exec",
                config.dockerContainer,
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
          } catch {
            dump = await buildSqlDataDump(pool);
            fallback = true;
          }
        } else if (missingBinary) {
          dump = await buildSqlDataDump(pool);
          fallback = true;
        } else {
          throw new Error(
            "pg_dump failed. Install postgresql-client, or set DOCKER_CONTAINER to fall back to 'docker exec'.",
          );
        }
      }

      const header = fallback
        ? `-- PGAutoPilot SQL fallback backup (pg_dump unavailable)\n-- Data-only: schema is NOT included. Restore with psql or the dashboard snapshot restore.\n\n`
        : "";
      dump = header + dump;

      writeFileSync(filepath, dump, "utf-8");
      const sizeKB = (Buffer.byteLength(dump, "utf-8") / 1024).toFixed(1);

      return textResponse({
        backup: filename,
        path: filepath,
        sizeKB: `${sizeKB} KB`,
        timestamp: now.toISOString(),
        ...(fallback && {
          method: "sql-fallback",
          note: "pg_dump was unavailable, so this backup contains data only (no schema). Install postgresql-client for full schema + data backups.",
        }),
        message: fallback
          ? `Backup saved: ${filename} (${sizeKB} KB) — data only via SQL fallback (pg_dump not found).`
          : `Backup saved: ${filename} (${sizeKB} KB)`,
      });
    },
  };
}
