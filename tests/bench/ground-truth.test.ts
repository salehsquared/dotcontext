import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createTmpDir, cleanupTmpDir, createFile, makeScanResult } from "../helpers.js";
import {
  buildDepSets,
  buildReverseDeps,
  buildDirFacts,
  buildFileTree,
  computeScopeTokens,
} from "../../src/bench/ground-truth.js";
import type { ScanResult } from "../../src/core/scanner.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await cleanupTmpDir(tmpDir);
});

describe("buildDepSets", () => {
  it("extracts external deps from package.json", async () => {
    await createFile(tmpDir, "package.json", JSON.stringify({
      name: "test",
      dependencies: { chalk: "^5", commander: "^12", yaml: "^2" },
    }));
    await createFile(tmpDir, "index.ts", "code");

    const scan = makeScanResult(tmpDir, { files: ["package.json", "index.ts"] });
    const { external } = await buildDepSets(scan);
    expect(external.get(".")?.length).toBeGreaterThanOrEqual(3);
    expect(external.get(".")?.some(d => d === "chalk")).toBe(true);
  });

  it("extracts internal deps from import statements", async () => {
    await createFile(tmpDir, "index.ts", 'import { helper } from "./utils.js";\nimport { scan } from "./core.js";');

    const scan = makeScanResult(tmpDir, { files: ["index.ts"] });
    const { internal } = await buildDepSets(scan);
    expect(internal.get(".")?.length).toBe(2);
  });

  it("normalizes dep names (strips versions)", async () => {
    await createFile(tmpDir, "package.json", JSON.stringify({
      name: "test",
      dependencies: { "some-pkg": "^1.2.3" },
    }));
    await createFile(tmpDir, "index.ts", "code");

    const scan = makeScanResult(tmpDir, { files: ["package.json", "index.ts"] });
    const { external } = await buildDepSets(scan);
    const deps = external.get(".");
    expect(deps).toBeDefined();
    // Should not contain version strings
    for (const dep of deps!) {
      expect(dep).not.toMatch(/\^|\~|\d+\.\d+/);
    }
  });

  it("returns empty sets for dirs with no deps", async () => {
    await createFile(tmpDir, "readme.md", "hello");

    const scan = makeScanResult(tmpDir, { files: ["readme.md"] });
    const { external, internal } = await buildDepSets(scan);
    expect(external.size).toBe(0);
    expect(internal.size).toBe(0);
  });
});

describe("buildReverseDeps", () => {
  it("maps imported file to its importers", async () => {
    await createFile(tmpDir, "a.ts", 'import { x } from "./b.js";');
    await createFile(tmpDir, "b.ts", "export const x = 1;");

    const scan = makeScanResult(tmpDir, { files: ["a.ts", "b.ts"] });
    const reverseDeps = await buildReverseDeps(scan);
    // b should be imported by a
    const importers = reverseDeps.get("b");
    expect(importers).toBeDefined();
    expect(importers).toContain("a.ts");
  });

  it("handles nested directories", async () => {
    const coreDir = join(tmpDir, "core");
    await mkdir(coreDir);
    await createFile(tmpDir, "index.ts", 'import { scan } from "./core/scanner.js";');
    await createFile(coreDir, "scanner.ts", "export function scan() {}");

    const coreScan = makeScanResult(coreDir, { relativePath: "core", files: ["scanner.ts"] });
    const scan = makeScanResult(tmpDir, { files: ["index.ts"], children: [coreScan] });
    const reverseDeps = await buildReverseDeps(scan);

    const importers = reverseDeps.get("core/scanner");
    expect(importers).toBeDefined();
    expect(importers).toContain("index.ts");
  });

  it("returns empty map for projects with no imports", async () => {
    await createFile(tmpDir, "a.ts", "const x = 1;");

    const scan = makeScanResult(tmpDir, { files: ["a.ts"] });
    const reverseDeps = await buildReverseDeps(scan);
    expect(reverseDeps.size).toBe(0);
  });
});

