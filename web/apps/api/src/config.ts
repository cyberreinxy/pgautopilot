export interface ApiConfig {
  port: number;
  host: string;
  token: string | null;
  databaseUrl: string;
  statementTimeoutMs: number;
  backupDir: string;
  snapshotsDir: string;
  migrationsDir: string;
  dockerContainer: string | null;
  blockedTables: Set<string>;
  extraSensitiveColumns: Set<string>;
  readonly: boolean;
  liveEvents: boolean;
  liveEventsIntervalMs: number;
  mode: "development" | "production";
  allowRawWrites: boolean;
  rateLimitMax: number | null;
  rateLimitWindowMs: number;
  authRateLimitMax: number;
  authRateLimitWindowMs: number;
  trustProxy: boolean | number | string;
  corsOrigins: string[];
}

function parseList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseOriginList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value || value === "false" || value === "0") return false;
  if (value === "true") return true;
  const hops = Number(value);
  return Number.isFinite(hops) ? hops : value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const databaseUrl = env.DATABASE_URL ?? "";
  const port = Number(env.PORT ?? 3000);
  const safePort = Number.isFinite(port) ? port : 3000;
  const host = env.HOST ?? "127.0.0.1";
  const token = env.DASHBOARD_TOKEN?.trim() || null;
  const statementTimeoutMs = Number(env.PG_STATEMENT_TIMEOUT_MS ?? 10000);
  const safeStatementTimeoutMs = Number.isFinite(statementTimeoutMs) ? statementTimeoutMs : 10000;
  const backupDir = env.BACKUPS_DIR ?? "./backups";
  const snapshotsDir = env.SNAPSHOTS_DIR ?? "./snapshots";
  const migrationsDir = env.MIGRATIONS_DIR ?? "./migrations";
  const dockerContainer = env.DOCKER_CONTAINER?.trim() || null;
  const readonly = env.READONLY === "true" || env.READONLY === "1";
  const liveEvents = env.LIVE_EVENTS !== "false" && env.LIVE_EVENTS !== "0";
  const liveEventsIntervalMs = Number(env.LIVE_EVENTS_INTERVAL_MS ?? 5000);
  const mode = env.NODE_ENV === "production" ? "production" : "development";
  const rateLimitMax = Number(env.RATE_LIMIT_MAX ?? 0);
  const rateLimitWindowMs = Number(env.RATE_LIMIT_WINDOW_MS ?? 60000);
  const authRateLimitMax = Number(env.AUTH_RATE_LIMIT_MAX ?? 30);
  const authRateLimitWindowMs = Number(env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60000);
  const allowRawWrites = env.ALLOW_RAW_WRITES === "true" || env.ALLOW_RAW_WRITES === "1";

  return {
    port: safePort,
    host,
    token,
    databaseUrl,
    statementTimeoutMs: safeStatementTimeoutMs,
    backupDir,
    snapshotsDir,
    migrationsDir,
    dockerContainer,
    blockedTables: parseList(env.BLOCKED_TABLES),
    extraSensitiveColumns: parseList(env.SENSITIVE_COLUMNS),
    readonly,
    liveEvents,
    liveEventsIntervalMs: Number.isFinite(liveEventsIntervalMs)
      ? Math.max(1000, liveEventsIntervalMs)
      : 5000,
    mode,
    rateLimitMax: Number.isFinite(rateLimitMax) && rateLimitMax > 0 ? rateLimitMax : null,
    rateLimitWindowMs: Number.isFinite(rateLimitWindowMs)
      ? Math.max(1000, rateLimitWindowMs)
      : 60000,
    authRateLimitMax:
      Number.isFinite(authRateLimitMax) && authRateLimitMax > 0 ? authRateLimitMax : 30,
    authRateLimitWindowMs: Number.isFinite(authRateLimitWindowMs)
      ? Math.max(1000, authRateLimitWindowMs)
      : 60000,
    allowRawWrites,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    corsOrigins: parseOriginList(env.CORS_ORIGINS),
  };
}
