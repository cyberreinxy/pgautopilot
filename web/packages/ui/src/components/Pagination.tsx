import { cn } from "../lib/cn.js";
import { Button } from "./Button.js";
import { Dropdown } from "./Dropdown.js";
import { Icon } from "./Icon.js";

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

type PageItem = number | "ellipsis-prev" | "ellipsis-next";

const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500];

function pageItems(page: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const items: PageItem[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) items.push("ellipsis-prev");
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < pageCount - 1) items.push("ellipsis-next");
  items.push(pageCount);
  return items;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
}: PaginationProps) {
  const canPrev = page > 1;
  const canNext = page < pageCount;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {pageSize !== undefined && onPageSizeChange !== undefined && (
        <Dropdown
          items={pageSizeOptions.map((size) => ({ key: String(size), label: `${size} / page` }))}
          selected={String(pageSize)}
          onSelect={(key) => onPageSizeChange(Number(key))}
          placement="top"
          menuClassName="right-0"
        >
          <button
            type="button"
            aria-label="Rows per page"
            className="flex h-8 w-[104px] cursor-pointer items-center justify-center gap-1 rounded-lg border border-pg-border bg-pg-surface-2 px-2.5 font-pg-mono text-[11px] text-pg-dim transition-colors hover:text-pg-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pg-primary/30"
          >
            {pageSize} / page
            <Icon name="solar:alt-arrow-down-linear" size={12} className="text-pg-muted" />
          </button>
        </Dropdown>
      )}
      {pageCount > 1 && (
        <>
          <Button
            size="sm"
            disabled={!canPrev}
            onClick={() => onPageChange(page - 1)}
            className="min-h-8"
            aria-label="Previous page"
          >
            <Icon name="solar:alt-arrow-left-linear" size={14} />
          </Button>
          {pageItems(page, pageCount).map((item, index) => {
            if (item === "ellipsis-prev" || item === "ellipsis-next") {
              return (
                <span
                  key={`${item}-${index}`}
                  className="flex h-8 w-4 items-center justify-center font-pg-mono text-[11px] text-pg-dim"
                >
                  …
                </span>
              );
            }
            const active = item === page;
            return (
              <button
                key={item}
                type="button"
                aria-label={`Page ${item}`}
                aria-current={active ? "page" : undefined}
                onClick={() => onPageChange(item)}
                className={cn(
                  "flex h-8 w-8 cursor-pointer select-none items-center justify-center rounded-lg border font-pg-mono text-[11px] transition-colors duration-100 ease-pg-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pg-primary/30",
                  active
                    ? "border-pg-primary bg-pg-primary text-white"
                    : "border-pg-border bg-pg-surface-2 text-pg-dim hover:border-pg-border-strong hover:text-pg-text",
                )}
              >
                {item}
              </button>
            );
          })}
          <Button
            size="sm"
            disabled={!canNext}
            onClick={() => onPageChange(page + 1)}
            className="min-h-8"
            aria-label="Next page"
          >
            <Icon name="solar:alt-arrow-right-linear" size={14} />
          </Button>
        </>
      )}
    </div>
  );
}
