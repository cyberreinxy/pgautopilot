import type { Pool } from "pg";
import { friendlyDbError } from "@pgautopilot/core";
import type { Logger } from "./logger.js";

export interface PoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export interface PingResult {
  ok: boolean;
  latencyMs: number;
  error: string | null;
}

export interface DbDiagnostics {
  readonly lastError: { message: string; at: string } | null;
  readonly lastSuccessAt: string | null;
  ping(): Promise<PingResult>;
  poolStats(): PoolStats;
}

const FALLBACK_REASON = "Database connection failed.";

function describePgError(err: unknown): string {
  return friendlyDbError(err) ?? FALLBACK_REASON;
}

function rawMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createDbDiagnostics(pool: Pool, logger: Logger): DbDiagnostics {
  let lastError: { message: string; at: string } | null = null;
  let lastSuccessAt: string | null = null;

  const poolAny = pool as unknown as { on?: (event: string, fn: (err: unknown) => void) => void };
  if (typeof poolAny.on === "function") {
    poolAny.on("error", (err) => {
      lastError = { message: describePgError(err), at: new Date().toISOString() };
      logger.error("PostgreSQL pool error", { error: rawMessage(err) });
    });
  }

  return {
    get lastError() {
      return lastError;
    },
    get lastSuccessAt() {
      return lastSuccessAt;
    },
    poolStats(): PoolStats {
      const p = pool as unknown as Partial<Pool>;
      return {
        totalCount: p.totalCount ?? 0,
        idleCount: p.idleCount ?? 0,
        waitingCount: p.waitingCount ?? 0,
      };
    },
    async ping(): Promise<PingResult> {
      const started = Date.now();
      try {
        await pool.query("SELECT 1");
        lastSuccessAt = new Date().toISOString();
        return { ok: true, latencyMs: Date.now() - started, error: null };
      } catch (err) {
        const error = describePgError(err);
        lastError = { message: error, at: new Date().toISOString() };
        logger.warn("Health check failed", { error: rawMessage(err) });
        return { ok: false, latencyMs: Date.now() - started, error };
      }
    },
  };
}
