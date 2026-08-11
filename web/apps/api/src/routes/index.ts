import { Router } from "express";
import type { RequestHandler } from "express";
import type { Pool } from "pg";
import type { HandlerMap, SafetyState } from "@pgautopilot/core";
import type { DbDiagnostics } from "../lib/dbDiagnostics.js";
import type { ApiConfig } from "../config.js";
import { createHealthRouter } from "./health.js";
import type { HealthOptions } from "./health.js";
import { createToolsRouter } from "./tools.js";
import { createSchemaRouter } from "./schema.js";
import { createMigrationsRouter } from "./migrations.js";
import type { MigrationsOptions } from "./migrations.js";
import { createSnapshotsRouter } from "./snapshots.js";
import type { SnapshotsOptions } from "./snapshots.js";
import { createConfigRouter } from "./config.js";
import { createLiveRouter } from "./live.js";
import { createLogsRouter } from "./logs.js";
import type { ChangeHub } from "../services/changeHub.js";

export interface ApiContext {
  handlers: HandlerMap;
  pool: Pool;
  diagnostics: DbDiagnostics;
  safety: SafetyState;
  config: ApiConfig;
  version: string;
  healthOptions: HealthOptions;
  migrationsOptions: MigrationsOptions;
  snapshotsOptions: SnapshotsOptions;
  rateLimiter: RequestHandler | null;
  changeHub: ChangeHub;
}

export function createApiRouter(context: ApiContext): Router {
  const router = Router();
  router.use(createHealthRouter(context.diagnostics, context.healthOptions));
  router.use(createToolsRouter(context.handlers, context.config.mode, context.rateLimiter));
  router.use(createSchemaRouter(context.pool, context.config.mode));
  router.use(createMigrationsRouter(context.pool, context.migrationsOptions, context.rateLimiter));
  router.use(createSnapshotsRouter(context.pool, context.snapshotsOptions, context.rateLimiter));
  router.use(createConfigRouter(context.safety, context.config, context.version));
  router.use(createLiveRouter(context.changeHub, context.rateLimiter));
  router.use(createLogsRouter(context.rateLimiter));
  return router;
}
