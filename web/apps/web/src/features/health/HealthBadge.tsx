import { Icon } from "@pgautopilot/ui";
import { cn } from "../../lib/cn";
import { useHealth } from "./useHealth";

const BADGE =
  "inline-flex h-8 items-center gap-1 rounded-lg border border-pg-border bg-pg-surface-2 px-2 text-[11px] leading-none";

interface LatencyTiers {
  avg: number;
  slow: number;
}

const LATENCY_TIERS: Record<"http" | "https", LatencyTiers> = {
  http: { avg: 100, slow: 200 },
  https: { avg: 300, slow: 600 },
};

export function HealthBadge() {
  const { online, reason, latencyMs } = useHealth();
  const isSecure = window.location.protocol === "https:";
  const label = online === null ? "Connecting..." : online ? "Connected" : "Disconnected";
  const tone = online === null ? "text-pg-muted" : online ? "text-pg-accent" : "text-pg-danger";
  const tiers = LATENCY_TIERS[isSecure ? "https" : "http"];
  const latencyTone = online
    ? (latencyMs ?? 0) < tiers.avg
      ? "text-pg-accent"
      : (latencyMs ?? 0) < tiers.slow
        ? "text-pg-warning"
        : "text-pg-danger"
    : "text-pg-dim";

  return (
    <span className={cn(BADGE, "w-36")} title={reason ?? undefined}>
      <Icon name="solar:database-linear" size={14} className={cn(tone, "shrink-0")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={cn("shrink-0 font-pg-mono text-[10px] tabular-nums", latencyTone)}>
        {online ? `${latencyMs ?? 0}ms` : "0ms"}
      </span>
    </span>
  );
}
