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

describe("rate limiting", () => {
  it("does not fail on a forwarded-header request when rate limiting is enabled", async () => {
    const app = createApp(stubPool, testConfig({ rateLimitMax: 100, rateLimitWindowMs: 60_000 }));
    const res = await request(app)
      .post("/api/tools/db_raw_query")
      .set("X-Forwarded-For", "203.0.113.9")
      .send({});
    expect(res.status).not.toBe(500);
  });

  it("returns 429 once the limit is exceeded", async () => {
    const app = createApp(stubPool, testConfig({ rateLimitMax: 1, rateLimitWindowMs: 60_000 }));
    const first = await request(app).post("/api/tools/db_raw_query").send({});
    const second = await request(app).post("/api/tools/db_raw_query").send({});
    expect(first.status).toBe(400);
    expect(second.status).toBe(429);
  });

  it("keys separately per client IP when trust proxy is enabled", async () => {
    const app = createApp(
      stubPool,
      testConfig({ rateLimitMax: 1, rateLimitWindowMs: 60_000, trustProxy: true }),
    );
    const clientA = await request(app)
      .post("/api/tools/db_raw_query")
      .set("X-Forwarded-For", "203.0.113.10");
    const clientB = await request(app)
      .post("/api/tools/db_raw_query")
      .set("X-Forwarded-For", "203.0.113.11");
    expect(clientA.status).toBe(400);
    expect(clientB.status).toBe(400);
  });
});

describe("auth rate limiting", () => {
  it("throttles repeated failed authentication attempts", async () => {
    const app = createApp(stubPool, testConfig({ token: "secret" }));
    const statuses: number[] = [];
    for (let i = 0; i < 35; i += 1) {
      const res = await request(app).get("/api/tools");
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(30).some((s) => s === 429)).toBe(true);
  });

  it("never counts authenticated requests toward the auth limit", async () => {
    const app = createApp(stubPool, testConfig({ token: "secret" }));
    for (let i = 0; i < 35; i += 1) {
      const res = await request(app).get("/api/tools").set("Authorization", "Bearer secret");
      expect(res.status).toBe(200);
    }
  });
});
