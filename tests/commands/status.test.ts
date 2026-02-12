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

describe("statusCommand --json", () => {
  let stdoutChunks: string[];

  beforeEach(() => {
    stdoutChunks = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
  });

  it("outputs valid JSON", async () => {
    await createFile(tmpDir, "index.ts", "export const x = 1;");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    await statusCommand({ path: tmpDir, json: true });

    const raw = stdoutChunks.join("");
    const parsed = JSON.parse(raw);
    expect(parsed).toBeDefined();
  });

  it("JSON contains directories array with required fields", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    await statusCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    expect(parsed.directories).toBeInstanceOf(Array);
    expect(parsed.directories.length).toBeGreaterThan(0);

    const entry = parsed.directories[0];
    expect(entry).toHaveProperty("scope");
    expect(entry).toHaveProperty("state");
    expect(entry).toHaveProperty("fingerprint");
  });

  it("JSON contains summary with correct counts", async () => {
    await createFile(tmpDir, "index.ts", "code");

    await statusCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    expect(parsed.summary).toHaveProperty("total");
    expect(parsed.summary).toHaveProperty("tracked");
    expect(parsed.summary).toHaveProperty("fresh");
    expect(parsed.summary).toHaveProperty("stale");
    expect(parsed.summary).toHaveProperty("missing");
    expect(parsed.summary.missing).toBe(1);
  });

  it("JSON includes root path", async () => {
    await createFile(tmpDir, "index.ts", "code");

    await statusCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    expect(parsed.root).toBe(tmpDir);
  });

  it("reports fresh/stale/missing states correctly in JSON", async () => {
    await createFile(tmpDir, "index.ts", "short");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    // Make it stale
    await createFile(tmpDir, "index.ts", "this is much longer content to make it stale");

    await statusCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    const entry = parsed.directories.find((d: { scope: string }) => d.scope === ".");
    expect(entry.state).toBe("stale");
  });

  it("emits no extra stdout noise (single JSON-parseable object)", async () => {
    await createFile(tmpDir, "index.ts", "code");

    await statusCommand({ path: tmpDir, json: true });

    // console.log should not be called in JSON mode
    expect(logs).toHaveLength(0);

    // stdout should contain exactly one valid JSON object
    const raw = stdoutChunks.join("");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("directories sorted deterministically by scope", async () => {
    await createFile(tmpDir, "index.ts", "code");

    await statusCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    const scopes = parsed.directories.map((d: { scope: string }) => d.scope);
    const sorted = [...scopes].sort();
    expect(scopes).toEqual(sorted);
  });
});
