import { resolve } from "node:path";
import { addToIgnore } from "../utils/ignore.js";
import { successMsg } from "../utils/display.js";

export async function ignoreCommand(targetPath: string, options: { path?: string }): Promise<void> {
  const rootPath = resolve(options.path ?? ".");

  await addToIgnore(rootPath, targetPath);
  console.log(successMsg(`Added "${targetPath}" to .contextignore`));
}
