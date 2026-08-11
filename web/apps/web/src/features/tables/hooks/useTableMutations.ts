import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@pgautopilot/api-client";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

export function useTableMutations() {
  const queryClient = useQueryClient();

  const invalidateTable = useCallback(
    (table: string) => {
      void queryClient.invalidateQueries({ queryKey: ["table-rows", table] });
      void queryClient.invalidateQueries({ queryKey: ["table-info", table] });
    },
    [queryClient],
  );

  const updateRow = useCallback(
    async (table: string, where: Record<string, unknown>, data: Record<string, unknown>) => {
      const res = await client.invokeTool("db_update_many", { table, where, data });
      if (res.ok) invalidateTable(table);
      return res;
    },
    [invalidateTable],
  );

  const deleteRows = useCallback(
    async (table: string, where: Record<string, unknown>) => {
      const res = await client.invokeTool("db_delete_many", { table, where });
      if (res.ok) invalidateTable(table);
      return res;
    },
    [invalidateTable],
  );

  return { updateRow, deleteRows };
}
