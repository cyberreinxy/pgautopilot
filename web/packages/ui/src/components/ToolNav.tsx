import { Icon } from "./Icon.js";
import { cn } from "../lib/cn.js";

export interface ToolNavItem {
  key: string;
  label: string;
  badge?: string;
  icon?: string;
  disabled?: boolean;
}

export interface ToolNavGroup {
  title: string;
  items: ToolNavItem[];
  tone?: "read" | "write" | "maint";
}

interface ToolNavProps {
  groups: ToolNavGroup[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}

export function ToolNav({ groups, activeKey, onSelect }: ToolNavProps) {
  return (
    <div>
      {groups.map((group) => (
        <div key={group.title}>
          <div
            className={cn(
              "pg-nav-section-header",
              group.tone === "read" && "pg-nav-section-header-read",
              group.tone === "write" && "pg-nav-section-header-write",
              group.tone === "maint" && "pg-nav-section-header-maint",
            )}
          >
            {group.title}
          </div>
          {group.items.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              className={cn("pg-nav-item", activeKey === item.key && "pg-nav-item-active")}
              onClick={() => onSelect(item.key)}
            >
              {item.icon && (
                <span className="pg-nav-icon">
                  <Icon name={item.icon} size={18} />
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="pg-nav-label">{item.label}</span>
                {item.badge && <span className="pg-nav-badge">{item.badge}</span>}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
