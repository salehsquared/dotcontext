import { stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { ScanResult } from "../core/scanner.js";

const BYTES_PER_TOKEN = 4;
export const DEFAULT_MIN_TOKENS = 4096;

export async function estimateDirectoryTokens(dir: ScanResult): Promise<number> {
  let totalBytes = 0;
  for (const file of dir.files) {
    try {
      const s = await stat(join(dir.path, file));
      totalBytes += s.size;
    } catch { /* skip */ }
  }
  return Math.ceil(totalBytes / BYTES_PER_TOKEN);
}

export async function filterByMinTokens(
  dirs: ScanResult[],
  minTokens?: number,
): Promise<{ dirs: ScanResult[]; skipped: number }> {
  const threshold = minTokens ?? DEFAULT_MIN_TOKENS;
  if (threshold <= 0) return { dirs, skipped: 0 };

  // dirs is bottom-up: children appear before parents.
  // When we keep a child, mark its parent as must-keep so routing
  // directories (no direct files, only children) are not skipped.
  const keptPaths = new Set<string>();

  for (const dir of dirs) {
    if (dir.relativePath === ".") {
      keptPaths.add(dir.path);
      continue;
    }
    const tokens = await estimateDirectoryTokens(dir);
    if (tokens >= threshold || keptPaths.has(dir.path)) {
      keptPaths.add(dir.path);
      keptPaths.add(dirname(dir.path));
    }
  }

  const result: ScanResult[] = [];
  let skipped = 0;
  for (const dir of dirs) {
    if (keptPaths.has(dir.path)) {
      result.push(dir);
    } else {
      skipped++;
    }
  }
  return { dirs: result, skipped };
}
