import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Commit } from "./types.js";

export function isGitRepo(dirPath: string): boolean {
  return existsSync(join(dirPath, ".git"));
}

function getChangedFiles(repoPath: string, sha: string): string[] {
  try {
    const output = execSync(
      `git diff-tree --no-commit-id --name-only -r ${sha}`,
      { cwd: repoPath, encoding: "utf-8", timeout: 10_000 },
    ).trim();
    return output ? output.split("\n") : [];
  } catch {
    return [];
  }
}

function queryCommits(
  repoPath: string,
  grepPattern: string,
  candidateCount: number,
): Array<{ sha: string; message: string }> {
  try {
    const output = execSync(
      `git log --grep="${grepPattern}" -i --format="%H|||%s" -n ${candidateCount}`,
      { cwd: repoPath, encoding: "utf-8", timeout: 30_000 },
    ).trim();
    if (!output) return [];
    return output.split("\n").map((line) => {
      const [sha, ...rest] = line.split("|||");
      return { sha, message: rest.join("|||") };
    });
  } catch {
    return [];
  }
}

export function getFixCommits(repoPath: string, count: number): Commit[] {
  const candidates = queryCommits(
    repoPath,
    "fix\\|bug\\|patch\\|resolve",
    count * 3,
  );

  const results: Commit[] = [];
  for (const { sha, message } of candidates) {
    if (results.length >= count) break;
    const files = getChangedFiles(repoPath, sha);
    if (files.length >= 1 && files.length <= 5) {
      results.push({ sha, message, files });
    }
  }
  return results;
}

export function getFeatureCommits(repoPath: string, count: number): Commit[] {
  const candidates = queryCommits(
    repoPath,
    "add\\|implement\\|feature\\|support",
    count * 3,
  );

  const results: Commit[] = [];
  for (const { sha, message } of candidates) {
    if (results.length >= count) break;
    const files = getChangedFiles(repoPath, sha);
    if (files.length >= 2 && files.length <= 5) {
      results.push({ sha, message, files });
    }
  }
  return results;
}

export async function cloneRepo(
  url: string,
  destDir: string,
  depth = 100,
): Promise<string> {
  execSync(`git clone --depth ${depth} ${url} ${destDir}`, {
    encoding: "utf-8",
    timeout: 120_000,
  });
  return destDir;
}
