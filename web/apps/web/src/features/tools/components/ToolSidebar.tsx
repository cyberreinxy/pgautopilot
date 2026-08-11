import { ToolNav } from "@pgautopilot/ui";
import type { ToolNavGroup } from "@pgautopilot/ui";
import type { ToolName } from "@pgautopilot/contracts";
import { getToolGroups, getTool } from "../hooks/useTools";

const TOOL_ICONS: Record<string, string> = {
  db_overview: "solar:widget-linear",
  db_schema: "solar:database-linear",
  db_health: "solar:bolt-linear",
  db_table_info: "solar:list-linear",
  db_find_many: "solar:magnifer-linear",
  db_find_first: "solar:bookmark-linear",
  db_count: "solar:hashtag-linear",
  db_aggregate: "solar:chart-square-linear",
  db_raw_query: "solar:code-linear",
  db_run_script: "solar:code-square-linear",
  db_create: "solar:add-circle-linear",
  db_upsert: "solar:refresh-linear",
  db_update_many: "solar:pen-new-square-linear",
  db_delete_many: "solar:trash-bin-trash-linear",
  db_backup: "solar:download-minimalistic-linear",
};

const TONE_BY_TITLE: Record<string, "read" | "write" | "maint"> = {
  Read: "read",
  Write: "write",
  Maintenance: "maint",
};

const GROUPS: ToolNavGroup[] = getToolGroups().map((group) => ({
  title: group.title,
  items: group.tools.map((tool) => ({
    key: tool.name,
    label: tool.title,
    badge: tool.name,
    icon: TOOL_ICONS[tool.name],
  })),
  tone: TONE_BY_TITLE[group.title],
}));

interface ToolSidebarProps {
  active: ToolName | null;
  onSelect: (name: ToolName) => void;
  readonly?: boolean;
}

export function ToolSidebar({ active, onSelect, readonly = false }: ToolSidebarProps) {
  const groups: ToolNavGroup[] = readonly
    ? GROUPS.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          disabled: getTool(item.key as ToolName).write,
        })),
      }))
    : GROUPS;
  return (
    <ToolNav groups={groups} activeKey={active} onSelect={(key) => onSelect(key as ToolName)} />
  );
}
