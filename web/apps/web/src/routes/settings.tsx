import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Badge, Button, Icon, Spinner, ConfirmDialog } from "@pgautopilot/ui";
import { cn } from "../lib/cn";
import { useConfig } from "../features/settings/hooks/useConfig";
import { useReadonlyContext } from "../features/readonly/readonly-context";
import { useToast } from "../lib/toast";
import { RefreshButton } from "../components/RefreshButton";

const DEFAULT_RATIO = 0.5;
const MIN_RATIO = DEFAULT_RATIO * 0.75;
const MAX_RATIO = DEFAULT_RATIO * 1.25;
const OVERSHOOT = 0.04;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2">
      <span className="text-xs text-pg-muted">{label}</span>
      <span className="truncate font-pg-mono text-xs text-pg-text">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const { config, loading, error, saving, elapsedMs, refresh, setReadonly } = useConfig();
  const { setReadonly: setReadonlyContext } = useReadonlyContext();
  const { showToast } = useToast();
  const [confirmToggle, setConfirmToggle] = useState<boolean | null>(null);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [resizing, setResizing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startRatio: number; container: number } | null>(null);
  const dragFinalRef = useRef<number | null>(null);

  const panelStyle = cn("flex min-h-0 shrink-0 flex-col", resizing && "transition-none");

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = containerRef.current?.getBoundingClientRect().width ?? 800;
      dragRef.current = { startX: event.clientX, startRatio: ratio, container };
      dragFinalRef.current = ratio;
      setResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [ratio],
  );

  const onResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.startX;
    const next = drag.startRatio + delta / drag.container;
    const stretched = Math.max(MIN_RATIO - OVERSHOOT, Math.min(MAX_RATIO + OVERSHOOT, next));
    dragFinalRef.current = stretched;
    setRatio(stretched);
    setBlocked(next < MIN_RATIO - OVERSHOOT || next > MAX_RATIO + OVERSHOOT);
  }, []);

  const endResize = useCallback(() => {
    const final = dragFinalRef.current;
    dragRef.current = null;
    dragFinalRef.current = null;
    setResizing(false);
    setBlocked(false);
    if (final === null) return;
    setRatio(Math.max(MIN_RATIO, Math.min(MAX_RATIO, final)));
  }, []);

  const applyReadonly = async (next: boolean) => {
    setReadonlyContext(next);
    try {
      await setReadonly(next);
      showToast(`Read-only mode ${next ? "enabled" : "disabled"}`, "success");
    } catch (err) {
      setReadonlyContext(!next);
      showToast(err instanceof Error ? err.message : "Could not update read-only mode", "error");
    }
  };

  const requestToggle = () => {
    if (!config) return;
    setConfirmToggle(!config.readonly);
  };

  return (
    <div ref={containerRef} className="flex h-full min-w-0 flex-col gap-1.5">
      <section className="pg-card shrink-0">
        <div className="pg-card-head border-b-0">
          <span>Settings</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Badge tone="maint" className="lowercase">{`${Math.round(elapsedMs)}ms`}</Badge>
            <RefreshButton onClick={refresh} loading={loading} />
          </span>
        </div>
      </section>
      <div className="flex min-h-0 flex-1 min-w-0">
        <div
          className={cn(panelStyle, "transition-[flex-basis]")}
          style={{
            flexBasis: `${ratio * 100}%`,
            minWidth: `${(MIN_RATIO - OVERSHOOT) * 100}%`,
            maxWidth: `${(MAX_RATIO + OVERSHOOT) * 100}%`,
          }}
        >
          <section className="pg-card min-h-0 flex-1">
            <div className="pg-card-head">
              <span>Connection</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {error && !config ? (
                <div className="px-3.5 py-8 text-center text-xs text-pg-danger">{error}</div>
              ) : !config ? (
                <div className="px-3.5 py-8 text-center text-xs text-pg-dim">
                  {loading ? "Loading..." : "Could not load configuration."}
                </div>
              ) : (
                <div className="flex flex-col">
                  <Row
                    label="Status"
                    value={config.databaseUrlConfigured ? "Configured" : "Not configured"}
                  />
                  <Row label="Server" value={`${config.host}:${config.port}`} />
                  <Row label="Mode" value={config.mode} />
                  <Row label="Statement timeout" value={`${config.statementTimeoutMs}ms`} />
                </div>
              )}
            </div>
          </section>
        </div>

        <div
          className={cn("pg-split-resizer", resizing && "pg-split-resizing")}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize settings panels"
          onPointerDown={startResize}
          onPointerMove={onResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        >
          <span className={cn("pg-split-handle", blocked && "text-pg-danger")}>
            <Icon name="dash" size={24} />
          </span>
        </div>

        <div
          className={cn("flex min-h-0 min-w-0 flex-1 flex-col", resizing && "transition-none")}
          style={{ minWidth: 0 }}
        >
          <section className="pg-card min-h-0 flex-1">
            <div className="pg-card-head">
              <span>Safety</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {error && !config ? (
                <div className="px-3.5 py-8 text-center text-xs text-pg-danger">{error}</div>
              ) : !config ? (
                <div className="px-3.5 py-8 text-center text-xs text-pg-dim">
                  {loading ? "Loading..." : "Could not load configuration."}
                </div>
              ) : (
                <div className="flex flex-col">
                  <Row
                    label="Blocked tables"
                    value={config.blockedTables.length ? config.blockedTables.join(", ") : "none"}
                  />
                  <Row
                    label="High-risk tables"
                    value={
                      config.highRiskTables.length ? config.highRiskTables.join(", ") : "none"
                    }
                  />
                  <Row
                    label="Sensitive columns"
                    value={
                      config.sensitiveColumns.length
                        ? `${config.sensitiveColumns.length} redacted`
                        : "none"
                    }
                  />
                  <div className="px-3.5 pb-1 pt-2">
                    <Button
                      size="sm"
                      variant={config.readonly ? "danger" : "primary"}
                      onClick={requestToggle}
                      disabled={saving}
                    >
                      {saving ? (
                        <Spinner />
                      ) : (
                        <Icon
                          name={config.readonly ? "solar:key-linear" : "solar:lock-keyhole-linear"}
                          size={14}
                        />
                      )}
                      <span className="pg-btn-label">
                        {config.readonly ? "Switch to read-write" : "Switch to read-only"}
                      </span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
      <ConfirmDialog
        open={confirmToggle !== null}
        title={confirmToggle ? "Enable read-only mode" : "Disable read-only mode"}
        message={
          confirmToggle
            ? "Block all writes across the dashboard — editing or deleting rows, write tools, migrations, and write SQL. Browsing and SELECT queries keep working."
            : "Re-enable writes across the dashboard — editing or deleting rows, write tools, migrations, and write SQL."
        }
        tone={confirmToggle ? "primary" : "danger"}
        icon={confirmToggle ? "solar:lock-keyhole-linear" : "solar:key-linear"}
        loading={saving}
        onConfirm={async () => {
          const next = confirmToggle;
          setConfirmToggle(null);
          if (next !== null) await applyReadonly(next);
        }}
        onCancel={() => setConfirmToggle(null)}
      />
    </div>
  );
}
