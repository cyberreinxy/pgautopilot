import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Dropdown, Icon, ScrollArea, Skeleton, Spinner } from "@pgautopilot/ui";
import type { DropdownItem } from "@pgautopilot/ui";
import { cn } from "../lib/cn";
import { useColumnResize } from "../lib/useColumnResize";
import { useSchema } from "../features/schema/hooks/useSchema";
import { RefreshButton } from "../components/RefreshButton";
import { TableListSkeleton, ColumnTableSkeleton } from "../components/Skeletons";

const LIST_MIN = 240;
const LIST_MAX = 380;

const SORT_ITEMS: DropdownItem[] = [
  { key: "name-asc", label: "Name A-Z" },
  { key: "name-desc", label: "Name Z-A" },
  { key: "cols-desc", label: "Most columns" },
  { key: "cols-asc", label: "Fewest columns" },
];

export function SchemaPage() {
  const { loading, tables, error, refresh } = useSchema();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name-asc");
  const [selected, setSelected] = useState<string | null>(null);
  const resize = useColumnResize({ initial: 280, min: LIST_MIN, max: LIST_MAX });
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = q ? tables.filter((t) => t.name.toLowerCase().includes(q)) : [...tables];
    switch (sort) {
      case "name-desc":
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "cols-desc":
        result.sort((a, b) => b.columns.length - a.columns.length);
        break;
      case "cols-asc":
        result.sort((a, b) => a.columns.length - b.columns.length);
        break;
      default:
        result.sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }, [tables, query, sort]);

  const active = filtered.find((table) => table.name === selected) ?? filtered[0];

  return (
    <div ref={resize.containerRef} className="flex h-full min-w-0">
      <div
        className={cn(
          "flex min-h-0 shrink-0 flex-col gap-1.5 transition-[width]",
          resize.resizing && "transition-none",
        )}
        style={{
          width: resize.width,
          minWidth: LIST_MIN - 40,
          maxWidth: LIST_MAX + 40,
        }}
      >
        <section className="pg-card min-h-0 flex-1">
          <div className="pg-card-head">
            <span>Schema</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {loading ? <Spinner /> : <span className="text-pg-dim">{tables.length} tables</span>}
              <RefreshButton onClick={() => refresh(true)} loading={loading} />
            </span>
          </div>
          <div className="relative border-b border-pg-border p-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter tables"
              className="h-8 w-full rounded-lg border border-pg-border bg-pg-surface-2 pl-2.5 pr-9 font-pg-sans text-xs text-pg-text outline-none transition-colors focus:border-pg-primary focus:ring-2 focus:ring-pg-primary/25"
            />
            <div className="absolute inset-y-0 right-2.5 z-50 flex items-center">
              <Dropdown
                items={SORT_ITEMS}
                selected={sort}
                onSelect={setSort}
                menuClassName="right-[3px]"
              >
                <button
                  type="button"
                  aria-label="Sort tables"
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-pg-muted transition-colors hover:text-pg-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pg-primary/30"
                >
                  <Icon name="solar:sort-from-top-to-bottom-linear" size={18} />
                </button>
              </Dropdown>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ScrollArea>
              <div className="p-1.5">
                {loading ? (
                  <TableListSkeleton />
                ) : (
                  filtered.map((table) => (
                    <button
                      key={table.name}
                      type="button"
                      className={cn(
                        "pg-nav-item",
                        active?.name === table.name && "pg-nav-item-active",
                      )}
                      onClick={() => setSelected(table.name)}
                    >
                      <span className="pg-nav-icon">
                        <Icon name="streamline-flex:table" size={18} />
                      </span>
                      <span className="pg-nav-label">{table.name}</span>
                    </button>
                  ))
                )}
                {!loading && filtered.length === 0 && (
                  <div className="px-2 py-3 text-center text-xs text-pg-dim">No tables found.</div>
                )}
              </div>
            </ScrollArea>
          </div>
        </section>
      </div>

      <div
        className={cn("pg-split-resizer", resize.resizing && "pg-split-resizing")}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize schema panel"
        onPointerDown={resize.start}
        onPointerMove={resize.move}
        onPointerUp={resize.end}
        onPointerCancel={resize.end}
      >
        <span className={cn("pg-split-handle", resize.blocked && "text-pg-danger")}>
          <Icon name="dash" size={24} />
        </span>
      </div>

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 transition-[width]",
          resize.resizing && "transition-none",
        )}
        style={{ minWidth: 0 }}
      >
        <section className="pg-card min-h-0 flex-1">
          {loading && (
            <div className="p-3.5">
              <div className="flex items-center gap-2">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4 w-40" />
              </div>
              <h3 className="mt-4 text-[11px] font-bold uppercase tracking-[0.6px] text-pg-dim">
                Columns
              </h3>
              <div className="mt-1.5">
                <ColumnTableSkeleton columns={4} />
              </div>
            </div>
          )}
          {!loading && error && (
            <div className="px-3.5 py-8 text-center text-xs text-pg-danger">{error}</div>
          )}
          {!loading && !error && active && (
            <div className="min-h-0 flex-1">
              <ScrollArea>
                <div className="p-3.5">
                  <div className="flex items-center gap-2">
                    <Icon name="solar:database-linear" size={16} className="text-pg-primary" />
                    <h2 className="m-0 text-[15px] font-semibold text-pg-text">{active.name}</h2>
                    <span className="text-xs text-pg-dim">{active.columns.length} columns</span>
                    <Button
                      size="sm"
                      className="ml-auto"
                      onClick={() =>
                        navigate(
                          `/sql?sql=${encodeURIComponent(`SELECT * FROM "${active.name}" LIMIT 100;`)}`,
                        )
                      }
                    >
                      <Icon name="solar:eye-linear" size={14} />
                      <span className="pg-btn-label">Preview</span>
                    </Button>
                  </div>

                  <h3 className="mt-4 text-[11px] font-bold uppercase tracking-[0.6px] text-pg-dim">
                    Columns
                  </h3>
                  <div className="mt-1.5 overflow-hidden rounded-lg border border-pg-border">
                    <table className="w-full border-collapse font-pg-mono text-xs">
                      <thead>
                        <tr className="bg-pg-surface-2 text-left text-[10px] uppercase tracking-wide text-pg-dim">
                          <th className="px-3 py-1.5 font-semibold">Name</th>
                          <th className="px-3 py-1.5 font-semibold">Type</th>
                          <th className="px-3 py-1.5 font-semibold">Nullable</th>
                          <th className="px-3 py-1.5 font-semibold">Default</th>
                        </tr>
                      </thead>
                      <tbody>
                        {active.columns.map((column) => (
                          <tr key={column.name} className="border-t border-pg-border text-pg-muted">
                            <td className="px-3 py-1.5 text-pg-text">
                              {column.name}
                              {column.isPrimaryKey && (
                                <span className="ml-2 rounded-full bg-pg-primary-light px-1.5 py-0.5 text-[9px] font-bold uppercase text-pg-primary">
                                  PK
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5">{column.dataType}</td>
                            <td className="px-3 py-1.5">{column.nullable ? "yes" : "no"}</td>
                            <td className="px-3 py-1.5">{column.default ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {active.foreignKeys.length > 0 && (
                    <>
                      <h3 className="mt-4 text-[11px] font-bold uppercase tracking-[0.6px] text-pg-dim">
                        Foreign keys
                      </h3>
                      <div className="mt-1.5 space-y-1">
                        {active.foreignKeys.map((fk) => (
                          <div
                            key={`${fk.column}-${fk.referencesTable}`}
                            className="flex items-center rounded-lg border border-pg-border px-3 py-2 font-pg-mono text-xs text-pg-muted"
                          >
                            <span className="text-pg-text">{fk.column}</span>
                            <Icon
                              name="solar:arrow-right-linear"
                              size={14}
                              className="mx-1.5 shrink-0 text-pg-dim"
                            />
                            {fk.referencesTable}.{fk.referencesColumn}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {active.uniqueColumnSets.length > 0 && (
                    <>
                      <h3 className="mt-4 text-[11px] font-bold uppercase tracking-[0.6px] text-pg-dim">
                        Unique constraints
                      </h3>
                      <div className="mt-1.5 space-y-1">
                        {active.uniqueColumnSets.map((set) => (
                          <div
                            key={set.join(",")}
                            className="rounded-lg border border-pg-border px-3 py-2 font-pg-mono text-xs text-pg-muted"
                          >
                            {set.join(", ")}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
          {!loading && !error && !active && (
            <div className="flex items-center justify-center px-3.5 py-8 text-xs text-pg-dim">
              {tables.length === 0
                ? "Connect a database to explore the schema."
                : "No tables match your filter."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
