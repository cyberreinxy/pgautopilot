import express from "express";
import type { Express } from "express";
import type { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";
import { buildSafetyState, createHandlers } from "@pgautopilot/core";
import type { CoreOptions } from "@pgautopilot/core";
import type { ApiConfig } from "./config.js";
import type { DbDiagnostics } from "./lib/dbDiagnostics.js";
import { createDbDiagnostics } from "./lib/dbDiagnostics.js";
import { logger } from "./lib/logger.js";
import { authMiddleware } from "./middleware/auth.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createRateLimiter } from "./middleware/rateLimit.js";
import { createReadonlyGuard } from "./middleware/readonly.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { createApiRouter } from "./routes/index.js";
import { ChangeHub } from "./services/changeHub.js";

export function createApp(
  pool: Pool,
  config: ApiConfig,
  diagnostics?: DbDiagnostics,
  version?: string,
  changeHub?: ChangeHub,
): Express {
  const safety = buildSafetyState(
    config.readonly,
    config.mode,
    config.blockedTables,
    config.extraSensitiveColumns,
  );

  const hub = changeHub ?? new ChangeHub();
  const coreOptions: CoreOptions = {
    statementTimeoutMs: config.statementTimeoutMs,
    backupDir: config.backupDir,
    dockerContainer: config.dockerContainer,
    databaseUrl: config.databaseUrl,
    allowRawWrites: config.allowRawWrites,
    onChange: (event) => hub.broadcast(event),
  };

  const handlers = createHandlers(pool, safety, coreOptions);
  const dbDiagnostics = diagnostics ?? createDbDiagnostics(pool, logger);
  const resolvedVersion = version ?? "0.0.0";

  const rateLimiter =
    config.rateLimitMax !== null
      ? createRateLimiter(config.rateLimitMax, config.rateLimitWindowMs, config.trustProxy)
      : null;

  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    if (config.mode === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });
  app.use(createCorsMiddleware({ allowedOrigins: config.corsOrigins, production: config.mode === "production" }));
  if (config.trustProxy !== false) {
    app.set("trust proxy", config.trustProxy);
  }
  app.use(express.json({ limit: "1mb" }));
  app.use(requestLogger());
  app.use(authMiddleware(config));
  app.use(createReadonlyGuard(safety));
  app.use(
    "/api",
    createApiRouter({
      handlers,
      pool,
      diagnostics: dbDiagnostics,
      safety,
      config,
      version: resolvedVersion,
      rateLimiter,
      healthOptions: {
        databaseUrl: config.databaseUrl,
        version: resolvedVersion,
        mode: config.mode,
      },
      migrationsOptions: {
        dir: config.migrationsDir,
        readonly: () => safety.readonly,
        mode: config.mode,
        snapshot: {
          dir: config.snapshotsDir,
          databaseUrl: config.databaseUrl,
          dockerContainer: config.dockerContainer,
        },
      },
      snapshotsOptions: {
        dir: config.snapshotsDir,
        databaseUrl: config.databaseUrl,
        dockerContainer: config.dockerContainer,
        readonly: () => safety.readonly,
        mode: config.mode,
      },
      changeHub: hub,
    }),
  );

  const webDist = path.resolve(process.cwd(), "apps/web/dist");
  if (fs.existsSync(path.join(webDist, "index.html"))) {
    app.use(express.static(webDist));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler(config.mode));

  return app;
}
