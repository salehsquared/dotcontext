import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { cp } from "node:fs/promises";
import { statusCommand } from "../../src/commands/status.js";
import { writeContext } from "../../src/core/writer.js";
import { computeFingerprint } from "../../src/core/fingerprint.js";
import { createTmpDir, cleanupTmpDir, createFile, makeValidContext } from "../helpers.js";

let tmpDir: string;
let logs: string[];

beforeEach(async () => {
  tmpDir = await createTmpDir();
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTmpDir(tmpDir);
});

const fixturesDir = join(import.meta.dirname, "../fixtures");

describe("statusCommand", () => {
  it("shows fresh for up-to-date context", async () => {
    await createFile(tmpDir, "index.ts", "export const x = 1;");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    await statusCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("fresh");
  });

  it("shows stale when file size changes", async () => {
    await createFile(tmpDir, "index.ts", "short");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    // Change file size to force staleness
    await createFile(tmpDir, "index.ts", "this is much longer content that changes the size");

    await statusCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("stale");
  });

  it("shows missing when no context exists", async () => {
    await createFile(tmpDir, "index.ts", "code");

    await statusCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("missing");
  });

  it("reports health summary", async () => {
    await createFile(tmpDir, "index.ts", "code");

    await statusCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toMatch(/context health: \d+ of \d+ directories tracked/);
  });

  it("suggests regen for stale dirs", async () => {
    await createFile(tmpDir, "index.ts", "short");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    await createFile(tmpDir, "index.ts", "this is much longer content that changes the size");

    await statusCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("context regen");
  });

  it("works on empty project", async () => {
    await cp(join(fixturesDir, "empty-project"), tmpDir, { recursive: true });

    await statusCommand({ path: tmpDir });
    // Should not throw
  });
});
