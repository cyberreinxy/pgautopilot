import { Router } from "express";
import type { SafetyState } from "@pgautopilot/core";
import type { ApiConfig } from "../config.js";

export function createConfigRouter(
  safety: SafetyState,
  config: ApiConfig,
  version: string,
): Router {
  const router = Router();

  router.get("/config", (_req, res) => {
    res.json({
      version,
      mode: config.mode,
      host: config.host,
      port: config.port,
      readonly: safety.readonly,
      databaseUrlConfigured: Boolean(config.databaseUrl),
      statementTimeoutMs: config.statementTimeoutMs,
      blockedTables: [...safety.blockedTables],
      highRiskTables: [...safety.highRiskTables],
      sensitiveColumns: [...safety.sensitiveColumns],
    });
  });

  router.post("/config/readonly", (req, res) => {
    const readonly = Boolean((req.body as { readonly?: unknown } | undefined)?.readonly);
    if (safety.mode === "production" && !readonly) {
      res
        .status(403)
        .json({ error: "Read-only mode cannot be disabled via the API in production." });
      return;
    }
    safety.readonly = readonly;
    res.json({ readonly: safety.readonly });
  });

  return router;
}
