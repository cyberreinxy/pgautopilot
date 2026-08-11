import type { Pool } from "pg";
import type { ChangeHub } from "./changeHub.js";
import { logger } from "../lib/logger.js";

interface TableCounters {
  table: string;
  ins: number;
  upd: number;
  del: number;
}

async function snapshotCounters(pool: Pool): Promise<Map<string, TableCounters>> {
  const result = await pool.query<{
    table: string;
    ins: string | number;
    upd: string | number;
    del: string | number;
  }>(
    "SELECT relname AS table, n_tup_ins AS ins, n_tup_upd AS upd, n_tup_del AS del FROM pg_stat_user_tables",
  );
  const map = new Map<string, TableCounters>();
  for (const row of result.rows) {
    map.set(row.table, {
      table: row.table,
      ins: Number(row.ins ?? 0),
      upd: Number(row.upd ?? 0),
      del: Number(row.del ?? 0),
    });
  }
  return map;
}

function countersReset(prev: TableCounters, current: TableCounters): boolean {
  return current.ins < prev.ins && current.upd < prev.upd && current.del < prev.del;
}

export function startChangeDetector(pool: Pool, hub: ChangeHub, intervalMs: number): () => void {
  let last: Map<string, TableCounters> | null = null;

  const poll = async (): Promise<void> => {
    let current: Map<string, TableCounters>;
    try {
      current = await snapshotCounters(pool);
    } catch (err) {
      logger.warn("Change detection poll failed", { error: String(err) });
      return;
    }
    if (last) {
      for (const [name, counters] of current) {
        const prev = last.get(name);
        if (!prev) {
          hub.broadcast({ table: name, action: "update" });
          continue;
        }
        if (counters.ins !== prev.ins || counters.upd !== prev.upd || counters.del !== prev.del) {
          if (!countersReset(prev, counters)) {
            hub.broadcast({ table: name, action: "update" });
          }
        }
      }
      for (const name of last.keys()) {
        if (!current.has(name)) {
          hub.broadcast({ table: name, action: "update" });
        }
      }
    }
    last = current;
  };

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    await poll();
    if (!stopped) {
      timer = setTimeout(() => {
        void tick();
      }, intervalMs);
    }
  };

  void tick();

  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
