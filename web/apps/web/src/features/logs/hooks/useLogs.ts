import { useCallback, useEffect, useRef, useState } from "react";
import { createApiClient } from "@pgautopilot/api-client";
import type { LogEntry, LogLevel } from "@pgautopilot/contracts";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

const INTERVAL_MS = 5000;

export function useLogs(
  level: LogLevel | undefined,
  sinceMinutes: number | undefined,
  autoRefresh: boolean,
) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [dir, setDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++refreshIdRef.current;
    const since =
      sinceMinutes !== undefined
        ? new Date(Date.now() - sinceMinutes * 60_000).toISOString()
        : undefined;
    try {
      const res = await client.getLogs({ level, limit: 200, since });
      if (id !== refreshIdRef.current) return;
      setEntries(res.entries);
      setDir(res.dir ?? null);
      setError(null);
    } catch (err) {
      if (id !== refreshIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (id === refreshIdRef.current) setLoading(false);
    }
  }, [level, sinceMinutes]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      void refresh();
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, refresh]);

  return { entries, dir, loading, error, refresh };
}
