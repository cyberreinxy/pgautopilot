import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export type ButtonVariant = "default" | "primary" | "danger";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "default", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "pg-btn",
        variant === "primary" && "pg-btn-primary",
        variant === "danger" && "pg-btn-danger",
        size === "sm" && "pg-btn-sm",
        className,
      )}
      {...props}
    />
  );
}
