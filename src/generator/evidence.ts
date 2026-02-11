import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Evidence } from "../core/schema.js";

/**
 * Collect evidence from existing test/typecheck artifacts.
 * Never runs commands — only reads files that already exist.
 * Returns null if no artifacts found.
 */
export async function collectBasicEvidence(rootPath: string): Promise<Evidence | null> {
  const evidence: Evidence = {
    collected_at: new Date().toISOString(),
  };
  let hasEvidence = false;

  // Check for test result artifacts
  const testArtifactPaths = [
    "test-results.json",
    ".vitest-results.json",
  ];

  for (const artifactPath of testArtifactPaths) {
    try {
      const raw = await readFile(join(rootPath, artifactPath), "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;

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
        hasEvidence = true;
        break;
      }

      // Alternative format: { numPassedTests, numFailedTests }
      if (typeof data.numPassedTests === "number" && typeof data.numFailedTests === "number") {
        const failed = data.numFailedTests as number;
        evidence.test_status = failed === 0 ? "passing" : "failing";
        evidence.test_count = (data.numPassedTests as number) + failed;
        hasEvidence = true;
        break;
      }
    } catch {
      // Artifact doesn't exist or is malformed
    }
  }

  // Check for JUnit XML
  if (!hasEvidence) {
    for (const xmlPath of ["junit.xml", "test-results.xml"]) {
      try {
        const content = await readFile(join(rootPath, xmlPath), "utf-8");
        const testsMatch = content.match(/tests="(\d+)"/);
        const failuresMatch = content.match(/failures="(\d+)"/);
        const errorsMatch = content.match(/errors="(\d+)"/);

        if (testsMatch) {
          const total = parseInt(testsMatch[1], 10);
          const failures = parseInt(failuresMatch?.[1] ?? "0", 10);
          const errors = parseInt(errorsMatch?.[1] ?? "0", 10);
          evidence.test_count = total;
          evidence.test_status = (failures + errors) === 0 ? "passing" : "failing";
          hasEvidence = true;
          break;
        }
      } catch {
        // Artifact doesn't exist
      }
    }
  }

  return hasEvidence ? evidence : null;
}
