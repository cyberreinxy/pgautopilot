import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, ConfirmDialog, Icon, Spinner } from "@pgautopilot/ui";
import { format as formatSql } from "@sqltools/formatter";
import { cn } from "../lib/cn";
import { classifySqlRisk, riskTitle, riskWarning } from "../lib/risk";
import { useRiskConfirm } from "../features/risk/useRiskConfirm";
import { useExecuteTool } from "../features/tools/hooks/useExecuteTool";
import { useReadonly } from "../features/readonly/readonly-context";
import { SqlEditor } from "../features/sql/components/SqlEditor";
import { ResultViewer } from "../features/tools/components/ResultViewer";
import { useToast } from "../lib/toast";
import { formatBytes, formatElapsed } from "../lib/format";

const EDITOR_MIN = 400;
const RESULT_MIN = 320;
const SPLIT_GAP = 6;
const RESIZE_OVERSHOOT = 40;

const WRITE_KW_RE =
  /\b(CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|GRANT|REVOKE|REPLACE|MERGE|VACUUM|REINDEX|COPY)\b/i;

function looksLikeWrite(sql: string): boolean {
  return WRITE_KW_RE.test(sql);
}

export function SqlEditorPage() {
  const [searchParams] = useSearchParams();
  const [sql, setSql] = useState(() => searchParams.get("sql") ?? "");
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [editorWidth, setEditorWidth] = useState(550);
  const [splitResizing, setSplitResizing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number; container: number } | null>(null);
  const dragFinalRef = useRef<number | null>(null);
  const { running, result, error, elapsedMs, execute, clear } = useExecuteTool();
  const readonly = useReadonly();
  const { showToast } = useToast();
  const riskConfirm = useRiskConfirm();

  const resultText = error
    ? ""
    : result == null
      ? ""
      : typeof result === "string"
        ? result
        : JSON.stringify(result, null, 2);
  const lines = resultText ? resultText.split("\n").length : 0;
  const bytes = resultText ? new Blob([resultText]).size : 0;
  const canEdit = sql.trim().length > 0;
  const writeBlocked = readonly && looksLikeWrite(sql);

  const format = () => {
    let next: string | null = null;
    try {
      next = formatSql(sql, { language: "sql", indent: "  " });
    } catch {
      next = null;
    }
    if (next !== null) {
      setSql(next);
      showToast("SQL formatted successfully", "success");
    } else {
      showToast("Invalid SQL — could not format", "error");
    }
  };

  const runQuery = async (confirmed = false) => {
    try {
      if (readonly && looksLikeWrite(sql)) {
        throw new Error(
          "Server is in READ-ONLY mode. Write/Script statements are blocked. Toggle off read-only in Settings to run this.",
        );
      }
      const outcome = await execute("db_run_script", {
        sql,
        ...(confirmed ? { confirmed: true } : {}),
      });
      if (outcome.warnings.length > 0) {
        showToast(outcome.warnings.join(" · "), "warning");
      } else {
        showToast(
          outcome.error ? "Query failed" : "Query executed successfully",
          outcome.error ? "error" : "success",
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Query failed to run", "error");
    }
  };

  const run = () => {
    const kind = classifySqlRisk(sql);
    if (kind) {
      riskConfirm.request({
        title: riskTitle(kind),
        message: <span>{riskWarning(kind)}</span>,
        action: () => runQuery(true),
      });
      return;
    }
    void runQuery();
  };

  const clearSql = () => setSql("");

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = splitRef.current?.getBoundingClientRect().width ?? 800;
      dragRef.current = { startX: event.clientX, startWidth: editorWidth, container };
      dragFinalRef.current = editorWidth;
      setSplitResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [editorWidth],
  );

  const onResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const maxEditor = drag.container - SPLIT_GAP - RESULT_MIN;
    const raw = drag.startWidth + (event.clientX - drag.startX);
    const next = Math.max(
      EDITOR_MIN - RESIZE_OVERSHOOT,
      Math.min(maxEditor + RESIZE_OVERSHOOT, raw),
    );
    dragFinalRef.current = next;
    setEditorWidth(next);
    setBlocked(raw < EDITOR_MIN - RESIZE_OVERSHOOT || raw > maxEditor + RESIZE_OVERSHOOT);
  }, []);

  const endResize = useCallback(() => {
    const drag = dragRef.current;
    const final = dragFinalRef.current;
    dragRef.current = null;
    dragFinalRef.current = null;
    setSplitResizing(false);
    setBlocked(false);
    if (!drag || final === null) return;
    const maxEditor = drag.container - SPLIT_GAP - RESULT_MIN;
    setEditorWidth(Math.max(EDITOR_MIN, Math.min(maxEditor, final)));
  }, []);

  return (
    <div ref={splitRef} className="flex h-full min-w-0">
      <div
        className={cn(
          "flex min-h-0 shrink-0 flex-col gap-1.5 transition-[width]",
          splitResizing && "transition-none",
        )}
        style={{
          width: editorWidth,
          minWidth: EDITOR_MIN - RESIZE_OVERSHOOT,
          maxWidth: `calc(100% - ${SPLIT_GAP + RESULT_MIN}px + ${RESIZE_OVERSHOOT}px)`,
        }}
      >
        <section className="pg-card min-h-0 flex-1">
          <div className="flex shrink-0 flex-col gap-1 border-b border-pg-border px-3.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xs font-bold tracking-[0.3px] text-pg-muted">
                  SQL Editor
                </span>
                <Badge tone="write" className="text-[8px] px-1.5 py-0.5">
                  QUERY
                </Badge>
                {readonly ? (
                  <Badge tone="read" className="text-[8px] px-1.5 py-0.5">
                    READ-ONLY
                  </Badge>
                ) : null}
              </div>
              <span className="flex shrink-0 items-center">
                {running ? <Spinner /> : elapsedMs > 0 ? formatElapsed(elapsedMs) : ""}
              </span>
            </div>
            <span className="min-w-0 truncate text-[10px] font-medium text-pg-dim">
              Run a query or script (transaction-safe, read-only by default)
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <SqlEditor
              value={sql}
              onChange={setSql}
              showLineNumbers={showLineNumbers}
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
              disabled={running || !canEdit || writeBlocked}
            >
              <Icon name="solar:play-linear" size={14} />
              <span className="pg-btn-label">Execute</span>
            </Button>
            <Button className="pg-btn-adaptive min-w-0 flex-1" onClick={format} disabled={!canEdit}>
              <Icon name="solar:magic-stick-3-linear" size={14} />
              <span className="pg-btn-label">Format</span>
            </Button>
            <Button
              className="pg-btn-adaptive min-w-0 flex-1"
              onClick={() => setShowLineNumbers((value) => !value)}
            >
              <Icon name="solar:list-linear" size={14} />
              <span className="pg-btn-label">{showLineNumbers ? "Lines" : "No lines"}</span>
            </Button>
            <Button className="min-w-0 flex-1" onClick={clearSql} disabled={!canEdit}>
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
        aria-label="Resize SQL editor"
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
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 transition-[width]",
          splitResizing && "transition-none",
        )}
        style={{ minWidth: 0 }}
      >
        <section className="pg-card min-h-0 flex-1">
          <ResultViewer
            value={result ?? undefined}
            error={error}
            emptyText="Run a query to see results."
          />
        </section>
        <section className="pg-card shrink-0">
          <div className="flex items-center justify-between gap-1.5 p-2">
            <span className="flex h-8 items-center gap-1.5 rounded-lg border border-pg-border px-3 font-pg-mono text-[11px] text-pg-dim">
              {lines} lines, {formatBytes(bytes)}
            </span>
            <Button onClick={clear} className="min-w-0 enabled:hover:text-pg-primary">
              <Icon name="solar:trash-bin-trash-linear" size={14} />
              <span className="pg-btn-label">Clear</span>
            </Button>
          </div>
        </section>
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
