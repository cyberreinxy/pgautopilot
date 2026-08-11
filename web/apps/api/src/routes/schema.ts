import { Router } from "express";
import type { Pool } from "pg";
import { getSchema } from "@pgautopilot/core";
import { queryWithRetry } from "../db.js";
import { clientErrorMessage } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function createSchemaRouter(pool: Pool, mode: "development" | "production"): Router {
  const router = Router();
  router.get("/schema", async (req, res) => {
    const refresh = req.query.refresh === "1";
    try {
      const tables = await queryWithRetry(() => getSchema(pool, refresh));
      if (refresh) {
        logger.info("Schema refreshed", {
          area: "schema",
          action: "refresh",
          tables: tables.length,
        });
      }
      res.json({ tables });
    } catch (err) {
      logger.error("Schema fetch failed", {
        area: "schema",
        action: "fetch",
        refresh,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(503).json({ error: clientErrorMessage(err, mode) });
    }
  });
  return router;
}
