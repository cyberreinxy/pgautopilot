import { useState } from "react";
import { Button, Icon, JsonViewer, ScrollArea } from "@pgautopilot/ui";
import { useToast } from "../../../lib/toast";

interface ResultViewerProps {
  value: unknown;
  error: string | null;
  emptyText?: string;
}

export function ResultViewer({
  value,
  error,
  emptyText = "Run a tool to see its output.",
}: ResultViewerProps) {
  const [raw, setRaw] = useState(false);
  const { showToast } = useToast();
  const empty = value === undefined && !error;
  const text = error ?? value;
  const rawText = empty ? "" : typeof text === "string" ? text : JSON.stringify(text, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rawText);
      showToast("Result copied to clipboard", "success");
    } catch {
      showToast("Could not copy to clipboard", "error");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="pg-card-head min-w-0 gap-1.5">
        <Button
          size="sm"
          variant={!raw ? "primary" : "default"}
          className="pg-btn-adaptive min-w-0 flex-1"
          onClick={() => setRaw(false)}
        >
          <Icon name="solar:magic-stick-3-linear" size={14} />
          <span className="pg-btn-label">Pretty</span>
        </Button>
        <Button
          size="sm"
          variant={raw ? "primary" : "default"}
          className="pg-btn-adaptive min-w-0 flex-1"
          onClick={() => setRaw(true)}
        >
          <Icon name="solar:code-linear" size={14} />
          <span className="pg-btn-label">Raw</span>
        </Button>
        <Button
          size="sm"
          onClick={copy}
          disabled={empty}
          className="pg-btn-adaptive min-w-0 flex-1 enabled:hover:text-pg-primary"
        >
          <Icon name="solar:copy-linear" size={14} />
          <span className="pg-btn-label">Copy</span>
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <ScrollArea>
          {empty ? (
            <div className="px-3.5 py-8 text-center text-xs text-pg-dim">{emptyText}</div>
          ) : error ? (
            <pre className="pg-json text-pg-danger">{error}</pre>
          ) : (
            <JsonViewer value={value} raw={raw} />
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
