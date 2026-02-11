import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTEXT_FILENAME } from "../core/schema.js";
import { errorMsg } from "../utils/display.js";

export async function showCommand(targetPath: string): Promise<void> {
  const dirPath = resolve(targetPath);
  const filePath = join(dirPath, CONTEXT_FILENAME);

  try {
    const content = await readFile(filePath, "utf-8");
    console.log(`\n# ${targetPath}/.context.yaml\n`);
    console.log(content);
  } catch {
    console.log(errorMsg(`No .context.yaml found at ${targetPath}`));
  }
}
