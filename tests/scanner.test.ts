import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { scanProject, flattenBottomUp, groupByDepth } from "../src/core/scanner.js";
import { createTmpDir, cleanupTmpDir, createFile, createNestedFile } from "./helpers.js";


let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await cleanupTmpDir(tmpDir);
});

describe("scanProject", () => {
  it("finds source files (.ts, .py, .js)", async () => {
    await createFile(tmpDir, "index.ts", "export default 1;");
    await createFile(tmpDir, "main.py", "print('hi')");
    await createFile(tmpDir, "app.js", "module.exports = {}");

    const result = await scanProject(tmpDir);
    expect(result.files).toEqual(["app.js", "index.ts", "main.py"]);
  });

  it("ignores node_modules directory", async () => {
    await createNestedFile(tmpDir, "node_modules/pkg/index.js", "code");
    await createNestedFile(tmpDir, "src/app.ts", "code");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);
    expect(allPaths).not.toContain(expect.stringContaining("node_modules"));
  });

  it("ignores .git directory", async () => {
    await createNestedFile(tmpDir, ".git/HEAD", "ref: refs/heads/main");
    await createFile(tmpDir, "index.ts", "code");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);
    expect(allPaths.some((p) => p.includes(".git"))).toBe(false);
  });

  it("ignores dist directory", async () => {
    await createNestedFile(tmpDir, "dist/index.js", "compiled");
    await createFile(tmpDir, "index.ts", "code");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);
    expect(allPaths.some((p) => p.includes("dist"))).toBe(false);
  });

  it("ignores hidden directories (starting with .)", async () => {
    await createNestedFile(tmpDir, ".hidden/secret.ts", "secret");
    await createFile(tmpDir, "index.ts", "code");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);
    expect(allPaths.some((p) => p.includes(".hidden"))).toBe(false);
  });

  it("respects maxDepth option", async () => {
    await createNestedFile(tmpDir, "a/file.ts", "shallow code");
    await createNestedFile(tmpDir, "a/b/c/deep.ts", "deep code");

    const result = await scanProject(tmpDir, { maxDepth: 1 });
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);

    // a/ should exist (depth 1) with its direct file, but a/b/ should not (depth 2)
    expect(allPaths.some((p) => p === "a")).toBe(true);
    expect(allPaths.some((p) => p.includes("a/b"))).toBe(false);
  });

  it("respects .gitignore patterns", async () => {
    await createFile(tmpDir, ".gitignore", "ignored_dir\n");
    await createNestedFile(tmpDir, "ignored_dir/code.ts", "ignored");
    await createNestedFile(tmpDir, "kept_dir/code.ts", "kept");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);

    expect(allPaths.some((p) => p.includes("ignored_dir"))).toBe(false);
    expect(allPaths.some((p) => p.includes("kept_dir"))).toBe(true);
  });

  it("respects .contextignore patterns", async () => {
    await createFile(tmpDir, ".contextignore", "skip_this\n");
    await createNestedFile(tmpDir, "skip_this/code.ts", "skipped");
    await createNestedFile(tmpDir, "keep_this/code.ts", "kept");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);

    expect(allPaths.some((p) => p.includes("skip_this"))).toBe(false);
    expect(allPaths.some((p) => p.includes("keep_this"))).toBe(true);
  });

  it("supports glob directory patterns in ignore files", async () => {
    await createFile(tmpDir, ".contextignore", "packages/*/dist\n");
    await createNestedFile(tmpDir, "packages/a/dist/app.ts", "ignored");
    await createNestedFile(tmpDir, "packages/a/src/app.ts", "kept");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);

    expect(allPaths.some((p) => p.includes("packages/a/dist"))).toBe(false);
    expect(allPaths.some((p) => p.includes("packages/a/src"))).toBe(true);
  });

  it("supports path-based ignore rules", async () => {
    await createFile(tmpDir, ".gitignore", "src/generated\n");
    await createNestedFile(tmpDir, "src/generated/types.ts", "ignored");
    await createNestedFile(tmpDir, "src/core/app.ts", "kept");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);

    expect(allPaths.some((p) => p.includes("src/generated"))).toBe(false);
    expect(allPaths.some((p) => p.includes("src/core"))).toBe(true);
  });

  it("supports basename glob patterns in ignore files", async () => {
    await createFile(tmpDir, ".contextignore", "*.cache\n");
    await createNestedFile(tmpDir, "build.cache/tmp.ts", "ignored");
    await createNestedFile(tmpDir, "src/app.ts", "kept");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);

    expect(allPaths.some((p) => p.includes("build.cache"))).toBe(false);
    expect(allPaths.some((p) => p.includes("src"))).toBe(true);
  });

  it("detects existing .context.yaml (hasContext flag)", async () => {
    await createFile(tmpDir, "index.ts", "code");
    await createFile(tmpDir, ".context.yaml", "version: 1");

    const result = await scanProject(tmpDir);
    expect(result.hasContext).toBe(true);
  });

  it("hasContext is false when no .context.yaml exists", async () => {
    await createFile(tmpDir, "index.ts", "code");

    const result = await scanProject(tmpDir);
    expect(result.hasContext).toBe(false);
  });

  it("returns empty files list for empty project", async () => {
    const result = await scanProject(tmpDir);
    expect(result.files).toEqual([]);
  });

  it("returns sorted file list", async () => {
    await createFile(tmpDir, "c.ts", "");
    await createFile(tmpDir, "a.ts", "");
    await createFile(tmpDir, "b.ts", "");

    const result = await scanProject(tmpDir);
    expect(result.files).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("excludes directories with only non-source files", async () => {
    await mkdir(join(tmpDir, "data"));
    await createFile(join(tmpDir, "data"), "readme", "just text no extension");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);
    expect(allPaths.some((p) => p.includes("data"))).toBe(false);
  });

  it("includes Dockerfile as meaningful file", async () => {
    await mkdir(join(tmpDir, "docker"));
    await createFile(join(tmpDir, "docker"), "Dockerfile", "FROM node:18");

    const result = await scanProject(tmpDir);
    const dockerDir = flattenBottomUp(result).find((r) => r.relativePath.includes("docker"));
    expect(dockerDir).toBeDefined();
    expect(dockerDir!.files).toContain("Dockerfile");
  });

  it("recursively scans nested directories", async () => {
    await createNestedFile(tmpDir, "src/core/schema.ts", "export const x = 1;");

    const result = await scanProject(tmpDir);
    const flat = flattenBottomUp(result);
    const corePath = flat.find((r) => r.relativePath.includes("core"));
    expect(corePath).toBeDefined();
    expect(corePath!.files).toContain("schema.ts");
  });

  it("sets relativePath correctly", async () => {
    await createNestedFile(tmpDir, "src/core/file.ts", "code");

    const result = await scanProject(tmpDir);
    expect(result.relativePath).toBe(".");

    const src = result.children.find((c) => c.relativePath === "src");
    expect(src).toBeDefined();

    const core = src!.children.find((c) => c.relativePath === "src/core");
    expect(core).toBeDefined();
  });
});

