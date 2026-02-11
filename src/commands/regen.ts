import { resolve } from "node:path";
import { scanProject, flattenBottomUp } from "../core/scanner.js";
import { readContext, writeContext } from "../core/writer.js";
import { generateStaticContext } from "../generator/static.js";
import { generateLLMContext } from "../generator/llm.js";
import { createProvider } from "../providers/index.js";
import { loadConfig, resolveApiKey } from "../utils/config.js";
import { loadScanOptions } from "../utils/scan-options.js";
import { successMsg, errorMsg, progressBar } from "../utils/display.js";
import type { ContextFile } from "../core/schema.js";

export async function regenCommand(
  targetPath: string | undefined,
  options: { all?: boolean; force?: boolean; noLlm?: boolean; path?: string; evidence?: boolean },
): Promise<void> {
  const rootPath = resolve(options.path ?? ".");

  const scanOptions = await loadScanOptions(rootPath);
  const scanResult = await scanProject(rootPath, scanOptions);
  const allDirs = flattenBottomUp(scanResult);

  // Determine which directories to regenerate
  let dirs = allDirs;
  if (!options.all && targetPath) {
    const resolvedTarget = resolve(rootPath, targetPath).replace(/\/$/, "");
    dirs = allDirs.filter((d) => d.path === resolvedTarget || d.path.startsWith(resolvedTarget + "/"));

    if (dirs.length === 0) {
      console.log(errorMsg(`No matching directory found for: ${targetPath}`));
      return;
    }
  }

  // Set up provider
  let provider = null;
  if (!options.noLlm) {
    const config = await loadConfig(rootPath);
    if (config) {
      const apiKey = resolveApiKey(config);
      if (apiKey) {
        provider = await createProvider(config.provider, apiKey);
      }
    }
  }

  console.log(`\nRegenerating context for ${dirs.length} director${dirs.length > 1 ? "ies" : "y"}...`);

  const childContexts = new Map<string, ContextFile>();

  // Pre-populate child contexts from existing files
  for (const dir of allDirs) {
    const existing = await readContext(dir.path);
    if (existing) childContexts.set(dir.path, existing);
  }

  let completed = 0;

  for (const dir of dirs) {
    process.stdout.write(`\r${progressBar(completed, dirs.length)}`);

    try {
      let context: ContextFile;
      const genOptions = { evidence: options.evidence };
      if (provider) {
        context = await generateLLMContext(provider, dir, childContexts, genOptions);
      } else {
        context = await generateStaticContext(dir, childContexts, genOptions);
      }

      await writeContext(dir.path, context);
      childContexts.set(dir.path, context);

      completed++;
      console.log(`\n${successMsg(`${dir.relativePath}/.context.yaml updated`)}`);
    } catch (err) {
      completed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\n${errorMsg(`${dir.relativePath}: ${msg}`)}`);
    }
  }

  console.log(`\nDone. ${completed} file${completed > 1 ? "s" : ""} regenerated.\n`);
}
