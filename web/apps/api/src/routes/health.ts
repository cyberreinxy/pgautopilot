import { Router } from "express";
import type { DbDiagnostics } from "../lib/dbDiagnostics.js";

export interface HealthOptions {
  databaseUrl: string;
  version: string;
  mode: "development" | "production";
}

export function createHealthRouter(diagnostics: DbDiagnostics, options: HealthOptions): Router {
  const router = Router();
  const startedAt = Date.now();

  router.get("/health", async (_req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const base = {
      databaseUrlConfigured: Boolean(options.databaseUrl),
      pool: diagnostics.poolStats(),
      uptimeSeconds,
      version: options.version,
      mode: options.mode,
      lastError: options.mode === "production" ? null : diagnostics.lastError,
      lastSuccessAt: diagnostics.lastSuccessAt,
    };

    const result = await diagnostics.ping();
    if (result.ok) {
      res.json({ ...base, status: "connected", reason: null, latencyMs: result.latencyMs });
      return;
    }

    res.status(503).json({
      ...base,
      status: "disconnected",
      reason: result.error,
      latencyMs: result.latencyMs,
    });
  });

  return router;
}
