import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared: optional database selector for multi-database mode
// ---------------------------------------------------------------------------

const DatabaseArg = z.object({
  database: z
    .string()
    .optional()
    .describe(
      "Name of the database to query (from pgautopilot.json). " +
        "Omit to use the current default database.",
    ),
});

export const HealthArgs = DatabaseArg;

// ---------------------------------------------------------------------------
// Table-based tools: table + optional database
// ---------------------------------------------------------------------------

const TableArg = z.object({
  table: z.string().describe("Name of the table to query"),
  database: z
    .string()
    .optional()
    .describe(
      "Name of the database to query (from pgautopilot.json). " +
        "Omit to use the current default database.",
    ),
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

// ---------------------------------------------------------------------------
// Raw query & backup: no table, but optional database
// ---------------------------------------------------------------------------

export const RawQueryArgs = DatabaseArg.extend({
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

export const BackupArgs = DatabaseArg.extend({
  label: z.string().optional().describe("Optional label for the backup filename"),
  confirmed: z
    .boolean()
    .optional()
    .default(false)
    .describe("Explicit user confirmation required to run a backup"),
});

// ---------------------------------------------------------------------------
// Write tools: table + data + optional database
// ---------------------------------------------------------------------------

export const CreateArgs = TableArg.extend({
  data: z.string().describe("JSON object of column values to insert"),
  dryRun: z.boolean().optional().default(false).describe("If true, simulates without writing"),
});

export const UpsertArgs = TableArg.extend({
  where: z.string().describe("JSON filter identifying the row, must match a unique constraint"),
  create: z.string().describe("JSON object of column-value pairs to insert if not found"),
  update: z.string().optional().describe("JSON object of column-value pairs to set if found"),
  dryRun: z.boolean().optional().default(false).describe("If true, simulates without writing"),
});

export const UpdateArgs = TableArg.extend({
  where: z.string().describe("JSON filter selecting rows to update"),
  data: z.string().describe("JSON object of column-value pairs to set"),
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

// ---------------------------------------------------------------------------
// New multi-database tools
// ---------------------------------------------------------------------------

export const ListDatabasesArgs = z.object({});

export const UseDatabaseArgs = z.object({
  database: z.string().describe("Name of the database to switch to as the default"),
});

export const ExplainArgs = DatabaseArg.extend({
  query: z
    .string()
    .describe(
      "The SQL SELECT query to analyze. Must be a SELECT statement. " +
      "The query is wrapped in EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) automatically.",
    ),
  analyze: z
    .boolean()
    .optional()
    .default(true)
    .describe("Run EXPLAIN ANALYZE for actual timing (default: true)."),
  buffers: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include buffer usage statistics (default: true)."),
});

// ---------------------------------------------------------------------------
// Tool annotations
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const toolDefinitions = {
  mcp_status: {
    title: "MCP Server Status",
    description: `Reports whether the MCP server is ready to run database tools and which database it is connected to. Use this tool first if you suspect a configuration problem. When the server is not configured (e.g. DATABASE_URL is missing or invalid), this tool returns a detailed explanation of exactly what to fix, including the expected .env file location and connection string format. In multi-database mode, it lists every configured database with its connection status. This tool never modifies anything — it is purely informational.

When to use:
- At the start of a session to verify the server is connected and healthy.
- When any other tool returns a connection error, to diagnose the root cause.
- When the user asks about the current server configuration or connected database.

Returns: a JSON object with 'status' (ready|not_configured), 'database' (connection summary), 'mode' (read-only or read-write), and 'readonly' flag. Errors include actionable guidance.`,
    inputSchema: {},
    annotations: readOnly,
  },
  db_list_databases: {
    title: "List Databases",
    description: `Lists all databases configured in pgautopilot.json for multi-database mode, including each database's connection status (connected, not connected, or error), host, port, schema, and read-only setting. This tool is only meaningful in multi-database mode — in single-database mode it returns a message indicating only one database is configured.

When to use:
- As the first call when the user wants to work with a specific named database.
- To discover which databases are available before calling db_use_database.
- To verify that all configured databases are reachable.

Returns: an array of database entries with name, connection summary, status (connected | not connected | error), and readonly flag. Databases that failed to connect at startup will show 'not connected' and will be lazily connected on first use.`,
    inputSchema: ListDatabasesArgs,
    annotations: readOnly,
  },
  db_use_database: {
    title: "Switch Default Database",
    description: `Switches the default database for subsequent tool calls. After switching, all tools that accept an optional 'database' parameter will use this database when the parameter is omitted. The target database must be listed in pgautopilot.json. This is an idempotent operation — calling it with the same database name has no effect.

When to use:
- After calling db_list_databases, when the user wants to work with a specific database.
- When switching between production and analytics databases mid-session.

Behavioral notes:
- The target database is lazily connected on first use if not already connected.
- If the target database is unreachable, the switch succeeds but subsequent tools will return a connection error with guidance.
- This does NOT affect other MCP sessions or connections — only the current session.

Returns: confirmation with the new default database name and its connection details.`,
    inputSchema: UseDatabaseArgs,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  db_overview: {
    title: "Database Overview",
    description: `Provides a high-level overview of the connected PostgreSQL database: all tables with approximate row counts, foreign key relationships between tables, the server mode (read-only or read-write), and active safety rules (blocked tables, high-risk tables, sensitive columns). Use this as your first call when exploring an unfamiliar database to understand its structure before querying specific tables.

When to use:
- At the start of a session to understand what tables exist and how they relate.
- When the user asks "What's in this database?" or "Show me the tables."
- Before writing queries, to confirm table names and relationships.

Behavioral notes:
- Row counts are estimates from pg_stat (not exact COUNT(*)) for performance.
- Only tables in the configured schemas are shown (default: public).
- The overview includes safety metadata so the agent knows what operations are allowed.

Returns: JSON with tables array (name, estimated rows, column count), foreign keys, server mode, and safety configuration.`,
    inputSchema: DatabaseArg,
    annotations: readOnly,
  },
  db_schema: {
    title: "Database Schema",
    description: `Returns the full database schema with column-level detail: every table's columns with their data types, nullability, defaults, constraints (primary key, unique, check), indexes, and foreign key relationships presented as a relationship diagram. This is introspected live from PostgreSQL's information_schema, so it always reflects the current state of the database.

When to use:
- When you need column-level detail beyond what db_overview provides.
- Before constructing queries with specific columns, to verify column names and types.
- When the user asks about table structure, constraints, or relationships.
- When debugging query errors related to column types or constraints.

Behavioral notes:
- Schema is fetched fresh on every call (not cached) to catch DDL changes.
- Only schemas listed in PG_SCHEMAS are included (default: public).
- The relationship diagram shows foreign keys between tables, useful for JOIN queries.

Returns: JSON with tables (each containing columns with type, nullable, default, constraints), indexes, and a relationships array.`,
    inputSchema: DatabaseArg,
    annotations: readOnly,
  },
  db_health: {
    title: "Database Health",
    description: `Checks database connectivity, connection pool statistics, server uptime, and total request count. In multi-database mode, omit the database parameter to see health status for all configured databases simultaneously. Also runs PostgreSQL system checks: vacuum health (TXID wraparound risk), replication lag, index usage, and sequence exhaustion.

When to use:
- At the start of a session to verify the database is responsive.
- When the user asks about connection health or pool utilization.
- When troubleshooting slow responses or connection errors.
- Periodically during long sessions to check pool exhaustion.
- To check vacuum/replication/sequence health in production.

Behavioral notes:
- In single-database mode, returns stats for the one connected database.
- In multi-database mode, returns an array of health entries for all databases.
- 'idle' connections are available; 'active' connections are in use.
- If pool utilization is high (>80%), consider increasing PGPOOL_MAX.
- Vacuum checks query pg_stat_user_tables — no extensions required.
- Replication checks query pg_stat_replication — returns empty on standalone instances.

Returns: JSON with connected (boolean), pool stats (total, idle, active), uptime seconds, total requests served, database connection summary, and health checks (vacuum, replication, indexes, sequences).`,
    inputSchema: HealthArgs,
    annotations: readOnly,
  },
  db_table_info: {
    title: "Table Information",
    description: `Returns detailed information about a single table: exact row count (via COUNT(*)), all columns with their types and nullability, all indexes with their columns and uniqueness, foreign key relationships, and approximate table size on disk. Use this when you need specifics about one table that go beyond the overview.

When to use:
- After db_overview, to drill into a specific table's details.
- When the user asks "Tell me about the orders table" or "What indexes does users have?"
- Before writing performance-sensitive queries, to understand available indexes.
- When debugging issues related to a specific table.

Behavioral notes:
- Row count is exact (uses COUNT(*)), which may be slow on very large tables.
- The table name must exist in the database — a typo returns a clear error with suggestions from the schema.
- Table size is approximate, based on pg_table_size().

Returns: JSON with row_count, columns array, indexes array, foreign_keys, and size_bytes.`,
    inputSchema: TableInfoArgs,
    annotations: readOnly,
  },
  db_find_many: {
    title: "Find Many Rows",
    description: `Queries rows from a table with flexible filtering, column selection, sorting, and pagination. This is the primary tool for reading data. All parameters are optional except 'table' — omitting filters returns all rows (up to the limit). The default limit is 50 rows; the maximum is 500. Sensitive columns (passwords, tokens, keys) are automatically redacted in the output.

When to use:
- "Show me recent orders", "Find users with email containing gmail"
- "List products sorted by price", "Get page 2 of customers"
- Any read query that needs filtering, sorting, or pagination

Parameter guidance:
- where: JSON filter object. Supports operators: eq, neq, gt, gte, lt, lte, contains, startsWith, endsWith, in, notIn. Example: {"status": "active", "age": {"gt": 18}}
- select: JSON array of column names to return. Example: ["id", "name", "email"]
- orderBy: JSON object with column name and direction. Example: {"created_at": "desc"}
- take: max rows to return (default 50, max 500)
- skip: rows to skip for offset pagination

Behavioral notes:
- All queries run in a read-only transaction with a configurable timeout (default 10s).
- The table name is validated against the live schema before query execution.
- Results include pagination metadata (total count when available).
- On error, returns a clear message explaining what went wrong.`,
    inputSchema: FindManyArgs,
    annotations: readOnly,
  },
  db_find_first: {
    title: "Find First Row",
    description: `Finds a single row matching the given filter. Returns the first matching row or null if no rows match. Use this instead of db_find_many when you expect exactly one result and want a single object rather than an array. Sensitive columns are automatically redacted.

When to use:
- "Get user with ID 42", "Find the order with this tracking number"
- Lookups by unique identifier (primary key or unique constraint)
- When you need exactly one row, not a list

Parameter guidance:
- where: JSON filter object (required). Must be specific enough to target one row. Example: {"id": 42} or {"email": "user@example.com"}
- select: optional JSON array of column names to return

Behavioral notes:
- Returns a single JSON object, not an array.
- Returns null (not an error) when no row matches the filter.
- For queries that should return multiple rows, use db_find_many instead.`,
    inputSchema: FindFirstArgs,
    annotations: readOnly,
  },
  db_count: {
    title: "Count Rows",
    description: `Returns the exact number of rows in a table, optionally filtered. This runs an exact COUNT(*) query — not an estimate. Use this when you need a precise count for reporting, validation, or before performing bulk operations.

When to use:
- "How many users signed up this week?"
- "Count all orders with status pending"
- Before bulk deletes, to confirm the scope of the operation

Parameter guidance:
- table: the table name (required)
- where: optional JSON filter object (same syntax as db_find_many)

Behavioral notes:
- Exact COUNT(*) on large tables (millions of rows) may be slow.
- On large tables, consider using db_aggregate with a group-by for approximate breakdowns.
- Returns an integer count, not a row object.`,
    inputSchema: CountArgs,
    annotations: readOnly,
  },
  db_aggregate: {
    title: "Aggregate / Group By",
    description: `Groups rows by one or more columns and computes aggregate functions (count, sum, avg, min, max) on each group. This is the tool for analytical queries like "total sales by category", "average order value by month", or "count of users per country". Results are sorted by the aggregate by default.

When to use:
- "How many products in each category?" (by=category, _count="*")
- "Total revenue by region" (by=region, _sum="amount")
- "Average order value by status" (by=status, _avg="total")
- "Min and max prices per category" (by=category, _min="price", _max="price")

Parameter guidance:
- by: comma-separated column names to group by (required). Example: "category, region"
- where: optional JSON filter applied before grouping
- orderBy: JSON object for sorting results. Use "_count", "_sum", "_avg", "_min", "_max" as the key. Example: {"_count": "desc"}
- sum/avg/min/max: comma-separated numeric columns to aggregate
- take: max groups to return (default 50)

Behavioral notes:
- All aggregations run in a read-only transaction with a configurable timeout.
- Results are returned as an array of group objects with the computed aggregates.
- Groups with zero rows are excluded from the results.`,
    inputSchema: AggregateArgs,
    annotations: readOnly,
  },
  db_explain: {
    title: "Explain Query Plan",
    description: `Runs EXPLAIN ANALYZE on a SQL SELECT query to analyze its execution plan, performance characteristics, and bottlenecks. Returns the full execution plan with timing, buffer usage, row estimates, and actionable analysis. This tool helps you understand how PostgreSQL processes a query and identifies optimization opportunities like missing indexes, sequential scans, or high-cost operations.

When to use:
- "Why is this query slow?"
- "Help me optimize this query"
- "What indexes would improve this query?"
- Before creating indexes, to understand current plan

Parameter guidance:
- query: the SQL SELECT query to analyze (required). Example: "SELECT u.name, COUNT(o.id) FROM users u JOIN orders o ON o.user_id = u.id WHERE o.created_at > '2025-01-01' GROUP BY u.name ORDER BY COUNT(o.id) DESC LIMIT 10"
- analyze: set to true for actual timing (default: true)
- buffers: set to true to include buffer usage stats (default: true)

Behavioral notes:
- Only SELECT queries are accepted — EXPLAIN on writes is not supported.
- The query is NOT executed — only the plan is analyzed.
- Results include: execution plan (JSON), total cost, actual time, rows, buffers, and analysis text.
- Analysis highlights: sequential scans on large tables, low selectivity filters, missing index opportunities, high-cost joins.
- No extensions required — uses built-in PostgreSQL EXPLAIN.`,
    inputSchema: ExplainArgs,
    annotations: readOnly,
  },
  db_raw_query: {
    title: "Raw SQL Query",
    description: `Executes a raw SQL SELECT statement with a mandatory LIMIT clause. This is the escape hatch for queries that cannot be expressed with the structured tools (complex JOINs, CTEs, window functions, subqueries, etc.). All queries run inside a read-only, single-statement transaction with a configurable timeout (default 10 seconds).

When to use:
- Complex JOINs across multiple tables
- CTEs, window functions, or subqueries
- Custom aggregations not supported by db_aggregate
- Exploratory queries during development

Parameter guidance:
- sql: the raw SQL statement (required). Must be a SELECT and MUST include a LIMIT clause. Example: "SELECT u.name, COUNT(o.id) FROM users u JOIN orders o ON o.user_id = u.id GROUP BY u.name ORDER BY COUNT(o.id) DESC LIMIT 10"
- confirmed: set to true to acknowledge the raw query (currently informational)

Behavioral notes:
- ONLY SELECT statements are allowed. INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, GRANT, and other DDL/DML are rejected.
- The LIMIT clause is mandatory — queries without LIMIT are rejected.
- Only single-statement queries are allowed (no semicolons separating multiple statements).
- Dangerous functions (pg_read_file, COPY, pg_sleep, etc.) are blocked.
- Results are capped at 5000 rows to prevent memory exhaustion.
- Sensitive columns are automatically redacted in the output.
- For write operations, use the structured tools (db_create, db_update_many, etc.).`,
    inputSchema: RawQueryArgs,
    annotations: readOnly,
  },
  db_backup: {
    title: "Backup Database",
    description: `Creates a full SQL dump of the database using pg_dump and saves it to the configured backup directory (default: ./backups). The backup includes the full schema and data. When the local pg_dump binary is not available and DOCKER_CONTAINER is set, this tool falls back to running pg_dump inside the specified Docker container.

When to use:
- Before running risky migrations or bulk operations
- Periodic backups as part of maintenance routines
- When the user asks to back up or export the database

Parameter guidance:
- label: optional label for the backup filename (e.g., "pre-migration"). The final filename includes a timestamp: backups/db_backup_pre-migration_2026-09-01T120000.sql
- confirmed: set to true to confirm the backup operation

Behavioral notes:
- Requires pg_dump to be available either locally or via Docker.
- The backup file is a plain SQL dump, not a binary format.
- Large databases may take significant time and disk space.
- This tool is idempotent — running it multiple times creates separate backup files.
- The backup directory is created automatically if it does not exist.

Returns: path to the created backup file and its size.`,
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
    description: `Inserts a new row into the specified table. All columns are validated against the live schema before execution — typos in column names or type mismatches are caught early. Sensitive columns (passwords, tokens, API keys, etc.) are automatically stripped from the input to prevent accidental credential storage. Use dry_run=true to preview the insert without actually writing to the database.

When to use:
- "Add a new user named Jane with email jane@example.com"
- "Create an order for customer 42 with total $99.99"
- Any single-row INSERT operation

Parameter guidance:
- table: the target table name (required)
- data: JSON object of column-value pairs to insert (required). Example: {"name": "Jane Doe", "email": "jane@example.com", "role": "admin"}
- dry_run: set to true to validate without writing (default: false)

Behavioral notes:
- The table name and all column names are validated against the live schema.
- The INSERT runs in a transaction — if any constraint is violated, the entire operation rolls back with a clear error message.
- On success, returns the inserted row including any auto-generated values (e.g., id).
- Sensitive columns in the input are silently stripped before execution.
- For multiple inserts, call this tool once per row or use db_raw_query with an INSERT ... VALUES statement (requires confirmed=true and ALLOW_RAW_WRITES).`,
    inputSchema: CreateArgs,
    annotations: write,
  },
  db_upsert: {
    title: "Upsert Row",
    description: `Inserts a new row or updates an existing one using PostgreSQL's ON CONFLICT mechanism. The 'where' filter's columns must match a unique constraint or primary key on the table — this is how PostgreSQL determines whether to insert or update. If a matching row exists, only the columns specified in 'update' are changed. If no match exists, a new row is created with the values from 'create'. Use dry_run=true to preview.

When to use:
- "Create this user if they don't exist, otherwise update their last_login"
- "Upsert product SKU-123 with price $29.99"
- Idempotent insert-or-update operations

Parameter guidance:
- table: the target table name (required)
- where: JSON filter identifying the conflict target (required). Columns must match a unique constraint or primary key. Example: {"email": "jane@example.com"}
- create: JSON object of column-value pairs for the INSERT case (required)
- update: JSON object of column-value pairs for the UPDATE case (optional). If omitted, no update occurs on conflict — the existing row is returned unchanged.
- dry_run: set to true to validate without writing (default: false)

Behavioral notes:
- The where columns MUST match a unique constraint or primary key — the tool validates this against the schema and returns an error if no matching constraint exists.
- Returns the final row (either newly inserted or updated).
- This is idempotent — calling it multiple times with the same data has the same effect as calling it once.`,
    inputSchema: UpsertArgs,
    annotations: { ...write, idempotentHint: true },
  },
  db_update_many: {
    title: "Update Rows",
    description: `Updates all rows matching the given filter. Every column and value is validated against the live schema before execution. When the filter is empty ('{}'), ALL rows in the table would be updated — this requires confirmAll=true as a safety gate. A warning is issued when more than 10 rows are affected. Use dry_run=true to preview the update without actually writing.

When to use:
- "Mark all pending orders as shipped"
- "Update user 42's email to new@example.com"
- "Set all products in category X as discontinued"

Parameter guidance:
- table: the target table name (required)
- where: JSON filter selecting rows to update (required). Example: {"status": "pending"} Use '{}' with confirmAll=true to update ALL rows (dangerous!).
- data: JSON object of column-value pairs to set (required). Example: {"status": "shipped", "shipped_at": "2026-09-01"}
- dry_run: set to true to preview without writing (default: false)
- confirmAll: REQUIRED when where='{}' to confirm updating all rows

Behavioral notes:
- A warning is emitted when more than 10 rows would be affected.
- Empty filter with confirmAll=false returns an error requiring explicit confirmation.
- The update runs in a transaction — all rows are updated atomically.
- Returns the count of affected rows.`,
    inputSchema: UpdateArgs,
    annotations: { ...write, idempotentHint: true },
  },
  db_delete_many: {
    title: "Delete Rows",
    description: `Deletes all rows matching the given filter. This is a destructive operation — deleted data cannot be recovered unless a backup exists. When the filter is empty ('{}'), ALL rows in the table would be deleted — this requires confirmAll=true as a safety gate. A warning is issued when more than 10 rows are affected. Use dry_run=true to preview the deletion scope before committing.

When to use:
- "Delete all logs older than 2025"
- "Remove user with email test@test.com"
- "Purge expired sessions"

Parameter guidance:
- table: the target table name (required)
- where: JSON filter selecting rows to delete (required). Example: {"expired": true} Use '{}' with confirmAll=true to delete ALL rows (dangerous!).
- dry_run: set to true to preview without deleting (default: false). STRONGLY recommended — always dry-run first to see how many rows would be affected.
- confirmAll: REQUIRED when where='{}' to confirm deleting all rows

Behavioral notes:
- A warning is emitted when more than 10 rows would be affected.
- Empty filter with confirmAll=false returns an error requiring explicit confirmation.
- The delete runs in a transaction — all rows are deleted atomically.
- Returns the count of deleted rows.
- ALWAYS use dry_run=true first to verify the scope before committing.`,
    inputSchema: DeleteArgs,
    annotations: write,
  },
};