describe("scanProject — negation patterns", () => {
  it("negation re-includes a previously ignored directory", async () => {
    await createFile(tmpDir, ".contextignore", "generated\n!generated\n");
    await createNestedFile(tmpDir, "generated/types.ts", "export type Foo = {}");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);
    expect(allPaths.some((p) => p.includes("generated"))).toBe(true);
  });

  it("negation after glob re-includes specific match", async () => {
    await createFile(tmpDir, ".contextignore", "*.log\n!keep.log\n");
    await createNestedFile(tmpDir, "debug.log/trace.ts", "code");
    await createNestedFile(tmpDir, "keep.log/main.ts", "code");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);
    expect(allPaths.some((p) => p.includes("debug.log"))).toBe(false);
    expect(allPaths.some((p) => p.includes("keep.log"))).toBe(true);
  });

  it("double-star negation re-includes specific nested path", async () => {
    await createFile(tmpDir, ".contextignore", "packages/**/reports\n!packages/core/reports\n");
    await createNestedFile(tmpDir, "packages/core/reports/summary.ts", "code");
    await createNestedFile(tmpDir, "packages/other/reports/summary.ts", "code");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);
    expect(allPaths.some((p) => p.includes("packages/core/reports"))).toBe(true);
    expect(allPaths.some((p) => p.includes("packages/other/reports"))).toBe(false);
  });
});

