import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { statsCommand } from "../../src/commands/stats.js";
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
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTmpDir(tmpDir);
});

// Helper: create a project with source files and context
async function setupTrackedDir(
  dirPath: string,
  relativePath: string,
  opts?: {
    sourceBytes?: number;
    summary?: string;
    exports?: string[];
    decisions?: { what: string; why: string }[];
    constraints?: string[];
    dependencies?: { internal?: string[]; external?: string[] };
  },
): Promise<void> {
  await mkdir(dirPath, { recursive: true });
  const bytes = opts?.sourceBytes ?? 4000;
  await createFile(dirPath, "index.ts", "x".repeat(bytes));
  const fp = await computeFingerprint(dirPath);
  await writeContext(dirPath, makeValidContext({
    fingerprint: fp,
    scope: relativePath,
    summary: opts?.summary ?? "Test module for things",
    exports: opts?.exports,
    decisions: opts?.decisions,
    constraints: opts?.constraints,
    dependencies: opts?.dependencies,
  }));
}

describe("statsCommand (human-readable)", () => {
  it("shows token reduction headline", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("Token Reduction");
    expect(output).toMatch(/\d+(\.\d+)?% reduction/);
    expect(output).toMatch(/\d+x smaller/);
  });

  it("shows tokens saved count", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("tokens saved");
  });

  it("shows codebase overview", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("Codebase");
    expect(output).toContain("directories");
    expect(output).toContain("source files");
    expect(output).toContain("estimated tokens");
  });

  it("shows freshness distribution", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("Freshness-Adjusted Impact");
    expect(output).toMatch(/\d+ fresh/);
  });

  it("shows all contexts fresh when none are stale", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("all contexts fresh");
  });

  it("shows staleness penalty when stale dirs exist", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });
    // Make it stale by changing a file
    await createFile(tmpDir, "index.ts", "x".repeat(16000));

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("staleness penalty");
  });

  it("shows context quality section", async () => {
    await setupTrackedDir(tmpDir, ".", {
      sourceBytes: 8000,
      exports: ["function foo(): void"],
      decisions: [{ what: "Use TypeScript", why: "Type safety" }],
    });

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("Context Quality");
    expect(output).toContain("summary quality");
    expect(output).toContain("signal density");
    expect(output).toContain("exports:");
    expect(output).toContain("decisions:");
    expect(output).toContain("constraints:");
    expect(output).toContain("dependencies:");
  });

  it("shows summary quality correctly with fallback summary", async () => {
    await setupTrackedDir(tmpDir, ".", {
      sourceBytes: 8000,
      summary: "Source directory.",
    });

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("1 fallback");
  });

  it("shows breakdown table", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("Breakdown");
    expect(output).toContain("scope");
    expect(output).toContain("source");
    expect(output).toContain("context");
    expect(output).toContain("reduction");
    expect(output).toContain("(root)");
  });

  it("shows language breakdown", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("Languages");
    expect(output).toContain(".ts");
  });

  it("handles project with no context files", async () => {
    // Create source file but no .context.yaml
    await createFile(tmpDir, "index.ts", "x".repeat(20000));

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("No .context.yaml files found");
    expect(output).toContain("context init");
  });

  it("handles empty project without error", async () => {
    // tmpDir has no source files — scanner still finds root dir but with 0 files
    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    // Should show "No .context.yaml files found" since root exists but has no context
    expect(output).toContain("No .context.yaml files found");
  });

  it("shows per-directory percentiles when enough dirs exist", async () => {
    const subDir = join(tmpDir, "sub");
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });
    await setupTrackedDir(subDir, "sub", { sourceBytes: 20000 });

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("p50");
    expect(output).toContain("p95");
  });

  it("shows multiple dirs in breakdown sorted by scope", async () => {
    const subA = join(tmpDir, "aaa");
    const subZ = join(tmpDir, "zzz");
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });
    await setupTrackedDir(subA, "aaa", { sourceBytes: 20000 });
    await setupTrackedDir(subZ, "zzz", { sourceBytes: 20000 });

    await statsCommand({ path: tmpDir });

    const output = logs.join("\n");
    const rootIdx = output.indexOf("(root)");
    const aaaIdx = output.indexOf("aaa");
    const zzzIdx = output.indexOf("zzz");
    expect(rootIdx).toBeLessThan(aaaIdx);
    expect(aaaIdx).toBeLessThan(zzzIdx);
  });
});

