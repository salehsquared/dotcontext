import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rehashCommand } from "../../src/commands/rehash.js";
import { writeContext, readContext, writeConfig } from "../../src/core/writer.js";
import { computeFingerprint } from "../../src/core/fingerprint.js";
import { createTmpDir, cleanupTmpDir, createFile, createNestedFile, makeValidContext } from "../helpers.js";

let tmpDir: string;
let logs: string[];

beforeEach(async () => {
  tmpDir = await createTmpDir();
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args) => {
    logs.push(args.map(String).join(" "));
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTmpDir(tmpDir);
});

describe("rehashCommand", () => {
  it("updates fingerprint and timestamp for tracked directories", async () => {
    await createFile(tmpDir, "index.ts", "short");
    const originalFingerprint = await computeFingerprint(tmpDir);
    await writeContext(
      tmpDir,
      makeValidContext({
        fingerprint: originalFingerprint,
        last_updated: "2020-01-01T00:00:00.000Z",
      }),
    );

    await createFile(tmpDir, "index.ts", "this is much longer content");

    await rehashCommand({ path: tmpDir });

    const updatedContext = await readContext(tmpDir);
    const expectedFingerprint = await computeFingerprint(tmpDir);
    expect(updatedContext?.fingerprint).toBe(expectedFingerprint);
    expect(updatedContext?.last_updated).toBe("2020-01-01T00:00:00.000Z");
    expect(logs.join("\n")).toContain("Updated fingerprints for 1 directories.");
  });

  it("skips directories without .context.yaml", async () => {
    await createFile(tmpDir, "index.ts", "code");

    await rehashCommand({ path: tmpDir });

    expect(logs.join("\n")).toContain("Updated fingerprints for 0 directories.");
  });

  it("respects max_depth from config when scanning", async () => {
    await createFile(tmpDir, "index.ts", "root");
    await createNestedFile(tmpDir, "src/app.ts", "nested");
    await writeConfig(tmpDir, { provider: "anthropic", max_depth: 0 });
    await writeContext(tmpDir, makeValidContext({ fingerprint: await computeFingerprint(tmpDir), scope: "." }));

    await rehashCommand({ path: tmpDir });

    // max_depth 0 means only root is scanned
    expect(logs.join("\n")).toContain("Updated fingerprints for 1 directories.");
  });
});
