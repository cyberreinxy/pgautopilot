import type { RequestHandler } from "express";
import type { SafetyState } from "@pgautopilot/core";
import { TOOL_INDEX } from "@pgautopilot/contracts";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const EXEMPT_PATHS = new Set(["/api/config/readonly"]);

const TOOL_PATH_PREFIX = "/api/tools/";

const READONLY_SAFE_TOOLS = new Set<string>(
  TOOL_INDEX.filter((tool) => !tool.write).map((tool) => tool.name),
);
READONLY_SAFE_TOOLS.add("db_run_script");

export function createReadonlyGuard(safety: SafetyState): RequestHandler {
  return (req, res, next) => {
    if (!safety.readonly || !MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }
    if (EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }
    if (req.path.startsWith(TOOL_PATH_PREFIX)) {
      const toolName = req.path.slice(TOOL_PATH_PREFIX.length);
      if (READONLY_SAFE_TOOLS.has(toolName)) {
        next();
        return;
      }
    }
    res.status(403).json({ error: "Read-only mode is enabled." });
  };
}
