import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@pgautopilot/api-client";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

const RECONNECT_DELAY_MS = 3000;

export function useLiveTable(table: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!table) return;
    let disposed = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const connect = async (): Promise<void> => {
      try {
        await client.streamChangeEvents((event) => {
          if (disposed || event.table !== table) return;
          void queryClient.invalidateQueries({ queryKey: ["table-rows", table] });
          void queryClient.invalidateQueries({ queryKey: ["table-info", table] });
        }, controller.signal);
      } catch {
        // stream closed or aborted; handled below
      }
      if (!disposed) {
        timer = window.setTimeout(() => {
          void connect();
        }, RECONNECT_DELAY_MS);
      }
    };

    void connect();

    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller.abort();
    };
  }, [table, queryClient]);
}
