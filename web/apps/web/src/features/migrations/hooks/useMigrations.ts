import { useCallback, useEffect, useState } from "react";
import { createApiClient } from "@pgautopilot/api-client";
import type { MigrationEntry } from "@pgautopilot/contracts";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

interface MigrationsState {
  loading: boolean;
  migrations: MigrationEntry[];
  applying: boolean;
  error: string | null;
  lastApplied: string[];
  selected: Set<number>;
}

export function useMigrations() {
  const [state, setState] = useState<MigrationsState>({
    loading: true,
    migrations: [],
    applying: false,
    error: null,
    lastApplied: [],
    selected: new Set(),
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await client.getMigrations();
      setState({
        loading: false,
        migrations: res.migrations,
        applying: false,
        error: null,
        lastApplied: [],
        selected: new Set(),
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const apply = useCallback(async () => {
    setState((prev) => ({ ...prev, applying: true, error: null }));
    try {
      const res = await client.applyMigrations();
      setState((prev) => ({
        ...prev,
        applying: false,
        lastApplied: res.applied.map((m) => m.name),
        selected: new Set(),
      }));
      await refresh();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        applying: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [refresh]);

  const toggleSelection = useCallback((version: number) => {
    setState((prev) => {
      const next = new Set(prev.selected);
      if (next.has(version)) {
        next.delete(version);
      } else {
        next.add(version);
      }
      return { ...prev, selected: next };
    });
  }, []);

  const selectAll = useCallback(() => {
    setState((prev) => {
      const pending = prev.migrations.filter((m) => m.appliedAt === null).map((m) => m.version);
      return { ...prev, selected: new Set(pending) };
    });
  }, []);

  const clearSelection = useCallback(() => {
    setState((prev) => ({ ...prev, selected: new Set() }));
  }, []);

  const applySelected = useCallback(async () => {
    const versions = [...state.selected].sort((a, b) => a - b);
    if (versions.length === 0) return;
    setState((prev) => ({ ...prev, applying: true, error: null }));
    try {
      const res = await client.applyMigrationsSelected(versions);
      setState((prev) => ({
        ...prev,
        applying: false,
        lastApplied: res.applied.map((m) => m.name),
        selected: new Set(),
      }));
      await refresh();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        applying: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [refresh, state.selected]);

  const applyOne = useCallback(
    async (version: number) => {
      setState((prev) => ({ ...prev, applying: true, error: null }));
      try {
        const res = await client.applyMigration(version);
        setState((prev) => ({
          ...prev,
          applying: false,
          lastApplied: res.applied.map((m) => m.name),
          selected: new Set(),
        }));
        await refresh();
      } catch (err) {
        setState((prev) => ({
          ...prev,
          applying: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [refresh],
  );

  const revert = useCallback(
    async (version: number, force = false) => {
      setState((prev) => ({ ...prev, applying: true, error: null }));
      try {
        const res = await client.revertMigrations([version], force);
        setState((prev) => ({
          ...prev,
          applying: false,
          lastApplied: res.applied.map((m) => m.name),
          selected: new Set(),
        }));
        await refresh();
      } catch (err) {
        setState((prev) => ({
          ...prev,
          applying: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
    apply,
    toggleSelection,
    selectAll,
    clearSelection,
    applySelected,
    applyOne,
    revert,
  };
}
