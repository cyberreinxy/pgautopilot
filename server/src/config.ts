import type { PoolConfig } from "pg";
import { readFileSync } from "fs";
import { resolve } from "path";
import { log } from "./logger.js";

interface DotEnvValues {
  envFilePath: string;
  values: Record<string, string>;
}

function loadDotEnv(): DotEnvValues {
  const envFilePath = resolve(".env");
  const values: Record<string, string> = {};
  try {
    const raw = readFileSync(envFilePath, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!key || value === undefined) continue;
      const unquoted =
        value.startsWith('"') && value.endsWith('"')
          ? value.slice(1, -1)
          : value.startsWith("'") && value.endsWith("'")
            ? value.slice(1, -1)
            : value;
      values[key] = unquoted;
    }
    log.warn("Loaded .env. Keep its permissions restricted and never commit it.");
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn(`Failed to read .env: ${err.message}`);
    }
  }
  return { envFilePath, values };
}

export function maskCredentials(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    if (url.password) url.password = "****";
    if (url.username) url.username = "****";
    return url.toString();
  } catch {
    return urlStr;
  }
}

export function detectDatabaseUrlConflict(
  envFile: DotEnvValues,
  processEnv: NodeJS.ProcessEnv,
): { url: string; from: string[] } {
  const processUrl = processEnv.DATABASE_URL?.trim();
  const fileUrl = envFile.values.DATABASE_URL?.trim();

  const sources: string[] = [];
  if (processUrl) sources.push("the process environment");
  if (fileUrl) sources.push(envFile.envFilePath);

  if (processUrl && fileUrl && processUrl !== fileUrl) {
    throw new Error(
      `Conflicting DATABASE_URL values detected.\n\n` +
        `  ${envFile.envFilePath} defines:\n` +
        `    DATABASE_URL=${maskCredentials(fileUrl)}\n\n` +
        `  The process environment defines:\n` +
        `    DATABASE_URL=${maskCredentials(processUrl)}\n\n` +
        `These differ, so it is ambiguous which database to use. Pick one by ` +
        `unsetting the environment variable OR removing DATABASE_URL from the .env file, ` +
        `then restart the MCP server.`,
    );
  }

  if (processUrl && fileUrl) {
    log.warn(
      "DATABASE_URL is set in both the process environment and .env with identical values; using it.",
    );
    return { url: processUrl, from: sources };
  }

  if (processUrl) return { url: processUrl, from: sources };
  return { url: fileUrl ?? "", from: sources };
}

export interface AppConfig {
  poolConfig: PoolConfig;
  readonly: boolean;
  mode: "development" | "production";
  backupDir: string;
  dockerContainer: string | null;
  blockedTables: Set<string>;
  highRiskTables: Set<string>;
  extraSensitiveColumns: Set<string>;
  statementTimeoutMs: number;
  allowRawWrites: boolean;
  schemas: string[];
  disabledTools: Set<string>;
}

function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "host.docker.internal" ||
    host.endsWith(".internal")
  );
}

function resolveSsl(url: URL): PoolConfig["ssl"] {
  const mode = (process.env.PGSSLMODE ?? url.searchParams.get("sslmode") ?? "").toLowerCase();
  if (mode === "disable" || mode === "off") return false;
  if (mode === "require" || mode === "verify-full")
    return { rejectUnauthorized: mode === "verify-full" };
  if (mode === "no-verify") return { rejectUnauthorized: false };
  if (mode === "prefer" || isLocalHost(url.hostname)) return false;
  return { rejectUnauthorized: true };
}

