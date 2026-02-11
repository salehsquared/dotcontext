import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectExternalDeps, detectInternalDeps } from "../src/generator/dependencies.js";
import { createTmpDir, cleanupTmpDir, createFile, makeScanResult } from "./helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await cleanupTmpDir(tmpDir);
});

describe("detectExternalDeps", () => {
  it("parses package.json dependencies and devDependencies", async () => {
    await createFile(tmpDir, "package.json", JSON.stringify({
      dependencies: { express: "^4.18.0", cors: "^2.8.5" },
      devDependencies: { vitest: "^4.0.0" },
    }));

    const deps = await detectExternalDeps(tmpDir);
    expect(deps).toContain("express ^4.18.0");
    expect(deps).toContain("cors ^2.8.5");
    expect(deps).toContain("vitest ^4.0.0 (dev)");
  });

  it("caps at 30 entries", async () => {
    const dependencies: Record<string, string> = {};
    for (let i = 0; i < 35; i++) {
      dependencies[`pkg-${i}`] = `^${i}.0.0`;
    }
    await createFile(tmpDir, "package.json", JSON.stringify({ dependencies }));

    const deps = await detectExternalDeps(tmpDir);
    expect(deps).toHaveLength(30);
  });

  it("returns empty for directory without manifests", async () => {
    await createFile(tmpDir, "index.ts", "export const x = 1;");
    const deps = await detectExternalDeps(tmpDir);
    expect(deps).toEqual([]);
  });

  it("handles malformed package.json gracefully", async () => {
    await createFile(tmpDir, "package.json", "not json{{{");
    const deps = await detectExternalDeps(tmpDir);
    // Falls through to next manifest, then returns empty
    expect(deps).toEqual([]);
  });

  it("parses requirements.txt", async () => {
    await createFile(tmpDir, "requirements.txt", [
      "flask>=2.0",
      "requests==2.31.0",
      "# comment",
      "",
      "click",
    ].join("\n"));

    const deps = await detectExternalDeps(tmpDir);
    expect(deps).toContain("flask >=2.0");
    expect(deps).toContain("requests ==2.31.0");
    expect(deps).toContain("click");
    expect(deps).toHaveLength(3);
  });

  it("parses Cargo.toml dependencies", async () => {
    await createFile(tmpDir, "Cargo.toml", [
      "[package]",
      'name = "myproject"',
      "",
      "[dependencies]",
      'serde = "1.0"',
      'tokio = { version = "1.0", features = ["full"] }',
      "",
      "[dev-dependencies]",
      'criterion = "0.5"',
    ].join("\n"));

    const deps = await detectExternalDeps(tmpDir);
    expect(deps).toContain("serde 1.0");
    expect(deps).toContain("tokio 1.0");
    // dev-dependencies is a separate section, not matched by [dependencies]
    expect(deps).toHaveLength(2);
  });

  it("parses go.mod require block", async () => {
    await createFile(tmpDir, "go.mod", [
      "module github.com/user/project",
      "",
      "go 1.21",
      "",
      "require (",
      "\tgithub.com/gin-gonic/gin v1.9.0",
      "\tgithub.com/stretchr/testify v1.8.0",
      ")",
    ].join("\n"));

    const deps = await detectExternalDeps(tmpDir);
    expect(deps).toContain("github.com/gin-gonic/gin v1.9.0");
    expect(deps).toContain("github.com/stretchr/testify v1.8.0");
    expect(deps).toHaveLength(2);
  });

  it("package.json takes priority over requirements.txt", async () => {
    await createFile(tmpDir, "package.json", JSON.stringify({
      dependencies: { express: "^4.0.0" },
    }));
    await createFile(tmpDir, "requirements.txt", "flask>=2.0\n");

    const deps = await detectExternalDeps(tmpDir);
    expect(deps).toContain("express ^4.0.0");
    expect(deps).not.toContain("flask >=2.0");
  });
});

describe("detectInternalDeps", () => {
  it("detects TS relative imports", async () => {
    await createFile(tmpDir, "index.ts", [
      'import { Scanner } from "../core/scanner.js";',
      'import { readFile } from "node:fs/promises";',
      'import type { Config } from "./config.js";',
    ].join("\n"));

    const scan = makeScanResult(tmpDir, { files: ["index.ts"] });
    const deps = await detectInternalDeps(scan);
    expect(deps).toContain("../core/scanner.js");
    expect(deps).toContain("./config.js");
    expect(deps).not.toContain("node:fs/promises");
  });

  it("ignores non-relative imports", async () => {
    await createFile(tmpDir, "index.ts", [
      'import { z } from "zod";',
      'import chalk from "chalk";',
    ].join("\n"));

    const scan = makeScanResult(tmpDir, { files: ["index.ts"] });
    const deps = await detectInternalDeps(scan);
    expect(deps).toEqual([]);
  });

  it("detects require() calls", async () => {
    await createFile(tmpDir, "old.js", [
      'const fs = require("node:fs");',
      'const helper = require("./helper.js");',
    ].join("\n"));

    const scan = makeScanResult(tmpDir, { files: ["old.js"] });
    const deps = await detectInternalDeps(scan);
    expect(deps).toContain("./helper.js");
    expect(deps).not.toContain("node:fs");
  });

  it("detects Python relative imports", async () => {
    await createFile(tmpDir, "handler.py", [
      "from .models import User",
      "from ..utils import format_date",
      "import os",
    ].join("\n"));

    const scan = makeScanResult(tmpDir, { files: ["handler.py"] });
    const deps = await detectInternalDeps(scan);
    expect(deps).toContain(".models");
    expect(deps).toContain("..utils");
  });

  it("detects Rust crate imports", async () => {
    await createFile(tmpDir, "main.rs", [
      "use crate::config;",
      "use crate::handlers;",
      "use std::io;",
    ].join("\n"));

    const scan = makeScanResult(tmpDir, { files: ["main.rs"] });
    const deps = await detectInternalDeps(scan);
    expect(deps).toContain("crate::config");
    expect(deps).toContain("crate::handlers");
    expect(deps).toHaveLength(2);
  });

  it("deduplicates across files in same directory", async () => {
    await createFile(tmpDir, "a.ts", 'import { foo } from "../shared/utils.js";');
    await createFile(tmpDir, "b.ts", 'import { bar } from "../shared/utils.js";');

    const scan = makeScanResult(tmpDir, { files: ["a.ts", "b.ts"] });
    const deps = await detectInternalDeps(scan);
    expect(deps.filter(d => d === "../shared/utils.js")).toHaveLength(1);
  });

  it("caps at 20 entries", async () => {
    const imports = Array.from({ length: 25 }, (_, i) =>
      `import { x${i} } from "../mod${i}/index.js";`
    ).join("\n");
    await createFile(tmpDir, "big.ts", imports);

    const scan = makeScanResult(tmpDir, { files: ["big.ts"] });
    const deps = await detectInternalDeps(scan);
    expect(deps).toHaveLength(20);
  });

  it("handles unreadable files gracefully", async () => {
    // File listed in scan but doesn't exist on disk
    const scan = makeScanResult(tmpDir, { files: ["missing.ts"] });
    const deps = await detectInternalDeps(scan);
    expect(deps).toEqual([]);
  });

  it("skips non-source files", async () => {
    await createFile(tmpDir, "data.json", '{"import": "not a real import"}');
    const scan = makeScanResult(tmpDir, { files: ["data.json"] });
    const deps = await detectInternalDeps(scan);
    expect(deps).toEqual([]);
  });
});
