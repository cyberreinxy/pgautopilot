import fs from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const CHUNK_MS = Math.max(1, Number(process.env.LOG_CHUNK_MINUTES ?? 60) || 60) * 60_000;

const configuredLevel: number = (() => {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVEL_ORDER[raw as LogLevel] ?? LEVEL_ORDER.info;
})();

let fileStream: fs.WriteStream | null = null;
let currentChunk: number | null = null;

export function logDir(): string {
  return process.env.LOG_DIR
    ? path.resolve(process.env.LOG_DIR)
    : path.resolve(process.cwd(), "data/logs");
}

function chunkStart(nowMs: number): number {
  return Math.floor(nowMs / CHUNK_MS) * CHUNK_MS;
}

function chunkFileName(chunkMs: number): string {
  const d = new Date(chunkMs);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `dashboard-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.log`;
}

function openChunk(nowMs: number): void {
  const chunk = chunkStart(nowMs);
  if (fileStream && currentChunk === chunk && !fileStream.destroyed) return;
  if (fileStream) {
    fileStream.end();
    fileStream = null;
  }
  currentChunk = chunk;
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    const stream = fs.createWriteStream(path.join(logDir(), chunkFileName(chunk)), {
      flags: "a",
    });
    stream.on("error", () => {
      stream.destroy();
      fileStream = null;
    });
    fileStream = stream;
  } catch {
    fileStream = null;
  }
}

function writeLine(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < configuredLevel) return;
  const record = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ?? {}),
  });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.log(record);
  openChunk(Date.now());
  if (fileStream && !fileStream.destroyed) fileStream.write(record + "\n");
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  flush(): Promise<void>;
}

export const logger: Logger = {
  debug: (message, meta) => writeLine("debug", message, meta),
  info: (message, meta) => writeLine("info", message, meta),
  warn: (message, meta) => writeLine("warn", message, meta),
  error: (message, meta) => writeLine("error", message, meta),
  async flush() {
    const stream = fileStream;
    if (stream && !stream.destroyed) {
      await new Promise<void>((resolve) => {
        stream.end(() => resolve());
      });
      fileStream = null;
    }
  },
};

export function listLogEntries(options: {
  level?: LogLevel;
  limit?: number;
  since?: string;
}): LogEntry[] {
  const limit = Math.min(Math.max(1, options.limit ?? 200), 2000);
  const minLevel = options.level ? LEVEL_ORDER[options.level] : 0;
  const since = options.since ? new Date(options.since).getTime() : null;
  if (since !== null && Number.isNaN(since)) {
    throw new Error(`Invalid 'since' timestamp: ${options.since}`);
  }
  let files: string[];
  try {
    files = fs.readdirSync(logDir());
  } catch {
    return [];
  }
  const chunks = files
    .filter((file) => /^dashboard-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.log$/.test(file))
    .sort()
    .reverse();
  const entries: LogEntry[] = [];
  for (const file of chunks) {
    if (entries.length >= limit) break;
    let lines: string[];
    try {
      lines = fs.readFileSync(path.join(logDir(), file), "utf8").split("\n");
    } catch {
      continue;
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!.trim();
      if (!line) continue;
      const parsed = parseLogLine(line);
      if (!parsed) continue;
      if (since !== null && new Date(parsed.ts).getTime() < since) {
        if (entries.length === 0) return [];
        return entries;
      }
      if (LEVEL_ORDER[parsed.level] < minLevel) continue;
      entries.push(parsed);
      if (entries.length >= limit) return entries;
    }
  }
  return entries;
}

function parseLogLine(line: string): LogEntry | null {
  try {
    const parsed = JSON.parse(line) as Partial<LogEntry>;
    if (
      typeof parsed.ts !== "string" ||
      typeof parsed.level !== "string" ||
      !(parsed.level in LEVEL_ORDER) ||
      typeof parsed.message !== "string"
    ) {
      return null;
    }
    const entry: LogEntry = {
      ts: parsed.ts,
      level: parsed.level as LogLevel,
      message: parsed.message,
    };
    if (parsed.meta && typeof parsed.meta === "object") {
      entry.meta = parsed.meta as Record<string, unknown>;
    }
    return entry;
  } catch {
    return null;
  }
}
