import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { cp, readFile, stat, rm, writeFile, chmod } from "node:fs/promises";
import { parse } from "yaml";
import { initCommand } from "../../src/commands/init.js";
import { regenCommand } from "../../src/commands/regen.js";
import { CONTEXT_FILENAME } from "../../src/core/schema.js";
import { createTmpDir, cleanupTmpDir, createNestedFile, createFile } from "../helpers.js";
import { AGENTS_FILENAME } from "../../src/core/markdown-writer.js";
import { AGENTS_SECTION_START } from "../../src/generator/markdown.js";

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

  it("reports error for path outside project root", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    logs = [];
    await regenCommand("../outside", { path: tmpDir, noLlm: true });

    expect(logs.join("\n")).toContain("No matching directory found");
  });

  it("reports error for absolute path outside project root", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    logs = [];
    await regenCommand("/tmp/totally-elsewhere", { path: tmpDir, noLlm: true });

    expect(logs.join("\n")).toContain("No matching directory found");
  });

  it("resolves nested relative targets against project root", async () => {
    await copyFixture("simple-project");
    await createNestedFile(tmpDir, "src/core/deep.ts", "export const deep = true;");
    await initCommand({ noLlm: true, path: tmpDir });

    const before = parse(
      await readFile(join(tmpDir, "src", "core", CONTEXT_FILENAME), "utf-8"),
    ) as { last_updated: string };

    await new Promise((resolve) => setTimeout(resolve, 5));
    await regenCommand("src/core", { path: tmpDir, noLlm: true });

    const after = parse(
      await readFile(join(tmpDir, "src", "core", CONTEXT_FILENAME), "utf-8"),
    ) as { last_updated: string };

    expect(after.last_updated).not.toBe(before.last_updated);
    expect(logs.join("\n")).toContain("src/core/.context.yaml updated");
    expect(logs.join("\n")).not.toContain("No matching directory found");
  });
});

describe("regenCommand AGENTS.md", () => {
  it("updates AGENTS.md on regen --all", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    // Delete AGENTS.md and re-run with --all
    const { rm } = await import("node:fs/promises");
    await rm(join(tmpDir, AGENTS_FILENAME));

    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true });

    const content = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");
    expect(content).toContain(AGENTS_SECTION_START);
  });

  it("does NOT update AGENTS.md on single-directory regen", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    const before = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");

    // Regen only src — AGENTS.md should not change
    await regenCommand("src", { path: tmpDir, noLlm: true });

    const after = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");
    expect(after).toBe(before);
  });

  it("skips AGENTS.md with noAgents on regen --all", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir, noAgents: true });

    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, noAgents: true });

    await expect(stat(join(tmpDir, AGENTS_FILENAME))).rejects.toThrow();
  });
});

