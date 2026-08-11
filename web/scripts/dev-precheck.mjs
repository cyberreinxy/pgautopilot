import { execSync } from "child_process";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createServer } from "net";
import { platform } from "os";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readDotEnv() {
  try {
    const raw = readFileSync(resolve(workspaceRoot, ".env"), "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!key || value === undefined) continue;
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env file — fall back to real environment variables.
  }
}

function resolvePorts() {
  readDotEnv();
  const apiPort = Number(process.env.PORT) || 3000;
  const fromEnv = process.env.CHECK_PORTS
    ? process.env.CHECK_PORTS.split(",").map((p) => Number(p.trim())).filter((p) => Number.isFinite(p) && p > 0)
    : [];
  return [...new Set(fromEnv.length > 0 ? fromEnv : [apiPort, 5173])];
}

function isPortInUse(port) {
  if (platform() === "win32") {
    try {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
      return output.split("\n").some((line) => line.includes("LISTENING"));
    } catch {
      return false;
    }
  }
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "0.0.0.0");
  });
}

function killPort(port) {
  const isWindows = platform() === "win32";
  try {
    if (isWindows) {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
      const pids = output
        .split("\n")
        .filter((line) => line.includes("LISTENING"))
        .map((line) => line.trim().split(/\s+/).pop())
        .filter(Boolean);

      for (const pid of [...new Set(pids)]) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
          console.log(`  Killed PID ${pid} on port ${port}`);
        } catch {
          // Process may have already exited.
        }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: "ignore" });
      console.log(`  Killed process(es) on port ${port}`);
    }
  } catch {
    // No process found on this port.
  }
}

async function main() {
  const kill = process.argv.includes("--kill");
  const ports = resolvePorts();

  console.log(`\x1b[33m[dev-precheck]\x1b[0m Checking ${ports.length} port(s): ${ports.join(", ")}`);

  let hadConflicts = false;

  for (const port of ports) {
    const inUse = await isPortInUse(port);
    if (inUse) {
      hadConflicts = true;
      if (kill) {
        console.log(`\x1b[31m[dev-precheck]\x1b[0m Port ${port} is in use — killing...`);
        killPort(port);
      } else {
        console.log(`\x1b[31m[dev-precheck]\x1b[0m Port ${port} is in use ✗`);
      }
    } else {
      console.log(`\x1b[32m[dev-precheck]\x1b[0m Port ${port} is free ✓`);
    }
  }

  if (hadConflicts && kill) {
    await new Promise((r) => setTimeout(r, 800));
  }

  const verdict = hadConflicts && !kill ? "Ports occupied — re-run with --kill to free them." : "Done.";
  console.log(`\n\x1b[33m[dev-precheck]\x1b[0m ${verdict}`);

  if (hadConflicts && !kill) process.exit(2);
}

main().catch((err) => {
  console.error("dev-precheck failed:", err);
  process.exit(1);
});