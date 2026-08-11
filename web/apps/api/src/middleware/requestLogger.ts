import type { RequestHandler } from "express";
import { logger } from "../lib/logger.js";

export function requestLogger(): RequestHandler {
  return (req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      logger.info("HTTP request", {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - started,
      });
    });
    next();
  };
}
