import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distDir = resolve(root, "dist");
const checksumsFile = resolve(distDir, "checksums.txt");
const sigFile = resolve(distDir, "checksums.txt.sig");

const args = process.argv.slice(2);
const useGpg =
  args.includes("--gpg") || args.some((a) => a.startsWith("--gpg-key="));
const gpgKeyArg = args.find((a) => a.startsWith("--gpg-key="));
const gpgKeyId = gpgKeyArg ? gpgKeyArg.split("=")[1] : undefined;

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function walkDir(dir) {
  const results = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkDir(full));
    } else if (stat.isFile()) {
      results.push(full);
    }
  }
  return results;
}

const files = walkDir(distDir)
  .filter(
    (f) =>
      basename(f) !== "checksums.txt" && basename(f) !== "checksums.txt.sig",
  )
  .sort();

const lines = [];
for (const filePath of files) {
  const hash = sha256(filePath);
  const relPath =
    filePath.startsWith(root) ? filePath.slice(root.length + 1) : filePath;
  lines.push(`${hash}  ${relPath}`);
}

const checksumContent = lines.join("\n") + "\n";
writeFileSync(checksumsFile, checksumContent, "utf-8");

const fileCount = lines.length;
const totalKb = files.reduce((sum, f) => sum + statSync(f).size, 0) / 1024;
console.log(
  `[sign] Wrote ${checksumsFile} (${fileCount} files, ${totalKb.toFixed(0)} KB total)`,
);

if (useGpg) {
  try {
    let cmd = `gpg --detach-sign --armor --output "${sigFile}"`;
    if (gpgKeyId) {
      cmd += ` --default-key ${gpgKeyId}`;
    }
    cmd += ` "${checksumsFile}"`;
    execSync(cmd, { stdio: "inherit" });
    console.log(`[sign] GPG signature written to ${sigFile}`);

    try {
      execSync(`gpg --verify "${sigFile}" "${checksumsFile}"`, {
        stdio: "inherit",
      });
      console.log("[sign] GPG signature verified successfully");
    } catch {
      console.warn("[sign] WARNING: GPG signature verification failed");
    }
  } catch (err) {
    console.error(
      "[sign] GPG signing failed. Is GPG installed and do you have a signing key?",
    );
    console.error(`[sign]   ${err.stderr?.toString().trim() || err.message}`);
    process.exit(1);
  }
} else {
  console.log(
    "[sign] Checksums generated (unsigned). Pass --gpg to sign with GPG.",
  );
}
