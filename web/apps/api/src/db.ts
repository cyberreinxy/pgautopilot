import { Pool, type PoolConfig } from "pg";
import type { ApiConfig } from "./config.js";
import { logger } from "./lib/logger.js";

const TRANSIENT_CONNECT_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "57P03",
  "53300",
]);

function isTransientConnectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && TRANSIENT_CONNECT_CODES.has(code);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function resolveSsl(url: URL): PoolConfig["ssl"] {
  const mode = (url.searchParams.get("sslmode") ?? "").toLowerCase();
  if (mode === "disable") return false;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  return isLoopbackHost(url.hostname) ? undefined : { rejectUnauthorized: true };
}

export function createPool(config: ApiConfig): Pool {
  const url = config.databaseUrl ? new URL(config.databaseUrl) : undefined;
  const pool = new Pool({
    connectionString: config.databaseUrl || undefined,
    ...(url ? { ssl: resolveSsl(url) } : {}),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10,
    application_name: "pgautopilot-dashboard",
  } satisfies PoolConfig);
  pool.on("error", (err) => {
    logger.warn("Database pool idle client error", { error: err.message });
  });
  return pool;
}

export async function queryWithRetry<T>(
  task: () => Promise<T>,
  options: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;
  let attempt = 0;
  for (; ;) {
    try {
      return await task();
    } catch (err) {
      if (!isTransientConnectError(err) || attempt >= retries - 1) throw err;
      attempt += 1;
      logger.warn(`Database query failed (transient), retrying ${attempt}/${retries}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      await delay(baseDelayMs * attempt);
    }
  }
}