describe("regenCommand --stale", () => {
  it("regenerates only stale directories", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    // Modify a file in src/ to make it stale
    await createFile(join(tmpDir, "src"), "new-file.ts", "export const added = true;");

    logs = [];
    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, stale: true });

    const output = logs.join("\n");
    // src should be regenerated (stale), root should also be stale (child changed)
    expect(output).toContain("src/.context.yaml updated");
  });

  it("regenerates missing directories", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    // Delete the src context file
    await rm(join(tmpDir, "src", CONTEXT_FILENAME));

    logs = [];
    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, stale: true });

    const output = logs.join("\n");
    expect(output).toContain("src/.context.yaml updated");
  });

  it("reports nothing to regenerate when all fresh", async () => {
    await copyFixture("simple-project");
    // Use noAgents to prevent AGENTS.md from making root stale
    await initCommand({ noLlm: true, path: tmpDir, noAgents: true });

    logs = [];
    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, stale: true });

    const output = logs.join("\n");
    expect(output).toContain("All contexts are fresh");
  });

  it("updates AGENTS.md on full-tree --stale (no target)", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    // Delete AGENTS.md and make a dir stale
    await rm(join(tmpDir, AGENTS_FILENAME));
    await createFile(join(tmpDir, "src"), "extra.ts", "export const x = 1;");

    logs = [];
    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, stale: true });

    const content = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");
    expect(content).toContain(AGENTS_SECTION_START);
  });

  it("does NOT update AGENTS.md on scoped --stale", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    const before = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");

    // Make src stale and regen with target
    await createFile(join(tmpDir, "src"), "extra.ts", "export const x = 1;");

    logs = [];
    await regenCommand("src", { path: tmpDir, noLlm: true, stale: true });

    const after = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");
    expect(after).toBe(before);
  });

  it("scoped --stale only updates target subtree contexts", async () => {
    await copyFixture("simple-project");
    await createNestedFile(tmpDir, "tools/tool.ts", "export const tool = true;");
    await initCommand({ noLlm: true, path: tmpDir, noAgents: true });

    const beforeRoot = parse(await readFile(join(tmpDir, CONTEXT_FILENAME), "utf-8")) as { last_updated: string };
    const beforeSrc = parse(await readFile(join(tmpDir, "src", CONTEXT_FILENAME), "utf-8")) as { last_updated: string };
    const beforeTools = parse(await readFile(join(tmpDir, "tools", CONTEXT_FILENAME), "utf-8")) as { last_updated: string };

    await createFile(join(tmpDir, "src"), "extra.ts", "export const x = 1;");
    await new Promise((resolve) => setTimeout(resolve, 10));

    logs = [];
    await regenCommand("src", { path: tmpDir, noLlm: true, stale: true, noAgents: true });

    const afterRoot = parse(await readFile(join(tmpDir, CONTEXT_FILENAME), "utf-8")) as { last_updated: string };
    const afterSrc = parse(await readFile(join(tmpDir, "src", CONTEXT_FILENAME), "utf-8")) as { last_updated: string };
    const afterTools = parse(await readFile(join(tmpDir, "tools", CONTEXT_FILENAME), "utf-8")) as { last_updated: string };

    expect(afterSrc.last_updated).not.toBe(beforeSrc.last_updated);
    expect(afterRoot.last_updated).toBe(beforeRoot.last_updated);
    expect(afterTools.last_updated).toBe(beforeTools.last_updated);
  });
});

describe("regenCommand --dry-run", () => {
  it("prints dirs without writing any files", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    // Delete a context to create a missing state
    await rm(join(tmpDir, "src", CONTEXT_FILENAME));

    const beforeRoot = await readFile(join(tmpDir, CONTEXT_FILENAME), "utf-8");

    logs = [];
    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, dryRun: true });

    const output = logs.join("\n");
    expect(output).toContain("Would regenerate");

    // Root context file should be unchanged
    const afterRoot = await readFile(join(tmpDir, CONTEXT_FILENAME), "utf-8");
    expect(afterRoot).toBe(beforeRoot);

    // src context file should still not exist
    await expect(stat(join(tmpDir, "src", CONTEXT_FILENAME))).rejects.toThrow();
  });

  it("shows freshness state for each dir", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    // Delete src context to make it missing
    await rm(join(tmpDir, "src", CONTEXT_FILENAME));

    logs = [];
    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, dryRun: true });

    const output = logs.join("\n");
    expect(output).toContain("missing");
  });

  it("works with --stale (only shows stale dirs)", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    // Make only src stale
    await createFile(join(tmpDir, "src"), "extra.ts", "export const x = 1;");

    logs = [];
    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, stale: true, dryRun: true });

    const output = logs.join("\n");
    expect(output).toContain("Would regenerate");
    // Should not contain "Done" (dry-run exits early)
    expect(output).not.toContain("Done.");
  });

  it("AGENTS.md is NOT written during --dry-run", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    // Delete AGENTS.md
    await rm(join(tmpDir, AGENTS_FILENAME));

    logs = [];
    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, dryRun: true });

    // AGENTS.md should still not exist
    await expect(stat(join(tmpDir, AGENTS_FILENAME))).rejects.toThrow();
  });
});

