import { z } from "zod";
import type { ToolMeta, ToolName } from "./tools.js";

export interface ToolSummary {
  name: ToolName;
  title: string;
  description: string;
}

export const toolInvokeArgsSchema = z.record(z.unknown());

export type ToolInvokeArgs = z.infer<typeof toolInvokeArgsSchema>;

export interface ToolInvokeSuccess {
  ok: true;
  data: unknown;
}

export interface ToolInvokeFailure {
  ok: false;
  error: string;
}

export type ToolInvokeResponse = ToolInvokeSuccess | ToolInvokeFailure;

export interface PoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export interface HealthResponse {
  status: "connected" | "disconnected";
  uptimeSeconds: number;
  version: string;
  mode: "development" | "production";
  reason: string | null;
  latencyMs: number | null;
  databaseUrlConfigured: boolean;
  pool: PoolStats;
  lastError: { message: string; at: string } | null;
  lastSuccessAt: string | null;
}

export interface SchemaColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
}

export interface SchemaForeignKey {
  column: string;
  referencesTable: string;
  referencesColumn: string;
}

export interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
  foreignKeys: SchemaForeignKey[];
  uniqueColumnSets: string[][];
}

export interface SchemaResponse {
  tables: SchemaTable[];
}

export interface MigrationEntry {
  version: number;
  name: string;
  file: string;
  appliedAt: string | null;
  hasDown: boolean;
}

export interface MigrationListResponse {
  migrations: MigrationEntry[];
}

export interface MigrationContentResponse {
  version: number;
  file: string;
  content: string;
  downContent: string | null;
}

export interface ApplyMigrationsResponse {
  applied: MigrationEntry[];
}

export interface ApplyMigrationsRequest {
  versions: number[];
}

export type SnapshotSource = "manual" | "pre-migration";

export interface SnapshotEntry {
  id: string;
  file: string;
  label: string;
  createdAt: string;
  tables: string[];
  rows: number;
  source: SnapshotSource;
  migrationVersion: number | null;
  format: "pg_dump" | "sql";
}

export interface SnapshotListResponse {
  snapshots: SnapshotEntry[];
}

export interface SnapshotContentResponse {
  snapshot: SnapshotEntry;
  content: string;
  truncated: boolean;
}

export interface CreateSnapshotRequest {
  label?: string;
}

export interface SnapshotCreateResponse {
  snapshot: SnapshotEntry;
}

export interface RestoreSnapshotRequest {
  id: string;
}

export interface RestoreSnapshotResponse {
  id: string;
  label: string;
  tables: string[];
  rowsRestored: number;
}

export interface RuntimeConfig {
  version: string;
  mode: "development" | "production";
  host: string;
  port: number;
  readonly: boolean;
  databaseUrlConfigured: boolean;
  statementTimeoutMs: number;
  blockedTables: string[];
  sensitiveColumns: string[];
}

export interface ReadonlyResponse {
  readonly: boolean;
}

export interface ApiErrorBody {
  error: string;
}

export interface ToolListResponse {
  tools: ToolMeta[];
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

export interface LogListResponse {
  entries: LogEntry[];
  dir?: string;
}
