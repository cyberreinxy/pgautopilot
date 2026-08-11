import { Button, Icon, Spinner } from "@pgautopilot/ui";
import { cn } from "../lib/cn";

interface RefreshButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function RefreshButton({
  onClick,
  loading = false,
  disabled = false,
  className,
}: RefreshButtonProps) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={loading || disabled}
      className={cn("min-w-0 w-24 min-h-8", className)}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        {loading ? <Spinner size={20} /> : <Icon name="codicon:refresh" size={16} />}
      </span>
      <span className="pg-btn-label">Refresh</span>
    </Button>
  );
}