describe("regenCommand --parallel", () => {
  it("produces same contexts as sequential mode", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    // Get sequential results
    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true });
    const seqRoot = parse(await readFile(join(tmpDir, CONTEXT_FILENAME), "utf-8")) as Record<string, unknown>;
    const seqSrc = parse(await readFile(join(tmpDir, "src", CONTEXT_FILENAME), "utf-8")) as Record<string, unknown>;

    // Get parallel results
    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, parallel: 4 });
    const parRoot = parse(await readFile(join(tmpDir, CONTEXT_FILENAME), "utf-8")) as Record<string, unknown>;
    const parSrc = parse(await readFile(join(tmpDir, "src", CONTEXT_FILENAME), "utf-8")) as Record<string, unknown>;

    // Compare structural fields (not timestamp/fingerprint which differ per run)
    expect(parRoot.scope).toBe(seqRoot.scope);
    expect(parRoot.summary).toBe(seqRoot.summary);
    expect(parSrc.scope).toBe(seqSrc.scope);
    expect(parSrc.summary).toBe(seqSrc.summary);
  });

  it("works with --stale + --parallel combined", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir });

    // Make src stale
    await createFile(join(tmpDir, "src"), "extra.ts", "export const x = 1;");

    logs = [];
    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, stale: true, parallel: 2 });

    const output = logs.join("\n");
    expect(output).toContain(".context.yaml updated");
    expect(output).not.toContain("All contexts are fresh");
  });

  it("preserves parent-child dependency semantics in parallel mode", async () => {
    await createFile(tmpDir, "index.ts", "export const root = true;");
    await createNestedFile(tmpDir, "src/index.ts", "export const src = true;");
    await createNestedFile(tmpDir, "src/core/a.ts", "export const a = true;");
    await initCommand({ noLlm: true, path: tmpDir, noAgents: true });

    await createNestedFile(tmpDir, "src/core/b.ts", "export const b = true;");

    await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, parallel: 4, noAgents: true });

    const srcContext = parse(await readFile(join(tmpDir, "src", CONTEXT_FILENAME), "utf-8")) as {
      subdirectories?: Array<{ name: string; summary: string }>;
    };
    const coreSummary = srcContext.subdirectories?.find((entry) => entry.name === "core/")?.summary ?? "";
    expect(coreSummary).toContain("2 files");
  });

  it("isolates per-directory failures and continues other writes", async () => {
    await copyFixture("simple-project");
    await initCommand({ noLlm: true, path: tmpDir, noAgents: true });

    const beforeRoot = parse(await readFile(join(tmpDir, CONTEXT_FILENAME), "utf-8")) as { last_updated: string };
    const beforeSrc = parse(await readFile(join(tmpDir, "src", CONTEXT_FILENAME), "utf-8")) as { last_updated: string };

    await chmod(join(tmpDir, "src", CONTEXT_FILENAME), 0o400);
    await new Promise((resolve) => setTimeout(resolve, 10));

    try {
      logs = [];
      await regenCommand(undefined, { path: tmpDir, noLlm: true, all: true, parallel: 2, noAgents: true });
    } finally {
      await chmod(join(tmpDir, "src", CONTEXT_FILENAME), 0o600);
    }

    const afterRoot = parse(await readFile(join(tmpDir, CONTEXT_FILENAME), "utf-8")) as { last_updated: string };
    const afterSrc = parse(await readFile(join(tmpDir, "src", CONTEXT_FILENAME), "utf-8")) as { last_updated: string };

    const output = logs.join("\n");
    expect(output).toContain("src:");
    expect(output).toMatch(/EACCES|EPERM/);
    expect(afterRoot.last_updated).not.toBe(beforeRoot.last_updated);
    expect(afterSrc.last_updated).toBe(beforeSrc.last_updated);
  });
});