describe("buildDirFacts", () => {
  it("collects file names per directory", async () => {
    await createFile(tmpDir, "a.ts", "export const a = 1;");
    await createFile(tmpDir, "b.ts", "export const b = 2;");

    const scan = makeScanResult(tmpDir, { files: ["a.ts", "b.ts"] });
    const facts = await buildDirFacts(scan);
    expect(facts.get(".")?.files).toEqual(["a.ts", "b.ts"]);
    expect(facts.get(".")?.fileCount).toBe(2);
  });

  it("collects export names per directory", async () => {
    await createFile(tmpDir, "mod.ts", "export function hello() {}\nexport const world = 1;");

    const scan = makeScanResult(tmpDir, { files: ["mod.ts"] });
    const facts = await buildDirFacts(scan);
    const exports = facts.get(".")?.exports ?? [];
    expect(exports).toContain("hello");
    expect(exports).toContain("world");
  });

  it("handles nested directories", async () => {
    const subDir = join(tmpDir, "sub");
    await mkdir(subDir);
    await createFile(subDir, "x.ts", "export const x = 1;");

    const subScan = makeScanResult(subDir, { relativePath: "sub", files: ["x.ts"] });
    const scan = makeScanResult(tmpDir, { files: [], children: [subScan] });
    const facts = await buildDirFacts(scan);
    expect(facts.has("sub")).toBe(true);
    expect(facts.get("sub")?.exports).toContain("x");
  });
});

describe("buildFileTree", () => {
  it("renders nested directories with indentation", () => {
    const child = makeScanResult(join(tmpDir, "core"), {
      relativePath: "core",
      files: ["scanner.ts", "schema.ts"],
    });
    const scan = makeScanResult(tmpDir, {
      files: ["index.ts"],
      children: [child],
    });

    const tree = buildFileTree(scan);
    expect(tree).toContain("./");
    expect(tree).toContain("  index.ts");
    expect(tree).toContain("  core/");
    expect(tree).toContain("    scanner.ts");
  });

  it("sorts files and dirs alphabetically", () => {
    const scan = makeScanResult(tmpDir, {
      files: ["z.ts", "a.ts", "m.ts"],
    });

    const tree = buildFileTree(scan);
    const lines = tree.split("\n");
    const fileLines = lines.filter(l => l.trim().endsWith(".ts"));
    expect(fileLines[0]).toContain("a.ts");
    expect(fileLines[1]).toContain("m.ts");
    expect(fileLines[2]).toContain("z.ts");
  });
});

describe("computeScopeTokens", () => {
  it("baseline includes source files in scope dir", async () => {
    // Create files with known sizes
    await createFile(tmpDir, "a.ts", "x".repeat(400)); // 400 bytes
    await createFile(tmpDir, "b.ts", "y".repeat(400)); // 400 bytes

    const scan = makeScanResult(tmpDir, { files: ["a.ts", "b.ts"] });
    const contextSizes = new Map<string, number>();
    contextSizes.set(".", 100); // 100 byte context file

    const tokens = await computeScopeTokens(".", scan, contextSizes);
    expect(tokens.baseline).toBe(200); // 800 bytes / 4
  });

  it("context includes .context.yaml for scope + parent + children", async () => {
    await createFile(tmpDir, "a.ts", "x".repeat(4000));
    const childDir = join(tmpDir, "core");
    await mkdir(childDir);
    await createFile(childDir, "b.ts", "y".repeat(4000));

    const childScan = makeScanResult(childDir, { relativePath: "core", files: ["b.ts"] });
    const scan = makeScanResult(tmpDir, { files: ["a.ts"], children: [childScan] });

    const contextSizes = new Map<string, number>();
    contextSizes.set(".", 200);
    contextSizes.set("core", 100);

    const tokens = await computeScopeTokens(".", scan, contextSizes);
    // context = (200 + 100) / 4 = 75
    expect(tokens.context).toBe(75);
  });

  it("context tokens << baseline tokens for typical directories", async () => {
    await createFile(tmpDir, "big.ts", "x".repeat(10000));

    const scan = makeScanResult(tmpDir, { files: ["big.ts"] });
    const contextSizes = new Map<string, number>();
    contextSizes.set(".", 200);

    const tokens = await computeScopeTokens(".", scan, contextSizes);
    expect(tokens.context).toBeLessThan(tokens.baseline);
    expect(tokens.baseline / tokens.context).toBeGreaterThan(10);
  });
});
