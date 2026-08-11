import { Router } from "express";
import type { RequestHandler } from "express";
import type { Pool } from "pg";
import {
  createSnapshot,
  listSnapshots,
  readSnapshotContent,
  restoreSnapshot,
} from "@pgautopilot/core";
import type { SnapshotOptions } from "@pgautopilot/core";
import type { CreateSnapshotRequest, RestoreSnapshotRequest } from "@pgautopilot/contracts";
import { queryWithRetry } from "../db.js";
import { clientErrorMessage } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { noopRateLimiter } from "../middleware/rateLimit.js";

export interface SnapshotsOptions extends SnapshotOptions {
  readonly: () => boolean;
  mode: "development" | "production";
}

export function createSnapshotsRouter(
  pool: Pool,
  options: SnapshotsOptions,
  rateLimiter: RequestHandler | null = null,
): Router {
  const router = Router();
  const snapshotOptions: SnapshotOptions = {
    dir: options.dir,
    databaseUrl: options.databaseUrl,
    dockerContainer: options.dockerContainer,
  };

  router.get("/snapshots", async (_req, res) => {
    try {
      const snapshots = await queryWithRetry(() => listSnapshots(snapshotOptions));
      res.json({ snapshots });
    } catch (err) {
      logger.error("Snapshot list failed", { error: rawMessage(err) });
      res.status(400).json({ error: clientErrorMessage(err, options.mode) });
    }
  });

  router.get("/snapshots/:id/content", async (req, res) => {
    const id = req.params.id ?? "";
    if (!id) {
      res.status(400).json({ error: "id must be a non-empty string" });
      return;
    }
    try {
      const result = await readSnapshotContent(snapshotOptions, id);
      res.json(result);
    } catch (err) {
      res
        .status(/not found/i.test(rawMessage(err)) ? 404 : 400)
        .json({ error: clientErrorMessage(err, options.mode) });
    }
  });

  router.post("/snapshots", rateLimiter ?? noopRateLimiter, async (req, res) => {
    if (options.readonly()) {
      res.status(403).json({ error: "Snapshots cannot be created while the server is read-only." });
      return;
    }
    try {
      const body = (req.body ?? {}) as CreateSnapshotRequest;
      const label =
        typeof body.label === "string" && body.label.trim().length > 0
          ? body.label.trim()
          : "Manual snapshot";
      const snapshot = await queryWithRetry(() =>
        createSnapshot(pool, {
          options: snapshotOptions,
          label,
          source: "manual",
        }),
      );
      logger.info("Snapshot created", {
        area: "snapshots",
        action: "create",
        snapshot: snapshot.id,
      });
      res.json({ snapshot });
    } catch (err) {
      logger.error("Snapshot create failed", { error: rawMessage(err) });
      res.status(400).json({ error: clientErrorMessage(err, options.mode) });
    }
  });

  router.post("/snapshots/restore", rateLimiter ?? noopRateLimiter, async (req, res) => {
    if (options.readonly()) {
      res
        .status(403)
        .json({ error: "Snapshots cannot be restored while the server is read-only." });
      return;
    }
    try {
      const body = (req.body ?? {}) as RestoreSnapshotRequest;
      if (typeof body.id !== "string" || body.id.length === 0) {
        res.status(400).json({ error: "id must be a non-empty string" });
        return;
      }
      const result = await queryWithRetry(() =>
        restoreSnapshot(pool, { options: snapshotOptions, id: body.id }),
      );
      logger.info("Snapshot restored", {
        area: "snapshots",
        action: "restore",
        snapshot: result.id,
        rows: result.rowsRestored,
      });
      res.json(result);
    } catch (err) {
      logger.error("Snapshot restore failed", { error: rawMessage(err) });
      res.status(400).json({ error: clientErrorMessage(err, options.mode) });
    }
  });

  return router;
}

function rawMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
