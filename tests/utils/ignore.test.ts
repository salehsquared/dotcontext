import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { addToIgnore } from "../../src/utils/ignore.js";
import { createTmpDir, cleanupTmpDir } from "../helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await cleanupTmpDir(tmpDir);
});

describe("addToIgnore", () => {
  it("creates .contextignore when missing", async () => {
    await addToIgnore(tmpDir, "build");

    const content = await readFile(join(tmpDir, ".contextignore"), "utf-8");
    expect(content).toBe("build\n");
  });

  it("appends new entries and preserves existing order", async () => {
    const ignorePath = join(tmpDir, ".contextignore");
    await writeFile(ignorePath, "dist\ncoverage\n", "utf-8");

    await addToIgnore(tmpDir, "tmp");

    const content = await readFile(ignorePath, "utf-8");
    expect(content).toBe("dist\ncoverage\ntmp\n");
  });

  it("does not duplicate an existing entry", async () => {
    const ignorePath = join(tmpDir, ".contextignore");
    await writeFile(ignorePath, "dist\n", "utf-8");

    await addToIgnore(tmpDir, "dist");

    const content = await readFile(ignorePath, "utf-8");
    expect(content).toBe("dist\n");
  });
});
