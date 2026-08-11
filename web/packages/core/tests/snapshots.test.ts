import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SnapshotEntry } from "@pgautopilot/contracts";
import { readSnapshotContent } from "../src/snapshots.js";
import type { SnapshotOptions } from "../src/snapshots.js";

function makeOptions(dir: string): SnapshotOptions {
  return { dir, databaseUrl: "postgres://localhost:5432/test", dockerContainer: null };
}

describe("readSnapshotContent", () => {
  let dir: string;
  let options: SnapshotOptions;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "snapshots-content-test-"));
    options = makeOptions(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function seedSnapshot(id: string, content: string): Promise<void> {
    await writeFile(join(dir, `${id}.sql`), content, "utf-8");
    const entry: SnapshotEntry = {
      id,
      file: `${id}.sql`,
      label: `Snapshot ${id}`,
      createdAt: "2024-01-01T00:00:00.000Z",
      tables: ["users"],
      rows: 5,
      source: "pre-migration",
      migrationVersion: 1,
      format: "sql",
    };
    await writeFile(
      join(dir, "index.json"),
      JSON.stringify({ snapshots: [entry] }, null, 2) + "\n",
      "utf-8",
    );
  }

  it("returns the full content when it fits the preview limit", async () => {
    const content = "INSERT INTO users (id) VALUES (1);\n";
    await seedSnapshot("snap-a", content);
    const result = await readSnapshotContent(options, "snap-a");
    expect(result.snapshot.migrationVersion).toBe(1);
    expect(result.content).toBe(content);
    expect(result.truncated).toBe(false);
  });

  it("truncates content that exceeds the preview limit", async () => {
    await seedSnapshot("snap-b", "x".repeat(1000));
    const result = await readSnapshotContent(options, "snap-b", 100);
    expect(result.content).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });

  it("throws when the snapshot id does not exist", async () => {
    await expect(readSnapshotContent(options, "nope")).rejects.toThrow(/not found/);
  });
});

