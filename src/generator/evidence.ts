import { readFile, stat, readdir } from "node:fs/promises";
import { join, dirname, resolve, isAbsolute } from "node:path";
import type { Evidence } from "../core/schema.js";

/**
 * Collect evidence from existing test/typecheck/lint/coverage artifacts.
 * Never runs commands — only reads files that already exist.
 * Returns null if no artifacts found.
 *
 * @param dirPath - Directory to collect evidence from
 * @param newestSourceMtimeMs - mtime of the newest source file (from scanner), used for staleness comparison
 */
export async function collectBasicEvidence(
  dirPath: string,
  newestSourceMtimeMs?: number,
): Promise<Evidence | null> {
  const evidence: Evidence = {
    collected_at: new Date().toISOString(),
  };
  let hasEvidence = false;

  // --- Commit SHA (read-only, no process execution) ---
  const sha = await resolveGitHeadSha(dirPath);
  if (sha) {
    evidence.commit_sha = sha;
  }

  // --- Test result artifacts ---
  // Check .vitest-results.json first (more specific)
  const vitestFound = await collectVitestResults(dirPath, evidence);
  if (vitestFound) {
    hasEvidence = true;
  } else {
    // Check test-results.json (Jest/Vitest generic format)
    const jsonFound = await collectJsonTestResults(dirPath, evidence);
    if (jsonFound) {
      hasEvidence = true;
    } else {
      // Check JUnit XML
      const junitFound = await collectJunitResults(dirPath, evidence);
      if (junitFound) {
        hasEvidence = true;
      }
    }
  }

  // --- Typecheck artifacts ---
  const typecheckFound = await collectTypecheckEvidence(dirPath, evidence, newestSourceMtimeMs);
  if (typecheckFound) hasEvidence = true;

  // --- Lint artifacts ---
  const lintFound = await collectLintEvidence(dirPath, evidence, newestSourceMtimeMs);
  if (lintFound) hasEvidence = true;

  // --- Coverage artifacts ---
  const coverageFound = await collectCoverageEvidence(dirPath, evidence);
  if (coverageFound) hasEvidence = true;

  return hasEvidence ? evidence : null;
}

// --- Test artifact collectors ---

async function collectVitestResults(dirPath: string, evidence: Evidence): Promise<boolean> {
  try {
    const raw = await readFile(join(dirPath, ".vitest-results.json"), "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (parseTestJson(data, evidence)) {
      evidence.test_tool = "vitest";
      return true;
    }
  } catch {
    // Artifact doesn't exist or is malformed
  }
  return false;
}

async function collectJsonTestResults(dirPath: string, evidence: Evidence): Promise<boolean> {
  try {
    const raw = await readFile(join(dirPath, "test-results.json"), "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (parseTestJson(data, evidence)) {
      // Distinguish vitest from jest: vitest uses startTime at root level
      evidence.test_tool = typeof data.startTime === "number" ? "vitest" : "jest";
      return true;
    }
  } catch {
    // Artifact doesn't exist or is malformed
  }
  return false;
}

function parseTestJson(data: Record<string, unknown>, evidence: Evidence): boolean {
  // Vitest/Jest JSON format: { success, numTotalTests, numFailedTests, testResults }
  if (typeof data.success === "boolean") {
    evidence.test_status = data.success ? "passing" : "failing";
    if (typeof data.numTotalTests === "number") {
      evidence.test_count = data.numTotalTests;
    }
    if (!data.success && Array.isArray(data.testResults)) {
      const failing: string[] = [];
      for (const suite of data.testResults as Array<Record<string, unknown>>) {
        if (suite.status === "failed" && typeof suite.name === "string") {
          failing.push(suite.name);
        }
      }
      if (failing.length > 0) evidence.failing_tests = failing;
    }
    return true;
  }

  // Alternative format: { numPassedTests, numFailedTests }
  if (typeof data.numPassedTests === "number" && typeof data.numFailedTests === "number") {
    const failed = data.numFailedTests as number;
    evidence.test_status = failed === 0 ? "passing" : "failing";
    evidence.test_count = (data.numPassedTests as number) + failed;
    return true;
  }

  return false;
}

async function collectJunitResults(dirPath: string, evidence: Evidence): Promise<boolean> {
  for (const xmlPath of ["junit.xml", "test-results.xml"]) {
    try {
      const content = await readFile(join(dirPath, xmlPath), "utf-8");
      const testsMatch = content.match(/tests="(\d+)"/);
      const failuresMatch = content.match(/failures="(\d+)"/);
      const errorsMatch = content.match(/errors="(\d+)"/);

      if (testsMatch) {
        const total = parseInt(testsMatch[1], 10);
        const failures = parseInt(failuresMatch?.[1] ?? "0", 10);
        const errors = parseInt(errorsMatch?.[1] ?? "0", 10);
        evidence.test_count = total;
        evidence.test_status = (failures + errors) === 0 ? "passing" : "failing";
        evidence.test_tool = "junit";
        return true;
      }
    } catch {
      // Artifact doesn't exist
    }
  }
  return false;
}

// --- Typecheck evidence ---

