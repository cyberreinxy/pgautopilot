#!/usr/bin/env node

/**
 * merge-skills-lock.mjs
 *
 * Smartly merges PGAutoPilot skill entries into existing skill lock files.
 * Generates proper skills-lock.json matching the vercel-labs/skills format.
 *
 * Supported lock file formats:
 *   - skills-lock.json  (vercel-labs/skills, project-scoped)
 *   - .skill-lock.json  (vercel-labs/skills, global)
 *   - skills.lock       (agentskills RFC, JSON with integrity digests)
 *   - skills-lock.yaml  (skm)
 *
 * If no lock file exists, creates skills-lock.json with full metadata.
 * If one exists, merges entries without overwriting existing skills.
 *
 * Usage:
 *   node scripts/merge-skills-lock.mjs                    # auto-detect project root
 *   node scripts/merge-skills-lock.mjs --target ./path    # specific target directory
 *   node scripts/merge-skills-lock.mjs --global           # merge into ~/.agents/.skill-lock.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Configuration ---

const SKILL_NAMES = [
  "pgautopilot",
  "query-optimization",
  "database-health",
  "safe-writes",
  "multi-database",
  "connection-troubleshooting",
  "backup-restore",
];

const SKILL_VERSION = "2.4.0";
const PKG_NAME = "pgautopilot";
const PKG_REPO = "cyberreinxy/pgautopilot";
const PKG_SOURCE_URL = "https://github.com/cyberreinxy/pgautopilot.git";

// --- Helpers ---

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { target: null, global: false };
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--target" && args[i + 1]) opts.target = args[++i];
    if (args[i] === "--global") opts.global = true;
  }
  return opts;
}

/**
 * Compute SHA-256 hash of all files in a skill directory.
 * Matches the vercel-labs/skills skillFolderHash format.
 */
function hashSkillFolder(skillDir) {
  if (!existsSync(skillDir)) return "missing";
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  walk(skillDir);
  files.sort();
  const hash = createHash("sha256");
  for (const f of files) {
    hash.update(readFileSync(f));
  }
  return hash.digest("hex");
}

function findExistingLock(targetDir) {
  const candidates = [
    { path: "skills-lock.json", format: "json" },
    { path: ".skill-lock.json", format: "json" },
    { path: "skills.lock", format: "lock" },
    { path: "skills-lock.yaml", format: "yaml" },
  ];
  for (const c of candidates) {
    const full = join(targetDir, c.path);
    if (existsSync(full)) return { ...c, fullPath: full };
  }
  return null;
}

function readLockFile(lockInfo) {
  try {
    const raw = readFileSync(lockInfo.fullPath, "utf-8");
    if (lockInfo.format === "json" || lockInfo.format === "lock") return JSON.parse(raw);
    if (lockInfo.format === "yaml") {
      console.warn(`  [warn] YAML lock files: only JSON merge is supported. Skipping.`);
      return null;
    }
  } catch (err) {
    console.warn(`  [warn] Could not parse ${lockInfo.fullPath}: ${err.message}`);
    return null;
  }
}

/**
 * Build a single skill entry in vercel-labs/skills format.
 */
function buildSkillEntry(skillName, skillDir) {
  const now = new Date().toISOString();
  const skillFolderHash = hashSkillFolder(skillDir);
  return {
    source: PKG_REPO,
    sourceType: "github",
    sourceUrl: PKG_SOURCE_URL,
    skillPath: `skills/${skillName}/SKILL.md`,
    skillFolderHash,
    installedAt: now,
    updatedAt: now,
  };
}

/**
 * Build all PGAutoPilot skill entries.
 */
function buildAllEntries(targetDir) {
  const entries = {};
  const skillsDir = join(targetDir, "skills");
  for (const name of SKILL_NAMES) {
    const skillDir = join(skillsDir, name);
    entries[name] = buildSkillEntry(name, skillDir);
  }
  return entries;
}

