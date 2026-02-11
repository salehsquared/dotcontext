import { readConfig, writeConfig } from "../core/writer.js";
import type { ConfigFile } from "../core/schema.js";

/**
 * Load project config, returning null if none exists.
 */
export async function loadConfig(rootPath: string): Promise<ConfigFile | null> {
  return readConfig(rootPath);
}

/**
 * Save project config.
 */
export async function saveConfig(rootPath: string, config: ConfigFile): Promise<void> {
  await writeConfig(rootPath, config);
}

/**
 * Resolve the API key from environment variables.
 */
export function resolveApiKey(config: ConfigFile): string | undefined {
  const envVar = config.api_key_env ?? getDefaultEnvVar(config.provider);
  return process.env[envVar];
}

function getDefaultEnvVar(provider: string): string {
  switch (provider) {
    case "anthropic": return "ANTHROPIC_API_KEY";
    case "openai": return "OPENAI_API_KEY";
    case "google": return "GOOGLE_API_KEY";
    case "ollama": return "OLLAMA_HOST";
    default: return "";
  }
}
