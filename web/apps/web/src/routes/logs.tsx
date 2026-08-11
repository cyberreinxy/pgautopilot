import { useState } from "react";
import { Badge, Checkbox, Dropdown, Icon, ScrollArea, Spinner } from "@pgautopilot/ui";
import type { DropdownItem } from "@pgautopilot/ui";
import type { LogEntry, LogLevel } from "@pgautopilot/contracts";
import { useLogs } from "../features/logs/hooks/useLogs";
import { RefreshButton } from "../components/RefreshButton";
import { cn } from "../lib/cn";

type Filter = "all" | LogLevel;

type Category = "all" | "operations" | "requests";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "all", label: "All" },
  { value: "operations", label: "Operations" },
  { value: "requests", label: "Requests" },
];

function isRequestEntry(meta: LogEntry["meta"]): boolean {
  return typeof meta?.method === "string" && typeof meta?.path === "string";
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warnings" },
  { value: "error", label: "Errors" },
];

const TIME_FRAMES: DropdownItem[] = [
  { key: "1", label: "1m" },
  { key: "5", label: "5m" },
  { key: "15", label: "15m" },
  { key: "30", label: "30m" },
  { key: "60", label: "1h" },
  { key: "360", label: "6h" },
  { key: "1440", label: "24h" },
  { key: "2880", label: "48h" },
  { key: "10080", label: "7d" },
];

const LEVEL_TONE: Record<LogLevel, "read" | "write" | "maint"> = {
  debug: "read",
  info: "read",
  warn: "maint",
  error: "write",
};

const LEVEL_ACTIVE: Record<Filter, string> = {
  all: "bg-pg-primary-light text-pg-primary",
  debug: "bg-pg-accent-light text-pg-accent",
  info: "bg-pg-accent-light text-pg-accent",
  warn: "bg-pg-warning/10 text-pg-warning",
  error: "bg-pg-danger-light text-pg-danger",
};

const LEVEL_HOVER: Record<Filter, string> = {
  all: "hover:bg-pg-surface-2 hover:text-pg-text",
  debug: "hover:bg-pg-accent-light hover:text-pg-accent",
  info: "hover:bg-pg-accent-light hover:text-pg-accent",
  warn: "hover:bg-pg-warning/10 hover:text-pg-warning",
  error: "hover:bg-pg-danger-light hover:text-pg-danger",
};

const baseChip =
  "inline-flex h-7 min-w-[76px] cursor-pointer items-center justify-center rounded-md px-2 text-[11px] transition-colors";

function chipClass(active: boolean, activeClasses: string, hoverClasses: string): string {
  return cn(baseChip, active ? activeClasses : cn("text-pg-dim", hoverClasses));
}

export function LogsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<Category>("operations");
  const [sinceMinutes, setSinceMinutes] = useState<number>(5);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(
    () => localStorage.getItem("pgap:logs:auto-refresh") === "1",
  );
  const { entries, dir, loading, error, refresh } = useLogs(
    filter === "all" ? undefined : filter,
    sinceMinutes,
    autoRefresh,
  );

  const visibleEntries = entries.filter((entry) =>
    category === "all" ? true : isRequestEntry(entry.meta) === (category === "requests"),
  );

  const toggleAutoRefresh = (checked: boolean): void => {
    setAutoRefresh(checked);
    localStorage.setItem("pgap:logs:auto-refresh", checked ? "1" : "0");
  };

  return (
    <div className="flex h-full min-w-0 flex-col gap-1.5">
      <section className="pg-card min-h-0 flex-1">
        <div className="pg-card-head">
          <span className="flex items-center gap-2">Logs</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {loading ? (
              <Spinner />
            ) : (
              <span className="text-pg-dim">{visibleEntries.length} entries</span>
            )}
            <RefreshButton onClick={refresh} loading={loading} />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-1.5 border-b border-pg-border px-3 py-1.5">
          <div className="flex items-center gap-1">
            {CATEGORIES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setCategory(item.value)}
                className={chipClass(
                  category === item.value,
                  "bg-pg-surface-2 text-pg-text",
                  "hover:bg-pg-surface-2 hover:text-pg-text",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={chipClass(
                  filter === item.value,
                  LEVEL_ACTIVE[item.value],
                  LEVEL_HOVER[item.value],
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center">
            <Dropdown
              items={TIME_FRAMES}
              selected={String(sinceMinutes)}
              onSelect={(key) => setSinceMinutes(Number(key))}
              align="left"
            >
              <button
                type="button"
                className="inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-[11px] text-pg-primary transition-colors hover:bg-pg-primary-light"
              >
                {TIME_FRAMES.find((item) => item.key === String(sinceMinutes))?.label ?? "5m"}
                <Icon name="solar:alt-arrow-down-linear" size={12} />
              </button>
            </Dropdown>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Checkbox
              checked={autoRefresh}
              onChange={(event) => toggleAutoRefresh(event.target.checked)}
            />
            <span className="text-[11px] text-pg-dim">Auto-refresh</span>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {error ? (
            <div className="border-b border-pg-border bg-pg-danger-light/50 px-3.5 py-2 text-xs text-pg-danger">
              {error}
            </div>
          ) : null}
          <ScrollArea>
            <div className="flex flex-col p-1.5">
              {visibleEntries.length === 0 && !loading ? (
                <div className="px-3.5 py-10 text-center text-xs text-pg-dim">
                  No log entries
                  {filter === "all" && category === "all"
                    ? " yet."
                    : ` for this ${category === "requests" ? "request " : ""}filter yet.`}
                </div>
              ) : (
                visibleEntries.map((entry, index) => (
                  <LogRow key={`${entry.ts}-${index}`} entry={entry} />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </section>
      {dir ? (
        <section className="pg-card shrink-0">
          <div className="flex h-8 items-center gap-1.5 px-2 text-[10px] font-pg-mono text-pg-dim">
            Log directory: <span className="truncate">{dir}</span>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function LogRow({
  entry,
}: {
  entry: { ts: string; level: LogLevel; message: string; meta?: Record<string, unknown> };
}) {
  const time = new Date(entry.ts).toLocaleString();
  const meta = entry.meta ?? {};
  const { error, method, path, status, durationMs, ...rest } = meta;
  const restKeys = Object.keys(rest);
  const metaJson =
    restKeys.length > 0
      ? JSON.stringify(Object.fromEntries(restKeys.map((key) => [key, rest[key]])))
      : null;
  const requestLine =
    typeof method === "string" && typeof path === "string"
      ? `${method} ${path}` +
      (typeof status === "number" ? `  →  ${status}` : "") +
      (typeof durationMs === "number" ? `  (${durationMs}ms)` : "")
      : null;
  return (
    <div className="flex items-start gap-2.5 rounded-md px-2 py-1.5">
      <span className="flex w-12 shrink-0 justify-end pt-0.5">
        <Badge tone={LEVEL_TONE[entry.level]}>{entry.level}</Badge>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-pg-mono text-[10px] text-pg-dim">{time}</span>
        </div>
        <div
          className={cn(
            "text-[12.5px]",
            entry.level === "error" ? "text-pg-danger" : "text-pg-text",
          )}
        >
          {entry.message}
        </div>
        {requestLine ? (
          <div className="pt-0.5 font-pg-mono text-[10.5px] text-pg-accent">{requestLine}</div>
        ) : null}
        {metaJson ? (
          <div className="break-all pt-0.5 font-pg-mono text-[10px] text-pg-dim">{metaJson}</div>
        ) : null}
        {error !== undefined ? (
          <div className="break-all pt-0.5 font-pg-mono text-[10.5px] text-pg-danger">
            {formatValue(error)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
