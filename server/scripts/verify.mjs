import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distDir = resolve(root, "dist");
const checksumsFile = resolve(distDir, "checksums.txt");
const sigFile = resolve(distDir, "checksums.txt.sig");

const args = process.argv.slice(2);
const useGpg = args.includes("--gpg");
const gpgKeyArg = args.find((a) => a.startsWith("--gpg-key="));

let allPassed = true;

if (!existsSync(checksumsFile)) {
  console.error(`[verify] FAIL: ${checksumsFile} not found.`);
  console.error(
    "[verify] Run `node scripts/sign.mjs` first to generate checksums.",
  );
  process.exit(1);
}

if (useGpg) {
  if (!existsSync(sigFile)) {
    console.error(
      `[verify] FAIL: ${sigFile} not found. Cannot verify GPG signature.`,
    );
    process.exit(1);
  }

  try {
    if (gpgKeyArg) {
      const keyId = gpgKeyArg.split("=")[1];
      const pubKeyPath = resolve(root, "PUBLIC_KEY.asc");
      if (existsSync(pubKeyPath)) {
        execSync(`gpg --import "${pubKeyPath}"`, { stdio: "inherit" });
      }
    }

    execSync(`gpg --verify "${sigFile}" "${checksumsFile}"`, {
      stdio: "inherit",
    });
    console.log("[verify] GPG signature is valid");
  } catch (err) {
    console.error("[verify] GPG signature verification FAILED");
    console.error(`[verify]   ${err.stderr?.toString().trim() || err.message}`);
    allPassed = false;
  }
}

console.log("[verify] Verifying SHA-256 checksums...");

const checksumLines = readFileSync(checksumsFile, "utf-8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.length > 0);

let verified = 0;
let failed = 0;
let missing = 0;

for (const line of checksumLines) {
  const parts = line.split(/\s+/);
  if (parts.length < 2) {
    console.warn(`[verify] Skipping malformed line: ${line}`);
    continue;
  }
  const expectedHash = parts[0];
  const relPath = parts
    .slice(1)
    .join(" ")
    .replace(/^\s*\*?/, "");
  const fullPath = resolve(root, relPath);

  if (!existsSync(fullPath)) {
    console.error(`[verify] MISSING: ${relPath}`);
    missing++;
    allPassed = false;
    continue;
  }

  const actualHash = createHash("sha256")
    .update(readFileSync(fullPath))
    .digest("hex");

  if (actualHash === expectedHash) {
    verified++;
  } else {
    console.error(`[verify] HASH MISMATCH: ${relPath}`);
    console.error(`         expected: ${expectedHash}`);
    console.error(`         actual:   ${actualHash}`);
    failed++;
    allPassed = false;
  }
}

console.log("");
console.log(`[verify]   Files verified:  ${verified}`);
if (failed > 0) console.error(`[verify]   Hash failures:   ${failed}`);
if (missing > 0) console.error(`[verify]   Missing files:   ${missing}`);
console.log(`[verify]   Overall status:  ${allPassed ? "PASSED" : "FAILED"}`);

if (!allPassed) {
  process.exit(1);
}
