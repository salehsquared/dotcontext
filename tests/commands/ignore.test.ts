import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ignoreCommand } from "../../src/commands/ignore.js";
import { createTmpDir, cleanupTmpDir } from "../helpers.js";

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

describe("ignoreCommand", () => {
  it("adds an entry to .contextignore", async () => {
    await ignoreCommand("build", { path: tmpDir });

    const content = await readFile(join(tmpDir, ".contextignore"), "utf-8");
    expect(content).toContain("build");
    expect(logs.join("\n")).toContain("Added \"build\" to .contextignore");
  });

  it("does not duplicate an existing entry", async () => {
    await ignoreCommand("tmp", { path: tmpDir });
    await ignoreCommand("tmp", { path: tmpDir });

    const content = await readFile(join(tmpDir, ".contextignore"), "utf-8");
    const lines = content.split("\n").filter(Boolean);
    expect(lines).toEqual(["tmp"]);
  });
});
