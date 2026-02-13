import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { createTmpDir, cleanupTmpDir } from "../helpers.js";
import { isGitRepo, getFixCommits, getFeatureCommits } from "../../src/bench/git.js";

let tmpDir: string;

async function initGitRepo(dir: string): Promise<void> {
  execSync("git init", { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
}

async function commitFile(
  dir: string,
  filename: string,
  content: string,
  message: string,
): Promise<void> {
  await writeFile(join(dir, filename), content);
  execSync(`git add ${filename}`, { cwd: dir });
  execSync(`git commit -m "${message}"`, { cwd: dir });
}

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await cleanupTmpDir(tmpDir);
});

describe("isGitRepo", () => {
  it("returns true for git repos", async () => {
    await initGitRepo(tmpDir);
    expect(isGitRepo(tmpDir)).toBe(true);
  });

  it("returns false for non-git dirs", () => {
    expect(isGitRepo(tmpDir)).toBe(false);
  });
});

describe("getFixCommits", () => {
  it("extracts fix commits from git history", async () => {
    await initGitRepo(tmpDir);
    await commitFile(tmpDir, "a.ts", "const a = 1;", "initial commit");
    await commitFile(tmpDir, "a.ts", "const a = 2;", "fix: resolve null check");
    await commitFile(tmpDir, "b.ts", "const b = 1;", "add feature");

    const commits = getFixCommits(tmpDir, 10);
    expect(commits.length).toBe(1);
    expect(commits[0].message).toBe("fix: resolve null check");
    expect(commits[0].files).toContain("a.ts");
  });

  it("filters to commits with 1-5 changed files", async () => {
    await initGitRepo(tmpDir);
    // Create initial files
    for (let i = 0; i < 7; i++) {
      await writeFile(join(tmpDir, `file${i}.ts`), `const x${i} = ${i};`);
    }
    execSync("git add .", { cwd: tmpDir });
    execSync('git commit -m "initial"', { cwd: tmpDir });

    // Create a fix commit touching 6 files (should be excluded)
    for (let i = 0; i < 6; i++) {
      await writeFile(join(tmpDir, `file${i}.ts`), `const x${i} = ${i + 10};`);
    }
    execSync("git add .", { cwd: tmpDir });
    execSync('git commit -m "fix: massive refactor"', { cwd: tmpDir });

    // Create a fix commit touching 2 files (should be included)
    await writeFile(join(tmpDir, "file0.ts"), "const x0 = 99;");
    await writeFile(join(tmpDir, "file1.ts"), "const x1 = 99;");
    execSync("git add .", { cwd: tmpDir });
    execSync('git commit -m "fix: small bug"', { cwd: tmpDir });

    const commits = getFixCommits(tmpDir, 10);
    expect(commits.length).toBe(1);
    expect(commits[0].message).toBe("fix: small bug");
  });

  it("handles repos with no fix commits", async () => {
    await initGitRepo(tmpDir);
    await commitFile(tmpDir, "a.ts", "const a = 1;", "initial commit");
    await commitFile(tmpDir, "b.ts", "const b = 1;", "add feature");

    const commits = getFixCommits(tmpDir, 10);
    expect(commits).toEqual([]);
  });

  it("respects count limit", async () => {
    await initGitRepo(tmpDir);
    await commitFile(tmpDir, "a.ts", "v1", "initial");
    await commitFile(tmpDir, "a.ts", "v2", "fix: issue 1");
    await commitFile(tmpDir, "a.ts", "v3", "fix: issue 2");
    await commitFile(tmpDir, "a.ts", "v4", "fix: issue 3");

    const commits = getFixCommits(tmpDir, 2);
    expect(commits.length).toBe(2);
  });
});

describe("getFeatureCommits", () => {
  it("extracts feature/add commits", async () => {
    await initGitRepo(tmpDir);
    await commitFile(tmpDir, "a.ts", "v1", "initial");
    // Feature commit needs 2-5 files
    await writeFile(join(tmpDir, "b.ts"), "const b = 1;");
    await writeFile(join(tmpDir, "c.ts"), "const c = 1;");
    execSync("git add .", { cwd: tmpDir });
    execSync('git commit -m "add: new feature"', { cwd: tmpDir });

    const commits = getFeatureCommits(tmpDir, 10);
    expect(commits.length).toBe(1);
    expect(commits[0].message).toBe("add: new feature");
    expect(commits[0].files.length).toBeGreaterThanOrEqual(2);
  });

  it("filters to commits with 2-5 changed files", async () => {
    await initGitRepo(tmpDir);
    // Single file commit (should be excluded since min is 2)
    await commitFile(tmpDir, "a.ts", "v1", "add: single file");

    // 3 file commit (should be included)
    await writeFile(join(tmpDir, "d.ts"), "d");
    await writeFile(join(tmpDir, "e.ts"), "e");
    await writeFile(join(tmpDir, "f.ts"), "f");
    execSync("git add .", { cwd: tmpDir });
    execSync('git commit -m "implement: multi-file feature"', { cwd: tmpDir });

    const commits = getFeatureCommits(tmpDir, 10);
    expect(commits.length).toBe(1);
    expect(commits[0].message).toBe("implement: multi-file feature");
  });
});