describe("statsCommand --json", () => {
  let stdoutChunks: string[];

  beforeEach(() => {
    stdoutChunks = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
  });

  it("outputs valid JSON with all sections", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    expect(parsed).toHaveProperty("token_economics");
    expect(parsed).toHaveProperty("freshness");
    expect(parsed).toHaveProperty("quality");
    expect(parsed).toHaveProperty("codebase");
    expect(parsed).toHaveProperty("directories");
  });

  it("directories array has per-dir fields", async () => {
    await setupTrackedDir(tmpDir, ".", {
      sourceBytes: 8000,
      exports: ["function foo(): void"],
    });

    await statsCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    const entry = parsed.directories[0];
    expect(entry).toHaveProperty("scope");
    expect(entry).toHaveProperty("source_tokens");
    expect(entry).toHaveProperty("context_tokens");
    expect(entry).toHaveProperty("reduction_percent");
    expect(entry).toHaveProperty("freshness");
    expect(entry).toHaveProperty("file_count");
    expect(entry).toHaveProperty("export_count");
    expect(entry).toHaveProperty("has_decisions");
    expect(entry).toHaveProperty("has_constraints");
    expect(entry).toHaveProperty("has_dependencies");
    expect(entry).toHaveProperty("summary_is_fallback");
    expect(entry).toHaveProperty("extensions");
  });

  it("token_economics has correct fields", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    const te = parsed.token_economics;
    expect(te.source_tokens).toBeGreaterThan(0);
    expect(te.context_tokens).toBeGreaterThan(0);
    expect(te.tokens_saved).toBeGreaterThan(0);
    expect(te.reduction_percent).toBeGreaterThan(0);
    expect(te.reduction_ratio).toBeGreaterThan(0);
  });

  it("freshness has correct fields", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    const f = parsed.freshness;
    expect(f).toHaveProperty("tracked");
    expect(f).toHaveProperty("fresh");
    expect(f).toHaveProperty("stale");
    expect(f).toHaveProperty("missing");
    expect(f).toHaveProperty("fresh_rate");
    expect(f).toHaveProperty("fresh_tokens_saved");
    expect(f).toHaveProperty("staleness_penalty");
    expect(f.fresh).toBe(1);
    expect(f.stale).toBe(0);
  });

  it("quality has correct coverage rates", async () => {
    await setupTrackedDir(tmpDir, ".", {
      sourceBytes: 8000,
      exports: ["function foo(): void"],
      decisions: [{ what: "d", why: "w" }],
      dependencies: { external: ["chalk"] },
    });

    await statsCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    const q = parsed.quality;
    expect(q).toHaveProperty("summary_quality_rate");
    expect(q).toHaveProperty("signal_density_avg");
    expect(q).toHaveProperty("exports_coverage");
    expect(q).toHaveProperty("decisions_coverage");
    expect(q).toHaveProperty("constraints_coverage");
    expect(q).toHaveProperty("dependencies_coverage");
    expect(q.exports_coverage).toBe(1);
    expect(q.decisions_coverage).toBe(1);
    expect(q.dependencies_coverage).toBe(1);
    expect(q.constraints_coverage).toBe(0);
  });

  it("codebase has correct counts", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    const c = parsed.codebase;
    expect(c.tracked).toBe(1);
    expect(c.total_source_files).toBeGreaterThan(0);
    expect(c.languages).toHaveProperty(".ts");
  });

  it("JSON includes root path", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    expect(parsed.root).toBe(tmpDir);
  });

  it("reports staleness in JSON when files change", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });
    // Make stale
    await createFile(tmpDir, "index.ts", "x".repeat(16000));

    await statsCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    expect(parsed.freshness.stale).toBe(1);
    expect(parsed.freshness.staleness_penalty).toBeGreaterThan(0);
  });

  it("signal density reflects populated fields", async () => {
    // All five fields present: good summary, exports, decisions, constraints, dependencies
    await setupTrackedDir(tmpDir, ".", {
      sourceBytes: 8000,
      summary: "A well-written summary",
      exports: ["function foo(): void"],
      decisions: [{ what: "d", why: "w" }],
      constraints: ["Must be fast"],
      dependencies: { external: ["chalk"] },
    });

    await statsCommand({ path: tmpDir, json: true });

    const parsed = JSON.parse(stdoutChunks.join(""));
    expect(parsed.quality.signal_density_avg).toBe(5);
  });

  it("emits no console.log in JSON mode", async () => {
    await setupTrackedDir(tmpDir, ".", { sourceBytes: 8000 });

    await statsCommand({ path: tmpDir, json: true });

    expect(logs).toHaveLength(0);
  });
});
