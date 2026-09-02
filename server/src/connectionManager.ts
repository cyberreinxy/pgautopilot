import type pg from "pg";
import type { PoolConfig } from "pg";
import { createPool, waitForConnection } from "./db.js";
import { buildSafetyState } from "./safety.js";
import type { SafetyState } from "./safety.js";
import { connectionSummary, resolveSsl } from "./config.js";
import { log } from "./logger.js";

export type ConnectionStatus = "not_connected" | "connecting" | "connected" | "error";

export interface DatabaseEntry {
  name: string;
  url: string;
  poolConfig: PoolConfig;
  readonly: boolean;
  schemas: string[];
  blockedTables: Set<string>;
  highRiskTables: Set<string>;
  extraSensitiveColumns: Set<string>;
  statementTimeoutMs: number;
  safety: SafetyState;
  pool: pg.Pool | null;
  status: ConnectionStatus;
  lastError: string | null;
}

export interface DatabaseListEntry {
  name: string;
  status: ConnectionStatus;
  readonly: boolean;
  connected: boolean;
  connection: string;
}

export class ConnectionManager {
  private databases = new Map<string, DatabaseEntry>();
  private defaultName: string | null = null;
  private connecting = new Map<string, Promise<DatabaseEntry>>();

  register(name: string, entry: DatabaseEntry): void {
    this.databases.set(name, entry);
    if (this.defaultName === null) {
      this.defaultName = name;
    }
  }

  has(name: string): boolean {
    return this.databases.has(name);
  }

  getDefaultName(): string | null {
    return this.defaultName;
  }

  setDefault(name: string): void {
    if (!this.databases.has(name)) {
      throw new Error(
        `Database "${name}" is not configured. Available: ${[...this.databases.keys()].join(", ")}`,
      );
    }
    this.defaultName = name;
  }

  async get(name: string): Promise<DatabaseEntry> {
    const entry = this.databases.get(name);
    if (!entry) {
      const available = [...this.databases.keys()].join(", ");
      throw new Error(
        `Database "${name}" is not configured. Available databases: ${available || "(none)"}`,
      );
    }
    if (entry.status === "connected" && entry.pool) {
      // Verify the connection is still alive
      try {
        await entry.pool.query("SELECT 1");
        return entry;
      } catch {
        // Pool is broken — destroy and reconnect
        log.warn(`Pool for "${name}" is unhealthy, reconnecting...`);
        await entry.pool.end().catch(() => undefined);
        entry.pool = null;
        entry.status = "not_connected";
      }
    }
    // Deduplicate concurrent connect attempts for the same database
    const inFlight = this.connecting.get(name);
    if (inFlight) return inFlight;
    const promise = this.connect(entry).finally(() => {
      this.connecting.delete(name);
    });
    this.connecting.set(name, promise);
    return promise;
  }

  async getDefault(): Promise<DatabaseEntry> {
    if (!this.defaultName) {
      throw new Error("No default database is configured.");
    }
    return this.get(this.defaultName);
  }

  resolve(name: string | undefined): string {
    if (name) return name;
    if (this.defaultName) return this.defaultName;
    throw new Error("No database specified and no default database configured.");
  }

  list(): DatabaseListEntry[] {
    return [...this.databases.entries()].map(([name, entry]) => ({
      name,
      status: entry.status,
      readonly: entry.readonly,
      connected: entry.status === "connected",
      connection: connectionSummary(entry.poolConfig),
    }));
  }

  private async connect(entry: DatabaseEntry): Promise<DatabaseEntry> {
    if (entry.status === "connecting") {
      while (entry.status === "connecting") {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (entry.status === "connected" && entry.pool) {
        return entry;
      }
      throw new Error(
        `Failed to connect to database "${entry.name}": ${entry.lastError ?? "unknown error"}`,
      );
    }

    entry.status = "connecting";
    const pool = createPool(entry.poolConfig);

    try {
      await waitForConnection(pool, 3, 2000);
      entry.pool = pool;
      entry.status = "connected";
      entry.lastError = null;
      log.info(`Connected to database "${entry.name}": ${connectionSummary(entry.poolConfig)}`);
      return entry;
    } catch (err) {
      entry.status = "error";
      entry.lastError = err instanceof Error ? err.message : String(err);
      await pool.end().catch(() => undefined);
      log.error(
        `Failed to connect to database "${entry.name}": ${entry.lastError}`,
      );
      throw new Error(
        `Failed to connect to database "${entry.name}": ${entry.lastError}\n` +
          `  Ensure the URL is correct and PostgreSQL is reachable.`,
      );
    }
  }

  async connectDefault(): Promise<DatabaseEntry> {
    if (!this.defaultName) {
      throw new Error("No default database is configured.");
    }
    const entry = this.databases.get(this.defaultName);
    if (!entry) {
      throw new Error(`Default database "${this.defaultName}" not found.`);
    }
    return this.connect(entry);
  }

  async closeAll(): Promise<void> {
    const closePromises: Promise<void>[] = [];
    for (const [name, entry] of this.databases) {
      if (entry.pool) {
        closePromises.push(
          entry.pool.end().then(() => {
            entry.pool = null;
            entry.status = "not_connected";
            log.info(`Closed pool for database "${name}".`);
          }),
        );
      }
    }
    await Promise.all(closePromises);
  }
}

export function buildDatabaseEntry(
  name: string,
  url: string,
  defaults: {
    readonly: boolean;
    schemas: string[];
    statementTimeoutMs: number;
    poolMax: number;
  },
  overrides: {
    readonly?: boolean;
    schemas?: string[];
    blocked_tables?: string[];
    sensitive_columns?: string[];
    statement_timeout_ms?: number;
    pool_max?: number;
    high_risk_tables?: string[];
  } = {},
): DatabaseEntry {
  const readonly = overrides.readonly ?? defaults.readonly;
  const schemas = overrides.schemas ?? defaults.schemas;
  const blockedTables = new Set(overrides.blocked_tables ?? []);
  const highRiskTables = new Set(overrides.high_risk_tables ?? []);
  const extraSensitiveColumns = new Set(overrides.sensitive_columns ?? []);
  const statementTimeoutMs = overrides.statement_timeout_ms ?? defaults.statementTimeoutMs;
  const poolMax = overrides.pool_max ?? defaults.poolMax;

  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    throw new Error(
      `Database "${name}" has an invalid URL: "${url.slice(0, 60)}${url.length > 60 ? "..." : ""}"\n` +
        `  Expected a postgresql:// or postgres:// connection string.`,
    );
  }
  const poolConfig: PoolConfig = {
    connectionString: url,
    ssl: resolveSsl(urlObj),
    max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    options: `-c statement_timeout=${statementTimeoutMs}`,
  };

  const mode = (process.env.NODE_ENV as "production" | "development") ?? "development";
  const safety = buildSafetyState(readonly, mode, blockedTables, extraSensitiveColumns, highRiskTables);

  return {
    name,
    url,
    poolConfig,
    readonly,
    schemas,
    blockedTables,
    highRiskTables,
    extraSensitiveColumns,
    statementTimeoutMs,
    safety,
    pool: null,
    status: "not_connected",
    lastError: null,
  };
}
