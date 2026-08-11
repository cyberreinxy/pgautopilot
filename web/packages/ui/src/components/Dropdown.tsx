import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn.js";

export interface DropdownItem {
  key: string;
  label: string;
}

type DropdownPlacement = "bottom" | "top" | "auto";

interface DropdownProps {
  items: DropdownItem[];
  selected: string | null;
  onSelect: (key: string) => void;
  children: ReactNode;
  align?: "left" | "right";
  placement?: DropdownPlacement;
  menuClassName?: string;
}

export type { DropdownPlacement };

interface MenuRect {
  top: number;
  left: number;
  right: number;
  width: number;
}

export function Dropdown({
  items,
  selected,
  onSelect,
  children,
  align = "right",
  placement = "auto",
  menuClassName,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<MenuRect | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = (): void => {
    const trigger = triggerRef.current;
    if (!trigger) {
      setOpen(true);
      return;
    }
    const bounds = trigger.getBoundingClientRect();
    const estimate = items.length * 36 + 12;
    const spaceBelow = window.innerHeight - bounds.bottom;
    const spaceAbove = bounds.top;
    const opensUp =
      placement === "top" ||
      (placement === "auto" && spaceBelow < estimate && spaceAbove >= estimate);
    const top = opensUp ? Math.max(4, bounds.top - estimate) : bounds.bottom + 4;
    setRect({ top, left: bounds.left, right: bounds.right, width: bounds.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const menu =
    open && rect ? (
      <div
        ref={menuRef}
        className={cn("pg-dropdown", menuClassName)}
        style={{
          position: "fixed",
          top: rect.top,
          ...(align === "right" ? { right: window.innerWidth - rect.right } : { left: rect.left }),
          minWidth: Math.max(140, rect.width),
        }}
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={cn("pg-dropdown-item", selected === item.key && "pg-dropdown-item-active")}
            onClick={() => {
              onSelect(item.key);
              setOpen(false);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <>
      <div ref={triggerRef} className="relative">
        <div onClick={open ? () => setOpen(false) : openMenu}>{children}</div>
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}
