import { resolve } from "node:path";
import { watch as chokidarWatch } from "chokidar";
import { scanProject, flattenBottomUp } from "../core/scanner.js";
import { readContext } from "../core/writer.js";
import { checkFreshness } from "../core/fingerprint.js";
import { freshnessIcon, heading, dim } from "../utils/display.js";
import { loadScanOptions } from "../utils/scan-options.js";
import type { ScanResult } from "../core/scanner.js";
import type { FreshnessState } from "../core/fingerprint.js";

interface DirState {
  dir: ScanResult;
  state: FreshnessState;
}

/**
 * Watch for file changes and report staleness in real-time.
 * Read-only: never writes to disk.
 */
export async function watchCommand(
  options: { path?: string; interval?: string },
): Promise<void> {
  const rootPath = resolve(options.path ?? ".");
  const debounceMs = parseInt(options.interval ?? "500", 10);

  const scanOptions = await loadScanOptions(rootPath);
  const scanResult = await scanProject(rootPath, scanOptions);
  const dirs = flattenBottomUp(scanResult);

  // Compute initial state
  const dirStates = new Map<string, DirState>();
  let freshCount = 0;
  let staleCount = 0;
  let missingCount = 0;

  console.log(heading("\ncontext watch\n"));
  console.log(`  Watching ${rootPath}`);
  console.log(`  Debounce: ${debounceMs}ms`);
  console.log(`  Press Ctrl+C to stop.\n`);

  for (const dir of dirs) {
    const context = await readContext(dir.path);
    let state: FreshnessState;

    if (context) {
      const result = await checkFreshness(dir.path, context.fingerprint);
      state = result.state;
    } else {
      state = "missing";
    }

    dirStates.set(dir.path, { dir, state });
    const label = dir.relativePath === "." ? "(root)" : dir.relativePath;
    console.log(`  ${freshnessIcon(state)}  ${label}`);

    if (state === "fresh") freshCount++;
    else if (state === "stale") staleCount++;
    else missingCount++;
  }

  console.log(
    `\n  ${freshCount} fresh, ${staleCount} stale, ${missingCount} missing\n`,
  );

  // Build a map from directory path to ScanResult for quick lookup
  const dirByPath = new Map<string, ScanResult>();
  for (const dir of dirs) {
    dirByPath.set(dir.path, dir);
  }

  // Track debounce timers per directory
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  // Find which tracked directory a changed file belongs to
  function findParentDir(filePath: string): ScanResult | undefined {
    // Walk up from file to find the closest tracked directory
    let candidate = filePath.substring(0, filePath.lastIndexOf("/"));
    while (candidate.length >= rootPath.length) {
      const dir = dirByPath.get(candidate);
      if (dir) return dir;
      const parent = candidate.substring(0, candidate.lastIndexOf("/"));
      if (parent === candidate) break;
      candidate = parent;
    }
    return undefined;
  }

  async function recheckDir(dir: ScanResult): Promise<void> {
    const context = await readContext(dir.path);
    let newState: FreshnessState;

    if (context) {
      const result = await checkFreshness(dir.path, context.fingerprint);
      newState = result.state;
    } else {
      newState = "missing";
    }

    const prev = dirStates.get(dir.path);
    if (prev && prev.state !== newState) {
      dirStates.set(dir.path, { dir, state: newState });
      const label = dir.relativePath === "." ? "(root)" : dir.relativePath;
      const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
      console.log(`  ${dim(time)}  ${freshnessIcon(newState)}  ${label}  ${dim("(files changed)")}`);
    }
  }

  // Watch all tracked directories
  const watchPaths = dirs.map((d) => d.path);
  const watcher = chokidarWatch(watchPaths, {
    ignored: [
      /node_modules/,
      /\.git/,
      /\.context\.yaml$/,
      /\.context\.config\.yaml$/,
    ],
    persistent: true,
    ignoreInitial: true,
    depth: 0, // Only watch direct files, not subdirectories
  });

  watcher.on("all", (_event, filePath) => {
    const dir = findParentDir(filePath);
    if (!dir) return;

    // Debounce per directory
    const existing = timers.get(dir.path);
    if (existing) clearTimeout(existing);

    timers.set(
      dir.path,
      setTimeout(() => {
        timers.delete(dir.path);
        recheckDir(dir).catch(() => {});
      }, debounceMs),
    );
  });

  // Graceful shutdown
  const cleanup = () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    watcher.close().catch(() => {});
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}
