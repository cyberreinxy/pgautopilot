import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "@pgautopilot/api-client";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

export interface TableColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
}

interface TableInfo {
  table: string;
  approxRowCount: number;
  columns: TableColumnInfo[];
  estimatedSize: string;
}

export function useTableInfo(table: string | null) {
  return useQuery({
    queryKey: ["table-info", table],
    enabled: Boolean(table),
    staleTime: 30_000,
    refetchOnMount: false,
    queryFn: async () => {
      const res = await client.invokeTool("db_table_info", { table: table ?? "" });
      if (!res.ok) throw new Error(res.error ?? "Failed to load table info");
      return (res.data ?? {}) as TableInfo;
    },
  });
}
