import { useEffect, useRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";
import { Icon } from "./Icon.js";

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  indeterminate?: boolean;
}

export function Checkbox({ indeterminate, className, ...props }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  return (
    <label className={cn("pg-checkbox", className)}>
      <input ref={ref} type="checkbox" className="pg-checkbox-input" {...props} />
      <span className="pg-checkbox-box" aria-hidden="true">
        <Icon name="jam:check" size={12} className="pg-checkbox-check" />
        <Icon name="jam:minus" size={12} className="pg-checkbox-minus" />
      </span>
    </label>
  );
}
