import { resolve } from "node:path";
import { scanProject, flattenBottomUp } from "../core/scanner.js";
import { readContext } from "../core/writer.js";
import { checkFreshness, type FreshnessState } from "../core/fingerprint.js";
import { freshnessIcon, heading } from "../utils/display.js";
import { loadScanOptions } from "../utils/scan-options.js";

interface StatusEntry {
  scope: string;
  state: FreshnessState | "missing";
  fingerprint: string | null;
  summary: string | null;
}

export async function statusCommand(options: { path?: string; json?: boolean }): Promise<void> {
  const rootPath = resolve(options.path ?? ".");

  const scanOptions = await loadScanOptions(rootPath);
  const scanResult = await scanProject(rootPath, scanOptions);
  const dirs = flattenBottomUp(scanResult);

  let tracked = 0;
  let issues = 0;
  let staleCount = 0;
  let missingCount = 0;
  const entries: StatusEntry[] = [];
  const stalePaths: string[] = [];
  const missingPaths: string[] = [];

  for (const dir of dirs) {
    const context = await readContext(dir.path);

    if (context) {
      tracked++;
      const { state } = await checkFreshness(dir.path, context.fingerprint);
      entries.push({
        scope: dir.relativePath,
        state,
        fingerprint: context.fingerprint,
        summary: context.summary,
      });
      if (state === "stale") {
        staleCount++;
        stalePaths.push(dir.relativePath);
        issues++;
      }
    } else {
      entries.push({
        scope: dir.relativePath,
        state: "missing",
        fingerprint: null,
        summary: null,
      });
      missingCount++;
      missingPaths.push(dir.relativePath);
      issues++;
    }
  }

  // Sort entries by scope for deterministic CI diffs
  entries.sort((a, b) => a.scope.localeCompare(b.scope));

  if (options.json) {
    // JSON mode: emit ONLY the JSON object to stdout. No headings, colors, or extra logs.
    process.stdout.write(JSON.stringify({
      root: rootPath,
      directories: entries,
      summary: {
        total: dirs.length,
        tracked,
        fresh: tracked - staleCount,
        stale: staleCount,
        missing: missingCount,
      },
    }, null, 2) + "\n");
    return;
  }

  // Human-readable output
  console.log("");

  for (const entry of entries) {
    const label = entry.scope === "." ? "(root)" : entry.scope;
    console.log(`  ${freshnessIcon(entry.state === "missing" ? "missing" : entry.state)}  ${label}`);

    if (entry.state === "stale") {
      console.log(`               (files changed since last update)`);
    }
  }

  console.log(heading(`\ncontext health: ${tracked} of ${dirs.length} directories tracked\n`));

  if (issues > 0) {
    console.log(`${issues} issue${issues > 1 ? "s" : ""} found. Run:`);
    for (const path of stalePaths) {
      console.log(`  context regen ${path}        # regenerate stale context`);
    }
    for (const path of missingPaths) {
      console.log(`  context regen ${path}        # generate context for new directory`);
    }
    console.log("");
  }
}
