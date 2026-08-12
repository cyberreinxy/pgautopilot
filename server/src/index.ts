import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, connectionSummary } from "./config.js";
import { createPool, waitForConnection } from "./db.js";
import { buildSafetyState } from "./safety.js";
import { toolDefinitions } from "./toolDefinitions.js";
import { createHandlers } from "./toolHandlers.js";
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
    version: "2.1.3",
  });

  let config: ReturnType<typeof loadConfig> | null = null;
  let configError: string | null = null;

  try {
    config = loadConfig(process.argv.slice(2));
  } catch (err) {
    configError = err instanceof Error ? err.message : String(err);
    log.error(`Configuration error: ${configError}`);
  }

  if (configError) {
    const statusHandler = async (): Promise<ToolResult> => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { status: "not_configured", error: configError, guidance: CONFIG_GUIDANCE },
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

  if (!config) {
    log.error("Unexpected: loadConfig returned no config and no error.");
    process.exit(1);
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("PGAutoPilot v2.1.3 ready");
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
}

main().catch((err) => {
  log.error(`Failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
