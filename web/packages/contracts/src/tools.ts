import { z } from "zod";

export const toolNames = [
  "db_overview",
  "db_schema",
  "db_health",
  "db_table_info",
  "db_find_many",
  "db_find_first",
  "db_count",
  "db_aggregate",
  "db_raw_query",
  "db_run_script",
  "db_backup",
  "db_create",
  "db_upsert",
  "db_update_many",
  "db_delete_many",
] as const;

export type ToolName = (typeof toolNames)[number];

export const SORT_DIRECTIONS = ["asc", "desc", "asc_nulls_last", "desc_nulls_first"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface LiveChangeEvent {
  table: string;
  action: "create" | "upsert" | "update" | "delete" | "script";
  entityId?: string;
}

export type ToolCategory = "read" | "write" | "maintenance";

export interface ToolMeta {
  name: ToolName;
  title: string;
  description: string;
  category: ToolCategory;
  write: boolean;
  sampleArgs: Record<string, unknown>;
}

export const TOOL_INDEX: ToolMeta[] = [
  {
    name: "db_overview",
    title: "Overview",
    description: "Tables, row counts, relationships",
    category: "read",
    write: false,
    sampleArgs: { table: "users" },
  },
  {
    name: "db_schema",
    title: "Schema",
    description: "Full column/type/constraint map",
    category: "read",
    write: false,
    sampleArgs: { table: "users" },
  },
  {
    name: "db_health",
    title: "Health",
    description: "Pool usage, uptime, latency",
    category: "read",
    write: false,
    sampleArgs: { table: "users" },
  },
  {
    name: "db_table_info",
    title: "Table Info",
    description: "Columns, indexes, row estimates",
    category: "read",
    write: false,
    sampleArgs: { table: "users" },
  },
  {
    name: "db_find_many",
    title: "Find Many",
    description: "Filtered, sorted, paginated rows",
    category: "read",
    write: false,
    sampleArgs: {
      table: "users",
      where: { status: "active" },
      orderBy: { created_at: "desc" },
      take: 25,
    },
  },
  {
    name: "db_find_first",
    title: "Find First",
    description: "Single matching row by filter",
    category: "read",
    write: false,
    sampleArgs: { table: "users", where: { id: 1 }, select: ["id", "name", "email"] },
  },
  {
    name: "db_count",
    title: "Count",
    description: "Row count with optional filter",
    category: "read",
    write: false,
    sampleArgs: { table: "users", where: { status: "active" } },
  },
  {
    name: "db_aggregate",
    title: "Aggregate",
    description: "Grouped count/sum/avg/min/max",
    category: "read",
    write: false,
    sampleArgs: {
      table: "orders",
      by: "status",
      sum: "total",
      avg: "total",
      orderBy: { status: "asc" },
      take: 10,
    },
  },
  {
    name: "db_raw_query",
    title: "Raw Query",
    description: "Custom SELECT with LIMIT",
    category: "read",
    write: false,
    sampleArgs: {
      sql: "SELECT id, name, email, status FROM users WHERE status = 'active' ORDER BY created_at DESC LIMIT 25",
    },
  },
  {
    name: "db_run_script",
    title: "Run Script",
    description: "Transactional multi-statement SQL (read-only aware)",
    category: "maintenance",
    write: true,
    sampleArgs: {
      sql: "BEGIN; INSERT INTO organizations (id, name) VALUES (md5(random()::text || clock_timestamp()::text)::uuid, 'Demo'); COMMIT;",
    },
  },
  {
    name: "db_create",
    title: "Create Row",
    description: "Insert with auto redaction",
    category: "write",
    write: true,
    sampleArgs: {
      table: "users",
      data: { name: "Jane Doe", email: "jane@example.com", role: "admin" },
      dryRun: true,
    },
  },
  {
    name: "db_upsert",
    title: "Upsert",
    description: "Insert or update on conflict",
    category: "write",
    write: true,
    sampleArgs: {
      table: "users",
      where: { email: "jane@example.com" },
      create: { name: "Jane Doe", email: "jane@example.com", role: "admin" },
      update: { name: "Jane Doe", role: "admin" },
      dryRun: true,
    },
  },
  {
    name: "db_update_many",
    title: "Update",
    description: "Update rows matching filter",
    category: "write",
    write: true,
    sampleArgs: {
      table: "users",
      where: { role: "guest" },
      data: { role: "member" },
      dryRun: true,
    },
  },
  {
    name: "db_delete_many",
    title: "Delete",
    description: "Delete rows matching filter",
    category: "write",
    write: true,
    sampleArgs: { table: "logs", where: { created_at: "2024-01-01" }, dryRun: true },
  },
  {
    name: "db_backup",
    title: "Backup",
    description: "Full SQL dump via pg_dump",
    category: "maintenance",
    write: false,
    sampleArgs: { label: "manual" },
  },
];

export const toolArgsSchema = {
  db_overview: z.object({ table: z.string().optional() }).strict(),
  db_schema: z.object({ table: z.string().optional() }).strict(),
  db_health: z.object({ table: z.string().optional() }).strict(),
  db_table_info: z.object({ table: z.string() }).strict(),
  db_find_many: z
    .object({
      table: z.string(),
      where: z.record(z.unknown()).optional(),
      select: z.array(z.string()).optional(),
      orderBy: z.record(z.enum(SORT_DIRECTIONS)).optional(),
      take: z.number().int().positive().max(500).optional(),
      skip: z.number().int().nonnegative().optional(),
    })
    .strict(),
  db_find_first: z
    .object({
      table: z.string(),
      where: z.record(z.unknown()).optional(),
      select: z.array(z.string()).optional(),
    })
    .strict(),
  db_count: z.object({ table: z.string(), where: z.record(z.unknown()).optional() }).strict(),
  db_aggregate: z
    .object({
      table: z.string(),
      by: z.string(),
      sum: z.string().optional(),
      avg: z.string().optional(),
      min: z.string().optional(),
      max: z.string().optional(),
      where: z.record(z.unknown()).optional(),
      orderBy: z.record(z.string()).optional(),
      take: z.number().int().positive().max(500).optional(),
    })
    .strict(),
  db_raw_query: z
    .object({
      sql: z.string().min(1),
      confirmed: z.boolean().optional().default(false),
    })
    .strict(),
  db_run_script: z
    .object({
      sql: z.string().min(1),
      confirmed: z.boolean().optional().default(false),
    })
    .strict(),
  db_backup: z
    .object({
      label: z.string().optional(),
      confirmed: z.boolean().optional().default(false),
    })
    .strict(),
  db_create: z
    .object({
      table: z.string(),
      data: z.record(z.unknown()),
      dryRun: z.boolean().optional(),
    })
    .strict(),
  db_upsert: z
    .object({
      table: z.string(),
      where: z.record(z.unknown()),
      create: z.record(z.unknown()),
      update: z.record(z.unknown()).optional(),
      dryRun: z.boolean().optional(),
    })
    .strict(),
  db_update_many: z
    .object({
      table: z.string(),
      where: z.record(z.unknown()).optional(),
      data: z.record(z.unknown()),
      dryRun: z.boolean().optional(),
      confirmAll: z.boolean().optional(),
    })
    .strict(),
  db_delete_many: z
    .object({
      table: z.string(),
      where: z.record(z.unknown()).optional(),
      dryRun: z.boolean().optional(),
      confirmAll: z.boolean().optional(),
    })
    .strict(),
} satisfies Record<ToolName, z.ZodType>;

export type ToolArgs<T extends ToolName> = z.infer<(typeof toolArgsSchema)[T]>;
