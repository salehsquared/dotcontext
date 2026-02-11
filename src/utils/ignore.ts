import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CONTEXTIGNORE = ".contextignore";

/**
 * Add a path to .contextignore
 */
export async function addToIgnore(rootPath: string, pathToIgnore: string): Promise<void> {
  const filePath = join(rootPath, CONTEXTIGNORE);
  let existing: string[] = [];

  try {
    const content = await readFile(filePath, "utf-8");
    existing = content.split("\n").filter(Boolean);
  } catch {
    // File doesn't exist yet
  }

  if (!existing.includes(pathToIgnore)) {
    existing.push(pathToIgnore);
    await writeFile(filePath, existing.join("\n") + "\n", "utf-8");
  }
}
