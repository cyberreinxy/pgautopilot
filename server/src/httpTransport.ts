import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { log } from "./logger.js";

export interface HttpTransportOptions {
  port: number;
  host?: string;
}

export async function startHttpTransport(
  createServerFn: () => Promise<{ server: { close(): Promise<void>; connect(transport: unknown): Promise<void> }; cleanup: () => Promise<void> }>,
  options: HttpTransportOptions,
): Promise<void> {
  const { port, host = "0.0.0.0" } = options;
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", sessions: sessions.size }));
      return;
    }

    if (!req.url?.startsWith("/mcp")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found. Use POST /mcp for MCP requests." }));
      return;
    }

    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (req.method === "POST" && !sessionId) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        const result = await createServerFn();
        await result.server.connect(transport);

        const newSessionId = transport.sessionId;
        if (newSessionId) {
          sessions.set(newSessionId, transport);
          log.info(`HTTP session created: ${newSessionId}`);
        }
        transport.onclose = () => {
          if (newSessionId) {
            sessions.delete(newSessionId);
            log.info(`HTTP session closed: ${newSessionId}`);
          }
        };
      } else if (sessionId) {
        const existing = sessions.get(sessionId);
        if (!existing) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Session not found." }));
          return;
        }
        transport = existing;
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing Mcp-Session-Id header." }));
        return;
      }

      await transport.handleRequest(req, res);
    } catch (err) {
      log.error(`HTTP request error: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

  return new Promise((resolve) => {
    httpServer.listen(port, host, () => {
      log.info(`MCP HTTP server listening on http://${host}:${port}/mcp`);
      log.info(`Health check: http://${host}:${port}/health`);
      resolve();
    });
    httpServer.on("error", (err) => {
      log.error(`HTTP server error: ${err.message}`);
      process.exit(1);
    });
  });
}
