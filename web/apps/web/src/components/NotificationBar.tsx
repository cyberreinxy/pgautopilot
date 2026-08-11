import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "@pgautopilot/ui";
import { cn } from "../lib/cn";

export type NotificationTone = "info" | "warning" | "danger";

interface NotificationBarProps {
  visible: boolean;
  onClose: () => void;
  message: string;
  tone?: NotificationTone;
}

const TONES: Record<NotificationTone, string> = {
  info: "text-pg-primary",
  warning: "text-pg-warning",
  danger: "text-pg-danger",
};

export function NotificationBar({
  visible,
  onClose,
  message,
  tone = "info",
}: NotificationBarProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [copies, setCopies] = useState(2);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const measure = measureRef.current;
    if (!viewport || !measure) return;
    const update = () => {
      const viewportWidth = viewport.clientWidth;
      const messageWidth = measure.offsetWidth;
      if (messageWidth <= 0) return;
      setCopies(Math.max(2, Math.ceil(viewportWidth / messageWidth) + 1));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [message]);

  const marqueeStyle = { "--marquee-copies": copies } as CSSProperties;

  return (
    <div
      className={cn(
        "group grid shrink-0 overflow-hidden transition-[grid-template-rows] duration-300 ease-pg-out",
        visible
          ? "mb-1.5 grid-rows-[1fr] rounded-[10px] border border-pg-border bg-pg-surface shadow-pg-sm"
          : "grid-rows-[0fr]",
      )}
      aria-hidden={!visible}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="flex h-8 items-stretch font-pg-mono text-xs">
          <span
            className={cn(
              "flex w-8 shrink-0 items-center justify-center border-r border-pg-border",
              TONES[tone],
            )}
          >
            <Icon
              name={tone === "danger" ? "solar:close-circle-bold" : "solar:info-circle-bold"}
              size={16}
            />
          </span>
          <div ref={viewportRef} className="relative min-w-0 flex-1 overflow-hidden">
            <span
              ref={measureRef}
              aria-hidden="true"
              className="invisible absolute whitespace-nowrap"
            >
              {message}
            </span>
            <div
              style={marqueeStyle}
              className="pg-notice-marquee flex h-full w-max items-center whitespace-nowrap group-hover:[animation-play-state:paused]"
            >
              {Array.from({ length: copies }, (_, index) => (
                <span key={index} className={cn("px-3", TONES[tone])} aria-hidden={index > 0}>
                  {message}
                </span>
              ))}
            </div>
          </div>
          <span className="flex w-8 shrink-0 items-center justify-center border-l border-pg-border text-pg-dim">
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={onClose}
              className="flex cursor-pointer items-center justify-center transition-colors hover:text-pg-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pg-primary/30"
            >
              <Icon name="iconamoon:close-fill" size={18} />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
