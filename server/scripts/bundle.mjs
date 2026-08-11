import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "dist");
const outFile = resolve(outDir, "pgautopilot.bundle.cjs");

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));

const result = await esbuild.build({
  entryPoints: [resolve(root, "dist", "index.js")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: outFile,
  banner: {
    js: [
      "#!/usr/bin/env node",
      `// PGAutoPilot v${pkg.version} — self-contained, no npm needed`,
      "",
    ].join("\n"),
  },
  minify: false,
  sourcemap: false,
  treeShaking: true,
  external: [],
  alias: {
    "pg-native": resolve(root, "scripts", "noop.js"),
  },
  logLevel: "info",
});

if (result.errors.length > 0) {
  console.error("[bundle] Errors:", result.errors);
  process.exit(1);
}

if (result.warnings.length > 0) {
  console.warn("[bundle] Warnings:", result.warnings);
}

const content = readFileSync(outFile, "utf-8");

const kb = (Buffer.byteLength(content) / 1024).toFixed(0);
console.log(`[bundle] Done — ${outFile} (${kb} KB)`);

const { execSync } = await import("child_process");
try {
  execSync(`node "${resolve(__dirname, "sign.mjs")}"`, {
    stdio: "inherit",
    cwd: root,
  });
} catch {
  console.warn("[bundle] Checksum generation skipped (sign.mjs failed)");
}
