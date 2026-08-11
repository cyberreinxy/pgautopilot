import { TOOL_INDEX } from "@pgautopilot/contracts";
import type { ToolMeta, ToolName } from "@pgautopilot/contracts";

export function getToolGroups(): Array<{ title: string; tools: ToolMeta[] }> {
  return [
    { title: "Read", tools: TOOL_INDEX.filter((t) => t.category === "read") },
    { title: "Write", tools: TOOL_INDEX.filter((t) => t.category === "write") },
    { title: "Maintenance", tools: TOOL_INDEX.filter((t) => t.category === "maintenance") },
  ];
}

export function getTool(name: ToolName): ToolMeta {
  const tool = TOOL_INDEX.find((t) => t.name === name);
  if (tool) return tool;
  return TOOL_INDEX[0]!;
}
