import { useCallback, useState } from "react";
import { createApiClient } from "@pgautopilot/api-client";
import type { ToolName } from "@pgautopilot/contracts";

const client = createApiClient(
  import.meta.env.VITE_API_BASE ?? "/api",
  import.meta.env.VITE_DASHBOARD_TOKEN,
);

export interface ExecuteState {
  running: boolean;
  result: unknown;
  error: string | null;
  elapsedMs: number;
  warnings: string[];
}

const IDLE: ExecuteState = {
  running: false,
  result: null,
  error: null,
  elapsedMs: 0,
  warnings: [],
};

function extractWarnings(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const warnings = (value as { warnings?: unknown }).warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings.filter((w): w is string => typeof w === "string");
}

export function useExecuteTool() {
  const [state, setState] = useState<ExecuteState>(IDLE);

  const execute = useCallback(
    async (name: ToolName, args: Record<string, unknown>): Promise<ExecuteState> => {
      setState({ ...IDLE, running: true });
      const started = performance.now();
      try {
        const response = await client.invokeTool(name, args);
        const next: ExecuteState = {
          running: false,
          result: response.ok ? response.data : null,
          error: response.ok ? null : response.error,
          elapsedMs: performance.now() - started,
          warnings: response.ok ? extractWarnings(response.data) : [],
        };
        setState(next);
        return next;
      } catch (err) {
        const next: ExecuteState = {
          running: false,
          result: null,
          error: err instanceof Error ? err.message : String(err),
          elapsedMs: performance.now() - started,
          warnings: [],
        };
        setState(next);
        return next;
      }
    },
    [],
  );

  const clear = useCallback(() => setState(IDLE), []);

  return { ...state, execute, clear };
}
