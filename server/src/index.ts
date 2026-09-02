import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, detectConfigMode, connectionSummary, isLocalHost } from "./config.js";
import { createPool, waitForConnection } from "./db.js";
import { buildSafetyState } from "./safety.js";
import { toolDefinitions } from "./toolDefinitions.js";
import { createHandlers } from "./toolHandlers.js";
import { ConnectionManager, buildDatabaseEntry } from "./connectionManager.js";
import { watchConfig } from "./configWatcher.js";
import { log } from "./logger.js";

process.on("unhandledRejection", (reason) => {
  log.error(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  process.exit(1);
});

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const CONFIG_GUIDANCE =
  "PGAutoPilot reads DATABASE_URL from the .env file in the working directory of the " +
  "MCP server process. Create (or correct) that .env file, then restart the MCP server.";

function configErrorResult(detail: string): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `Database tools are unavailable because the server is not configured.\n\n${CONFIG_GUIDANCE}\n\nDetails:\n${detail}`,
      },
    ],
    isError: true,
  };
}

function registerTools(
  server: McpServer,
  handlers: Record<string, (args: unknown) => Promise<ToolResult>>,
  disabledTools: Set<string>,
) {
  for (const [name, def] of Object.entries(toolDefinitions)) {
    if (disabledTools.has(name)) {
      log.warn(`Tool "${name}" is disabled via DISABLED_TOOLS.`);
      continue;
    }
    const handler = handlers[name];
    const wrapped = async (args: unknown): Promise<ToolResult> => {
      if (!handler) {
        return configErrorResult(`No handler available for tool: ${name}`);
      }
      try {
        return await handler(args);
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: err instanceof Error ? err.message : String(err) },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    };
    const inputSchema =
      def.inputSchema && "shape" in def.inputSchema ? def.inputSchema.shape : def.inputSchema;
    server.registerTool(
      name,
      { ...def, inputSchema } as Parameters<typeof server.registerTool>[1],
      wrapped as Parameters<typeof server.registerTool>[2],
    );
  }
}

