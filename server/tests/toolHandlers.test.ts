import { describe, it, expect, beforeEach } from "vitest";
import type { Pool } from "pg";
import { createHandlers } from "../src/toolHandlers.js";
import { buildSafetyState } from "../src/safety.js";
import { invalidateSchemaCache } from "../src/schema.js";
import type { AppConfig } from "../src/config.js";

const CONFIG: AppConfig = {
  poolConfig: {},
  readonly: false,
  mode: "development",
  backupDir: "./backups",
  dockerContainer: null,
  blockedTables: new Set(),
  highRiskTables: new Set(),
  extraSensitiveColumns: new Set(),
  statementTimeoutMs: 10000,
  allowRawWrites: false,
  schemas: ["public"],
  disabledTools: new Set(),
};

function createStubPool(rowsForQuery: (text: string) => unknown[] = () => []): Pool {
  const client = {
    query: async (text: string) => ({ rows: rowsForQuery(String(text)), rowCount: 0 }),
    release: () => undefined,
  };
  return {
    connect: async () => client,
    query: async (text: string) => {
      const sql = String(text);
      if (/information_schema\.tables/.test(sql)) {
        return { rows: [{ table_schema: "public", table_name: "users" }], rowCount: 1 };
      }
      if (/information_schema\.columns/.test(sql)) {
        return {
          rows: [
            { column_name: "id", data_type: "integer", is_nullable: "NO", column_default: null },
            {
              column_name: "email",
              data_type: "text",
              is_nullable: "YES",
              column_default: null,
            },
            {
              column_name: "password",
              data_type: "text",
              is_nullable: "YES",
              column_default: null,
            },
          ],
          rowCount: 3,
        };
      }
      if (/constraint_type = 'PRIMARY KEY'/.test(sql)) {
        return { rows: [{ column_name: "id" }], rowCount: 1 };
      }
      if (/FOREIGN KEY/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/PRIMARY KEY', 'UNIQUE/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: rowsForQuery(sql), rowCount: 0 };
    },
  } as unknown as Pool;
}

function developmentSafety() {
  return buildSafetyState(false, "development", new Set(), new Set());
}

function readonlySafety() {
  return buildSafetyState(true, "development", new Set(), new Set());
}

function firstText(result: { content: { type: string; text: string }[] }): unknown {
  return JSON.parse(result.content[0]?.text ?? "");
}

describe("db_raw_query validation", () => {
  let pool: Pool;
  beforeEach(() => {
    pool = createStubPool();
    invalidateSchemaCache(pool);
  });

  it("rejects multi-statement SQL", async () => {
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "SELECT 1; SELECT 2", confirmed: false }),
    ).rejects.toThrow(/Multi-statement/);
  });

  it("rejects non-SELECT SQL", async () => {
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "DELETE FROM users", confirmed: false }),
    ).rejects.toThrow(/Only SELECT/);
  });

  it("blocks authentication catalog queries", async () => {
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "SELECT * FROM pg_authid LIMIT 1", confirmed: false }),
    ).rejects.toThrow(/authentication catalogs/);
  });

  it("rejects dangerous functions", async () => {
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "SELECT pg_sleep(10) LIMIT 1", confirmed: false }),
    ).rejects.toThrow(/Dangerous/);
  });

  it("requires a terminal LIMIT clause", async () => {
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "SELECT * FROM users", confirmed: false }),
    ).rejects.toThrow(/LIMIT/);
  });

  it("does not accept a fake LIMIT inside a string literal", async () => {
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "SELECT 'LIMIT 1' FROM users", confirmed: false }),
    ).rejects.toThrow(/LIMIT/);
  });

  it("rejects LIMIT above the cap", async () => {
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    await expect(
      handlers.db_raw_query({ sql: "SELECT * FROM users LIMIT 99999", confirmed: false }),
    ).rejects.toThrow(/exceeds maximum/);
  });

  it("blocks raw writes in read-only mode even when confirmed and enabled", async () => {
    const config = { ...CONFIG, allowRawWrites: true };
    const handlers = createHandlers(pool, readonlySafety(), config);
    await expect(
      handlers.db_raw_query({ sql: "UPDATE users SET email='x'", confirmed: true }),
    ).rejects.toThrow(/read-only/);
  });

  it("accepts a valid SELECT with terminal LIMIT", async () => {
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_raw_query({
      sql: "SELECT id FROM users LIMIT 5",
      confirmed: false,
    });
    expect(result.content[0]?.type).toBe("text");
  });
});

