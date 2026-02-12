import { resolve } from "node:path";
import { loadConfig, saveConfig } from "../utils/config.js";
import { heading, errorMsg, successMsg } from "../utils/display.js";
import type { ProviderName } from "../providers/index.js";

export async function configCommand(
  options: {
    path?: string;
    provider?: string;
    model?: string;
    maxDepth?: string;
    ignore?: string[];
    apiKeyEnv?: string;
    mode?: string;
  },
): Promise<void> {
  const rootPath = resolve(options.path ?? ".");
  const existing = await loadConfig(rootPath);

  // If no flags, show current config
  if (!options.provider && !options.model && !options.maxDepth && !options.ignore && !options.apiKeyEnv && !options.mode) {
    if (!existing) {
      console.log(errorMsg("No .context.config.yaml found. Run `context init` first."));
      return;
    }
    console.log(heading("\nCurrent configuration:\n"));
    console.log(`  provider: ${existing.provider}`);
    if (existing.model) console.log(`  model: ${existing.model}`);
    if (existing.api_key_env) console.log(`  api_key_env: ${existing.api_key_env}`);
    if (existing.max_depth) console.log(`  max_depth: ${existing.max_depth}`);
    if (existing.ignore?.length) console.log(`  ignore: ${existing.ignore.join(", ")}`);
    console.log(`  mode: ${existing.mode ?? "lean"}`);
    console.log("");
    return;
  }

  // Update config
  const updated = existing ?? { provider: "anthropic" as ProviderName };

  if (options.provider) {
    const validProviders = ["anthropic", "openai", "google", "ollama"];
    if (!validProviders.includes(options.provider)) {
      console.log(errorMsg(`Invalid provider: ${options.provider}. Must be one of: ${validProviders.join(", ")}`));
      return;
    }
    updated.provider = options.provider as ProviderName;
  }

  if (options.model) {
    updated.model = options.model;
  }

  if (options.maxDepth) {
    const depth = parseInt(options.maxDepth, 10);
    if (isNaN(depth) || depth < 1) {
      console.log(errorMsg("max_depth must be a positive integer"));
      return;
    }
    updated.max_depth = depth;
  }

  if (options.ignore) {
    updated.ignore = [...new Set([...(updated.ignore ?? []), ...options.ignore])];
  }

  if (options.apiKeyEnv) {
    updated.api_key_env = options.apiKeyEnv;
  }

  if (options.mode) {
    const validModes = ["lean", "full"];
    if (!validModes.includes(options.mode)) {
      console.log(errorMsg(`Invalid mode: ${options.mode}. Must be one of: ${validModes.join(", ")}`));
      return;
    }
    updated.mode = options.mode as "lean" | "full";
  }

  await saveConfig(rootPath, updated);
  console.log(successMsg("Configuration updated."));
}
