import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Badge, Button, Checkbox, ConfirmDialog, Icon, Spinner } from "@pgautopilot/ui";
import type { MigrationEntry } from "@pgautopilot/contracts";
import { cn } from "../lib/cn";
import { useMigrations } from "../features/migrations/hooks/useMigrations";
import { useMigrationContent } from "../features/migrations/hooks/useMigrationContent";
import { useReadonly } from "../features/readonly/readonly-context";
import { useRiskConfirm } from "../features/risk/useRiskConfirm";
import { RefreshButton } from "../components/RefreshButton";
import { CodeEditor } from "../components/CodeEditor";
import { highlightSql } from "../lib/sqlHighlight";
import { SnapshotsPanel } from "../features/snapshots/components/SnapshotsPanel";

const LIST_MIN = 400;
const DETAIL_MIN = 320;
const SPLIT_GAP = 6;
const RESIZE_OVERSHOOT = 40;

function copyText(text: string): void {
  void navigator.clipboard.writeText(text);
}

export function MigrationsPage() {
  const readonly = useReadonly();
  const {
    loading,
    migrations,
    applying,
    error,
    selected,
    refresh,
    apply,
    toggleSelection,
    selectAll,
    clearSelection,
    applySelected,
    applyOne,
    revert,
  } = useMigrations();
  const riskConfirm = useRiskConfirm();
  const [listWidth, setListWidth] = useState(550);
  const [splitResizing, setSplitResizing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number; container: number } | null>(null);
  const dragFinalRef = useRef<number | null>(null);

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const appliedCount = migrations.filter((m) => m.appliedAt !== null).length;
  const pending = migrations.filter((m) => m.appliedAt === null);
  const allPendingSelected = pending.length > 0 && pending.every((m) => selected.has(m.version));

  const selectedMigration = migrations.find((m) => m.version === selectedVersion) ?? null;
  const {
    content: migrationContent,
    loading: loadingMigration,
    error: migrationError,
  } = useMigrationContent(selectedVersion);

  const confirmApply = (count: number, action: () => void | Promise<void>) => {
    riskConfirm.request({
      title: "Confirm migration",
      message: `Apply ${count} migration${count === 1 ? "" : "s"} to the database? Apply can include schema or data changes and is not automatically reversible.`,
      action,
    });
  };

  const confirmRerun = (migration: MigrationEntry, action: () => void | Promise<void>) => {
    const downFile = migration.file.replace(/\.sql$/, ".down.sql");
    riskConfirm.request({
      title: migration.hasDown
        ? "Confirm rerun (revert & re-apply)"
        : "Confirm rerun (reset & re-apply)",
      message: migration.hasDown
        ? `Rerun "${migration.name}": revert it with its down migration, then re-apply it? This can modify or remove tables and data.`
        : `No "${downFile}" file exists. This will reset "${migration.file}" and re-run it as-is without undoing prior changes, which can fail or duplicate data if it is not idempotent. Add a ${downFile} file to revert safely.`,
      action,
    });
  };

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = splitRef.current?.getBoundingClientRect().width ?? 1000;
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
    const maxList = drag.container - SPLIT_GAP - DETAIL_MIN;
    const raw = drag.startWidth + (event.clientX - drag.startX);
    const next = Math.max(LIST_MIN - RESIZE_OVERSHOOT, Math.min(maxList + RESIZE_OVERSHOOT, raw));
    dragFinalRef.current = next;
    setListWidth(next);
    setBlocked(raw < LIST_MIN - RESIZE_OVERSHOOT || raw > maxList + RESIZE_OVERSHOOT);
  }, []);

  const endResize = useCallback(() => {
    const drag = dragRef.current;
    const final = dragFinalRef.current;
    dragRef.current = null;
    dragFinalRef.current = null;
    setSplitResizing(false);
    setBlocked(false);
    if (!drag || final === null) return;
    const maxList = drag.container - SPLIT_GAP - DETAIL_MIN;
    setListWidth(Math.max(LIST_MIN, Math.min(maxList, final)));
  }, []);

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
          maxWidth: `calc(100% - ${SPLIT_GAP + DETAIL_MIN}px + ${RESIZE_OVERSHOOT}px)`,
        }}
      >
        <section className="pg-card min-h-0 flex-1">
          <div className="pg-card-head">
            <span className="flex items-center gap-2">
              Migrations
              {readonly && (
                <Badge tone="read" className="px-1.5 py-0.5 text-[8px]">
                  READ-ONLY
                </Badge>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {loading ? (
                <Spinner />
              ) : (
                <span className="text-pg-dim">
                  {appliedCount}/{migrations.length}
                </span>
              )}
              <RefreshButton onClick={refresh} loading={loading} disabled={applying} />
            </span>
          </div>
          <div className="min-h-0 flex-1">
            {error ? (
              <div className="border-b border-pg-border bg-pg-danger-light/50 px-3.5 py-2 text-xs text-pg-danger">
                {error}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {migrations.length === 0 && !loading ? (
                <div className="px-3.5 py-10 text-center text-xs text-pg-dim">
                  No migrations found. Drop versioned{" "}
                  <span className="font-pg-mono">NNNN_name.sql</span> files into the migrations
                  directory.
                </div>
              ) : (
                <div className="p-1.5">
                  {migrations.map((migration) => {
                    const isApplied = migration.appliedAt !== null;
                    const isPending = !isApplied;
                    const isSelected = selected.has(migration.version);
                    const isViewed = selectedVersion === migration.version;
                    return (
                      <div
                        key={migration.version}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-100 ease-pg-out hover:bg-pg-surface-2",
                          isViewed && "bg-pg-surface-2",
                        )}
                        onClick={() => {
                          setSelectedVersion((prev) =>
                            prev === migration.version ? null : migration.version,
                          );
                        }}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={isApplied || readonly}
                          onChange={(event) => {
                            event.stopPropagation();
                            toggleSelection(migration.version);
                          }}
                          className="shrink-0"
                        />
                        <span
                          className={cn(
                            "flex size-[34px] shrink-0 items-center justify-center rounded-lg",
                            isViewed ? "bg-pg-primary-light" : "bg-pg-surface-2",
                          )}
                        >
                          <Icon
                            name={isViewed ? "solar:file-bold" : "solar:file-linear"}
                            size={16}
                            className={isApplied ? "text-pg-accent" : "text-pg-dim"}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-pg-text">
                            {migration.name}
                          </span>
                          <span className="block truncate font-pg-mono text-[10px] text-pg-dim">
                            {migration.file}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <Badge tone={isApplied ? "read" : "maint"}>
                            {isApplied ? "Applied" : "Pending"}
                          </Badge>
                          {isApplied && !readonly ? (
                            <Button
                              variant="default"
                              size="sm"
                              title={
                                migration.hasDown
                                  ? "Reruns this migration: reverts it with its down file, then re-applies it."
                                  : `No down file — resets and re-runs ${migration.file} as-is. Add ${migration.file.replace(/\.sql$/, ".down.sql")} to revert safely.`
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                confirmRerun(migration, () =>
                                  revert(migration.version, !migration.hasDown),
                                );
                              }}
                              disabled={applying}
                              className="h-7 px-2 text-[11px]"
                            >
                              <span className="flex size-4 shrink-0 items-center justify-center">
                                {applying && selectedVersion === migration.version ? (
                                  <Spinner size={14} />
                                ) : (
                                  <Icon name="solar:restart-linear" size={12} />
                                )}
                              </span>
                              <span className="pg-btn-label">Rerun</span>
                            </Button>
                          ) : null}
                          {isPending ? (
                            <Button
                              variant="default"
                              size="sm"
                              title="Apply this migration"
                              onClick={(event) => {
                                event.stopPropagation();
                                confirmApply(1, () => applyOne(migration.version));
                              }}
                              disabled={applying || readonly}
                              className="h-7 px-2 text-[11px]"
                            >
                              <Icon
                                name="fluent:text-arrow-down-right-column-24-regular"
                                size={12}
                              />
                            </Button>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="pg-card shrink-0">
          <div className="flex gap-1.5 p-2">
            {pending.length > 0 && !readonly ? (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={allPendingSelected ? clearSelection : selectAll}
                  disabled={applying}
                  className="pg-btn-adaptive min-w-0 flex-1"
                >
                  {allPendingSelected ? "Deselect all" : `Select all (${pending.length})`}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => confirmApply(selected.size, applySelected)}
                  disabled={applying || selected.size === 0}
                  className="pg-btn-adaptive min-w-0 flex-1"
                >
                  <Icon name="fluent:text-arrow-down-right-column-24-regular" size={14} />
                  <span className="pg-btn-label">Apply selected ({selected.size})</span>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => confirmApply(pending.length, apply)}
                  disabled={applying || pending.length === 0}
                  className="pg-btn-adaptive min-w-0 flex-1"
                >
                  <Icon name="fluent:text-arrow-down-right-column-24-regular" size={14} />
                  <span className="pg-btn-label">Apply pending</span>
                </Button>
              </>
            ) : readonly ? (
              <span className="flex h-7 items-center text-[11px] text-pg-dim">
                Read-only — apply disabled
              </span>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => confirmApply(pending.length, apply)}
                disabled={applying || pending.length === 0}
                className="min-w-0 flex-1"
              >
                <Icon name="fluent:text-arrow-down-right-column-24-regular" size={14} />
                <span className="pg-btn-label">Apply pending</span>
              </Button>
            )}
          </div>
        </section>
      </div>

      <div
        className={cn("pg-split-resizer", splitResizing && "pg-split-resizing")}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize migrations list"
        onPointerDown={startResize}
        onPointerMove={onResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      >
        <span className={cn("pg-split-handle", blocked && "text-pg-danger")}>
          <Icon name="dash" size={24} />
        </span>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
        <section className="pg-card min-h-0 flex-1">
          <div className="flex shrink-0 flex-col gap-1 border-b border-pg-border px-3.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xs font-bold tracking-[0.3px] text-pg-muted">
                  Migration
                </span>
                {selectedMigration ? (
                  <Badge
                    tone={selectedMigration.appliedAt ? "read" : "maint"}
                    className="text-[8px] px-1.5 py-0.5"
                  >
                    {selectedMigration.appliedAt ? "APPLIED" : "PENDING"}
                  </Badge>
                ) : null}
                {readonly ? (
                  <Badge tone="read" className="text-[8px] px-1.5 py-0.5">
                    READ-ONLY
                  </Badge>
                ) : null}
              </div>
              <span className="flex shrink-0 items-center gap-1">
                {loadingMigration ? <Spinner size={14} /> : null}
                {selectedMigration && migrationContent ? (
                  <>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[10px] enabled:hover:text-pg-primary"
                      onClick={() => copyText(migrationContent.content)}
                      title="Copy migration SQL"
                    >
                      <Icon name="solar:copy-linear" size={12} />
                    </Button>
                  </>
                ) : null}
              </span>
            </div>
            <span className="min-w-0 truncate text-[10px] font-medium text-pg-dim">
              {selectedMigration
                ? `${selectedMigration.name} · ${selectedMigration.file}`
                : "Select a migration from the list to inspect its SQL."}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            {migrationError ? (
              <div className="px-3.5 py-8 text-center text-xs text-pg-danger">{migrationError}</div>
            ) : selectedMigration === null ? (
              <div className="px-3.5 py-10 text-center text-xs text-pg-dim">
                Select a migration to preview its SQL.
              </div>
            ) : migrationContent === null ? (
              <div className="px-3.5 py-10 text-center text-xs text-pg-dim">
                {loadingMigration ? "Loading migration…" : "No content available."}
              </div>
            ) : (
              <CodeEditor
                key={selectedMigration.version}
                value={migrationContent.content}
                onChange={() => undefined}
                highlight={highlightSql}
                showLineNumbers
              />
            )}
          </div>
        </section>

        <div className="flex h-[220px] min-h-0 shrink-0">
          <SnapshotsPanel />
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
