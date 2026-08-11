import fs from "node:fs";
import path from "node:path";
import { loadEnvFile, currentBaseDir, findPackageRoot } from "./env.js";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { ChangeHub } from "./services/changeHub.js";
import { startChangeDetector } from "./services/changeDetector.js";
import { logger } from "./lib/logger.js";
import { createDbDiagnostics } from "./lib/dbDiagnostics.js";
import { createPool } from "./db.js";

loadEnvFile();

const config = loadConfig();
const packageRoot = findPackageRoot(currentBaseDir());

function readVersion(): string {
  const pkgPath = path.join(packageRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return "0.0.0";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch (err) {
    logger.error("Failed to read package version", { error: err instanceof Error ? err.message : String(err) });
    return "0.0.0";
  }
}

const version = readVersion();

if (!config.databaseUrl) {
  logger.warn("DATABASE_URL is not set. Health will report disconnected and tools will fail.");
}

if (
  config.host !== "127.0.0.1" &&
  config.host !== "localhost" &&
  config.host !== "::1" &&
  !config.token
) {
  throw new Error(
    "Refusing to start: the API would be exposed on a non-loopback interface without DASHBOARD_TOKEN. " +
    "Set DASHBOARD_TOKEN or bind to 127.0.0.1.",
  );
}

if (config.mode === "production" && !config.token && process.env.ALLOW_NO_AUTH !== "true") {
  throw new Error(
    "Refusing to start: DASHBOARD_TOKEN is required in production. " +
    "Set DASHBOARD_TOKEN, or start with ALLOW_NO_AUTH=true in a controlled environment.",
  );
}

const pool = createPool(config);
const diagnostics = createDbDiagnostics(pool, logger);
const changeHub = new ChangeHub();
const app = createApp(pool, config, diagnostics, version, changeHub);

let stopChangeDetector: (() => void) | null = null;

if (config.liveEvents) {
  stopChangeDetector = startChangeDetector(pool, changeHub, config.liveEventsIntervalMs);
  logger.info("Live change detection enabled", { intervalMs: config.liveEventsIntervalMs });
}

const server = app.listen(config.port, config.host, () => {
  logger.info("Dashboard API listening", {
    host: config.host,
    port: config.port,
    mode: config.mode,
  });
});

async function shutdown(): Promise<void> {
  server.close(() => undefined);
  if (stopChangeDetector) {
    stopChangeDetector();
  }
  await pool.end().catch(() => undefined);
  await logger.flush();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
