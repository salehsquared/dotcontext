import { stat } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import type { ScanResult } from "../core/scanner.js";
import { CONTEXT_FILENAME } from "../core/schema.js";

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

export async function estimateContextFileTokens(dirPath: string): Promise<number> {
  try {
    const s = await stat(join(dirPath, CONTEXT_FILENAME));
    return Math.ceil(s.size / BYTES_PER_TOKEN);
  } catch {
    return 0;
  }
}

export function collectExtensions(dirs: ScanResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const dir of dirs) {
    for (const file of dir.files) {
      const ext = extname(file);
      if (ext) {
        counts[ext] = (counts[ext] ?? 0) + 1;
      }
    }
  }
  return counts;
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
