import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadScanOptions } from "../src/utils/scan-options.js";
import { saveConfig } from "../src/utils/config.js";
import { createTmpDir, cleanupTmpDir } from "./helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await cleanupTmpDir(tmpDir);
});

describe("loadScanOptions", () => {
  it("returns empty options when no config exists", async () => {
    const opts = await loadScanOptions(tmpDir);
    expect(opts).toEqual({});
  });

  it("extracts maxDepth from config", async () => {
    await saveConfig(tmpDir, { provider: "anthropic", max_depth: 5 });
    const opts = await loadScanOptions(tmpDir);
    expect(opts.maxDepth).toBe(5);
  });

  it("extracts extraIgnore from config", async () => {
    await saveConfig(tmpDir, { provider: "anthropic", ignore: ["tmp", "scripts"] });
    const opts = await loadScanOptions(tmpDir);
    expect(opts.extraIgnore).toEqual(["tmp", "scripts"]);
  });

  it("returns undefined for missing optional fields", async () => {
    await saveConfig(tmpDir, { provider: "anthropic" });
    const opts = await loadScanOptions(tmpDir);
    expect(opts.maxDepth).toBeUndefined();
    expect(opts.extraIgnore).toBeUndefined();
  });
});
