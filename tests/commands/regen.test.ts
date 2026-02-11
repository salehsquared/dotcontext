import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { cp, readFile } from "node:fs/promises";
import { parse } from "yaml";
import { initCommand } from "../../src/commands/init.js";
import { regenCommand } from "../../src/commands/regen.js";
import { CONTEXT_FILENAME } from "../../src/core/schema.js";
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

describe("regenCommand", () => {
  it("resolves relative target path against project root", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    const before = parse(
      await readFile(join(tmpDir, "src", CONTEXT_FILENAME), "utf-8"),
    ) as { last_updated: string };

    await new Promise((resolve) => setTimeout(resolve, 5));
    await regenCommand("src", { path: tmpDir, noLlm: true });

    const after = parse(
      await readFile(join(tmpDir, "src", CONTEXT_FILENAME), "utf-8"),
    ) as { last_updated: string };

    expect(after.last_updated).not.toBe(before.last_updated);
    expect(logs.join("\n")).not.toContain("No matching directory found");
  });

  it("accepts absolute target paths", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    await regenCommand(join(tmpDir, "src"), { path: tmpDir, noLlm: true });

    expect(logs.join("\n")).toContain("src/.context.yaml updated");
  });

  it("reports error for unknown target path", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    await regenCommand("does-not-exist", { path: tmpDir, noLlm: true });

    expect(logs.join("\n")).toContain("No matching directory found");
  });

  it("regenerates all directories with --all", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    logs = [];
    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true });

    expect(logs.join("\n")).toContain("2 files regenerated");
  });
});
