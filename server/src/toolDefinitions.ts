import { z } from "zod";

const TableArg = z.object({
  table: z.string().describe("Name of the table to query"),
});

export const FindManyArgs = TableArg.extend({
  where: z
    .string()
    .optional()
    .describe('JSON filter object, e.g. \'{"email":{"contains":"@gmail"}}\''),
  select: z.string().optional().describe('JSON array of column names, e.g. \'["id","email"]\''),
  orderBy: z.string().optional().describe('JSON object, e.g. \'{"createdAt":"desc"}\''),
  take: z.number().optional().describe("Max rows to return (default 50, max 500)"),
  skip: z.number().optional().describe("Rows to skip for pagination"),
});

export const FindFirstArgs = TableArg.extend({
  where: z.string().describe("JSON filter object to find a single row"),
  select: z.string().optional(),
});

export const CountArgs = TableArg.extend({
  where: z.string().optional().describe("Optional JSON filter object"),
});

export const AggregateArgs = TableArg.extend({
  by: z.string().describe("Comma-separated column names to group by"),
  where: z.string().optional().describe("Optional JSON filter applied before grouping"),
  orderBy: z.string().optional().describe('JSON order object, e.g. \'{"_count":"desc"}\''),
  take: z.number().optional().describe("Max groups to return (default 50)"),
  sum: z.string().optional().describe("Comma-separated numeric columns to sum"),
  avg: z.string().optional().describe("Comma-separated numeric columns to average"),
  min: z.string().optional().describe("Comma-separated columns to find minimum"),
  max: z.string().optional().describe("Comma-separated columns to find maximum"),
});

export const TableInfoArgs = TableArg;

export const RawQueryArgs = z.object({
  sql: z
    .string()
    .describe(
      "Raw SQL statement. SELECT (must end with LIMIT) by default; non-SELECT requires confirmed: true, ALLOW_RAW_WRITES on the server, and a server that is not read-only",
    ),
  confirmed: z
    .boolean()
    .optional()
    .default(false)
    .describe("Explicit user confirmation to allow a single non-SELECT (write/DDL) statement"),
});

export const BackupArgs = z.object({
  label: z.string().optional().describe("Optional label for the backup filename"),
  confirmed: z
    .boolean()
    .optional()
    .default(false)
    .describe("Explicit user confirmation required to run a backup"),
});

export const CreateArgs = TableArg.extend({
  data: z.string().describe("JSON object of column values to insert"),
  dryRun: z.boolean().optional().default(false).describe("If true, simulates without writing"),
});

export const UpsertArgs = TableArg.extend({
  where: z.string().describe("JSON filter identifying the row, must match a unique constraint"),
  create: z.string().describe("JSON object of column values to insert if not found"),
  update: z.string().optional().describe("JSON object of column values to set if found"),
  dryRun: z.boolean().optional().default(false).describe("If true, simulates without writing"),
});

export const UpdateArgs = TableArg.extend({
  where: z.string().describe("JSON filter selecting rows to update"),
  data: z.string().describe("JSON object of column values to set"),
  dryRun: z.boolean().optional().default(false).describe("If true, simulates without writing"),
  confirmAll: z
    .boolean()
    .optional()
    .default(false)
    .describe("Required to update all rows when where is '{}'"),
});

export const DeleteArgs = TableArg.extend({
  where: z.string().describe("JSON filter selecting rows to delete"),
  dryRun: z.boolean().optional().default(false).describe("If true, simulates without deleting"),
  confirmAll: z
    .boolean()
    .optional()
    .default(false)
    .describe("Required to delete all rows when where is '{}'"),
});

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const write = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

export const toolDefinitions = {
  mcp_status: {
    title: "MCP Server Status",
    description:
      "Reports whether the MCP server is ready to run database tools and the database it is " +
      "connected to. If the server could not be configured (e.g. DATABASE_URL is missing or " +
      "conflicting), this tool explains exactly what to fix.",
    inputSchema: {},
    annotations: readOnly,
  },
  db_overview: {
    title: "Database Overview",
    description:
      "Overview of the connected database: tables with approximate row counts, foreign key " +
      "relationships, server mode, and safety rules. Call this first when exploring a database.",
    inputSchema: {},
    annotations: readOnly,
  },
  db_schema: {
    title: "Database Schema",
    description:
      "Full schema with column-level detail and a relationship diagram, introspected live " +
      "from the connected PostgreSQL database.",
    inputSchema: {},
    annotations: readOnly,
  },
  db_health: {
    title: "Database Health",
    description: "Check database connectivity, pool stats, uptime, and request count.",
    inputSchema: {},
    annotations: readOnly,
  },
  db_table_info: {
    title: "Table Information",
    description:
      "Detailed info for one table: exact row count, columns, indexes, foreign keys, size.",
    inputSchema: TableInfoArgs,
    annotations: readOnly,
  },
  db_find_many: {
    title: "Find Many Rows",
    description:
      "Query rows from any table. Supports where, select, orderBy, take, skip. " +
      "Returns pagination metadata.",
    inputSchema: FindManyArgs,
    annotations: readOnly,
  },
  db_find_first: {
    title: "Find First Row",
    description: "Find a single row matching a filter. Returns null if not found.",
    inputSchema: FindFirstArgs,
    annotations: readOnly,
  },
  db_count: {
    title: "Count Rows",
    description: "Exact count of rows in a table, optionally filtered.",
    inputSchema: CountArgs,
    annotations: readOnly,
  },
  db_aggregate: {
    title: "Aggregate / Group By",
    description: "Group rows by one or more columns and compute count, sum, avg, min, max.",
    inputSchema: AggregateArgs,
    annotations: readOnly,
  },
  db_raw_query: {
    title: "Raw SQL Query",
    description:
      "Execute a raw read-only SELECT with a mandatory LIMIT. Runs inside a read-only, " +
      "10-second-timeout transaction.",
    inputSchema: RawQueryArgs,
    annotations: readOnly,
  },
  db_backup: {
    title: "Backup Database",
    description:
      "Full SQL dump via pg_dump, saved to the configured backup directory. Falls back to " +
      "'docker exec' when DOCKER_CONTAINER is set and local pg_dump is unavailable.",
    inputSchema: BackupArgs,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  db_create: {
    title: "Create Row",
    description:
      "Insert a new row. Sensitive columns (passwords, tokens) are stripped automatically.",
    inputSchema: CreateArgs,
    annotations: write,
  },
  db_upsert: {
    title: "Upsert Row",
    description:
      "Insert or update a row using ON CONFLICT. The where filter's columns must match a " +
      "unique constraint or primary key on the table.",
    inputSchema: UpsertArgs,
    annotations: { ...write, idempotentHint: true },
  },
  db_update_many: {
    title: "Update Rows",
    description:
      "Update all rows matching a filter. Empty filter requires confirmAll:true to proceed.",
    inputSchema: UpdateArgs,
    annotations: { ...write, idempotentHint: true },
  },
  db_delete_many: {
    title: "Delete Rows",
    description:
      "Delete all rows matching a filter. Empty filter requires confirmAll:true to proceed.",
    inputSchema: DeleteArgs,
    annotations: write,
  },
};
