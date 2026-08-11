import { useCallback, useEffect, useState } from "react";
import { createApiClient } from "@pgautopilot/api-client";
import type { MigrationContentResponse } from "@pgautopilot/contracts";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

export function useMigrationContent(version: number | null) {
  const [content, setContent] = useState<MigrationContentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (target: number) => {
    setLoading(true);
    setError(null);
    try {
      setContent(await client.getMigrationContent(target));
    } catch (err) {
      setContent(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (version === null) {
      setContent(null);
      setLoading(false);
      setError(null);
      return;
    }
    void load(version);
  }, [version, load]);

  return { content, loading, error };
}
