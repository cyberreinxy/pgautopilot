import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

interface UseColumnResizeOptions {
  initial: number;
  min: number;
  max: number | ((container: number) => number);
  overshoot?: number;
}

export function useColumnResize(options: UseColumnResizeOptions) {
  const { min, max, overshoot = 40 } = options;
  const [width, setWidth] = useState(options.initial);
  const [resizing, setResizing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number; container: number } | null>(null);
  const dragFinalRef = useRef<number | null>(null);

  const maxFor = useCallback(
    (container: number) => (typeof max === "function" ? max(container) : max),
    [max],
  );

  const start = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = containerRef.current?.getBoundingClientRect().width ?? 800;
      dragRef.current = { startX: event.clientX, startWidth: width, container };
      dragFinalRef.current = width;
      setResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width],
  );

  const move = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const raw = drag.startWidth + (event.clientX - drag.startX);
      const max = maxFor(drag.container);
      const next = Math.max(min - overshoot, Math.min(max + overshoot, raw));
      dragFinalRef.current = next;
      setWidth(next);
      setBlocked(raw < min - overshoot || raw > max + overshoot);
    },
    [min, overshoot, maxFor],
  );

  const end = useCallback(() => {
    const drag = dragRef.current;
    const final = dragFinalRef.current;
    dragRef.current = null;
    dragFinalRef.current = null;
    setResizing(false);
    setBlocked(false);
    if (!drag || final === null) return;
    setWidth(Math.max(min, Math.min(maxFor(drag.container), final)));
  }, [min, maxFor]);

  return { containerRef, width, setWidth, resizing, blocked, start, move, end };
}
