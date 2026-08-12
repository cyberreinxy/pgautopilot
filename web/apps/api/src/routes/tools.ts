import { Router } from "express";
import type { RequestHandler } from "express";
import { TOOL_INDEX, toolArgsSchema } from "@pgautopilot/contracts";
import type { ToolName } from "@pgautopilot/contracts";
import { friendlyDbError } from "@pgautopilot/core";
import type { HandlerMap } from "@pgautopilot/core";
import { invokeTool } from "../services/toolGateway.js";
import { logger } from "../lib/logger.js";
import { noopRateLimiter } from "../middleware/rateLimit.js";

function isPgError(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && typeof (err as { code?: unknown }).code === "string"
  );
}

function asClientError(err: unknown, mode: "development" | "production"): Error {
  const error = err instanceof Error ? err : new Error(String(err));
  const friendly = friendlyDbError(err);
  if (friendly) {
    error.message = friendly;
  } else if (isPgError(err) && mode === "production") {
    error.message = "Database error";
  }
  if (typeof (error as { status?: unknown }).status !== "number") {
    (error as { status?: number }).status = 400;
  }
  return error;
}

export function createToolsRouter(
  handlers: HandlerMap,
  mode: "development" | "production",
  rateLimiter: RequestHandler | null = null,
  disabledTools: Set<string> = new Set(),
): Router {
  const router = Router();

  router.get("/tools", (_req, res) => {
    res.json({ tools: TOOL_INDEX.filter((t) => !disabledTools.has(t.name)) });
  });

  router.post("/tools/:name", rateLimiter ?? noopRateLimiter, async (req, res, next) => {
    const name = req.params.name as ToolName;
    try {
      if (disabledTools.has(name)) {
        res.status(403).json({ error: `Tool "${name}" is disabled on this server.` });
        return;
      }
      const handler = handlers[name];
      if (!handler) {
        res.status(404).json({ error: `Unknown tool: "${name}"` });
        return;
      }
      const schema = toolArgsSchema[name];
      const args = schema ? schema.parse(req.body ?? {}) : (req.body ?? {});
      const data = await invokeTool(handler, args);
      logger.info("Tool invoked", { area: "tools", tool: name });
      res.json({ ok: true, data });
    } catch (err) {
      logger.error("Tool invocation failed", {
        area: "tools",
        tool: name,
        error: err instanceof Error ? err.message : String(err),
      });
      next(asClientError(err, mode));
    }
  });

  return router;
}
