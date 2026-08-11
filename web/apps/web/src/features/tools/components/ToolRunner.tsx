import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Badge, Button, ConfirmDialog, Icon, ScrollArea, Spinner } from "@pgautopilot/ui";
import { cn } from "../../../lib/cn";
import type { ToolName } from "@pgautopilot/contracts";
import { useRiskConfirm } from "../../risk/useRiskConfirm";
import { useExecuteTool } from "../hooks/useExecuteTool";
import { getTool } from "../hooks/useTools";
import { useReadonly } from "../../readonly/readonly-context";
import { useToast } from "../../../lib/toast";
import { formatBytes, formatElapsed } from "../../../lib/format";
import { ToolSidebar } from "./ToolSidebar";
import { ParamsEditor } from "./ParamsEditor";
import { ResultViewer } from "./ResultViewer";

const PARAMS_MIN = 400;
const RESPONSE_MIN = 320;
const SPLIT_GAP = 6;
const NAV_RESIZER = 6;
const NAV_MIN = 180;
const NAV_MAX = 220;
const RESIZE_OVERSHOOT = 40;

interface ToolOutcome {
  result: unknown;
  error: string | null;
  elapsedMs: number;
}

export function ToolRunner() {
  const [activeName, setActiveName] = useState<ToolName>("db_overview");
  const [paramsText, setParamsText] = useState("{}");
  const [paramsWidth, setParamsWidth] = useState(550);
  const [navWidth, setNavWidth] = useState(220);
  const [splitResizing, setSplitResizing] = useState(false);
  const [blocked, setBlocked] = useState<"nav" | "split" | null>(null);
  const [outcomes, setOutcomes] = useState<Partial<Record<ToolName, ToolOutcome>>>({});
  const outerRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const resizeDragRef = useRef<{
    target: "nav" | "split";
    startX: number;
    startNav: number;
    startParams: number;
    container: number;
  } | null>(null);
  const dragFinalRef = useRef<{ nav: number; params: number } | null>(null);
  const { running, execute } = useExecuteTool();
  const { showToast } = useToast();
  const readonly = useReadonly();
  const riskConfirm = useRiskConfirm();

  const active = getTool(activeName);
  const activeOutcome = outcomes[activeName];
  const outcomeText = activeOutcome?.error ?? activeOutcome?.result;
  const outcomeRaw =
    outcomeText === undefined
      ? ""
      : typeof outcomeText === "string"
        ? outcomeText
        : JSON.stringify(outcomeText, null, 2);
  const lines = outcomeRaw ? outcomeRaw.split("\n").length : 0;
  const bytes = outcomeRaw ? new Blob([outcomeRaw]).size : 0;
  const tone = active.write ? "write" : active.category === "maintenance" ? "maint" : "read";
  const writeBlocked = readonly && active.write;

  const run = () => {
    const parsed = JSON.parse(paramsText || "{}") as Record<string, unknown>;
    if (!active.write) {
      void executeActive(parsed);
      return;
    }
    const unfiltered =
      (activeName === "db_update_many" || activeName === "db_delete_many") &&
      (!parsed.where || typeof parsed.where !== "object" || Object.keys(parsed.where).length === 0);
    riskConfirm.request({
      title: unfiltered ? "Confirm full-table operation" : "Confirm write operation",
      message: (
        <span className="flex flex-col gap-1.5">
          <span>
            Running "{active.title}" will modify data in your database.
            {unfiltered ? " No WHERE filter is set — this will affect every row." : ""}
          </span>
          <code className="break-all rounded-md border border-pg-border bg-pg-surface-2 px-2 py-1 font-pg-mono text-[11px] text-pg-text">
            {JSON.stringify(parsed, null, 2)}
          </code>
        </span>
      ),
      action: () => {
        const extra: Record<string, unknown> = {};
        if (unfiltered) {
          extra.confirmAll = true;
        }
        if (activeName === "db_run_script") {
          extra.confirmed = true;
        }
        return executeActive({ ...parsed, ...extra });
      },
    });
  };

  const executeActive = async (args: Record<string, unknown>) => {
    try {
      const outcome = await execute(activeName, args);
      setOutcomes((prev) => ({
        ...prev,
        [activeName]: {
          result: outcome.result,
          error: outcome.error,
          elapsedMs: outcome.elapsedMs,
        },
      }));
      if (outcome.warnings.length > 0) {
        showToast(outcome.warnings.join(" · "), "warning");
      } else {
        showToast(
          outcome.error ? "Execution failed" : "Execution succeeded",
          outcome.error ? "error" : "success",
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Invalid JSON in parameters", "error");
    }
  };

  const clearAll = () => setOutcomes({});

  const isValid = (() => {
    try {
      JSON.parse(paramsText || "{}");
      return true;
    } catch {
      return false;
    }
  })();

  const format = () => {
    let next: string | null = null;
    try {
      next = JSON.stringify(JSON.parse(paramsText || "{}"), null, 2);
    } catch {
      next = null;
    }
    if (next !== null) {
      setParamsText(next);
    }
  };

  const clearParams = () => setParamsText("{}");

  const startResize = useCallback(
    (target: "nav" | "split") => (event: ReactPointerEvent<HTMLDivElement>) => {
      const container =
        (target === "nav" ? outerRef.current : splitRef.current)?.getBoundingClientRect().width ??
        800;
      resizeDragRef.current = {
        target,
        startX: event.clientX,
        startNav: navWidth,
        startParams: paramsWidth,
        container,
      };
      dragFinalRef.current = { nav: navWidth, params: paramsWidth };
      setSplitResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [navWidth, paramsWidth],
  );

  const onResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    if (drag.target === "nav") {
      const total = drag.startNav + drag.startParams;
      const maxNav = Math.min(
        NAV_MAX,
        drag.container - (NAV_RESIZER + SPLIT_GAP + RESPONSE_MIN + PARAMS_MIN),
        total - PARAMS_MIN,
      );
      const rawNav = drag.startNav + dx;
      const nextNav = Math.max(
        NAV_MIN - RESIZE_OVERSHOOT,
        Math.min(maxNav + RESIZE_OVERSHOOT, rawNav),
      );
      const nextParams = total - nextNav;
      dragFinalRef.current = { nav: nextNav, params: nextParams };
      setNavWidth(nextNav);
      setParamsWidth(nextParams);
      setBlocked(
        rawNav < NAV_MIN - RESIZE_OVERSHOOT || rawNav > maxNav + RESIZE_OVERSHOOT ? "nav" : null,
      );
    } else {
      const maxParams = drag.container - SPLIT_GAP - RESPONSE_MIN;
      const rawParams = drag.startParams + dx;
      const nextParams = Math.max(
        PARAMS_MIN - RESIZE_OVERSHOOT,
        Math.min(maxParams + RESIZE_OVERSHOOT, rawParams),
      );
      dragFinalRef.current = { nav: drag.startNav, params: nextParams };
      setParamsWidth(nextParams);
      setBlocked(
        rawParams < PARAMS_MIN - RESIZE_OVERSHOOT || rawParams > maxParams + RESIZE_OVERSHOOT
          ? "split"
          : null,
      );
    }
  }, []);

  const endResize = useCallback(() => {
    const drag = resizeDragRef.current;
    const final = dragFinalRef.current;
    resizeDragRef.current = null;
    dragFinalRef.current = null;
    setSplitResizing(false);
    setBlocked(null);
    if (!drag || !final) return;
    if (drag.target === "nav") {
      const maxNav = Math.min(
        NAV_MAX,
        drag.container - (NAV_RESIZER + SPLIT_GAP + RESPONSE_MIN + PARAMS_MIN),
        drag.startNav + drag.startParams - PARAMS_MIN,
      );
      const finalNav = Math.max(NAV_MIN, Math.min(maxNav, final.nav));
      setNavWidth(finalNav);
      setParamsWidth(drag.startNav + drag.startParams - finalNav);
    } else {
      const maxParams = drag.container - SPLIT_GAP - RESPONSE_MIN;
      setParamsWidth(Math.max(PARAMS_MIN, Math.min(maxParams, final.params)));
    }
  }, []);

  return (
    <div ref={outerRef} className="flex h-full">
      <section
        className={cn(
          "pg-card min-h-0 shrink-0 transition-[width]",
          splitResizing && "transition-none",
        )}
        style={{
          width: navWidth,
          minWidth: NAV_MIN - RESIZE_OVERSHOOT,
          maxWidth: NAV_MAX + RESIZE_OVERSHOOT,
        }}
      >
        <div className="pg-card-head">
          <span>Tools</span>
        </div>
        <div className="min-h-0 flex-1">
          <ScrollArea>
            <div className="pb-3">
              <ToolSidebar
                active={activeName}
                readonly={readonly ?? false}
                onSelect={(name) => {
                  setActiveName(name);
                  setParamsText(JSON.stringify(getTool(name).sampleArgs ?? {}, null, 2));
                }}
              />
            </div>
          </ScrollArea>
        </div>
      </section>

      <div
        className={cn("pg-split-resizer", splitResizing && "pg-split-resizing")}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize tools panel"
        onPointerDown={startResize("nav")}
        onPointerMove={onResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      >
        <span className={cn("pg-split-handle", blocked === "nav" && "text-pg-danger")}>
          <Icon name="dash" size={24} />
        </span>
      </div>

      <div ref={splitRef} className="flex min-h-0 min-w-0 flex-1">
        <div
          className={cn(
            "flex min-h-0 shrink-0 flex-col gap-1.5 transition-[width]",
            splitResizing && "transition-none",
          )}
          style={{
            width: paramsWidth,
            minWidth: PARAMS_MIN - RESIZE_OVERSHOOT,
            maxWidth: `calc(100% - ${SPLIT_GAP + RESPONSE_MIN}px + ${RESIZE_OVERSHOOT}px)`,
          }}
        >
          <section className="pg-card min-h-0 flex-1">
            <div className="flex shrink-0 flex-col gap-1 border-b border-pg-border px-3.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-xs font-bold tracking-[0.3px] text-pg-muted">
                    {active.title}
                  </span>
                  <Badge tone={tone} className="text-[8px] px-1.5 py-0.5">
                    {active.write ? "WRITE" : active.category.toUpperCase()}
                  </Badge>
                  {writeBlocked && (
                    <Badge tone="read" className="text-[8px] px-1.5 py-0.5">
                      READ-ONLY
                    </Badge>
                  )}
                </div>
                <span className="flex shrink-0 items-center">
                  {running ? (
                    <Spinner />
                  ) : activeOutcome && activeOutcome.elapsedMs > 0 ? (
                    formatElapsed(activeOutcome.elapsedMs)
                  ) : (
                    ""
                  )}
                </span>
              </div>
              <span className="min-w-0 truncate text-[10px] font-medium text-pg-dim">
                {active.description}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <ParamsEditor
                key={activeName}
                value={paramsText}
                onChange={setParamsText}
                onRun={run}
                disabled={running}
              />
            </div>
          </section>
          <section className="pg-card shrink-0">
            <div className="flex gap-1.5 p-2">
              <Button
                variant="primary"
                className="pg-btn-adaptive min-w-0 flex-1"
                onClick={run}
                disabled={running || !isValid || writeBlocked}
              >
                <Icon name="solar:play-linear" size={14} />
                <span className="pg-btn-label">Execute</span>
              </Button>
              <Button className="pg-btn-adaptive min-w-0 flex-1" onClick={format}>
                <Icon name="solar:code-square-linear" size={14} />
                <span className="pg-btn-label">Format</span>
              </Button>
              <Button className="min-w-0 flex-1" onClick={clearParams}>
                <Icon name="solar:trash-bin-trash-linear" size={14} />
                <span className="pg-btn-label">Clear</span>
              </Button>
            </div>
          </section>
        </div>

        <div
          className={cn("pg-split-resizer", splitResizing && "pg-split-resizing")}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          onPointerDown={startResize("split")}
          onPointerMove={onResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        >
          <span className={cn("pg-split-handle", blocked === "split" && "text-pg-danger")}>
            <Icon name="dash" size={24} />
          </span>
        </div>

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 transition-[width]",
            splitResizing && "transition-none",
          )}
          style={{ minWidth: 0 }}
        >
          <section className="pg-card min-h-0 flex-1">
            <ResultViewer value={activeOutcome?.result} error={activeOutcome?.error ?? null} />
          </section>
          <section className="pg-card shrink-0">
            <div className="flex items-center justify-between gap-1.5 p-2">
              <span className="flex h-8 items-center gap-1.5 rounded-lg border border-pg-border px-3 font-pg-mono text-[11px] text-pg-dim">
                {lines} lines, {formatBytes(bytes)}
              </span>
              <Button onClick={clearAll} className="min-w-0 enabled:hover:text-pg-primary">
                <Icon name="solar:trash-bin-trash-linear" size={14} />
                <span className="pg-btn-label">Clear</span>
              </Button>
            </div>
          </section>
        </div>
      </div>
      <ConfirmDialog
        open={riskConfirm.open}
        title={riskConfirm.title}
        message={riskConfirm.message}
        icon="solar:danger-triangle-bold"
        confirmLabel="Confirm"
        tone="danger"
        loading={riskConfirm.confirming}
        onConfirm={riskConfirm.confirm}
        onCancel={riskConfirm.cancel}
      />
    </div>
  );
}
