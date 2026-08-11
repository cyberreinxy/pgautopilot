type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  message: string;
}

function formatEntry(entry: LogEntry): string {
  return `${entry.ts} [pgautopilot] ${entry.level.toUpperCase()} ${entry.message}`;
}

function write(entry: LogEntry): void {
  process.stderr.write(formatEntry(entry) + "\n");
}

export const log = {
  info(message: string): void {
    write({ ts: new Date().toISOString(), level: "info", message });
  },
  warn(message: string): void {
    write({ ts: new Date().toISOString(), level: "warn", message });
  },
  error(message: string): void {
    write({ ts: new Date().toISOString(), level: "error", message });
  },
};
