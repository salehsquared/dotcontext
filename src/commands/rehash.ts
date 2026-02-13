import { resolve } from "node:path";
import { scanProject, flattenBottomUp } from "../core/scanner.js";
import { readContext, writeContext, UnsupportedVersionError } from "../core/writer.js";
import { computeFingerprint } from "../core/fingerprint.js";
import { loadScanOptions } from "../utils/scan-options.js";
import { loadConfig } from "../utils/config.js";
import { filterByMinTokens } from "../utils/tokens.js";

export async function rehashCommand(options: { path?: string }): Promise<void> {
  const rootPath = resolve(options.path ?? ".");

  const config = await loadConfig(rootPath);
  const scanOptions = await loadScanOptions(rootPath);
  const scanResult = await scanProject(rootPath, scanOptions);
  const allDirs = flattenBottomUp(scanResult);
  const { dirs } = await filterByMinTokens(allDirs, config?.min_tokens);

  let updated = 0;
  let stale = 0;

  for (const dir of dirs) {
    let context;
    try {
      context = await readContext(dir.path);
    } catch (err) {
      if (err instanceof UnsupportedVersionError) {
        console.log(`  ${dir.relativePath}: ${err.message} (skipped)`);
        continue;
      }
      throw err;
    }
    if (!context) continue;

    const newFingerprint = await computeFingerprint(dir.path);

    if (context.fingerprint !== newFingerprint) {
      stale++;
    }

    context.fingerprint = newFingerprint;
    await writeContext(dir.path, context);
    updated++;
  }

  console.log(`\nUpdated fingerprints for ${updated} directories.`);
  if (stale > 0) {
    console.log(`${stale} directories were stale (fingerprints updated, content unchanged).`);
  }
  console.log("");
}