describe("scanProject — source extension & meaningful file coverage", () => {
  it("recognizes additional source extensions (.rs, .go, .vue, .svelte, .proto)", async () => {
    await createFile(tmpDir, "main.rs", "fn main() {}");
    await createFile(tmpDir, "main.go", "package main");
    await createFile(tmpDir, "App.vue", "<template></template>");
    await createFile(tmpDir, "App.svelte", "<script>let x = 1;</script>");
    await createFile(tmpDir, "service.proto", "syntax = \"proto3\";");

    const result = await scanProject(tmpDir);
    expect(result.files).toContain("main.rs");
    expect(result.files).toContain("main.go");
    expect(result.files).toContain("App.vue");
    expect(result.files).toContain("App.svelte");
    expect(result.files).toContain("service.proto");
  });

  it("recognizes additional meaningful files (Cargo.toml, go.mod, pyproject.toml)", async () => {
    await mkdir(join(tmpDir, "project"));
    await createFile(join(tmpDir, "project"), "Cargo.toml", "[package]");
    await createFile(join(tmpDir, "project"), "go.mod", "module example");
    await createFile(join(tmpDir, "project"), "pyproject.toml", "[tool.poetry]");

    const result = await scanProject(tmpDir);
    const projectDir = flattenBottomUp(result).find((r) => r.relativePath === "project");
    expect(projectDir).toBeDefined();
    expect(projectDir!.files).toContain("Cargo.toml");
    expect(projectDir!.files).toContain("go.mod");
    expect(projectDir!.files).toContain("pyproject.toml");
  });

  it("ignores files with no recognized extension", async () => {
    await createFile(tmpDir, "LICENSE", "MIT");
    await createFile(tmpDir, "CODEOWNERS", "* @owner");
    await createFile(tmpDir, ".env", "SECRET=abc");

    const result = await scanProject(tmpDir);
    expect(result.files).not.toContain("LICENSE");
    expect(result.files).not.toContain("CODEOWNERS");
    expect(result.files).not.toContain(".env");
  });
});

describe("scanProject — glob pattern matching", () => {
  it("? wildcard matches single character in ignore pattern", async () => {
    await createFile(tmpDir, ".contextignore", "log?\n");
    await createNestedFile(tmpDir, "log1/file.ts", "code");
    await createNestedFile(tmpDir, "logdir/file.ts", "code");
    await createNestedFile(tmpDir, "log/file.ts", "code");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);

    expect(allPaths.some((p) => p.includes("log1"))).toBe(false);
    expect(allPaths.some((p) => p.includes("logdir"))).toBe(true);
    expect(allPaths.some((p) => p === "log")).toBe(true);
  });

  it("double-star in middle of path matches nested directories", async () => {
    await createFile(tmpDir, ".contextignore", "src/**/generated\n");
    await createNestedFile(tmpDir, "src/a/generated/out.ts", "code");
    await createNestedFile(tmpDir, "src/a/b/generated/out.ts", "code");
    await createNestedFile(tmpDir, "src/a/kept/out.ts", "code");

    const result = await scanProject(tmpDir);
    const allPaths = flattenBottomUp(result).map((r) => r.relativePath);

    expect(allPaths.some((p) => p.includes("src/a/generated"))).toBe(false);
    expect(allPaths.some((p) => p.includes("src/a/b/generated"))).toBe(false);
    expect(allPaths.some((p) => p.includes("src/a/kept"))).toBe(true);
  });
});

