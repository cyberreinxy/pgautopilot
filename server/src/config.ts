import type { PoolConfig } from "pg";
import { readFileSync } from "fs";
import { existsSync } from "fs";
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

export function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "host.docker.internal" ||
    host.endsWith(".internal")
  );
}

export function resolveSsl(url: URL): PoolConfig["ssl"] {
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

// ---------------------------------------------------------------------------
// Multi-database configuration support
// ---------------------------------------------------------------------------

export interface MultiDbEntryConfig {
  url: string;
  readonly?: boolean;
  schemas?: string[];
  blocked_tables?: string[];
  sensitive_columns?: string[];
  statement_timeout_ms?: number;
  pool_max?: number;
  high_risk_tables?: string[];
}

export interface MultiDbDefaults {
  readonly: boolean;
  schemas: string[];
  statement_timeout_ms: number;
  pool_max: number;
}

export interface MultiDbConfig {
  databases: Record<string, MultiDbEntryConfig>;
  defaults: MultiDbDefaults;
}

export type ConfigMode = "single" | "multi";

export interface ResolvedConfig {
  mode: ConfigMode;
  argv: string[];
  globalReadonly: boolean;
  globalMode: "development" | "production";
  backupDir: string;
  dockerContainer: string | null;
  allowRawWrites: boolean;
  disabledTools: Set<string>;
  multiDbConfig: MultiDbConfig | null;
  singleDbUrl: string | null;
  defaultDatabase: string | null;
}

const CONFIG_FILE_NAMES = ["pgautopilot.json", "pgautopilot.config.json"];

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (
    _match: string,
    braced: string | undefined,
    simple: string | undefined,
  ) => {
    const varName = braced ?? simple;
    if (!varName) return _match;
    const envVal = process.env[varName];
    if (envVal === undefined) {
      log.warn(`Environment variable "${varName}" referenced in config is not set; keeping literal value.`);
      return _match;
    }
    return envVal;
  });
}

function resolveEnvVarsDeep(obj: unknown): unknown {
  if (typeof obj === "string") return resolveEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(resolveEnvVarsDeep);
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = resolveEnvVarsDeep(v);
    }
    return result;
  }
  return obj;
}

function findConfigFile(): string | null {
  for (const name of CONFIG_FILE_NAMES) {
    const filePath = resolve(name);
    if (existsSync(filePath)) return filePath;
  }
  return null;
}

function parseMultiDbJson(raw: string, filePath: string, globalReadonly?: boolean): MultiDbConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}\n\n` +
        `  Ensure the file contains valid JSON.`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${filePath} must be a JSON object with a "databases" key.`);
  }

  const obj = parsed as Record<string, unknown>;
  const databasesRaw = obj.databases;
  if (typeof databasesRaw !== "object" || databasesRaw === null || Array.isArray(databasesRaw)) {
    throw new Error(
      `${filePath} must contain a "databases" object mapping names to connection configs.\n\n` +
        `  Example:\n` +
        `  {\n` +
        `    "databases": {\n` +
        `      "users": { "url": "postgresql://..." },\n` +
        `      "analytics": { "url": "postgresql://..." }\n` +
        `    }\n` +
        `  }`,
    );
  }

  const databases = databasesRaw as Record<string, unknown>;
  const entries: Record<string, MultiDbEntryConfig> = {};

  for (const [name, entryRaw] of Object.entries(databases)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) {
      throw new Error(
        `Database name "${name}" in ${filePath} is invalid.\n` +
          `  Names must start with a letter or underscore and contain only letters, digits, underscores, or hyphens.`,
      );
    }
    if (typeof entryRaw !== "object" || entryRaw === null || Array.isArray(entryRaw)) {
      throw new Error(
        `Database "${name}" in ${filePath} must be an object with a "url" field.`,
      );
    }
    const entry = entryRaw as Record<string, unknown>;
    const url = entry.url;
    if (typeof url !== "string" || url.length === 0) {
      throw new Error(
        `Database "${name}" in ${filePath} must have a non-empty "url" field.`,
      );
    }
    // Validate URL format (allow $VAR interpolation — skip if still a reference)
    if (!url.startsWith("$") && !url.startsWith("${")) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
          throw new Error(
            `Database "${name}" URL must use postgresql:// or postgres:// protocol, got "${parsed.protocol}".`,
          );
        }
        if (!parsed.hostname) {
          throw new Error(`Database "${name}" URL is missing a hostname.`);
        }
      } catch (err) {
        if (err instanceof TypeError) {
          throw new Error(
            `Database "${name}" URL is not a valid connection string: "${url.slice(0, 60)}${url.length > 60 ? "..." : ""}"`,
          );
        }
        throw err;
      }
    }

    const entryConfig: MultiDbEntryConfig = { url };
    if (typeof entry.readonly === "boolean") entryConfig.readonly = entry.readonly;
    if (Array.isArray(entry.schemas)) entryConfig.schemas = entry.schemas;
    if (Array.isArray(entry.blocked_tables)) entryConfig.blocked_tables = entry.blocked_tables;
    if (Array.isArray(entry.sensitive_columns)) entryConfig.sensitive_columns = entry.sensitive_columns;
    if (Array.isArray(entry.high_risk_tables)) entryConfig.high_risk_tables = entry.high_risk_tables;
    if (typeof entry.statement_timeout_ms === "number") entryConfig.statement_timeout_ms = entry.statement_timeout_ms;
    if (typeof entry.pool_max === "number") entryConfig.pool_max = entry.pool_max;
    entries[name] = entryConfig;
  }

  if (Object.keys(entries).length === 0) {
    throw new Error(`${filePath} must define at least one database in "databases".`);
  }

  const defaultsRaw = obj.defaults;
  const defaults: MultiDbDefaults = {
    readonly: globalReadonly ?? true,
    schemas: ["public"],
    statement_timeout_ms: 10000,
    pool_max: 5,
  };

  if (typeof defaultsRaw === "object" && defaultsRaw !== null && !Array.isArray(defaultsRaw)) {
    const d = defaultsRaw as Record<string, unknown>;
    if (typeof d.readonly === "boolean") defaults.readonly = d.readonly;
    if (Array.isArray(d.schemas)) defaults.schemas = d.schemas;
    if (typeof d.statement_timeout_ms === "number") defaults.statement_timeout_ms = d.statement_timeout_ms;
    if (typeof d.pool_max === "number") defaults.pool_max = d.pool_max;
  }

  return { databases: entries, defaults };
}

