import { useCallback, useEffect, useRef, useState } from "react";
import { createApiClient } from "@pgautopilot/api-client";
import type { RuntimeConfig } from "@pgautopilot/contracts";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

let cachedConfig: RuntimeConfig | null = null;

export function useConfig() {
  const [config, setConfig] = useState<RuntimeConfig | null>(cachedConfig);
  const [loading, setLoading] = useState(cachedConfig === null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  const applyConfig = useCallback((next: RuntimeConfig | null) => {
    cachedConfig = next;
    setConfig(next);
  }, []);

  const refresh = useCallback(async () => {
    clearTicker();
    setLoading(true);
    setError(null);
    const started = performance.now();
    tickerRef.current = setInterval(() => setElapsedMs(performance.now() - started), 50);
    try {
      applyConfig(await client.getConfig());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTicker();
      setElapsedMs(performance.now() - started);
      setLoading(false);
    }
  }, [applyConfig, clearTicker]);

  const setReadonly = useCallback(async (readonly: boolean) => {
    setSaving(true);
    setError(null);
    applyConfig(cachedConfig ? { ...cachedConfig, readonly } : cachedConfig);
    try {
      const res = await client.setReadonly(readonly);
      applyConfig(cachedConfig ? { ...cachedConfig, readonly: res.readonly } : cachedConfig);
    } catch (err) {
      applyConfig(cachedConfig ? { ...cachedConfig, readonly: !readonly } : cachedConfig);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    refresh();
    return clearTicker;
  }, [refresh, clearTicker]);

  return { config, loading, error, saving, elapsedMs, refresh, setReadonly };
}
