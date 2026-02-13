import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { createTmpDir, cleanupTmpDir, createFile, makeScanResult } from "../helpers.js";
import { generateTasks, seededSample } from "../../src/bench/tasks.js";
import type { DirFacts, Commit } from "../../src/bench/types.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await cleanupTmpDir(tmpDir);
});

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    scanResult: makeScanResult(tmpDir, { files: [] }),
    dirFacts: new Map<string, DirFacts>(),
    depSets: { external: new Map<string, string[]>(), internal: new Map<string, string[]>() },
    reverseDeps: new Map<string, string[]>(),
    fixCommits: [] as Commit[],
    featureCommits: [] as Commit[],
    seed: 42,
    ...overrides,
  };
}

describe("generateTasks", () => {
  it("generates comprehension tasks for dirs with files", async () => {
    await createFile(tmpDir, "a.ts", "export const a = 1;");
    await createFile(tmpDir, "b.ts", "export const b = 2;");

    const scan = makeScanResult(tmpDir, { files: ["a.ts", "b.ts"] });
    const dirFacts = new Map<string, DirFacts>([
      [".", { files: ["a.ts", "b.ts"], exports: ["a", "b"], fileCount: 2 }],
    ]);

    const tasks = await generateTasks(makeInput({ scanResult: scan, dirFacts }));
    const compTasks = tasks.filter(t => t.category === "comprehension");
    expect(compTasks.length).toBeGreaterThan(0);
    expect(compTasks[0].scoring).toBe("llm_judge");
  });

  it("generates dependency tasks from dep sets", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const scan = makeScanResult(tmpDir, { files: ["index.ts"] });
    const depSets = {
      external: new Map([[".", ["chalk", "commander", "yaml"]]]),
      internal: new Map([[".", ["./utils.js", "./core.js"]]]),
    };
    const dirFacts = new Map<string, DirFacts>([
      [".", { files: ["index.ts"], exports: [], fileCount: 1 }],
    ]);

    const tasks = await generateTasks(makeInput({ scanResult: scan, depSets, dirFacts }));
    const depTasks = tasks.filter(t => t.category === "dependency");
    expect(depTasks.length).toBeGreaterThan(0);
    expect(depTasks.some(t => t.scoring === "list_coverage")).toBe(true);
  });

  it("generates change_impact tasks from reverse deps", async () => {
    await createFile(tmpDir, "a.ts", "code");
    const scan = makeScanResult(tmpDir, { files: ["a.ts"] });
    const reverseDeps = new Map([
      ["schema.ts", ["scanner.ts", "writer.ts", "init.ts"]],
    ]);
    const dirFacts = new Map<string, DirFacts>([
      [".", { files: ["a.ts"], exports: [], fileCount: 1 }],
    ]);

    const tasks = await generateTasks(makeInput({ scanResult: scan, reverseDeps, dirFacts }));
    const impactTasks = tasks.filter(t => t.category === "change_impact");
    expect(impactTasks.length).toBe(1);
    expect(impactTasks[0].scoring).toBe("topk_recall");
  });

  it("generates task_routing tasks from directory patterns", async () => {
    const cmdDir = join(tmpDir, "commands");
    await mkdir(cmdDir);
    await createFile(cmdDir, "init.ts", "code");

    const cmdScan = makeScanResult(cmdDir, { relativePath: "commands", files: ["init.ts"] });
    const scan = makeScanResult(tmpDir, { files: [], children: [cmdScan] });
    const dirFacts = new Map<string, DirFacts>([
      [".", { files: [], exports: [], fileCount: 0 }],
      ["commands", { files: ["init.ts"], exports: [], fileCount: 1 }],
    ]);

    const tasks = await generateTasks(makeInput({ scanResult: scan, dirFacts }));
    const routeTasks = tasks.filter(t => t.category === "task_routing");
    expect(routeTasks.length).toBeGreaterThan(0);
    expect(routeTasks[0].scoring).toBe("target_hit");
    expect(routeTasks[0].expected).toContain("commands");
  });

  it("generates bug_localization tasks from fix commits", async () => {
    await createFile(tmpDir, "a.ts", "code");
    const scan = makeScanResult(tmpDir, { files: ["a.ts"] });
    const fixCommits: Commit[] = [
      { sha: "abc123", message: "fix: null pointer in scanner", files: ["src/scanner.ts"] },
    ];

    const tasks = await generateTasks(makeInput({ scanResult: scan, fixCommits }));
    const bugTasks = tasks.filter(t => t.category === "bug_localization");
    expect(bugTasks.length).toBe(1);
    expect(bugTasks[0].scoring).toBe("mrr");
    expect(bugTasks[0].question).toContain("null pointer in scanner");
  });

  it("generates patch_planning tasks from feature commits", async () => {
    await createFile(tmpDir, "a.ts", "code");
    const scan = makeScanResult(tmpDir, { files: ["a.ts"] });
    const featureCommits: Commit[] = [
      { sha: "def456", message: "add: new export command", files: ["src/commands/export.ts", "src/index.ts"] },
    ];

    const tasks = await generateTasks(makeInput({ scanResult: scan, featureCommits }));
    const patchTasks = tasks.filter(t => t.category === "patch_planning");
    expect(patchTasks.length).toBe(1);
    expect(patchTasks[0].scoring).toBe("file_set_f1");
  });

  it("skips categories when ground truth unavailable", async () => {
    await createFile(tmpDir, "a.ts", "code");
    const scan = makeScanResult(tmpDir, { files: ["a.ts"] });
    // No fix commits, no feature commits, no deps, no dir facts with enough files
    const tasks = await generateTasks(makeInput({ scanResult: scan }));
    const bugTasks = tasks.filter(t => t.category === "bug_localization");
    const patchTasks = tasks.filter(t => t.category === "patch_planning");
    expect(bugTasks.length).toBe(0);
    expect(patchTasks.length).toBe(0);
  });

  it("respects maxTasks filter", async () => {
    await createFile(tmpDir, "a.ts", "export const a = 1;");
    const scan = makeScanResult(tmpDir, { files: ["a.ts"] });
    const dirFacts = new Map<string, DirFacts>([
      [".", { files: ["a.ts", "b.ts"], exports: ["a"], fileCount: 2 }],
    ]);
    const reverseDeps = new Map([
      ["a.ts", ["b.ts", "c.ts"]],
      ["d.ts", ["e.ts", "f.ts"]],
    ]);

    const tasks = await generateTasks(makeInput({
      scanResult: scan,
      dirFacts,
      reverseDeps,
      maxTasks: 2,
    }));
    expect(tasks.length).toBeLessThanOrEqual(2);
  });

  it("respects category filter", async () => {
    await createFile(tmpDir, "a.ts", "export const a = 1;");
    const scan = makeScanResult(tmpDir, { files: ["a.ts"] });
    const dirFacts = new Map<string, DirFacts>([
      [".", { files: ["a.ts", "b.ts"], exports: ["a"], fileCount: 2 }],
    ]);
    const fixCommits: Commit[] = [
      { sha: "abc", message: "fix: bug", files: ["a.ts"] },
    ];

    const tasks = await generateTasks(makeInput({
      scanResult: scan,
      dirFacts,
      fixCommits,
      category: "bug_localization",
    }));
    expect(tasks.every(t => t.category === "bug_localization")).toBe(true);
  });
});

describe("seededSample", () => {
  it("is deterministic", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const s1 = seededSample(arr, 3, 42);
    const s2 = seededSample(arr, 3, 42);
    expect(s1).toEqual(s2);
  });

  it("different seed gives different result", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const s1 = seededSample(arr, 3, 42);
    const s2 = seededSample(arr, 3, 99);
    // Different seeds should give different samples (extremely likely)
    expect(s1).not.toEqual(s2);
  });

  it("returns all elements if n >= length", () => {
    const arr = [1, 2, 3];
    const result = seededSample(arr, 5, 42);
    expect(result).toEqual([1, 2, 3]);
  });
});