export function loadMultiDbConfig(globalReadonly?: boolean): MultiDbConfig | null {
  const filePath = findConfigFile();
  if (!filePath) return null;

  try {
    const raw = readFileSync(filePath, "utf-8");
    const resolved = resolveEnvVarsDeep(parseMultiDbJson(raw, filePath, globalReadonly)) as MultiDbConfig;
    log.warn(`Loaded multi-database config from ${filePath}.`);
    return resolved;
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export function detectConfigMode(argv: string[]): {
  mode: ConfigMode;
  resolved: ResolvedConfig;
} {
  const envFile = loadDotEnv();
  const resolveDb = detectDatabaseUrlConflict(envFile, process.env);
  const databaseUrl = resolveDb.url;

  for (const [key, value] of Object.entries(envFile.values)) {
    if (key !== "DATABASE_URL" && !(key in process.env)) {
      process.env[key] = value;
    }
  }

  const readonly = resolveReadonly(argv, process.env.ALLOW_WRITES);
  const modeArg = argv.find((a) => a.startsWith("--mode="));
  const mode =
    (modeArg?.split("=")[1] as "development" | "production" | undefined) ??
    (process.env.NODE_ENV === "production" ? "production" : "development");

  const multiDbConfig = loadMultiDbConfig(readonly);

  if (multiDbConfig && Object.keys(multiDbConfig.databases).length > 0) {
    if (databaseUrl && !multiDbConfig.databases["default"]) {
      log.info(
        `DATABASE_URL from .env will serve as the "default" database alongside ${Object.keys(multiDbConfig.databases).length} database(s) in config file.`,
      );
    }

    const dbFlag = argv.find((a) => a.startsWith("--database="));
    const defaultDatabase = dbFlag ? (dbFlag.split("=")[1] ?? null) : null;

    if (defaultDatabase && multiDbConfig && !multiDbConfig.databases[defaultDatabase]) {
      throw new Error(
        `--database="${defaultDatabase}" not found in pgautopilot.json.\n` +
          `Available databases: ${Object.keys(multiDbConfig.databases).join(", ")}`,
      );
    }

    const resolved: ResolvedConfig = {
      mode: "multi",
      argv,
      globalReadonly: readonly,
      globalMode: mode,
      backupDir: process.env.BACKUPS_DIR ?? "./backups",
      dockerContainer: process.env.DOCKER_CONTAINER ?? null,
      allowRawWrites:
        process.env.ALLOW_RAW_WRITES === "true" || process.env.ALLOW_RAW_WRITES === "1",
      disabledTools: parseList(process.env.DISABLED_TOOLS),
      multiDbConfig,
      singleDbUrl: databaseUrl || null,
      defaultDatabase,
    };
    return { mode: "multi", resolved };
  }

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set.\n\n" +
        `  Looking for a ".env" file in the current working directory:\n` +
        `    ${envFile.envFilePath}\n\n` +
        "  Create a .env file there with:\n\n" +
        "    DATABASE_URL=postgresql://user:password@localhost:5432/yourdb\n\n" +
        "  Or create a pgautopilot.json with a \"databases\" section for multi-database support.\n\n" +
        `  DATABASE_URL was not found in ${resolveDb.from.join(" or ") || "any source"}.`,
    );
  }

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

  const resolved: ResolvedConfig = {
    mode: "single",
    argv,
    globalReadonly: readonly,
    globalMode: mode,
    backupDir: process.env.BACKUPS_DIR ?? "./backups",
    dockerContainer: process.env.DOCKER_CONTAINER ?? null,
    allowRawWrites:
      process.env.ALLOW_RAW_WRITES === "true" || process.env.ALLOW_RAW_WRITES === "1",
    disabledTools: parseList(process.env.DISABLED_TOOLS),
    multiDbConfig: null,
    singleDbUrl: databaseUrl,
    defaultDatabase: null,
  };
  return { mode: "single", resolved };
}
