import { useCallback, useEffect, useState } from "react";
import { createApiClient } from "@pgautopilot/api-client";
import type { SchemaTable } from "@pgautopilot/contracts";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

interface SchemaState {
  loading: boolean;
  tables: SchemaTable[];
  error: string | null;
}

const cached: SchemaState = { loading: true, tables: [], error: null };

export function useSchema() {
  const [state, setState] = useState<SchemaState>(cached);

  const refresh = useCallback(async (force = false) => {
    setState((prev) => ({ ...prev, loading: prev.tables.length === 0, error: null }));
    try {
      const response = await client.getSchema(force);
      const next = { loading: false, tables: response.tables, error: null };
      Object.assign(cached, next);
      setState(next);
    } catch (err) {
      const next = {
        loading: false,
        tables: [],
        error: err instanceof Error ? err.message : String(err),
      };
      Object.assign(cached, next);
      setState(next);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
