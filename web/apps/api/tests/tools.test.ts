import { describe, it, expect } from "vitest";
import request from "supertest";
import type { Pool } from "pg";
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

describe("tools API", () => {
  it("validates tool args against schemas", async () => {
    const app = createApp(stubPool, testConfig());
    const res = await request(app).post("/api/tools/db_raw_query").send({});
    expect(res.status).toBe(400);
  });

  it("enforces read-only mode on write tools", async () => {
    const app = createApp(stubPool, testConfig({ readonly: true }));
    const res = await request(app)
      .post("/api/tools/db_delete_many")
      .send({ table: "users", where: { id: 1 }, dryRun: true });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Read-only mode is enabled.");
  });
});
