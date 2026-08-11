import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Dropdown,
  Icon,
  Pagination,
  ScrollArea,
} from "@pgautopilot/ui";
import type { ConfirmTone, DropdownItem } from "@pgautopilot/ui";
import type { SortDirection } from "@pgautopilot/contracts";
import { cn } from "../lib/cn";
import { useToast } from "../lib/toast";
import { useTableList } from "../features/tables/hooks/useTableList";
import { useTableData } from "../features/tables/hooks/useTableData";
import { useTableMutations } from "../features/tables/hooks/useTableMutations";
import { useLiveTable } from "../features/tables/hooks/useLiveTable";
import { useReadonly } from "../features/readonly/readonly-context";
import { RefreshButton } from "../components/RefreshButton";
import { TableListSkeleton, DataGridSkeleton } from "../components/Skeletons";

const LIST_MIN = 200;
const LIST_MAX = 240;
const RESIZE_OVERSHOOT = 40;
const DEFAULT_COL_WIDTH = 300;
const COL_MIN_WIDTH = 80;
const COL_MAX_WIDTH = 500;
const COL_FLOOR = 120;
const CHECKBOX_COL_WIDTH = 36;
const COL_RESIZE_ZONE = 16;
const RESIZE_HANDLE_SIZE = 24;

const SORT_ITEMS: DropdownItem[] = [
  { key: "name-asc", label: "Name A-Z" },
  { key: "name-desc", label: "Name Z-A" },
  { key: "cols-desc", label: "Most columns" },
  { key: "cols-asc", label: "Fewest columns" },
];

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  tone: ConfirmTone;
  action: () => Promise<void>;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ColumnResizeGrip({
  column,
  side,
  active,
  onPointerDown,
}: {
  column: string;
  side: "left" | "right";
  active: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span
      className={cn(
        "group pointer-events-none absolute inset-y-0 z-10 flex w-6 items-stretch justify-center",
        side === "left" ? "-left-[12.5px]" : "-right-[12.5px]",
      )}
    >
      <span
        className={cn(
          "flex select-none items-center text-pg-dim transition-[color,scale,opacity] duration-100 ease-pg-out",
          "opacity-50 group-hover:text-pg-primary group-hover:opacity-80",
          active && "scale-110 text-pg-primary opacity-100",
        )}
      >
        <Icon name="dash" size={RESIZE_HANDLE_SIZE} />
      </span>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize column ${column}`}
        onPointerDown={onPointerDown}
        onClick={(event) => event.stopPropagation()}
        className="pointer-events-auto absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 cursor-col-resize"
      />
    </span>
  );
}

export function TablesPage() {
  const { showToast } = useToast();
  const readonly = useReadonly();

  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name-asc");
  const [listWidth, setListWidth] = useState(LIST_MAX);
  const [splitResizing, setSplitResizing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number; container: number } | null>(null);
  const dragFinalRef = useRef<number | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const colDragRef = useRef<{ name: string; startX: number; startWidth: number } | null>(null);
  const [colResizing, setColResizing] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const { tables, loading, error: tableError, refresh: refreshTables } = useTableList();

  const activeTable = tables.find((table) => table.name === active);

  const pkColumns = useMemo(() => {
    if (!activeTable) return [] as string[];
    const pk = activeTable.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
    if (pk.length > 0) return pk;
    return activeTable.uniqueColumnSets[0] ?? [];
  }, [activeTable]);

  const defaultOrderBy = useMemo<Record<string, SortDirection> | undefined>(() => {
    if (!activeTable) return undefined;
    const names = new Set(activeTable.columns.map((c) => c.name));
    if (names.has("created_at")) return { created_at: "desc" };
    if (pkColumns.length > 0) return { [pkColumns[0]!]: "asc" };
    return undefined;
  }, [activeTable, pkColumns]);

  const {
    data,
    dataError,
    dataLoading,
    page,
    pageSize,
    total,
    pageCount,
    orderBy,
    goToPage,
    setPageSize,
    toggleSort,
    refresh: refreshData,
  } = useTableData(active, { defaultOrderBy });

  const { updateRow, deleteRows } = useTableMutations();
  useLiveTable(active);

  const tableMinWidth = useMemo(() => {
    if (!data) return undefined;
    return (
      data.columns.reduce((acc, column) => acc + (colWidths[column.name] ?? COL_FLOOR), 0) +
      CHECKBOX_COL_WIDTH
    );
  }, [data, colWidths]);

  const hasCustomWidths = Object.keys(colWidths).length > 0;

  const allSelected = data ? data.rows.length > 0 && selectedRows.size === data.rows.length : false;
  const someSelected = selectedRows.size > 0 && !allSelected;

  const toggleRow = useCallback((rowIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!data) return;
    setSelectedRows(allSelected ? new Set() : new Set(data.rows.map((_, index) => index)));
  }, [allSelected, data]);

  const rowWhere = useCallback(
    (row: Record<string, unknown>): Record<string, unknown> | null => {
      if (pkColumns.length === 0) return null;
      const where: Record<string, unknown> = {};
      for (const col of pkColumns) {
        if (row[col] === null || row[col] === undefined) return null;
        where[col] = row[col];
      }
      return where;
    },
    [pkColumns],
  );

  const startEdit = useCallback((rowIndex: number, column: string, initial: string) => {
    setEditingCell({ row: rowIndex, col: column });
    setEditValue(initial);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  const submitEdit = useCallback(
    (rowIndex: number, column: string) => {
      const row = data?.rows[rowIndex];
      if (!row || !active) return;
      const next = editValue;
      const where = rowWhere(row);
      cancelEdit();
      if (!where) {
        showToast("Table has no primary key — cannot update this row", "error");
        return;
      }
      const current = cellText(row[column]);
      if (next === current) return;
      setConfirmReq({
        title: "Update cell",
        message: `Update "${column}" to "${next}" in ${active}?`,
        confirmLabel: "Save change",
        tone: "primary",
        action: async () => {
          const res = await updateRow(active, where, { [column]: next });
          if (!res.ok) throw new Error(res.error);
          showToast("Cell updated", "success");
        },
      });
    },
    [active, data, editValue, rowWhere, cancelEdit, updateRow, showToast],
  );

  const openDeleteConfirm = useCallback(() => {
    if (!active || !data || selectedRows.size === 0) return;
    const rows = data.rows.filter((_, index) => selectedRows.has(index));
    const missingKey = rows.some((row) => !rowWhere(row));
    if (missingKey) {
      showToast("Some selected rows have no primary key — cannot delete", "error");
      return;
    }
    const count = rows.length;
    setConfirmReq({
      title: "Delete rows",
      message: `Delete ${count} selected row${count === 1 ? "" : "s"} from ${active}? This cannot be undone.`,
      tone: "danger",
      action: async () => {
        for (const row of rows) {
          const where = rowWhere(row);
          if (!where) continue;
          const res = await deleteRows(active, where);
          if (!res.ok) throw new Error(res.error);
        }
        setSelectedRows(new Set());
        showToast(`Deleted ${count} row${count === 1 ? "" : "s"}`, "success");
      },
    });
  }, [active, data, selectedRows, rowWhere, deleteRows, showToast]);

  const runConfirm = useCallback(async () => {
    if (!confirmReq) return;
    setConfirming(true);
    try {
      await confirmReq.action();
      setConfirmReq(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Action failed", "error");
    } finally {
      setConfirming(false);
    }
  }, [confirmReq, showToast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = q ? tables.filter((table) => table.name.toLowerCase().includes(q)) : [...tables];
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

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = splitRef.current?.getBoundingClientRect().width ?? 800;
      dragRef.current = { startX: event.clientX, startWidth: listWidth, container };
      dragFinalRef.current = listWidth;
      setSplitResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [listWidth],
  );

  const onResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const raw = drag.startWidth + (event.clientX - drag.startX);
    const next = Math.max(LIST_MIN - RESIZE_OVERSHOOT, Math.min(LIST_MAX + RESIZE_OVERSHOOT, raw));
    dragFinalRef.current = next;
    setListWidth(next);
    setBlocked(raw < LIST_MIN - RESIZE_OVERSHOOT || raw > LIST_MAX + RESIZE_OVERSHOOT);
  }, []);

  const endResize = useCallback(() => {
    const drag = dragRef.current;
    const final = dragFinalRef.current;
    dragRef.current = null;
    dragFinalRef.current = null;
    setSplitResizing(false);
    setBlocked(false);
    if (!drag || final === null) return;
    setListWidth(Math.max(LIST_MIN, Math.min(LIST_MAX, final)));
  }, []);

  const beginColumnResize = useCallback((column: string, startX: number, startWidth: number) => {
    colDragRef.current = { name: column, startX, startWidth };
    setColResizing(column);
  }, []);

  const onCellPointerDown = useCallback(
    (column: string) => (event: ReactPointerEvent<HTMLTableCellElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.right - COL_RESIZE_ZONE) return;
      event.preventDefault();
      event.stopPropagation();
      beginColumnResize(
        column,
        event.clientX,
        colWidths[column] ?? rect.width ?? DEFAULT_COL_WIDTH,
      );
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [colWidths, beginColumnResize],
  );

  const onHandlePointerDown = useCallback(
    (column: string) => (event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const width =
        colWidths[column] ??
        event.currentTarget.closest("th")?.getBoundingClientRect().width ??
        DEFAULT_COL_WIDTH;
      beginColumnResize(column, event.clientX, width);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [colWidths, beginColumnResize],
  );

  const onColumnResizeMove = useCallback((event: PointerEvent) => {
    const drag = colDragRef.current;
    if (!drag) return;
    const raw = Math.round(drag.startWidth + (event.clientX - drag.startX));
    const width = Math.min(COL_MAX_WIDTH, Math.max(COL_MIN_WIDTH, raw));
    setColWidths((prev) => (prev[drag.name] === width ? prev : { ...prev, [drag.name]: width }));
  }, []);

  useEffect(() => {
    if (!colResizing) return;
    const onMove = onColumnResizeMove;
    const onEnd = () => {
      colDragRef.current = null;
      setColResizing(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [colResizing, onColumnResizeMove]);

  const sortEntries = Object.entries(orderBy ?? {});
  const sortDirectionFor = useCallback(
    (column: string): SortDirection | null => {
      const entry = sortEntries.find(([name]) => name === column);
      return entry ? (entry[1] as SortDirection) : null;
    },
    [sortEntries],
  );

  const onHeaderClick = useCallback(
    (column: string, event: ReactMouseEvent<HTMLTableCellElement>) => {
      if (colResizing) return;
      toggleSort(column, event.shiftKey);
    },
    [toggleSort, colResizing],
  );

  useEffect(() => {
    setEditingCell(null);
    setEditValue("");
    setSelectedRows(new Set());
  }, [active, page, orderBy]);

  useEffect(() => {
    if (!loading && tables.length > 0 && !active) {
      const first = tables[0]?.name;
      if (first) setActive(first);
    }
  }, [loading, tables, active]);

  return (
    <div ref={splitRef} className="flex h-full min-w-0">
      <div
        className={cn(
          "flex min-h-0 shrink-0 flex-col gap-1.5 transition-[width]",
          splitResizing && "transition-none",
        )}
        style={{
          width: listWidth,
          minWidth: LIST_MIN - RESIZE_OVERSHOOT,
          maxWidth: LIST_MAX + RESIZE_OVERSHOOT,
        }}
      >
        <section className="pg-card min-h-0 flex-1">
          <div className="pg-card-head">
            <span>Tables</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="text-pg-dim">{tables.length} tables</span>
              <RefreshButton onClick={refreshTables} loading={loading} />
            </span>
          </div>
          <div className="relative border-b border-pg-border p-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter tables"
              className="h-8 w-full rounded-lg border border-pg-border bg-pg-surface-2 pl-2.5 pr-16 font-pg-sans text-xs text-pg-text outline-none transition-colors focus:ring-1 focus:ring-pg-primary"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute inset-y-0 right-9 z-10 my-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-pg-muted transition-colors hover:text-pg-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pg-primary/30"
              >
                <Icon name="iconamoon:close-fill" size={20} />
              </button>
            )}
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
          <div className="min-h-0 min-w-0 flex-1">
            <ScrollArea>
              <div className="p-1.5">
                {loading ? (
                  <TableListSkeleton />
                ) : (
                  filtered.map((table) => (
                    <button
                      key={table.name}
                      type="button"
                      className={cn("pg-nav-item", active === table.name && "pg-nav-item-active")}
                      onClick={() => setActive(table.name)}
                    >
                      <span className="pg-nav-icon">
                        <Icon name="streamline-flex:table" size={16} />
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
        className={cn("pg-split-resizer", splitResizing && "pg-split-resizing")}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize tables panel"
        onPointerDown={startResize}
        onPointerMove={onResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      >
        <span className={cn("pg-split-handle", blocked && "text-pg-danger")}>
          <Icon name="dash" size={RESIZE_HANDLE_SIZE} />
        </span>
      </div>

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 transition-[width]",
          splitResizing && "transition-none",
        )}
        style={{ minWidth: 0 }}
      >
        <section className="pg-card min-h-0 min-w-0 flex-1">
          <div className="pg-card-head">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-pg-primary">
                <Icon name="streamline-flex:table" size={18} />
              </span>
              <span className="shrink-0 text-sm">{activeTable?.name ?? "Table"}</span>
              {readonly && (
                <Badge tone="read" className="px-1.5 py-0.5 text-[8px]">
                  READ-ONLY
                </Badge>
              )}
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
              {selectedRows.size > 0 && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={openDeleteConfirm}
                  disabled={readonly}
                  className="min-h-8"
                >
                  <Icon name="solar:trash-bin-trash-linear" size={14} />
                  <span className="pg-btn-label">Delete ({selectedRows.size})</span>
                </Button>
              )}
              <RefreshButton
                onClick={refreshData}
                loading={dataLoading}
                disabled={!active}
                className="enabled:hover:text-pg-primary"
              />
            </span>
          </div>
          <div className="min-h-0 min-w-0 flex-1">
            {tableError && !loading ? (
              <div className="px-3.5 py-8 text-center text-xs text-pg-danger">{tableError}</div>
            ) : dataError && !data ? (
              <div className="px-3.5 py-8 text-center text-xs text-pg-danger">{dataError}</div>
            ) : data ? (
              <ScrollArea>
                <table
                  className="w-full border-separate border-spacing-0 font-pg-mono text-xs"
                  style={{
                    tableLayout: "fixed",
                    width: "100%",
                    minWidth: tableMinWidth,
                  }}
                >
                  <colgroup>
                    <col style={{ width: CHECKBOX_COL_WIDTH }} />
                    {data.columns.map((column) => (
                      <col key={column.name} style={{ width: colWidths[column.name] ?? "auto" }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-pg-dim">
                      <th className="sticky left-0 top-0 z-30 border-b border-r border-pg-border bg-pg-surface-2 px-3 py-1.5">
                        <Checkbox
                          aria-label="Select all rows"
                          checked={allSelected}
                          indeterminate={someSelected}
                          disabled={readonly}
                          onChange={toggleAll}
                        />
                      </th>
                      {data.columns.map((column, index) => {
                        const prevColumn = data.columns[index - 1];
                        const isLast = index === data.columns.length - 1;
                        const direction = sortDirectionFor(column.name);
                        const ascending = direction === "asc" || direction === "asc_nulls_last";
                        return (
                          <th
                            key={column.name}
                            onClick={(event) => onHeaderClick(column.name, event)}
                            className="group relative sticky top-0 z-20 cursor-pointer select-none border-b border-r border-pg-border bg-pg-surface-2 py-1.5 pl-3 pr-10 font-semibold"
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate">{column.name}</span>
                              <span className="truncate font-pg-sans text-[9px] normal-case text-pg-dim">
                                {column.dataType}
                              </span>
                            </span>
                            <span className="absolute inset-y-0 right-[18px] flex items-center">
                              <span
                                className={cn(
                                  "flex h-5 min-w-5 items-center justify-center rounded-md px-1",
                                  direction
                                    ? "bg-pg-primary/10 text-pg-primary"
                                    : "text-pg-muted opacity-60 transition-opacity group-hover:opacity-100",
                                )}
                              >
                                <Icon
                                  name={
                                    !direction
                                      ? "solar:sort-vertical-linear"
                                      : ascending
                                        ? "solar:sort-from-bottom-to-top-linear"
                                        : "solar:sort-from-top-to-bottom-linear"
                                  }
                                  size={14}
                                />
                              </span>
                            </span>
                            {index > 0 && prevColumn && (
                              <ColumnResizeGrip
                                column={prevColumn.name}
                                side="left"
                                active={colResizing === prevColumn.name}
                                onPointerDown={onHandlePointerDown(prevColumn.name)}
                              />
                            )}
                            {isLast && (
                              <ColumnResizeGrip
                                column={column.name}
                                side="right"
                                active={colResizing === column.name}
                                onPointerDown={onHandlePointerDown(column.name)}
                              />
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, rowIndex) => (
                      <tr
                        key={rowIndex}
                        className="group text-pg-muted transition-colors hover:bg-pg-primary/5"
                      >
                        <td
                          className="sticky left-0 z-10 border-b border-r border-pg-border bg-pg-surface px-3 py-1.5 transition-colors group-hover:bg-pg-primary/5"
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            aria-label={`Select row ${rowIndex + 1}`}
                            checked={selectedRows.has(rowIndex)}
                            disabled={readonly}
                            onChange={() => toggleRow(rowIndex)}
                          />
                        </td>
                        {data.columns.map((column) => {
                          const text = cellText(row[column.name]);
                          const isEditing =
                            editingCell?.row === rowIndex && editingCell?.col === column.name;
                          return (
                            <td
                              key={column.name}
                              title={text}
                              onPointerDown={onCellPointerDown(column.name)}
                              onClick={(event) => {
                                const rect = event.currentTarget.getBoundingClientRect();
                                if (
                                  readonly ||
                                  colResizing ||
                                  event.clientX >= rect.right - COL_RESIZE_ZONE
                                )
                                  return;
                                startEdit(rowIndex, column.name, text);
                              }}
                              className="relative truncate border-b border-r border-pg-border px-3 py-1.5 text-pg-text"
                            >
                              <span className={cn(isEditing && "invisible")}>{text}</span>
                              {isEditing && (
                                <input
                                  autoFocus
                                  value={editValue}
                                  onChange={(event) => setEditValue(event.target.value)}
                                  onFocus={(event) =>
                                    event.currentTarget.setSelectionRange(
                                      event.currentTarget.value.length,
                                      event.currentTarget.value.length,
                                    )
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      submitEdit(rowIndex, column.name);
                                    } else if (event.key === "Escape") {
                                      event.preventDefault();
                                      cancelEdit();
                                    }
                                  }}
                                  onBlur={cancelEdit}
                                  className="absolute inset-0 h-full w-full cursor-text bg-transparent px-3 py-1.5 font-pg-mono text-xs text-pg-text outline-none"
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {data.rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={data.columns.length + 1}
                          className="px-3 py-6 text-center text-pg-dim"
                        >
                          No rows.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            ) : dataLoading ? (
              <DataGridSkeleton columns={5} />
            ) : (
              <div className="px-3.5 py-8 text-center text-xs text-pg-dim">
                Select a table to browse its rows.
              </div>
            )}
          </div>
        </section>
        <section className="pg-card shrink-0">
          <div className="flex items-center justify-between gap-1.5 p-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="flex h-8 min-w-[72px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-pg-border px-3 font-pg-mono text-[11px] text-pg-dim">
                {data ? `${data.columns.length} cols` : "0 cols"}
              </span>
              <span className="flex h-8 min-w-[140px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-pg-border px-3 font-pg-mono text-[11px] text-pg-dim">
                {data && total > 0
                  ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} of ${total} rows`
                  : data
                    ? `${total} rows`
                    : "0 rows"}
              </span>
              {data && total > 0 && (
                <Pagination
                  page={page + 1}
                  pageCount={pageCount}
                  onPageChange={(next) => goToPage(next - 1)}
                  pageSize={pageSize}
                  onPageSizeChange={setPageSize}
                />
              )}
            </div>
            {hasCustomWidths && (
              <Button size="sm" onClick={() => setColWidths({})} className="min-h-8 shrink-0">
                <Icon name="solar:restart-linear" size={14} />
                <span className="pg-btn-label">Reset widths</span>
              </Button>
            )}
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={Boolean(confirmReq)}
        title={confirmReq?.title ?? ""}
        message={confirmReq?.message ?? ""}
        confirmLabel={confirmReq?.confirmLabel}
        tone={confirmReq?.tone ?? "default"}
        icon={
          confirmReq?.tone === "danger"
            ? "solar:trash-bin-trash-linear"
            : "solar:pen-new-square-linear"
        }
        loading={confirming}
        onConfirm={runConfirm}
        onCancel={() => setConfirmReq(null)}
      />
    </div>
  );
}