async function collectTypecheckEvidence(
  dirPath: string,
  evidence: Evidence,
  newestSourceMtimeMs?: number,
): Promise<boolean> {
  try {
    const artifactStat = await stat(join(dirPath, "tsconfig.tsbuildinfo"));
    evidence.typecheck_tool = "tsc";

    if (newestSourceMtimeMs !== undefined && artifactStat.mtimeMs >= newestSourceMtimeMs) {
      evidence.typecheck = "clean";
    } else {
      evidence.typecheck = "unknown";
    }
    return true;
  } catch {
    return false;
  }
}

// --- Lint evidence ---

async function collectLintEvidence(
  dirPath: string,
  evidence: Evidence,
  newestSourceMtimeMs?: number,
): Promise<boolean> {
  try {
    const artifactStat = await stat(join(dirPath, ".eslintcache"));
    evidence.lint_tool = "eslint";

    if (newestSourceMtimeMs !== undefined && artifactStat.mtimeMs >= newestSourceMtimeMs) {
      evidence.lint_status = "clean";
    } else {
      evidence.lint_status = "unknown";
    }
    return true;
  } catch {
    return false;
  }
}

// --- Coverage evidence ---

async function collectCoverageEvidence(dirPath: string, evidence: Evidence): Promise<boolean> {
  // Istanbul/c8 format: coverage/coverage-summary.json
  try {
    const raw = await readFile(join(dirPath, "coverage", "coverage-summary.json"), "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const total = data.total as Record<string, unknown> | undefined;
    if (total) {
      const lines = total.lines as Record<string, unknown> | undefined;
      if (lines && typeof lines.pct === "number") {
        evidence.coverage_percent = lines.pct;
        return true;
      }
    }
  } catch {
    // Not found or malformed
  }

  // pytest-cov format: coverage.json
  try {
    const raw = await readFile(join(dirPath, "coverage.json"), "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const totals = data.totals as Record<string, unknown> | undefined;
    if (totals && typeof totals.percent_covered === "number") {
      evidence.coverage_percent = totals.percent_covered;
      return true;
    }
  } catch {
    // Not found or malformed
  }

  return false;
}

// --- Git SHA resolution (pure file reads, no process execution) ---

/**
 * Resolve the current git HEAD SHA by reading .git/HEAD and following refs.
 * Handles: regular repos, worktrees (.git is a file), packed-refs fallback.
 * Returns null if not in a git repo or SHA cannot be resolved.
 */
export async function resolveGitHeadSha(startDir: string): Promise<string | null> {
  try {
    const gitDir = await findGitDir(startDir);
    if (!gitDir) return null;

    const headContent = (await readFile(join(gitDir, "HEAD"), "utf-8")).trim();

    // Detached HEAD — bare SHA
    if (/^[0-9a-f]{40}$/i.test(headContent)) {
      return headContent;
    }

    // Symbolic ref: "ref: refs/heads/main"
    const refMatch = headContent.match(/^ref:\s*(.+)$/);
    if (!refMatch) return null;

    const refPath = refMatch[1];

    // Try loose ref first
    try {
      const sha = (await readFile(join(gitDir, refPath), "utf-8")).trim();
      if (/^[0-9a-f]{40}$/i.test(sha)) return sha;
    } catch {
      // Loose ref doesn't exist, try packed-refs
    }

    // Fall back to packed-refs
    try {
      const packed = await readFile(join(gitDir, "packed-refs"), "utf-8");
      for (const line of packed.split("\n")) {
        if (line.startsWith("#") || line.startsWith("^")) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2 && parts[1] === refPath) {
          const sha = parts[0];
          if (/^[0-9a-f]{40}$/i.test(sha)) return sha;
        }
      }
    } catch {
      // No packed-refs
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Walk up from startDir to find the .git directory.
 * If .git is a file (worktree/submodule), follows the gitdir pointer.
 */
async function findGitDir(startDir: string): Promise<string | null> {
  let current = resolve(startDir);
  const root = dirname(current) === current ? current : undefined;

  // Walk up to find .git
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const gitPath = join(current, ".git");
    try {
      const gitStat = await stat(gitPath);

      if (gitStat.isDirectory()) {
        return gitPath;
      }

      if (gitStat.isFile()) {
        // Worktree/submodule: .git is a file containing "gitdir: <path>"
        const content = (await readFile(gitPath, "utf-8")).trim();
        const match = content.match(/^gitdir:\s*(.+)$/);
        if (match) {
          const gitdir = match[1];
          return isAbsolute(gitdir) ? gitdir : resolve(current, gitdir);
        }
        return null;
      }
    } catch {
      // .git doesn't exist at this level
    }

    const parent = dirname(current);
    if (parent === current || parent === root) return null;
    current = parent;
  }
}

/**
 * Find the newest mtime (in ms) among files in a directory listing.
 * Useful when the scanner file list is not available.
 */
export async function getNewestFileMtimeMs(dirPath: string): Promise<number | undefined> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    let newest = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      try {
        const s = await stat(join(dirPath, entry.name));
        if (s.mtimeMs > newest) newest = s.mtimeMs;
      } catch {
        // skip unreadable files
      }
    }
    return newest > 0 ? newest : undefined;
  } catch {
    return undefined;
  }
}
