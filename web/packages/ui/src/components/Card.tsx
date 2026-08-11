import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

interface CardProps {
  title?: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, hint, actions, children, className }: CardProps) {
  return (
    <section className={cn("pg-card", className)}>
      {(title || actions) && (
        <div className="pg-card-head">
          <div>
            {title && <span>{title}</span>}
            {hint && <span style={{ marginLeft: 8, color: "var(--color-pg-dim)" }}>{hint}</span>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
