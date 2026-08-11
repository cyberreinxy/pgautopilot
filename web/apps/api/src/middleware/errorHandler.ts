import type { ErrorRequestHandler } from "express";
import { friendlyDbError } from "@pgautopilot/core";
import { logger } from "../lib/logger.js";

interface HttpError extends Error {
  status?: number;
  issues?: unknown;
}

export function errorHandler(mode: "development" | "production"): ErrorRequestHandler {
  return (err: HttpError, _req, res, _next) => {
    const isValidation = Array.isArray(err.issues);
    const status = isValidation ? 400 : typeof err.status === "number" ? err.status : 500;

    if (status >= 500) {
      logger.error("Unhandled server error", {
        error: err.message ?? String(err),
        stack: err.stack,
      });
    }

    const message =
      status >= 500 && mode === "production"
        ? "Internal server error"
        : (friendlyDbError(err) ?? err.message ?? String(err));
    res.status(status).json({ error: message });
  };
}
