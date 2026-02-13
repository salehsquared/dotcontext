import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { estimateDirectoryTokens, estimateContextFileTokens, filterByMinTokens, DEFAULT_MIN_TOKENS } from "../../src/utils/tokens.js";
import { createTmpDir, cleanupTmpDir, createFile, makeScanResult } from "../helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await cleanupTmpDir(tmpDir);
});

describe("estimateDirectoryTokens", () => {
  it("estimates tokens from file sizes (bytes / 4)", async () => {
    // Write 1000 bytes
    await createFile(tmpDir, "a.ts", "x".repeat(1000));
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"] });

    const tokens = await estimateDirectoryTokens(scan);
    expect(tokens).toBe(250); // 1000 / 4
  });

  it("sums tokens across multiple files", async () => {
    await createFile(tmpDir, "a.ts", "x".repeat(400));
    await createFile(tmpDir, "b.ts", "x".repeat(600));
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts", "b.ts"] });

    const tokens = await estimateDirectoryTokens(scan);
    expect(tokens).toBe(250); // (400 + 600) / 4
  });

  it("handles empty directories", async () => {
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: [] });

    const tokens = await estimateDirectoryTokens(scan);
    expect(tokens).toBe(0);
  });

  it("skips missing files without error", async () => {
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["nonexistent.ts"] });

    const tokens = await estimateDirectoryTokens(scan);
    expect(tokens).toBe(0);
  });

  it("rounds up token estimate", async () => {
    // 5 bytes → ceil(5/4) = 2 tokens
    await createFile(tmpDir, "tiny.ts", "abcde");
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["tiny.ts"] });

    const tokens = await estimateDirectoryTokens(scan);
    expect(tokens).toBe(2);
  });
});

describe("estimateContextFileTokens", () => {
  it("returns token count for existing .context.yaml", async () => {
    // Write 400 bytes to .context.yaml
    await createFile(tmpDir, ".context.yaml", "x".repeat(400));
    const tokens = await estimateContextFileTokens(tmpDir);
    expect(tokens).toBe(100); // 400 / 4
  });

  it("returns 0 for missing .context.yaml", async () => {
    const tokens = await estimateContextFileTokens(tmpDir);
    expect(tokens).toBe(0);
  });
});

describe("filterByMinTokens", () => {
  it("filters out directories below threshold", async () => {
    await createFile(tmpDir, "a.ts", "x".repeat(100)); // 25 tokens, below default 4096
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"] });

    const { dirs, skipped } = await filterByMinTokens([scan]);
    expect(dirs).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("includes directories at or above threshold", async () => {
    // 4096 * 4 = 16384 bytes needed for default threshold
    await createFile(tmpDir, "big.ts", "x".repeat(16384));
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["big.ts"] });

    const { dirs, skipped } = await filterByMinTokens([scan]);
    expect(dirs).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it("never filters root directory", async () => {
    await createFile(tmpDir, "a.ts", "tiny"); // very small
    const scan = makeScanResult(tmpDir, { relativePath: ".", files: ["a.ts"] });

    const { dirs, skipped } = await filterByMinTokens([scan]);
    expect(dirs).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it("returns skipped count", async () => {
    await createFile(tmpDir, "a.ts", "x".repeat(10));
    const scan1 = makeScanResult(tmpDir, { relativePath: "a", files: ["a.ts"] });
    const scan2 = makeScanResult(tmpDir, { relativePath: "b", files: ["a.ts"] });

    const { dirs, skipped } = await filterByMinTokens([scan1, scan2]);
    expect(dirs).toHaveLength(0);
    expect(skipped).toBe(2);
  });

  it("respects custom min_tokens value", async () => {
    await createFile(tmpDir, "a.ts", "x".repeat(100)); // 25 tokens
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"] });

    const { dirs: filtered } = await filterByMinTokens([scan], 20);
    expect(filtered).toHaveLength(1);
  });

  it("disables filtering when min_tokens is 0", async () => {
    await createFile(tmpDir, "a.ts", "tiny");
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"] });

    const { dirs, skipped } = await filterByMinTokens([scan], 0);
    expect(dirs).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it("default threshold is 4096", () => {
    expect(DEFAULT_MIN_TOKENS).toBe(4096);
  });

  it("keeps routing directory when child is above threshold", async () => {
    const childDir = join(tmpDir, "child");
    await mkdir(childDir);
    await createFile(childDir, "big.ts", "x".repeat(16384)); // 4096 tokens

    // Bottom-up order: child before parent
    const childScan = makeScanResult(childDir, { relativePath: "parent/child", files: ["big.ts"] });
    const parentScan = makeScanResult(tmpDir, { relativePath: "parent", files: [] });

    const { dirs, skipped } = await filterByMinTokens([childScan, parentScan]);
    expect(dirs).toHaveLength(2); // both kept
    expect(skipped).toBe(0);
  });

  it("skips routing directory when all children are below threshold", async () => {
    const childDir = join(tmpDir, "child");
    await mkdir(childDir);
    await createFile(childDir, "tiny.ts", "x".repeat(10)); // 3 tokens

    const childScan = makeScanResult(childDir, { relativePath: "parent/child", files: ["tiny.ts"] });
    const parentScan = makeScanResult(tmpDir, { relativePath: "parent", files: [] });

    const { dirs, skipped } = await filterByMinTokens([childScan, parentScan]);
    expect(dirs).toHaveLength(0);
    expect(skipped).toBe(2);
  });

  it("chains parent-keeping through multiple levels", async () => {
    const midDir = join(tmpDir, "mid");
    const leafDir = join(midDir, "leaf");
    await mkdir(midDir);
    await mkdir(leafDir);
    await createFile(leafDir, "big.ts", "x".repeat(16384));

    // Bottom-up: leaf → mid → root-like parent
    const leafScan = makeScanResult(leafDir, { relativePath: "top/mid/leaf", files: ["big.ts"] });
    const midScan = makeScanResult(midDir, { relativePath: "top/mid", files: [] });
    const topScan = makeScanResult(tmpDir, { relativePath: "top", files: [] });

    const { dirs, skipped } = await filterByMinTokens([leafScan, midScan, topScan]);
    expect(dirs).toHaveLength(3); // all kept via chain
    expect(skipped).toBe(0);
  });
});
