import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";
import { cn } from "../lib/cn.js";

export type ConfirmTone = "default" | "danger" | "primary";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  icon?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const EXIT_MS = 160;
const GRACE_MS = 1000;

export function ConfirmDialog({
  open,
  title,
  message,
  icon = "solar:info-circle-linear",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [pending, setPending] = useState(false);
  const graceTimerRef = useRef<number | null>(null);
  const busy = loading || pending;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const timer = window.setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, EXIT_MS);
      return () => window.clearTimeout(timer);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!open) {
      if (graceTimerRef.current !== null) window.clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
      setPending(false);
    }
    return () => {
      if (graceTimerRef.current !== null) window.clearTimeout(graceTimerRef.current);
    };
  }, [open]);

  const handleCancel = useCallback(() => {
    if (graceTimerRef.current !== null) window.clearTimeout(graceTimerRef.current);
    graceTimerRef.current = null;
    setPending(false);
    onCancel();
  }, [onCancel]);

  const handleConfirm = () => {
    if (busy) return;
    setPending(true);
    graceTimerRef.current = window.setTimeout(() => {
      graceTimerRef.current = null;
      setPending(false);
      onConfirm();
    }, GRACE_MS);
  };

  useEffect(() => {
    if (!open || closing) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) handleCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closing, busy, handleCancel]);

  if (!mounted) return null;

  return (
    <div
      className={cn("pg-modal-overlay", closing && "pg-modal-overlay-closing")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) handleCancel();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("pg-modal outline-none", closing && "pg-modal-closing")}
      >
        <div className="flex items-center gap-3">
          <Icon
            name={icon}
            size={22}
            className={cn(
              busy && "opacity-40",
              tone === "danger" && "text-pg-danger",
              tone === "primary" && "text-pg-primary",
              tone === "default" && "text-pg-muted",
            )}
          />
          <h2 className="m-0 text-[15px] font-semibold text-pg-text">{title}</h2>
        </div>
        <div className="mt-1.5 text-[13px] leading-5 text-pg-muted">{message}</div>
        <div className="mt-5 flex items-stretch gap-2">
          <Button size="sm" className="min-h-9 flex-1" onClick={handleCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            className="min-h-9 flex-1"
            variant={tone === "danger" ? "danger" : tone === "primary" ? "primary" : "default"}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? <Icon name="spinner" size={18} /> : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
