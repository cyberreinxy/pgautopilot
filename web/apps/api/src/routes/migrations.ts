import { Router } from "express";
import type { RequestHandler } from "express";
import type { Pool } from "pg";
import {
  applyMigrations,
  applyPendingMigrations,
  listMigrations,
  readMigrationContent,
  revertMigrations,
} from "@pgautopilot/core";
import { queryWithRetry } from "../db.js";
import { clientErrorMessage } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { noopRateLimiter } from "../middleware/rateLimit.js";
import type { ApplyMigrationsRequest } from "@pgautopilot/contracts";
import type { SnapshotOptions } from "@pgautopilot/core";

export interface MigrationsOptions {
  dir: string;
  readonly: () => boolean;
  mode: "development" | "production";
  snapshot?: SnapshotOptions;
}

export function createMigrationsRouter(
  pool: Pool,
  options: MigrationsOptions,
  rateLimiter: RequestHandler | null = null,
): Router {
  const router = Router();

  router.get("/migrations", async (_req, res) => {
    try {
      const migrations = await queryWithRetry(() =>
        listMigrations(pool, options.dir, { readonly: options.readonly() }),
      );
      res.json({ migrations });
    } catch (err) {
      logger.error("Migration list failed", { error: rawMessage(err) });
      res.status(400).json({ error: clientErrorMessage(err, options.mode) });
    }
  });

  router.get("/migrations/:version", async (req, res) => {
    const version = Number(req.params.version);
    if (!Number.isInteger(version) || version < 0) {
      res.status(400).json({ error: "Invalid version number" });
      return;
    }
    try {
      const result = await readMigrationContent(options.dir, version);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: clientErrorMessage(err, options.mode) });
    }
  });

  router.post("/migrations/apply", rateLimiter ?? noopRateLimiter, async (_req, res) => {
    try {
      const result = await applyPendingMigrations(pool, options.dir, {
        readonly: options.readonly(),
        snapshot: options.snapshot,
      });
      logger.info("Migrations applied", {
        area: "migrations",
        action: "apply",
        applied: result.applied.map((m) => m.name),
      });
      res.json(result);
    } catch (err) {
      logger.error("Migration apply failed", { error: rawMessage(err) });
      res.status(400).json({ error: clientErrorMessage(err, options.mode) });
    }
  });

  router.post("/migrations/apply-selected", rateLimiter ?? noopRateLimiter, async (req, res) => {
    try {
      const body = req.body as ApplyMigrationsRequest;
      const versions = body.versions;
      if (!Array.isArray(versions) || versions.length === 0) {
        res.status(400).json({ error: "versions must be a non-empty array" });
        return;
      }
      const result = await applyMigrations(pool, options.dir, versions, {
        readonly: options.readonly(),
        snapshot: options.snapshot,
      });
      logger.info("Migrations applied", {
        area: "migrations",
        action: "apply-selected",
        versions,
        applied: result.applied.map((m) => m.name),
      });
      res.json(result);
    } catch (err) {
      logger.error("Migration apply-selected failed", { error: rawMessage(err) });
      res.status(400).json({ error: clientErrorMessage(err, options.mode) });
    }
  });

  router.post("/migrations/apply/:version", rateLimiter ?? noopRateLimiter, async (req, res) => {
    try {
      const version = Number(req.params.version);
      if (Number.isNaN(version)) {
        res.status(400).json({ error: "Invalid version number" });
        return;
      }
      const result = await applyMigrations(pool, options.dir, [version], {
        readonly: options.readonly(),
        snapshot: options.snapshot,
      });
      logger.info("Migration applied", {
        area: "migrations",
        action: "apply-one",
        version,
        applied: result.applied.map((m) => m.name),
      });
      res.json(result);
    } catch (err) {
      logger.error("Migration apply failed", {
        area: "migrations",
        action: "apply-one",
        error: rawMessage(err),
      });
      res.status(400).json({ error: clientErrorMessage(err, options.mode) });
    }
  });

  router.post("/migrations/revert", rateLimiter ?? noopRateLimiter, async (req, res) => {
    try {
      const body = req.body as ApplyMigrationsRequest & { force?: boolean };
      const versions = body.versions;
      if (!Array.isArray(versions) || versions.length === 0) {
        res.status(400).json({ error: "versions must be a non-empty array" });
        return;
      }
      const result = await revertMigrations(pool, options.dir, versions, {
        readonly: options.readonly(),
        force: Boolean(body.force),
        snapshot: options.snapshot,
      });
      logger.info("Migrations rerun", {
        area: "migrations",
        action: "revert",
        versions,
        force: Boolean(body.force),
        applied: result.applied.map((m) => m.name),
      });
      res.json(result);
    } catch (err) {
      logger.error("Migration rerun failed", {
        area: "migrations",
        action: "revert",
        error: rawMessage(err),
      });
      res.status(400).json({ error: clientErrorMessage(err, options.mode) });
    }
  });

  return router;
}

function rawMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