/**
 * Merge PGAutoPilot entries into existing lock data.
 * Handles both vercel-labs/skills format (top-level keys) and
 * agentskills RFC format (resolved: { ... }).
 */
function mergeInto(existing, pgEntries) {
  // vercel-labs/skills format: { "skill-name": { source, skillPath, ... } }
  // The top-level keys ARE the skill entries
  if (existing.skills && typeof existing.skills === "object") {
    // Wrapped format: { skills: { ... } }
    for (const [name, entry] of Object.entries(pgEntries)) {
      if (!existing.skills[name]) {
        existing.skills[name] = entry;
        console.log(`  [+] Added: ${name}`);
      } else if (existing.skills[name].skillFolderHash !== entry.skillFolderHash) {
        existing.skills[name].skillFolderHash = entry.skillFolderHash;
        existing.skills[name].updatedAt = entry.updatedAt;
        console.log(`  [~] Updated: ${name} (hash changed)`);
      } else {
        console.log(`  [=] Kept: ${name} (unchanged)`);
      }
    }
    return existing;
  }

  // Check if it's flat vercel-labs format (top-level keys are skill names)
  const firstKey = Object.keys(existing)[0];
  if (firstKey && existing[firstKey] && typeof existing[firstKey] === "object" && existing[firstKey].source) {
    // Flat format: { "skill-name": { source, ... }, "other-skill": { ... } }
    for (const [name, entry] of Object.entries(pgEntries)) {
      if (!existing[name]) {
        existing[name] = entry;
        console.log(`  [+] Added: ${name}`);
      } else if (existing[name].skillFolderHash !== entry.skillFolderHash) {
        existing[name].skillFolderHash = entry.skillFolderHash;
        existing[name].updatedAt = entry.updatedAt;
        console.log(`  [~] Updated: ${name} (hash changed)`);
      } else {
        console.log(`  [=] Kept: ${name} (unchanged)`);
      }
    }
    return existing;
  }

  // agentskills RFC format: { resolved: { ... } }
  if (existing.resolved && typeof existing.resolved === "object") {
    for (const [name, entry] of Object.entries(pgEntries)) {
      const key = `${PKG_REPO}/${name}@v${entry.skillFolderHash?.slice(0, 8) ?? SKILL_VERSION}`;
      if (!existing.resolved[key]) {
        existing.resolved[key] = {
          commit: entry.skillFolderHash ?? "local",
          integrity: `sha256-${entry.skillFolderHash}`,
          skills: [name],
        };
        console.log(`  [+] Added: ${name}`);
      } else {
        console.log(`  [=] Kept: ${name} (unchanged)`);
      }
    }
    return existing;
  }

  // Unknown format — wrap into skills: {} format
  return mergeInto({ skills: existing }, pgEntries);
}

// --- Main ---

function main() {
  const opts = parseArgs(process.argv);
  let targetDir;

  if (opts.global) {
    targetDir = join(homedir(), ".agents");
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  } else if (opts.target) {
    targetDir = opts.target;
  } else {
    targetDir = process.cwd();
  }

  console.log(`PGAutoPilot skills — merging into ${targetDir}`);

  const existing = findExistingLock(targetDir);
  const pgEntries = buildAllEntries(targetDir);

  if (existing) {
    console.log(`Found existing lock file: ${existing.path}`);
    const data = readLockFile(existing);
    if (data) {
      const merged = mergeInto(data, pgEntries);
      writeFileSync(existing.fullPath, JSON.stringify(merged, null, 2) + "\n");
      console.log(`Merged into ${existing.fullPath}`);
    }
  } else {
    // No lock file — create skills-lock.json in vercel-labs/skills format
    const lockPath = join(targetDir, "skills-lock.json");
    const lock = {};
    for (const [name, entry] of Object.entries(pgEntries)) {
      lock[name] = entry;
    }
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
    console.log(`Created ${lockPath} (${Object.keys(pgEntries).length} skills)`);
  }
}

main();
