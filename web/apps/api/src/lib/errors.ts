import { friendlyDbError } from "@pgautopilot/core";

export function clientErrorMessage(err: unknown, mode: "development" | "production"): string {
  const message = err instanceof Error ? err.message : String(err);
  const friendly = friendlyDbError(err);
  if (friendly) return friendly;
  return mode === "production" ? "Request failed" : message;
}
