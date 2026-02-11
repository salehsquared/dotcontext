import { loadConfig } from "./config.js";
import type { ScanOptions } from "../core/scanner.js";

export async function loadScanOptions(rootPath: string): Promise<ScanOptions> {
  const config = await loadConfig(rootPath);
  if (!config) return {};
  return {
    maxDepth: config.max_depth,
    extraIgnore: config.ignore,
  };
}
