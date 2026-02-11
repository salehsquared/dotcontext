import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify, parse } from "yaml";
import { contextSchema, configSchema, CONTEXT_FILENAME, CONFIG_FILENAME } from "./schema.js";
import type { ContextFile, ConfigFile } from "./schema.js";

/**
 * Write a ContextFile to disk as .context.yaml
 */
export async function writeContext(dirPath: string, data: ContextFile): Promise<void> {
  // Validate before writing
  contextSchema.parse(data);

  const yamlContent = stringify(data, {
    lineWidth: 120,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
  });

  await writeFile(join(dirPath, CONTEXT_FILENAME), yamlContent, "utf-8");
}

/**
 * Read and parse a .context.yaml from disk
 */
export async function readContext(dirPath: string): Promise<ContextFile | null> {
  try {
    const content = await readFile(join(dirPath, CONTEXT_FILENAME), "utf-8");
    const parsed = parse(content);
    return contextSchema.parse(parsed);
  } catch {
    return null;
  }
}

/**
 * Write config file to disk
 */
export async function writeConfig(rootPath: string, data: ConfigFile): Promise<void> {
  configSchema.parse(data);

  const yamlContent = stringify(data, {
    lineWidth: 120,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
  });

  await writeFile(join(rootPath, CONFIG_FILENAME), yamlContent, "utf-8");
}

/**
 * Read config file from disk
 */
export async function readConfig(rootPath: string): Promise<ConfigFile | null> {
  try {
    const content = await readFile(join(rootPath, CONFIG_FILENAME), "utf-8");
    const parsed = parse(content);
    return configSchema.parse(parsed);
  } catch {
    return null;
  }
}
