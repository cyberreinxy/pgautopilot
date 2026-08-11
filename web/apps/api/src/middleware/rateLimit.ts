import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, RequestHandler } from "express";

export type TrustProxy = boolean | number | string;

function createKeyGenerator(trustProxy: TrustProxy): (req: Request) => string {
  return (req) =>
    ipKeyGenerator(trustProxy ? (req.ip ?? "unknown") : (req.socket.remoteAddress ?? "unknown"));
}

function createBaseOptions(trustProxy: TrustProxy) {
  return {
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: createKeyGenerator(trustProxy),
    validate: { trustProxy: false, xForwardedForHeader: false, forwardedHeader: false },
  } as const;
}

export function createRateLimiter(
  max: number,
  windowMs: number,
  trustProxy: TrustProxy = false,
): RequestHandler {
  return rateLimit({
    ...createBaseOptions(trustProxy),
    windowMs,
    limit: max,
    message: { error: "Too many requests. Please wait a moment and try again." },
  });
}

export function createAuthFailureLimiter(
  max = 30,
  windowMs = 60_000,
  trustProxy: TrustProxy = false,
): RequestHandler {
  return rateLimit({
    ...createBaseOptions(trustProxy),
    windowMs,
    limit: max,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.statusCode !== 401,
    message: { error: "Too many failed login attempts. Please wait and try again." },
  });
}

export const noopRateLimiter: RequestHandler = (_req, _res, next) => next();
