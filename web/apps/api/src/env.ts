import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function moduleBaseDir(): string {
  if (
    typeof import.meta !== "undefined" &&
    import.meta &&
    typeof import.meta.url === "string" &&
    import.meta.url.length > 0
  ) {
    return path.dirname(fileURLToPath(import.meta.url));
  }
  return process.cwd();
}

export function currentBaseDir(): string {
  return path.resolve(moduleBaseDir());
}

function findUp(startDir: string, filename: string): string {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 6; depth++) {
    if (fs.existsSync(path.join(dir, filename))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
}

export function findPackageRoot(startDir: string): string {
  return findUp(startDir, "package.json");
}

export function loadEnvFile(startDir?: string): void {
  const base = path.resolve(startDir ?? moduleBaseDir());
  const envDir = findUp(base, ".env");
  if (!envDir) return;
  const file = path.join(envDir, ".env");
  const content = fs.readFileSync(file, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
