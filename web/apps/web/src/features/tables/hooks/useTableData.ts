import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@pgautopilot/api-client";
import type { SortDirection } from "@pgautopilot/contracts";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

export interface TableColumn {
  name: string;
  dataType: string;
}

export interface TableData {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  elapsedMs: number;
}

const DEFAULT_PAGE_SIZE = 50;

function deriveColumns(rows: Record<string, unknown>[]): TableColumn[] {
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first).map((name) => ({ name, dataType: "unknown" }));
}

export interface UseTableDataOptions {
  defaultOrderBy?: Record<string, SortDirection>;
  pageSize?: number;
}

export function useTableData(table: string | null, options: UseTableDataOptions = {}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(options.pageSize ?? DEFAULT_PAGE_SIZE);
  const [userOrderBy, setUserOrderBy] = useState<Record<string, SortDirection> | undefined>(
    undefined,
  );

  useEffect(() => {
    setPage(0);
    setUserOrderBy(undefined);
  }, [table]);

  const orderBy = userOrderBy ?? options.defaultOrderBy;

  const queryKey = useMemo(
    () => ["table-rows", table, { page, pageSize, orderBy }] as const,
    [table, page, pageSize, orderBy],
  );

  const query = useQuery({
    queryKey,
    enabled: Boolean(table),
    staleTime: 30_000,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const started = performance.now();
      const skip = page * pageSize;
      const [infoRes, rowsRes] = await Promise.all([
        client.invokeTool("db_table_info", { table: table ?? "" }),
        client.invokeTool("db_find_many", {
          table: table ?? "",
          take: pageSize,
          skip,
          ...(orderBy && Object.keys(orderBy).length > 0 ? { orderBy } : {}),
        }),
      ]);
      const info =
        infoRes.ok && infoRes.data && typeof infoRes.data === "object"
          ? (infoRes.data as { columns?: TableColumn[] })
          : null;
      const findMany =
        rowsRes.ok && rowsRes.data && typeof rowsRes.data === "object"
          ? (rowsRes.data as { data?: unknown; total?: number; hasMore?: boolean })
          : null;
      const rows = Array.isArray(findMany?.data)
        ? (findMany.data as Record<string, unknown>[])
        : [];
      const total = findMany?.total ?? rows.length;
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      return {
        columns: info?.columns?.length ? info.columns : deriveColumns(rows),
        rows,
        total,
        page,
        pageSize,
        pageCount,
        elapsedMs: performance.now() - started,
      } satisfies TableData;
    },
  });

  useEffect(() => {
    if (!table) return;
    const count = query.data?.pageCount ?? 1;
    if (page + 1 > count) {
      setPage(Math.max(0, count - 1));
    }
  }, [table, page, query.data?.pageCount]);

  const goToPage = useCallback((next: number) => {
    setPage(next);
  }, []);

  const setPageSizeSafe = useCallback((size: number) => {
    setPageSize(size);
    setPage(0);
  }, []);

  const toggleSort = useCallback(
    (column: string, multi = false) => {
      setPage(0);
      setUserOrderBy((current) => {
        const active = current ?? options.defaultOrderBy;
        const base = active && Object.keys(active).length > 0 ? { ...active } : {};
        if (multi) {
          if (column in base) {
            delete base[column];
          } else {
            base[column] = "asc";
          }
          return Object.keys(base).length > 0 ? base : undefined;
        }
        const single = Object.keys(base).length === 1 && column in base;
        if (single) {
          const next = base[column] === "asc" ? "desc" : undefined;
          return next ? { [column]: next } : undefined;
        }
        return { [column]: "asc" };
      });
    },
    [options.defaultOrderBy],
  );

  const refresh = useCallback(() => {
    if (!table) return;
    void queryClient.invalidateQueries({ queryKey: ["table-rows", table] });
    void queryClient.invalidateQueries({ queryKey: ["table-info", table] });
  }, [table, queryClient]);

  const data = query.data ?? null;
  const dataError = query.error
    ? query.error instanceof Error
      ? query.error.message
      : String(query.error)
    : null;

  return {
    data,
    dataError,
    dataLoading: query.isFetching,
    page,
    pageSize,
    total: data?.total ?? 0,
    pageCount: data?.pageCount ?? 1,
    orderBy,
    goToPage,
    setPageSize: setPageSizeSafe,
    toggleSort,
    refresh,
  };
}
