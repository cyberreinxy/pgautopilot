import { Link } from "react-router-dom";
import { Badge, Icon, ScrollArea } from "@pgautopilot/ui";
import { useHealth } from "../features/health/useHealth";
import { useConfig } from "../features/settings/hooks/useConfig";
import { useReadonly } from "../features/readonly/readonly-context";
import { RefreshButton } from "../components/RefreshButton";

interface StatTile {
  label: string;
  value: string;
  valueClass: string;
  detail: string;
  tone: "read" | "write" | "maint";
  icon: string;
}

interface ActionCard {
  to: string;
  title: string;
  description: string;
  icon: string;
}

const ACTIONS: ActionCard[] = [
  {
    to: "/sql",
    title: "SQL Editor",
    description: "Run read-only queries and scripts safely, with formatting and risk warnings.",
    icon: "solar:code-linear",
  },
  {
    to: "/tools",
    title: "Tools",
    description: "Use MCP-style tools against your database: overview, schema, CRUD, backups.",
    icon: "solar:box-minimalistic-linear",
  },
  {
    to: "/tables",
    title: "Tables",
    description: "Browse, create, update and delete rows in your tables.",
    icon: "streamline-flex:table",
  },
  {
    to: "/schema",
    title: "Schema",
    description: "Inspect columns, keys, indexes and relations across all tables.",
    icon: "solar:database-linear",
  },
  {
    to: "/migrations",
    title: "Migrations",
    description: "Apply versioned SQL migrations with automatic snapshots before changes.",
    icon: "fluent:text-arrow-down-right-column-24-regular",
  },
  {
    to: "/logs",
    title: "Logs",
    description: "Review API requests, migrations and errors with live filtering.",
    icon: "solar:clipboard-list-linear",
  },
  {
    to: "/settings",
    title: "Settings",
    description: "Toggle read-only mode and review runtime configuration.",
    icon: "solar:settings-linear",
  },
];

export function OverviewPage() {
  const health = useHealth();
  const readonly = useReadonly();
  const { config, loading, refresh } = useConfig();

  const tiles: StatTile[] = [
    {
      label: "Database",
      value: health.online ? "Connected" : "Disconnected",
      valueClass:
        health.online === null
          ? "text-pg-muted"
          : health.online
            ? "text-pg-accent"
            : "text-pg-danger",
      detail:
        health.online && health.latencyMs !== null
          ? `${health.latencyMs}ms ping`
          : (health.reason ?? "Waiting for a connection…"),
      tone: health.online ? "write" : "maint",
      icon: health.online ? "solar:check-circle-bold" : "solar:server-square-linear",
    },
    {
      label: "Mode",
      value: config?.mode === "production" ? "Production" : "Development",
      valueClass: "text-pg-primary",
      detail: config ? `${config.host}:${config.port}` : "Loading…",
      tone: "read",
      icon: "solar:shield-keyhole-linear",
    },
    {
      label: "Access",
      value: readonly === null ? "…" : readonly ? "Read-only" : "Read-write",
      valueClass:
        readonly === null
          ? "text-pg-muted"
          : readonly
            ? "text-pg-accent"
            : "text-pg-danger",
      detail:
        readonly === null ? "Checking…" : readonly ? "Writes are blocked" : "Writes are allowed",
      tone: readonly ? "maint" : "write",
      icon: readonly ? "solar:lock-keyhole-linear" : "solar:key-linear",
    },
    {
      label: "Pool",
      value: `${health.pool.totalCount} total`,
      valueClass: "text-pg-primary",
      detail: `${health.pool.idleCount} idle · ${health.pool.waitingCount} waiting`,
      tone: "read",
      icon: "solar:database-linear",
    },
  ];

  return (
    <div className="flex h-full min-w-0 flex-col gap-1.5 overflow-hidden">
      <section className="pg-card shrink-0">
        <div className="pg-card-head">
          <span className="flex items-center gap-2">
            Overview
            {readonly ? (
              <Badge tone="read" className="px-1.5 py-0.5 text-[8px]">
                READ-ONLY
              </Badge>
            ) : null}
          </span>
          <RefreshButton onClick={refresh} loading={loading} />
        </div>
        <div className="p-3">
          <div className="text-[13px] font-medium text-pg-text">PGAutoPilot Dashboard</div>
          <div className="pt-0.5 text-xs text-pg-dim">
            A safe way to inspect and manage your PostgreSQL database. Start from one of the
            sections below or jump straight into the SQL Editor.
          </div>
        </div>
      </section>

      <section className="grid shrink-0 grid-cols-2 gap-1.5 md:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="pg-card">
            <div className="flex flex-col gap-1.5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold tracking-[0.3px] text-pg-muted">
                  {tile.label.toUpperCase()}
                </span>
                <Icon name={tile.icon} size={16} className={tile.valueClass} />
              </div>
              <span className={`text-[15px] font-semibold ${tile.valueClass}`}>
                {tile.value}
              </span>
              <span className="truncate text-[10px] text-pg-dim">{tile.detail}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="pg-card min-h-0 flex-1">
        <div className="pg-card-head">
          <span className="flex items-center gap-2">Sections</span>
          <span className="text-pg-dim text-[10px]">jump straight in</span>
        </div>
        <div className="min-h-0 flex-1">
          <ScrollArea>
            <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {ACTIONS.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="group flex items-start gap-2.5 rounded-lg border border-pg-border bg-pg-surface px-3 py-2.5 transition-colors hover:border-pg-primary/50 hover:bg-pg-surface-2"
                >
                  <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-pg-surface-2 transition-colors group-hover:bg-pg-primary-light">
                    <Icon name={action.icon} size={16} className="text-pg-primary" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-pg-text">{action.title}</span>
                      <Icon
                        name="solar:arrow-up-right-linear"
                        size={12}
                        className="text-pg-dim transition-colors group-hover:text-pg-primary"
                      />
                    </span>
                    <span className="block pt-0.5 text-[11px] leading-relaxed text-pg-dim">
                      {action.description}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </ScrollArea>
        </div>
      </section>
    </div>
  );
}