describe("db_aggregate redaction", () => {
  let pool: Pool;
  beforeEach(() => {
    pool = createStubPool();
    invalidateSchemaCache(pool);
  });

  it("redacts group-by and aggregate columns derived from sensitive columns", async () => {
    pool = createStubPool((text) => {
      if (String(text).startsWith("SELECT")) {
        return [{ password: "hunter2", count: 3, min_password: "aaa" }];
      }
      return [];
    });
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_aggregate({
      table: "users",
      by: "password",
      min: "password",
    });
    const payload = firstText(result) as {
      data: { password: string; count: number; min_password: string }[];
    };
    expect(payload.data).toEqual([
      { password: "***REDACTED***", count: 3, min_password: "***REDACTED***" },
    ]);
  });
});

describe("db_update_many confirmAll gate", () => {
  let pool: Pool;
  beforeEach(() => {
    pool = createStubPool();
    invalidateSchemaCache(pool);
  });

  it("refuses to update all rows without confirmAll", async () => {
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    await expect(
      handlers.db_update_many({
        table: "users",
        where: "{}",
        data: '{"email":"a@b.com"}',
        dryRun: false,
        confirmAll: false,
      }),
    ).rejects.toThrow(/Refusing to update ALL rows/);
  });

  it("allows updating all rows with confirmAll", async () => {
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_update_many({
      table: "users",
      where: "{}",
      data: '{"email":"a@b.com"}',
      dryRun: false,
      confirmAll: true,
    });
    expect(result.content[0]?.type).toBe("text");
  });
});

describe("db_create high-risk warning", () => {
  let pool: Pool;
  beforeEach(() => {
    pool = createStubPool();
    invalidateSchemaCache(pool);
  });

  it("surfaces a HIGH-RISK warning on dry-run writes", async () => {
    const safety = buildSafetyState(false, "development", new Set(), new Set(), new Set(["users"]));
    const handlers = createHandlers(pool, safety, CONFIG);
    const result = await handlers.db_create({
      table: "users",
      data: '{"email":"a@b.com"}',
      dryRun: true,
    });
    const payload = firstText(result) as { warnings?: string[] };
    expect(payload.warnings).toEqual([expect.stringContaining("HIGH-RISK")]);
  });
});

