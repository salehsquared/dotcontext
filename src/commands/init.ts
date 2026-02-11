import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { scanProject, flattenBottomUp } from "../core/scanner.js";
import { writeContext } from "../core/writer.js";
import { generateStaticContext } from "../generator/static.js";
import { generateLLMContext } from "../generator/llm.js";
import { createProvider, type ProviderName } from "../providers/index.js";
import { saveConfig, resolveApiKey } from "../utils/config.js";
import { loadScanOptions } from "../utils/scan-options.js";
import { successMsg, errorMsg, progressBar, heading } from "../utils/display.js";
import type { ContextFile, ConfigFile } from "../core/schema.js";

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function initCommand(options: { noLlm?: boolean; path?: string }): Promise<void> {
  const rootPath = resolve(options.path ?? ".");

  console.log(heading("\nWelcome to context.\n"));

  let config: ConfigFile | null = null;

  if (!options.noLlm) {
    // Prompt for provider
    console.log("Which LLM provider would you like to use for generating context?");
    console.log("  1. Anthropic (Claude)");
    console.log("  2. OpenAI (GPT)");
    console.log("  3. Google (Gemini)");
    console.log("  4. Ollama (local)");

    const choice = await ask("  > ");
    const providers: Record<string, ProviderName> = {
      "1": "anthropic",
      "2": "openai",
      "3": "google",
      "4": "ollama",
    };

    const providerName = providers[choice];
    if (!providerName) {
      console.log(errorMsg("Invalid choice. Run `context init --no-llm` for offline mode."));
      process.exit(1);
    }

    config = { provider: providerName };

    // Check for API key
    const apiKey = resolveApiKey(config);
    if (!apiKey && providerName !== "ollama") {
      const envVar = providerName === "anthropic" ? "ANTHROPIC_API_KEY"
        : providerName === "openai" ? "OPENAI_API_KEY"
        : "GOOGLE_API_KEY";

      const key = await ask(`Enter your API key (or set ${envVar}):\n  > `);
      if (!key) {
        console.log(errorMsg(`No API key provided. Set ${envVar} or run with --no-llm.`));
        process.exit(1);
      }
      // Set for this session
      process.env[envVar] = key;
    }

    await saveConfig(rootPath, config);
  }

  // Scan project
  console.log("\nScanning project structure...");
  const scanOptions = await loadScanOptions(rootPath);
  const scanResult = await scanProject(rootPath, scanOptions);
  const dirs = flattenBottomUp(scanResult);

  console.log(`Found ${dirs.length} directories with source code.\n`);

  if (dirs.length === 0) {
    console.log(errorMsg("No directories with source files found."));
    return;
  }

  // Generate context files
  console.log(options.noLlm
    ? "Generating structural context (no LLM)..."
    : "Generating context... (this may take a minute)");

  const provider = (!options.noLlm && config)
    ? await createProvider(config.provider, resolveApiKey(config) ?? "")
    : null;

  const childContexts = new Map<string, ContextFile>();
  let completed = 0;

  for (const dir of dirs) {
    process.stdout.write(`\r${progressBar(completed, dirs.length)}`);

    try {
      let context: ContextFile;

      if (provider) {
        context = await generateLLMContext(provider, dir, childContexts);
      } else {
        context = await generateStaticContext(dir, childContexts);
      }

      await writeContext(dir.path, context);
      childContexts.set(dir.path, context);

      completed++;
      process.stdout.write(`\r${progressBar(completed, dirs.length)}`);
      console.log(`\n${successMsg(`.context.yaml  ${dir.relativePath === "." ? "(root)" : dir.relativePath}`)}`);
    } catch (err) {
      completed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\n${errorMsg(`${dir.relativePath}: ${msg}`)}`);
    }
  }

  console.log(`\n\nDone. ${completed} .context.yaml files created.`);
  console.log('Run `context status` to check freshness.\n');
}
