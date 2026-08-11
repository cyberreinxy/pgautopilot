import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@pgautopilot/api-client";
import type { SchemaTable } from "@pgautopilot/contracts";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

export function useTableList() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["tables"],
    staleTime: 60_000,
    refetchOnMount: false,
    queryFn: async () => {
      const res = await client.getSchema();
      return res.tables;
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["tables"] });
  };

  const tables = query.data ?? ([] as SchemaTable[]);
  const loading = query.isLoading;
  const error = query.error
    ? query.error instanceof Error
      ? query.error.message
      : String(query.error)
    : null;

  return { tables, loading, error, refresh };
}