async function main() {
  const server = new McpServer({
    name: "pgautopilot",
    title: "PGAutoPilot -- PostgreSQL AI Assistant",
    version: "2.3.0",
  });

  const argv = process.argv.slice(2);

  // --- Detect configuration mode (single vs multi-database) ---
  let configMode: ReturnType<typeof detectConfigMode> | null = null;
  try {
    configMode = detectConfigMode(argv);
  } catch (err) {
    log.error(`Configuration error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!configMode) {
    const statusHandler = async (): Promise<ToolResult> => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: "not_configured",
              error: "Could not load configuration.",
              guidance: CONFIG_GUIDANCE,
            },
            null,
            2,
          ),
        },
      ],
    });
    registerTools(server, { mcp_status: statusHandler }, new Set<string>());
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log.warn(
      "PGAutoPilot started in not-configured mode. Fix DATABASE_URL in the .env and restart.",
    );
    return;
  }

  // --- Single-database mode (backward compatible) ---
  if (configMode.mode === "single") {
    let config: ReturnType<typeof loadConfig> | null = null;
    try {
      config = loadConfig(argv);
    } catch (err) {
      log.error(`Configuration error: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!config) {
      const statusHandler = async (): Promise<ToolResult> => configErrorResult("Failed to load single-database config.");
      registerTools(server, { mcp_status: statusHandler }, new Set<string>());
      const transport = new StdioServerTransport();
      await server.connect(transport);
      return;
    }

    const pool = createPool(config.poolConfig);
    const safety = buildSafetyState(
      config.readonly,
      config.mode,
      config.blockedTables,
      config.extraSensitiveColumns,
      config.highRiskTables,
    );

    try {
      await waitForConnection(pool, 5, 2000);
      log.info(`Connected to ${connectionSummary(config.poolConfig)}`);
    } catch (err) {
      log.error(`Failed to connect: ${err instanceof Error ? err.message : String(err)}`);
      log.error("Ensure DATABASE_URL points to a reachable PostgreSQL instance.");
      await pool.end();
      process.exit(1);
    }

    const handlers = createHandlers(pool, safety, config);
    const untypedHandlers = handlers as Record<string, (args: unknown) => Promise<ToolResult>>;

    const statusHandler = async (): Promise<ToolResult> => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: "ready",
              database: connectionSummary(config.poolConfig),
              mode: safety.mode,
              readonly: safety.readonly,
            },
            null,
            2,
          ),
        },
      ],
    });
    registerTools(server, { ...untypedHandlers, mcp_status: statusHandler }, config.disabledTools);

    // --- MCP Resources ---
    server.resource("status", "pgautopilot://status", async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            name: "pgautopilot",
            version: "2.3.0",
            mode: safety.mode,
            readonly: safety.readonly,
            database: connectionSummary(config.poolConfig),
          }, null, 2),
        },
      ],
    }));

    server.resource("schema", "pgautopilot://schema", async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: "Use db_schema tool to get the full schema. This resource provides a quick summary.",
        },
      ],
    }));

    // --- MCP Prompts ---
    server.prompt("explore-database", "Systematically explore an unfamiliar database to understand its structure", async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are exploring an unfamiliar PostgreSQL database. Follow these steps:\n\n1. Call db_overview to see all tables, row counts, and relationships.\n2. Call db_schema to understand column types, constraints, and indexes.\n3. Identify the main entities and how they relate.\n4. Note any tables with unusual patterns (large tables, many columns, JSONB fields).\n5. Summarize: what is this database about? What are the key tables? What are the relationships?\n\nStart by calling db_overview.`,
          },
        },
      ],
    }));

    server.prompt("diagnose-query", "Diagnose why a query is slow or returning unexpected results", async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are diagnosing a PostgreSQL query issue. Follow these steps:\n\n1. Ask the user for the query (or find it in context).\n2. Call db_explain with the query to analyze the execution plan.\n3. Look for: sequential scans on large tables, low selectivity filters, missing indexes, high-cost joins, external sorts.\n4. If the query references specific tables, call db_table_info to check available indexes.\n5. Suggest specific fixes: indexes to add, query rewrites, or configuration changes.\n\nStart by asking for the query, or run db_explain if you already have it.`,
          },
        },
      ],
    }));

    const transport = new StdioServerTransport();
    await server.connect(transport);
    log.info("PGAutoPilot v2.3.0 ready");
    log.info(`Connection: ${connectionSummary(config.poolConfig)}`);
    log.info(`Mode: ${safety.mode} | Read-only: ${safety.readonly ? "yes" : "no"}`);
    if (safety.blockedTables.size > 0) {
      log.info(`Blocked tables: ${[...safety.blockedTables].join(", ")}`);
    }

    const shutdown = async () => {
      await server.close();
      await pool.end();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

  // --- Multi-database mode ---
  const resolved = configMode.resolved;
  const multiDb = resolved.multiDbConfig!;

  log.info("PGAutoPilot v2.3.0 starting in multi-database mode");
  log.info(`Databases configured: ${Object.keys(multiDb.databases).join(", ")}`);

  const manager = new ConnectionManager();
  const dbNames = Object.keys(multiDb.databases);

  for (const name of dbNames) {
    const entryConfig = multiDb.databases[name]!;
    const overrides: Parameters<typeof buildDatabaseEntry>[3] = {};
    if (entryConfig.readonly !== undefined) overrides.readonly = entryConfig.readonly;
    if (entryConfig.schemas !== undefined) overrides.schemas = entryConfig.schemas;
    if (entryConfig.blocked_tables !== undefined) overrides.blocked_tables = entryConfig.blocked_tables;
    if (entryConfig.sensitive_columns !== undefined) overrides.sensitive_columns = entryConfig.sensitive_columns;
    if (entryConfig.high_risk_tables !== undefined) overrides.high_risk_tables = entryConfig.high_risk_tables;
    if (entryConfig.statement_timeout_ms !== undefined) overrides.statement_timeout_ms = entryConfig.statement_timeout_ms;
    if (entryConfig.pool_max !== undefined) overrides.pool_max = entryConfig.pool_max;
    const entry = buildDatabaseEntry(
      name,
      entryConfig.url,
      {
        readonly: multiDb.defaults.readonly,
        schemas: multiDb.defaults.schemas,
        statementTimeoutMs: multiDb.defaults.statement_timeout_ms,
        poolMax: multiDb.defaults.pool_max,
      },
      overrides,
    );
    manager.register(name, entry);
  }

  // Register DATABASE_URL from .env as the "default" if present and not already in config
  if (resolved.singleDbUrl && !manager.has("default")) {
    const defaultEntry = buildDatabaseEntry(
      "default",
      resolved.singleDbUrl,
      {
        readonly: multiDb.defaults.readonly,
        schemas: multiDb.defaults.schemas,
        statementTimeoutMs: multiDb.defaults.statement_timeout_ms,
        poolMax: multiDb.defaults.pool_max,
      },
      {},
    );
    manager.register("default", defaultEntry);
  }

  // Set the default database (from --database flag or first registered)
  if (resolved.defaultDatabase) {
    manager.setDefault(resolved.defaultDatabase);
  }

  // Connect to the default database at startup (required)
  let defaultEntry;
  try {
    defaultEntry = await manager.connectDefault();
  } catch (err) {
    log.error(`Failed to connect to default database: ${err instanceof Error ? err.message : String(err)}`);
    log.error("Other databases will connect on first use.");
  }

  // Probe remaining databases in parallel (best-effort, non-blocking)
  const remainingNames = dbNames.filter((n) => n !== (resolved.defaultDatabase ?? dbNames[0]));
  if (remainingNames.length > 0) {
    log.info(`Probing ${remainingNames.length} additional database(s)...`);
    const probes = remainingNames.map(async (name) => {
      try {
        const entry = await manager.get(name);
        if (entry.pool) {
          log.info(`  [${name}] OK — ${connectionSummary(entry.poolConfig)}`);
        }
      } catch (err) {
        log.warn(`  [${name}] unreachable — ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    // Don't block startup — fire and forget with a timeout
    Promise.allSettled(probes).then(() => {
      log.info("Database probe complete.");
    });
  }

  const pool = defaultEntry?.pool ?? null;
  const safety = defaultEntry?.safety ?? buildSafetyState(
    resolved.globalReadonly,
    resolved.globalMode,
    new Set(),
    new Set(),
    new Set(),
  );

  const config = {
    poolConfig: defaultEntry?.poolConfig ?? { connectionString: "" },
    readonly: safety.readonly,
    mode: safety.mode,
    backupDir: resolved.backupDir,
    dockerContainer: resolved.dockerContainer,
    blockedTables: safety.blockedTables,
    highRiskTables: safety.highRiskTables,
    extraSensitiveColumns: safety.sensitiveColumns,
    statementTimeoutMs: defaultEntry?.statementTimeoutMs ?? 10000,
    allowRawWrites: resolved.allowRawWrites,
    schemas: defaultEntry?.schemas ?? ["public"],
    disabledTools: resolved.disabledTools,
  };

  // Create handlers using the default pool (tool handlers use pool directly)
  const handlers = pool
    ? createHandlers(pool, safety, config, manager)
    : {} as ReturnType<typeof createHandlers>;
  const untypedHandlers = handlers as Record<string, (args: unknown) => Promise<ToolResult>>;

  // Multi-DB status handler
  const dbList = manager.list();
  const statusHandler = async (): Promise<ToolResult> => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            status: "ready",
            mode: "multi-database",
            current_default: manager.getDefaultName(),
            databases: dbList.map((d) => ({
              name: d.name,
              connection: d.connection,
              status: d.status,
              readonly: d.readonly,
            })),
          },
          null,
          2,
        ),
      },
    ],
  });

  registerTools(server, { ...untypedHandlers, mcp_status: statusHandler }, resolved.disabledTools);

  // --- MCP Resources ---
  server.resource("status", "pgautopilot://status", async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({
          name: "pgautopilot",
          version: "2.3.0",
          mode: "multi-database",
          defaultDatabase: manager.getDefaultName(),
          databases: manager.list().map((d) => ({
            name: d.name,
            status: d.status,
            readonly: d.readonly,
          })),
          uptimeSeconds: Math.floor((Date.now() - Date.now()) / 1000),
        }, null, 2),
      },
    ],
  }));

  server.resource("schema", "pgautopilot://schema", async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/plain",
        text: "Use db_schema tool to get the full schema. This resource provides a quick summary.",
      },
    ],
  }));

  // --- MCP Prompts ---
  server.prompt("explore-database", "Systematically explore an unfamiliar database to understand its structure", async () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `You are exploring an unfamiliar PostgreSQL database. Follow these steps:

1. Call db_overview to see all tables, row counts, and relationships.
2. Call db_schema to understand column types, constraints, and indexes.
3. Identify the main entities and how they relate.
4. Note any tables with unusual patterns (large tables, many columns, JSONB fields).
5. Summarize: what is this database about? What are the key tables? What are the relationships?

Start by calling db_overview.`,
        },
      },
    ],
  }));

  server.prompt("diagnose-query", "Diagnose why a query is slow or returning unexpected results", async () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `You are diagnosing a PostgreSQL query issue. Follow these steps:

1. Ask the user for the query (or find it in context).
2. Call db_explain with the query to analyze the execution plan.
3. Look for: sequential scans on large tables, low selectivity filters, missing indexes, high-cost joins, external sorts.
4. If the query references specific tables, call db_table_info to check available indexes.
5. Suggest specific fixes: indexes to add, query rewrites, or configuration changes.

Start by asking for the query, or run db_explain if you already have it.`,
        },
      },
    ],
  }));

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Startup banner
  log.info("Multi-database mode ready");
  for (const entry of dbList) {
    const statusIcon = entry.connected ? "connected" : "not connected (lazy)";
    log.info(`  [${entry.name}] ${entry.connection} — ${statusIcon} | readonly: ${entry.readonly}`);
  }

  // Watch config file for changes
  const configWatcher = watchConfig(manager, { globalReadonly: resolved.globalReadonly });

  const shutdown = async () => {
    configWatcher.stop();
    await server.close();
    await manager.closeAll();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log.error(`Failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
