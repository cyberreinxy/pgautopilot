import { cn } from "../lib/cn.js";

export type BadgeTone = "read" | "write" | "maint";

interface BadgeProps {
  tone: BadgeTone;
  children: string;
  className?: string;
}

export function Badge({ tone, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "pg-badge",
        tone === "read" && "pg-badge-read",
        tone === "write" && "pg-badge-write",
        tone === "maint" && "pg-badge-maint",
        className,
      )}
    >
      {children}
    </span>
  );
}
