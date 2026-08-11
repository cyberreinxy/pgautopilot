import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Icon } from "./Icon.js";
import { ScrollArea } from "./ScrollArea.js";
import { cn } from "../lib/cn.js";

const DEFAULT_WIDTH = 180;
const MIN_WIDTH = 180;
const MAX_WIDTH = 200;
const COLLAPSED_WIDTH = 50;
const LABEL_BREAKPOINT = 90;

interface SidebarProps {
  children: ReactNode;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  footer?: ReactNode;
}

export function Sidebar({
  children,
  collapsed,
  onToggleCollapsed,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
  footer,
}: SidebarProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const dragWidthRef = useRef<number | null>(null);

  const dragging = dragWidth !== null;
  const displayWidth = dragging ? dragWidth : collapsed ? COLLAPSED_WIDTH : width;
  const showLabels = displayWidth >= LABEL_BREAKPOINT;
  const visuallyCollapsed = dragging ? displayWidth < LABEL_BREAKPOINT : collapsed;
  const collapseThreshold = Math.round((minWidth + LABEL_BREAKPOINT) / 2);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const startWidth = collapsed ? COLLAPSED_WIDTH : width;
      dragRef.current = { startX: event.clientX, startWidth };
      dragWidthRef.current = startWidth;
      setDragWidth(startWidth);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [collapsed, width],
  );

  const onResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = drag.startWidth + (event.clientX - drag.startX);
      const clamped = Math.max(COLLAPSED_WIDTH, Math.min(maxWidth + 40, next));
      dragWidthRef.current = clamped;
      setDragWidth(clamped);
      setBlocked(next < COLLAPSED_WIDTH || next > maxWidth + 40);
    },
    [maxWidth],
  );

  const endResize = useCallback(() => {
    const finalWidth = dragWidthRef.current;
    dragRef.current = null;
    dragWidthRef.current = null;
    setDragWidth(null);
    setBlocked(false);
    if (finalWidth === null) return;
    if (finalWidth < collapseThreshold) {
      if (!collapsed) onToggleCollapsed();
      return;
    }
    setWidth(Math.min(maxWidth, Math.max(minWidth, finalWidth)));
    if (collapsed) onToggleCollapsed();
  }, [collapseThreshold, collapsed, maxWidth, minWidth, onToggleCollapsed]);

  return (
    <>
      <aside
        className={cn(
          "pg-sidebar",
          visuallyCollapsed && "pg-sidebar-collapsed",
          !showLabels && "pg-sidebar-no-labels",
          dragging && "pg-sidebar-resizing",
        )}
        style={{ width: displayWidth }}
      >
        <section className="pg-card min-h-0 flex-1">
          <div className={cn("pg-card-head", visuallyCollapsed && "justify-center px-0")}>
            <span className="flex min-w-0 items-center gap-2">
              <Icon name="solar:siderbar-bold" size={24} className="shrink-0 text-pg-muted" />
              <span className="pg-nav-label">Navigation</span>
            </span>
          </div>
          {children}
          <div className={cn("shrink-0 pt-1", visuallyCollapsed ? "px-1" : "px-2")}>
            <button
              type="button"
              className="pg-nav-item"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={onToggleCollapsed}
            >
              <span className="pg-nav-icon">
                <Icon name="solar:siderbar-linear" size={18} />
              </span>
              <span className="pg-nav-label">{collapsed ? "Expand" : "Collapse"}</span>
            </button>
          </div>
          <div className={cn("shrink-0", visuallyCollapsed ? "px-1" : "px-2")}>{footer}</div>
        </section>
      </aside>
      <div
        className={cn("pg-split-resizer", dragging && "pg-split-resizing")}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={startResize}
        onPointerMove={onResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      >
        <span className={cn("pg-split-handle", blocked && "text-pg-danger")}>
          <Icon name="dash" size={24} />
        </span>
      </div>
    </>
  );
}

interface SidebarNavProps {
  children: ReactNode;
}

export function SidebarNav({ children }: SidebarNavProps) {
  return (
    <nav className="pg-sidebar-nav">
      <ScrollArea>{children}</ScrollArea>
    </nav>
  );
}
