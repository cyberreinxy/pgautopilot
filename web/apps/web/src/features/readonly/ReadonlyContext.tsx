import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createApiClient } from "@pgautopilot/api-client";
import { ReadonlyContext } from "./readonly-context";
import type { ReadonlyContextValue } from "./readonly-context";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

const POLL_MS = 3000;

export function ReadonlyProvider({ children }: { children: ReactNode }) {
  const [readonly, setReadonlyState] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const config = await client.getConfig();
        if (active) setReadonlyState(config.readonly);
      } catch {
        if (active) setReadonlyState((prev) => prev);
      }
    };
    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  const setReadonly = useCallback((value: boolean) => setReadonlyState(value), []);

  const value = useMemo<ReadonlyContextValue>(
    () => ({ readonly, setReadonly }),
    [readonly, setReadonly],
  );

  return <ReadonlyContext.Provider value={value}>{children}</ReadonlyContext.Provider>;
}
