import { useEffect, useState } from "react";
import { createApiClient } from "@pgautopilot/api-client";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

export interface HealthState {
  online: boolean | null;
  reason: string | null;
  latencyMs: number | null;
  mode: "development" | "production";
  pool: { totalCount: number; idleCount: number; waitingCount: number };
}

const cached: HealthState = {
  online: null,
  reason: null,
  latencyMs: null,
  mode: "development",
  pool: { totalCount: 0, idleCount: 0, waitingCount: 0 },
};

export function useHealth(intervalMs = 3000): HealthState {
  const [state, setState] = useState<HealthState>(cached);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await client.health();
        if (!active) return;
        const next: HealthState = {
          online: res.status === "connected",
          reason: res.reason ?? null,
          latencyMs: res.latencyMs ?? null,
          mode: res.mode,
          pool: res.pool,
        };
        Object.assign(cached, next);
        setState(next);
      } catch {
        if (active) {
          setState((prev) => ({
            ...prev,
            online: false,
            reason: "API unreachable",
            latencyMs: null,
          }));
        }
      }
    };
    check();
    const id = window.setInterval(check, intervalMs);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return state;
}
