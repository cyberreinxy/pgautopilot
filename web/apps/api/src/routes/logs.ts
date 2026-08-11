import { Router } from "express";
import type { RequestHandler } from "express";
import { listLogEntries, logDir, type LogLevel } from "../lib/logger.js";

const VALID_LEVELS = new Set(["debug", "info", "warn", "error"]);

export function createLogsRouter(rateLimiter: RequestHandler | null = null): Router {
  const router = Router();

  router.get("/logs", rateLimiter ?? ((_req, _res, next) => next()), (req, res) => {
    const rawLevel =
      typeof req.query.level === "string" ? req.query.level.toLowerCase() : undefined;
    if (rawLevel !== undefined && !VALID_LEVELS.has(rawLevel)) {
      res.status(400).json({ error: `level must be one of: debug, info, warn, error` });
      return;
    }
    const rawLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
    if (!Number.isInteger(rawLimit) || rawLimit < 1) {
      res.status(400).json({ error: "limit must be a positive integer" });
      return;
    }
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    try {
      const entries = listLogEntries({
        level: rawLevel as LogLevel | undefined,
        limit: rawLimit,
        ...(since ? { since } : {}),
      });
      res.json({ entries, dir: logDir() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