function buildPoolConfig(statementTimeoutMs: number, databaseUrl: string): PoolConfig {
  const raw = databaseUrl;

  const url = new URL(raw);
  const poolMax = Number(process.env.PGPOOL_MAX ?? "5");
  const connectionTimeoutMs = Number(process.env.PG_CONNECT_TIMEOUT_MS ?? "10000");
  const idleTimeoutMs = Number(process.env.PG_IDLE_TIMEOUT_MS ?? "30000");

  return {
    connectionString: raw,
    ssl: resolveSsl(url),
    max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 5,
    connectionTimeoutMillis: Number.isFinite(connectionTimeoutMs) ? connectionTimeoutMs : 10000,
    idleTimeoutMillis: Number.isFinite(idleTimeoutMs) ? idleTimeoutMs : 30000,
    options: `-c statement_timeout=${statementTimeoutMs}`,
  };
}

function parseList(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
}

function parseSchemas(value: string | undefined): string[] {
  const schemas = (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return schemas.length > 0 ? schemas : ["public"];
}

export function resolveReadonly(argv: string[], allowWrites: string | undefined): boolean {
  return argv.includes("--readonly") || allowWrites !== "true";
}

export function loadConfig(argv: string[]): AppConfig {
  const envFile = loadDotEnv();
  const resolveDb = detectDatabaseUrlConflict(envFile, process.env);
  const databaseUrl = resolveDb.url;

  for (const [key, value] of Object.entries(envFile.values)) {
    if (key !== "DATABASE_URL" && !(key in process.env)) {
      process.env[key] = value;
    }
  }

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set.\n\n" +
        `  Looking for a ".env" file in the current working directory:\n` +
        `    ${envFile.envFilePath}\n\n` +
        "  Create a .env file there with:\n\n" +
        "    DATABASE_URL=postgresql://user:password@localhost:5432/yourdb\n\n" +
        "  PGAutoPilot always reads DATABASE_URL from the .env file in the " +
        "working directory of the MCP server process. If the wrong (or no) " +
        "database is used, make sure the .env that matches this project is " +
        "the one in the folder the editor opened.\n\n" +
        `  DATABASE_URL was not found in ${resolveDb.from.join(" or ") || "any source"}.`,
    );
  }

  const readonly = resolveReadonly(argv, process.env.ALLOW_WRITES);
  const modeArg = argv.find((a) => a.startsWith("--mode="));
  const mode =
    (modeArg?.split("=")[1] as "development" | "production" | undefined) ??
    (process.env.NODE_ENV === "production" ? "production" : "development");

  const statementTimeoutMs = Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? "10000");
  const finalTimeoutMs = Number.isFinite(statementTimeoutMs) ? statementTimeoutMs : 10000;

  if (mode === "production" && databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      if (url.password && !isLocalHost(url.hostname)) {
        log.warn(
          "DATABASE_URL contains a password and targets a non-loopback host. Use a dedicated role and rotate this credential if it has ever appeared on a command line.",
        );
      }
    } catch {
      log.warn("DATABASE_URL could not be parsed.");
    }
  }

  return {
    poolConfig: buildPoolConfig(finalTimeoutMs, databaseUrl),
    readonly,
    mode,
    backupDir: process.env.BACKUPS_DIR ?? "./backups",
    dockerContainer: process.env.DOCKER_CONTAINER ?? null,
    blockedTables: parseList(process.env.BLOCKED_TABLES),
    highRiskTables: parseList(process.env.HIGH_RISK_TABLES),
    extraSensitiveColumns: parseList(process.env.SENSITIVE_COLUMNS),
    statementTimeoutMs: finalTimeoutMs,
    allowRawWrites: process.env.ALLOW_RAW_WRITES === "true" || process.env.ALLOW_RAW_WRITES === "1",
    schemas: parseSchemas(process.env.PG_SCHEMAS),
    disabledTools: parseList(process.env.DISABLED_TOOLS),
  };
}

export function connectionSummary(poolConfig: PoolConfig): string {
  const raw = poolConfig.connectionString;
  if (typeof raw !== "string") return "unknown";
  try {
    const url = new URL(raw);
    const sslLabel = poolConfig.ssl === false ? "no SSL" : "SSL";
    return `${url.hostname}:${url.port || "5432"}/${url.pathname.replace(/^\//, "")} (${sslLabel})`;
  } catch {
    return "unknown";
  }
}
