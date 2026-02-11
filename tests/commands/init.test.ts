import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { cp, readFile, stat } from "node:fs/promises";
import { parse } from "yaml";
import { initCommand } from "../../src/commands/init.js";
import { contextSchema, CONTEXT_FILENAME } from "../../src/core/schema.js";
import { createTmpDir, cleanupTmpDir } from "../helpers.js";

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

async function copyFixture(name: string): Promise<void> {
  await cp(join(fixturesDir, name), tmpDir, { recursive: true });
}

async function readContextYaml(dirPath: string) {
  const content = await readFile(join(dirPath, CONTEXT_FILENAME), "utf-8");
  return parse(content);
}

describe("initCommand (--no-llm)", () => {
  it("creates .context.yaml at root", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    const parsed = await readContextYaml(tmpDir);
    const result = contextSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("creates .context.yaml in subdirectories", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    const rootStat = await stat(join(tmpDir, CONTEXT_FILENAME));
    expect(rootStat.isFile()).toBe(true);

    const srcStat = await stat(join(tmpDir, "src", CONTEXT_FILENAME));
    expect(srcStat.isFile()).toBe(true);
  });

  it("generated context has valid fingerprint", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    const parsed = await readContextYaml(tmpDir);
    expect(parsed.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it("scope is set correctly per directory", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    const rootContext = await readContextYaml(tmpDir);
    expect(rootContext.scope).toBe(".");

    const srcContext = await readContextYaml(join(tmpDir, "src"));
    expect(srcContext.scope).toBe("src");
  });

  it("files list matches actual sources", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    const srcContext = await readContextYaml(join(tmpDir, "src"));
    const fileNames = srcContext.files.map((f: { name: string }) => f.name);
    expect(fileNames).toContain("index.ts");
    expect(fileNames).toContain("utils.ts");
  });

  it("handles empty project gracefully", async () => {
    // Empty project still gets root in scan results (scanner always returns root).
    // Init should complete without error and create a context file.
    await copyFixture("empty-project");
    await initCommand({ noLlm: true, path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("Done.");
  });

  it("reports completion count", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    const output = logs.join("\n");
    expect(output).toMatch(/Done\. \d+ \.context\.yaml files created/);
  });
});
