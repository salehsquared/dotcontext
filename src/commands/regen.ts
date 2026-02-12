import { resolve, relative, isAbsolute } from "node:path";
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
    const resolvedTarget = resolve(rootPath, targetPath);
    const targetRelFromRoot = relative(rootPath, resolvedTarget);
    const targetInsideRoot = targetRelFromRoot === "" || (!targetRelFromRoot.startsWith("..") && !isAbsolute(targetRelFromRoot));

    if (targetInsideRoot) {
      dirs = allDirs.filter((d) => {
        const rel = relative(resolvedTarget, d.path);
        return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
      });
    } else {
      dirs = [];
    }

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
      const credential = resolveApiKey(config);
      if (config.provider === "ollama" || credential) {
        provider = await createProvider(config.provider, credential, config.model);
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
