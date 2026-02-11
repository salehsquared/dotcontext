import { resolve } from "node:path";
import { scanProject, flattenBottomUp } from "../core/scanner.js";
import { readContext } from "../core/writer.js";
import { checkFreshness } from "../core/fingerprint.js";
import { freshnessIcon, heading } from "../utils/display.js";

export async function statusCommand(options: { path?: string }): Promise<void> {
  const rootPath = resolve(options.path ?? ".");

  const scanResult = await scanProject(rootPath);
  const dirs = flattenBottomUp(scanResult);

  let tracked = 0;
  let issues = 0;
  const stale: string[] = [];
  const missing: string[] = [];

  console.log("");

  for (const dir of dirs) {
    const context = await readContext(dir.path);

    if (context) {
      tracked++;
      const { state, computed } = await checkFreshness(dir.path, context.fingerprint);
      const label = dir.relativePath === "." ? "(root)" : dir.relativePath;
      console.log(`  ${freshnessIcon(state)}  ${label}`);

      if (state === "stale") {
        const changedCount = dir.files.length; // approximate
        console.log(`               (files changed since last update)`);
        stale.push(dir.relativePath);
        issues++;
      }
    } else {
      const label = dir.relativePath === "." ? "(root)" : dir.relativePath;
      console.log(`  ${freshnessIcon("missing")}  ${label}`);
      missing.push(dir.relativePath);
      issues++;
    }
  }

  console.log(heading(`\ncontext health: ${tracked} of ${dirs.length} directories tracked\n`));

  if (issues > 0) {
    console.log(`${issues} issue${issues > 1 ? "s" : ""} found. Run:`);
    for (const path of stale) {
      console.log(`  context regen ${path}        # regenerate stale context`);
    }
    for (const path of missing) {
      console.log(`  context regen ${path}        # generate context for new directory`);
    }
    console.log("");
  }
}
