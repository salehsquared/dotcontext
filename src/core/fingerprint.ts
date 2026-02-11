import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { CONTEXT_FILENAME } from "./schema.js";

/**
 * Compute a fingerprint for a directory based on file names, mtimes, and sizes.
 * Only considers files directly in the directory (non-recursive).
 * Excludes .context.yaml itself and common non-source directories.
 */
export async function computeFingerprint(dirPath: string, ignorePatterns: string[] = []): Promise<string> {
  const entries = await readdir(dirPath, { withFileTypes: true });

  const fileEntries: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === CONTEXT_FILENAME) continue;
    if (shouldIgnore(entry.name, ignorePatterns)) continue;

    const filePath = join(dirPath, entry.name);
    const fileStat = await stat(filePath);

    fileEntries.push(`${entry.name}:${Math.floor(fileStat.mtimeMs)}:${fileStat.size}`);
  }

  fileEntries.sort();

  const content = fileEntries.join("\n");
  const hash = createHash("sha256").update(content).digest("hex");

  return hash.substring(0, 8);
}

/**
 * Compare stored fingerprint against computed fingerprint.
 */
export type FreshnessState = "fresh" | "stale" | "missing";

export async function checkFreshness(
  dirPath: string,
  storedFingerprint: string | undefined,
  ignorePatterns: string[] = [],
): Promise<{ state: FreshnessState; computed: string }> {
  const computed = await computeFingerprint(dirPath, ignorePatterns);

  if (storedFingerprint === undefined) {
    return { state: "missing", computed };
  }

  return {
    state: storedFingerprint === computed ? "fresh" : "stale",
    computed,
  };
}

function shouldIgnore(filename: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (filename === pattern) return true;
    // Simple glob: *.ext
    if (pattern.startsWith("*.")) {
      const ext = pattern.slice(1);
      if (filename.endsWith(ext)) return true;
    }
  }
  return false;
}
