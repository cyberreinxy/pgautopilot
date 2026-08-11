import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Pool } from "pg";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import type { ApiConfig } from "../src/config.js";

function testConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    port: 3000,
    host: "127.0.0.1",
    token: null,
    databaseUrl: process.env.DATABASE_URL ?? "postgres://localhost:5432/postgres",
    statementTimeoutMs: 10000,
    backupDir: "./backups",
    migrationsDir: "./migrations",
    snapshotsDir: "./snapshots",
    dockerContainer: null,
    blockedTables: new Set(),
    extraSensitiveColumns: new Set(),
    readonly: false,
    liveEvents: false,
    liveEventsIntervalMs: 5000,
    mode: "development",
    rateLimitMax: null,
    rateLimitWindowMs: 60000,
    authRateLimitMax: 30,
    authRateLimitWindowMs: 60000,
    allowRawWrites: false,
    trustProxy: false,
    corsOrigins: [],
    ...overrides,
  };
}

const stubPool = {
  query: async () => ({ rows: [], rowCount: 0 }),
} as unknown as Pool;

describe("app", () => {
  it("reports health as connected", async () => {
    const app = createApp(stubPool, testConfig());
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("connected");
  });

  it("lists tools", async () => {
    const app = createApp(stubPool, testConfig());
    const res = await request(app).get("/api/tools");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tools)).toBe(true);
    expect(res.body.tools.length).toBeGreaterThan(0);
  });

  it("rejects an unknown tool with 404", async () => {
    const app = createApp(stubPool, testConfig());
    const res = await request(app).post("/api/tools/not_a_tool").send({});
    expect(res.status).toBe(404);
  });

  it("rejects missing token when configured", async () => {
    const app = createApp(stubPool, testConfig({ token: "secret" }));
    const denied = await request(app).get("/api/tools");
    expect(denied.status).toBe(401);
    const allowed = await request(app).get("/api/tools").set("Authorization", "Bearer secret");
    expect(allowed.status).toBe(200);
  });

  it("returns errors as JSON for failing tools", async () => {
    const app = createApp(stubPool, testConfig());
    const res = await request(app).post("/api/tools/db_find_many").send({ table: "users" });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });

  it("rejects mutating requests with 403 when read-only", async () => {
    const app = createApp(stubPool, testConfig({ readonly: true }));
    const res = await request(app).post("/api/tools/db_create").send({ table: "users" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Read-only mode is enabled.");
  });

  it("lets read tools through when read-only", async () => {
    const app = createApp(stubPool, testConfig({ readonly: true }));
    const res = await request(app).post("/api/tools/db_find_many").send({ table: "users" });
    expect(res.status).not.toBe(403);
  });

  it("allows the readonly toggle when read-only", async () => {
    const app = createApp(stubPool, testConfig({ readonly: true }));
    const res = await request(app).post("/api/config/readonly").send({ readonly: false });
    expect(res.status).toBe(200);
    expect(res.body.readonly).toBe(false);
  });

  it("releases the guard after toggling read-only off", async () => {
    const app = createApp(stubPool, testConfig({ readonly: true }));
    await request(app).post("/api/config/readonly").send({ readonly: false });
    const res = await request(app).post("/api/tools/db_find_many").send({ table: "users" });
    expect(res.status).toBe(400);
  });

  it("refuses to disable read-only via the API in production", async () => {
    const app = createApp(stubPool, testConfig({ readonly: true, mode: "production" }));
    const res = await request(app).post("/api/config/readonly").send({ readonly: false });
    expect(res.status).toBe(403);
  });

  it("lets GET requests through when read-only", async () => {
    const app = createApp(stubPool, testConfig({ readonly: true }));
    const res = await request(app).get("/api/tools");
    expect(res.status).toBe(200);
  });

  it("runs no DDL in the migrations listing after a runtime toggle-on", async () => {
    const queries: string[] = [];
    const pool = {
      query: async (text: string) => {
        queries.push(text);
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;
    const app = createApp(pool, testConfig({ readonly: false }));
    await request(app).post("/api/config/readonly").send({ readonly: true });
    const res = await request(app).get("/api/migrations");
    expect(res.status).toBe(200);
    expect(
      queries.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS schema_migrations")),
    ).toBe(false);
  });
});

describe("migration and snapshot content endpoints", () => {
  let base: string;
  let migrationsDir: string;
  let snapshotsDir: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "api-content-test-"));
    migrationsDir = join(base, "migrations");
    snapshotsDir = join(base, "snapshots");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(migrationsDir, { recursive: true });
    await mkdir(snapshotsDir, { recursive: true });
    await writeFile(join(migrationsDir, "1_init.sql"), "CREATE TABLE init (id int);");
    await writeFile(join(migrationsDir, "1_init.down.sql"), "DROP TABLE init;");
    await writeFile(join(snapshotsDir, "snap-a.sql"), "INSERT INTO users (id) VALUES (1);");
    await writeFile(
      join(snapshotsDir, "index.json"),
      JSON.stringify({
        snapshots: [
          {
            id: "snap-a",
            file: "snap-a.sql",
            label: "Before 1_init",
            createdAt: "2024-01-01T00:00:00.000Z",
            tables: ["users"],
            rows: 1,
            source: "pre-migration",
            migrationVersion: 1,
            format: "sql",
          },
        ],
      }),
      "utf-8",
    );
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("serves a migration's up and down content", async () => {
    const app = createApp(stubPool, testConfig({ migrationsDir, snapshotsDir }));
    const res = await request(app).get("/api/migrations/1");
    expect(res.status).toBe(200);
    expect(res.body.file).toBe("1_init.sql");
    expect(res.body.content).toBe("CREATE TABLE init (id int);");
    expect(res.body.downContent).toBe("DROP TABLE init;");
  });

  it("returns a 404 for an unknown migration version", async () => {
    const app = createApp(stubPool, testConfig({ migrationsDir, snapshotsDir }));
    const res = await request(app).get("/api/migrations/99");
    expect(res.status).toBe(404);
  });

  it("serves a snapshot's content", async () => {
    const app = createApp(stubPool, testConfig({ migrationsDir, snapshotsDir }));
    const res = await request(app).get("/api/snapshots/snap-a/content");
    expect(res.status).toBe(200);
    expect(res.body.snapshot.id).toBe("snap-a");
    expect(res.body.content).toBe("INSERT INTO users (id) VALUES (1);");
    expect(res.body.truncated).toBe(false);
  });

  it("returns a 404 for an unknown snapshot id", async () => {
    const app = createApp(stubPool, testConfig({ migrationsDir, snapshotsDir }));
    const res = await request(app).get("/api/snapshots/nope/content");
    expect(res.status).toBe(404);
  });

  it("returns JSON 404 for unknown api paths", async () => {
    const app = createApp(stubPool, testConfig());
    const res = await request(app).post("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });

  it("sends security headers", async () => {
    const app = createApp(stubPool, testConfig());
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });
});