describe("db_explain", () => {
  let pool: Pool;
  beforeEach(() => {
    pool = createStubPool();
    invalidateSchemaCache(pool);
  });

  it("rejects non-SELECT queries", async () => {
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    await expect(
      handlers.db_explain({ query: "UPDATE users SET email = 'x'", analyze: true, buffers: true }),
    ).rejects.toThrow(/only accepts SELECT/);
  });

  it("rejects INSERT queries", async () => {
    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    await expect(
      handlers.db_explain({ query: "INSERT INTO users (email) VALUES ('a@b.com')", analyze: true, buffers: true }),
    ).rejects.toThrow(/only accepts SELECT/);
  });

  it("runs EXPLAIN ANALYZE and returns plan with analysis", async () => {
    const explainPlan = [
      {
        nodeType: "Seq Scan",
        relationName: "users",
        startupCost: 0,
        totalCost: 15,
        planRows: 1000,
        actualRows: 1000,
        actualLoops: 1,
        sharedHitBlocks: 10,
        sharedReadBlocks: 0,
        filter: "(email ~~ '%@example.com%'::text)",
        rowsRemovedByFilter: 9000,
      },
    ];
    pool = {
      connect: async () => ({
        query: async (text: string) => {
          const sql = String(text);
          if (sql.startsWith("EXPLAIN")) {
            return { rows: [{ "QUERY PLAN": explainPlan }] };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined,
      }),
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_explain({
      query: "SELECT * FROM users WHERE email LIKE '%@example.com%'",
      analyze: true,
      buffers: true,
    });

    const payload = firstText(result) as {
      query: string;
      plan: unknown[];
      summary: { totalCost: number | null; executionTimeMs: number | null };
      analysis: string[];
    };

    expect(payload.query).toContain("SELECT");
    expect(payload.plan).toEqual(explainPlan);
    expect(payload.analysis).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Sequential scan"),
      ]),
    );
  });

  it("returns ok message when no issues detected", async () => {
    const explainPlan = [
      {
        nodeType: "Index Scan",
        relationName: "users",
        startupCost: 0,
        totalCost: 8,
        planRows: 1,
        actualRows: 1,
        actualLoops: 1,
        sharedHitBlocks: 1,
        sharedReadBlocks: 0,
      },
    ];
    pool = {
      connect: async () => ({
        query: async (text: string) => {
          const sql = String(text);
          if (sql.startsWith("EXPLAIN")) {
            return { rows: [{ "QUERY PLAN": explainPlan }] };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined,
      }),
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_explain({
      query: "SELECT * FROM users WHERE id = 1",
      analyze: true,
      buffers: true,
    });

    const payload = firstText(result) as { analysis: string[] };
    expect(payload.analysis).toEqual([
      expect.stringContaining("No major issues detected"),
    ]);
  });

  it("strips trailing semicolon from query", async () => {
    const explainPlan = [{ nodeType: "Result", totalCost: 0, planRows: 1 }];
    pool = {
      connect: async () => ({
        query: async (text: string) => {
          const sql = String(text);
          if (sql.startsWith("EXPLAIN")) {
            return { rows: [{ "QUERY PLAN": explainPlan }] };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined,
      }),
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_explain({
      query: "SELECT 1;",
      analyze: false,
      buffers: false,
    });

    const payload = firstText(result) as { query: string; plan: unknown[] };
    expect(payload.query).toBe("SELECT 1");
    expect(payload.plan).toEqual(explainPlan);
  });

  it("respects analyze=false and buffers=false", async () => {
    const explainPlan = [{ nodeType: "Result", totalCost: 0, planRows: 1 }];
    let capturedSql = "";
    pool = {
      connect: async () => ({
        query: async (text: string) => {
          const sql = String(text);
          if (sql.startsWith("EXPLAIN")) {
            capturedSql = sql;
            return { rows: [{ "QUERY PLAN": explainPlan }] };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined,
      }),
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    await handlers.db_explain({
      query: "SELECT 1",
      analyze: false,
      buffers: false,
    });

    expect(capturedSql).toBe("EXPLAIN (FORMAT JSON) SELECT 1");
  });

  it("includes ANALYZE and BUFFERS when enabled", async () => {
    const explainPlan = [{ nodeType: "Result", totalCost: 0, planRows: 1 }];
    let capturedSql = "";
    pool = {
      connect: async () => ({
        query: async (text: string) => {
          const sql = String(text);
          if (sql.startsWith("EXPLAIN")) {
            capturedSql = sql;
            return { rows: [{ "QUERY PLAN": explainPlan }] };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined,
      }),
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    await handlers.db_explain({
      query: "SELECT 1",
      analyze: true,
      buffers: true,
    });

    expect(capturedSql).toContain("ANALYZE");
    expect(capturedSql).toContain("BUFFERS");
    expect(capturedSql).toContain("FORMAT JSON");
  });

  it("detects high-cost hash joins in analysis", async () => {
    const explainPlan = [
      {
        nodeType: "Hash Join",
        totalCost: 50000,
        planRows: 1000,
        actualRows: 1000,
        sharedHitBlocks: 100,
        sharedReadBlocks: 0,
        Plans: [],
      },
    ];
    pool = {
      connect: async () => ({
        query: async (text: string) => {
          const sql = String(text);
          if (sql.startsWith("EXPLAIN")) {
            return { rows: [{ "QUERY PLAN": explainPlan }] };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined,
      }),
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_explain({
      query: "SELECT * FROM a JOIN b ON a.id = b.a_id",
      analyze: true,
      buffers: true,
    });

    const payload = firstText(result) as { analysis: string[] };
    expect(payload.analysis).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Hash Join"),
      ]),
    );
  });
});

describe("db_health extended checks", () => {
  let pool: Pool;
  beforeEach(() => {
    pool = createStubPool();
    invalidateSchemaCache(pool);
  });

  it("returns vacuum, replication, indexes, and sequences checks", async () => {
    pool = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
      query: async (text: string) => {
        const sql = String(text);
        if (sql === "SELECT 1") {
          return { rows: [{ "?column?": 1 }], rowCount: 1 };
        }
        if (sql.includes("pg_stat_user_tables") && sql.includes("relfrozenxid")) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("pg_stat_replication")) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("pg_stat_user_indexes") && sql.includes("idx_scan = 0")) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("information_schema.sequences")) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_health({});
    const payload = firstText(result) as {
      status: string;
      healthChecks: {
        vacuum: { status: string };
        replication: { status: string };
        indexes: { status: string };
        sequences: { status: string };
        constraints: { status: string };
      };
    };

    expect(payload.status).toBe("connected");
    expect(payload.healthChecks.vacuum.status).toBe("ok");
    expect(payload.healthChecks.replication.status).toBe("no_replicas");
    expect(payload.healthChecks.indexes.status).toBe("ok");
    expect(payload.healthChecks.sequences.status).toBe("ok");
    expect(payload.healthChecks.constraints.status).toBe("ok");
  });

  it("reports tables at risk of TXID wraparound", async () => {
    pool = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
      query: async (text: string) => {
        const sql = String(text);
        if (sql === "SELECT 1") {
          return { rows: [{ "?column?": 1 }], rowCount: 1 };
        }
        if (sql.includes("relfrozenxid")) {
          return {
            rows: [
              {
                schemaname: "public",
                relname: "logs",
                n_dead_tup: 5000000,
                n_live_tup: 100000,
                last_vacuum: null,
                last_autovacuum: null,
                last_analyze: null,
                last_autoanalyze: null,
                xid_age: 150000000,
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes("pg_stat_replication")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_user_indexes")) return { rows: [], rowCount: 0 };
        if (sql.includes("information_schema.sequences")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_health({});
    const payload = firstText(result) as {
      healthChecks: {
        vacuum: {
          warning: string;
          tables: { relname: string; xid_age: number }[];
        };
      };
    };

    expect(payload.healthChecks.vacuum.warning).toContain("TXID wraparound");
    expect(payload.healthChecks.vacuum.tables).toHaveLength(1);
    const vacuumTable = payload.healthChecks.vacuum.tables[0]!;
    expect(vacuumTable.relname).toBe("logs");
  });

  it("reports unused indexes", async () => {
    pool = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
      query: async (text: string) => {
        const sql = String(text);
        if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 };
        if (sql.includes("relfrozenxid")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_replication")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_user_indexes") && sql.includes("idx_scan = 0")) {
          return {
            rows: [
              {
                schemaname: "public",
                relname: "orders",
                indexrelname: "idx_orders_old_status",
                idx_scan: 0,
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes("information_schema.sequences")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_health({});
    const payload = firstText(result) as {
      healthChecks: {
        indexes: {
          warning: string;
          unused: { indexrelname: string }[];
        };
      };
    };

    expect(payload.healthChecks.indexes.warning).toContain("unused");
    expect(payload.healthChecks.indexes.unused).toHaveLength(1);
    const unusedIndex = payload.healthChecks.indexes.unused[0]!;
    expect(unusedIndex.indexrelname).toBe("idx_orders_old_status");
  });

  it("reports sequences nearing max value", async () => {
    pool = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
      query: async (text: string) => {
        const sql = String(text);
        if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 };
        if (sql.includes("relfrozenxid")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_replication")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_user_indexes")) return { rows: [], rowCount: 0 };
        if (sql.includes("information_schema.sequences")) {
          return {
            rows: [
              {
                sequencename: "users_id_seq",
                schema_name: "public",
                last_value: 2100000000,
                max_value: 2147483647,
                pct_used: 97.8,
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_health({});
    const payload = firstText(result) as {
      healthChecks: {
        sequences: {
          warning: string;
          sequences: { sequencename: string; pct_used: number }[];
        };
      };
    };

    expect(payload.healthChecks.sequences.warning).toContain("80%");
    expect(payload.healthChecks.sequences.sequences).toHaveLength(1);
    const seq = payload.healthChecks.sequences.sequences[0]!;
    expect(seq.sequencename).toBe("users_id_seq");
  });

  it("reports replica lag", async () => {
    pool = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
      query: async (text: string) => {
        const sql = String(text);
        if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 };
        if (sql.includes("relfrozenxid")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_replication")) {
          return {
            rows: [
              {
                client_addr: "10.0.0.2",
                state: "streaming",
                sent_lsn: "0/1000000",
                write_lsn: "0/1000000",
                flush_lsn: "0/1000000",
                replay_lsn: "0/0FF000",
                replay_lag_bytes: 65536,
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes("pg_stat_user_indexes")) return { rows: [], rowCount: 0 };
        if (sql.includes("information_schema.sequences")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_health({});
    const payload = firstText(result) as {
      healthChecks: {
        replication: {
          replicas: number;
          lagging: number;
          details: { client_addr: string; replay_lag_bytes: number }[];
        };
      };
    };

    expect(payload.healthChecks.replication.replicas).toBe(1);
    expect(payload.healthChecks.replication.lagging).toBe(0);
    const replDetail = payload.healthChecks.replication.details[0]!;
    expect(replDetail.replay_lag_bytes).toBe(65536);
  });

  it("handles health check query errors gracefully", async () => {
    pool = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
      query: async (text: string) => {
        const sql = String(text);
        if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 };
        // All health check queries fail
        throw new Error("permission denied for table pg_stat_user_tables");
      },
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    // Should not throw — health checks are best-effort
    const result = await handlers.db_health({});
    const payload = firstText(result) as {
      status: string;
      healthChecks: Record<string, unknown>;
    };

    expect(payload.status).toBe("connected");
    // healthChecks should still be present (with ok/null values from failed queries)
    expect(payload.healthChecks).toBeDefined();
  });

  it("warns on low buffer cache hit rate", async () => {
    pool = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
      query: async (text: string) => {
        const sql = String(text);
        if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 };
        if (sql.includes("relfrozenxid")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_replication")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_user_indexes")) return { rows: [], rowCount: 0 };
        if (sql.includes("information_schema.sequences")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_database")) {
          return {
            rows: [{
              datname: "testdb",
              blks_hit: 1000,
              blks_read: 9000,
              hit_rate_pct: 10.0,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes("pg_constraint")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_health({});
    const payload = firstText(result) as {
      healthChecks: {
        bufferCache: {
          warning: string;
          hitRatePct: number;
          blksHit: number;
          blksRead: number;
        };
      };
    };

    expect(payload.healthChecks.bufferCache.warning).toContain("10%");
    expect(payload.healthChecks.bufferCache.warning).toContain("below 90%");
    expect(payload.healthChecks.bufferCache.hitRatePct).toBe(10.0);
    expect(payload.healthChecks.bufferCache.blksHit).toBe(1000);
    expect(payload.healthChecks.bufferCache.blksRead).toBe(9000);
  });

  it("reports buffer cache as OK when hit rate is high", async () => {
    pool = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
      query: async (text: string) => {
        const sql = String(text);
        if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 };
        if (sql.includes("relfrozenxid")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_replication")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_user_indexes")) return { rows: [], rowCount: 0 };
        if (sql.includes("information_schema.sequences")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_database")) {
          return {
            rows: [{
              datname: "testdb",
              blks_hit: 99000,
              blks_read: 1000,
              hit_rate_pct: 99.0,
            }],
            rowCount: 1,
          };
        }
        if (sql.includes("pg_constraint")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_health({});
    const payload = firstText(result) as {
      healthChecks: {
        bufferCache: {
          status: string;
          hitRatePct: number;
        };
      };
    };

    expect(payload.healthChecks.bufferCache.status).toBe("ok");
    expect(payload.healthChecks.bufferCache.hitRatePct).toBe(99.0);
  });

  it("omits buffer cache when query returns empty", async () => {
    pool = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
      query: async (text: string) => {
        const sql = String(text);
        if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 };
        if (sql.includes("relfrozenxid")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_replication")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_user_indexes")) return { rows: [], rowCount: 0 };
        if (sql.includes("information_schema.sequences")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_database")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_constraint")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_health({});
    const payload = firstText(result) as {
      healthChecks: Record<string, unknown>;
    };

    // bufferCache should not exist when query returns no rows
    expect(payload.healthChecks.bufferCache).toBeUndefined();
  });

  it("reports invalid constraints", async () => {
    pool = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
      query: async (text: string) => {
        const sql = String(text);
        if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 };
        if (sql.includes("relfrozenxid")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_replication")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_user_indexes")) return { rows: [], rowCount: 0 };
        if (sql.includes("information_schema.sequences")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_database")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_constraint") && sql.includes("NOT convalidated")) {
          return {
            rows: [
              { conname: "fk_orders_user", table_name: "orders", contype: "f", is_invalid: true },
              { conname: "chk_positive_amount", table_name: "payments", contype: "c", is_invalid: true },
            ],
            rowCount: 2,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_health({});
    const payload = firstText(result) as {
      healthChecks: {
        constraints: {
          warning: string;
          invalid: { conname: string; table_name: string }[];
        };
      };
    };

    expect(payload.healthChecks.constraints.warning).toContain("2 invalid constraint");
    expect(payload.healthChecks.constraints.invalid).toHaveLength(2);
    expect(payload.healthChecks.constraints.invalid[0]!.conname).toBe("fk_orders_user");
  });

  it("reports constraints as OK when none are invalid", async () => {
    pool = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
      query: async (text: string) => {
        const sql = String(text);
        if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 };
        if (sql.includes("relfrozenxid")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_replication")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_user_indexes")) return { rows: [], rowCount: 0 };
        if (sql.includes("information_schema.sequences")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_stat_database")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_constraint")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;

    const handlers = createHandlers(pool, developmentSafety(), CONFIG);
    const result = await handlers.db_health({});
    const payload = firstText(result) as {
      healthChecks: {
        constraints: { status: string };
      };
    };

    expect(payload.healthChecks.constraints.status).toBe("ok");
  });
});