describe("flattenBottomUp", () => {
  it("returns children before parents", async () => {
    await createNestedFile(tmpDir, "src/core/file.ts", "code");
    await createNestedFile(tmpDir, "src/file.ts", "code");

    const result = await scanProject(tmpDir);
    const flat = flattenBottomUp(result);
    const paths = flat.map((r) => r.relativePath);

    const coreIdx = paths.indexOf("src/core");
    const srcIdx = paths.indexOf("src");
    const rootIdx = paths.indexOf(".");

    expect(coreIdx).toBeLessThan(srcIdx);
    expect(srcIdx).toBeLessThan(rootIdx);
  });

  it("returns single entry for flat directory", async () => {
    await createFile(tmpDir, "index.ts", "code");

    const result = await scanProject(tmpDir);
    const flat = flattenBottomUp(result);
    expect(flat).toHaveLength(1);
    expect(flat[0].relativePath).toBe(".");
  });

  it("handles deeply nested trees", async () => {
    await createNestedFile(tmpDir, "a/b/c/file.ts", "code");

    const result = await scanProject(tmpDir);
    const flat = flattenBottomUp(result);
    const paths = flat.map((r) => r.relativePath);

    // c before b before a before root
    const cIdx = paths.findIndex((p) => p.endsWith("c"));
    const bIdx = paths.findIndex((p) => p.endsWith("b"));
    const aIdx = paths.findIndex((p) => p === "a");
    const rootIdx = paths.indexOf(".");

    expect(cIdx).toBeLessThan(bIdx);
    expect(bIdx).toBeLessThan(aIdx);
    expect(aIdx).toBeLessThan(rootIdx);
  });
});

describe("groupByDepth", () => {
  it("groups root-only tree into single layer", async () => {
    await createFile(tmpDir, "index.ts", "code");

    const result = await scanProject(tmpDir);
    const groups = groupByDepth(result);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(1);
    expect(groups[0][0].relativePath).toBe(".");
  });

  it("groups two-level tree into 2 layers", async () => {
    await createNestedFile(tmpDir, "src/app.ts", "code");
    await createFile(tmpDir, "index.ts", "code");

    const result = await scanProject(tmpDir);
    const groups = groupByDepth(result);

    expect(groups).toHaveLength(2);
    // First layer (deepest) = children
    expect(groups[0].map((r) => r.relativePath)).toContain("src");
    // Second layer = root
    expect(groups[1].map((r) => r.relativePath)).toContain(".");
  });

  it("groups three-level tree correctly (deepest first)", async () => {
    await createNestedFile(tmpDir, "a/b/file.ts", "code");
    await createFile(tmpDir, "index.ts", "code");

    const result = await scanProject(tmpDir);
    const groups = groupByDepth(result);

    expect(groups).toHaveLength(3);
    // Deepest layer first
    expect(groups[0].some((r) => r.relativePath === "a/b")).toBe(true);
    expect(groups[1].some((r) => r.relativePath === "a")).toBe(true);
    expect(groups[2].some((r) => r.relativePath === ".")).toBe(true);
  });

  it("leaf layer first, root layer last (bottom-up)", async () => {
    await createNestedFile(tmpDir, "src/core/file.ts", "code");
    await createNestedFile(tmpDir, "src/file.ts", "code");
    await createFile(tmpDir, "index.ts", "code");

    const result = await scanProject(tmpDir);
    const groups = groupByDepth(result);

    // First group is deepest, last group is root
    const firstPaths = groups[0].map((r) => r.relativePath);
    const lastPaths = groups[groups.length - 1].map((r) => r.relativePath);

    expect(firstPaths).toContain("src/core");
    expect(lastPaths).toContain(".");
  });

  it("each layer contains only siblings (no parent-child)", async () => {
    await createNestedFile(tmpDir, "a/file.ts", "code");
    await createNestedFile(tmpDir, "b/file.ts", "code");
    await createFile(tmpDir, "index.ts", "code");

    const result = await scanProject(tmpDir);
    const groups = groupByDepth(result);

    // Layer 0 should contain a and b (both at depth 1) — they are siblings
    const layer0Paths = groups[0].map((r) => r.relativePath).sort();
    expect(layer0Paths).toEqual(["a", "b"]);

    // Layer 1 should contain only root
    expect(groups[1]).toHaveLength(1);
    expect(groups[1][0].relativePath).toBe(".");
  });
});
