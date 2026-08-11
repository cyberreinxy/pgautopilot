import type { ToolHandler } from "@pgautopilot/core";

export async function invokeTool(
  handler: ToolHandler,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await handler(args);
  if (result && typeof result === "object" && "text" in result) {
    return (result as { text: string }).text;
  }
  return result;
}
