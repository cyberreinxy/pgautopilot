import { Skeleton } from "@pgautopilot/ui";
import { cn } from "../lib/cn";

const TABLE_LIST_COUNT = 10;

export function TableListSkeleton() {
  return (
    <>
      {[...Array(TABLE_LIST_COUNT)].map((_, index) => (
        <div key={index} className="flex items-center gap-2.5 px-2 py-[9px]">
          <Skeleton className="size-4 shrink-0 rounded" />
          <Skeleton className="h-3.5 flex-1" />
        </div>
      ))}
    </>
  );
}

export function DataGridSkeleton({ columns }: { columns: number }) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-3 border-b border-pg-border bg-pg-surface-2 px-3 py-2.5">
        <Skeleton className="size-3.5 shrink-0 rounded-sm" />
        {[...Array(columns)].map((_, index) => (
          <Skeleton key={index} className={cn("h-3", (index + 1) % 3 === 0 ? "w-24" : "flex-1")} />
        ))}
      </div>
      {[...Array(8)].map((_, row) => (
        <div key={row} className="flex items-center gap-3 border-b border-pg-border px-3 py-2.5">
          <Skeleton className="size-3.5 shrink-0 rounded-sm" />
          {[...Array(columns)].map((_, index) => (
            <Skeleton key={index} className={cn("h-3", (index + 1) % 3 === 0 ? "w-24" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ColumnTableSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-pg-border">
      <div className="flex items-center gap-3 bg-pg-surface-2 px-3 py-2">
        {[...Array(columns)].map((_, index) => (
          <Skeleton key={index} className={cn("h-3", index === 0 ? "min-w-20 flex-1" : "w-16")} />
        ))}
      </div>
      {[...Array(6)].map((_, row) => (
        <div key={row} className="flex items-center gap-3 border-t border-pg-border px-3 py-2.5">
          {[...Array(columns)].map((_, index) => (
            <Skeleton key={index} className={cn("h-3", index === 0 ? "min-w-20 flex-1" : "w-16")} />
          ))}
        </div>
      ))}
    </div>
  );
}
