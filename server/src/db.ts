import pg from "pg";
const { Pool } = pg;
import type { PoolConfig } from "pg";
import { log } from "./logger.js";

export function createPool(poolConfig: PoolConfig): pg.Pool {
  const pool = new Pool(poolConfig);
  pool.on("error", (err) => {
    log.warn(`Idle client error: ${err.message}`);
  });
  return pool;
}

export async function waitForConnection(
  pool: pg.Pool,
  retries: number,
  delayMs: number,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function poolStats(pool: pg.Pool): { total: number; idle: number; waiting: number } {
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
}
