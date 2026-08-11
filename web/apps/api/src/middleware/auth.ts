import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { createAuthFailureLimiter } from "./rateLimit.js";
import type { TrustProxy } from "./rateLimit.js";

export interface AuthOptions {
  token: string | null;
  authRateLimitMax: number;
  authRateLimitWindowMs: number;
  trustProxy: TrustProxy;
}

function safeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

export function authMiddleware(options: AuthOptions): RequestHandler[] {
  const { token } = options;
  if (!token) {
    return [(_req, _res, next) => next()];
  }
  const failureLimiter = createAuthFailureLimiter(
    options.authRateLimitMax,
    options.authRateLimitWindowMs,
    options.trustProxy,
  );
  return [
    failureLimiter,
    (req, res, next) => {
      const header = req.headers.authorization ?? "";
      const expected = `Bearer ${token}`;
      if (safeEqual(header, expected)) {
        next();
        return;
      }
      res.status(401).json({ error: "Unauthorized" });
    },
  ];
}
