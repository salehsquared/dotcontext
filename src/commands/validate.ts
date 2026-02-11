import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { scanProject, flattenBottomUp } from "../core/scanner.js";
import { contextSchema, CONTEXT_FILENAME } from "../core/schema.js";
import { successMsg, errorMsg } from "../utils/display.js";

export async function validateCommand(options: { path?: string }): Promise<void> {
  const rootPath = resolve(options.path ?? ".");

  const scanResult = await scanProject(rootPath);
  const dirs = flattenBottomUp(scanResult);

  let valid = 0;
  let invalid = 0;
  let missing = 0;

  for (const dir of dirs) {
    const filePath = join(dir.path, CONTEXT_FILENAME);
    const label = dir.relativePath === "." ? "(root)" : dir.relativePath;

    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = parse(content);
      const result = contextSchema.safeParse(parsed);

      if (result.success) {
        console.log(successMsg(`${label}`));
        valid++;
      } else {
        console.log(errorMsg(`${label}`));
        for (const issue of result.error.issues) {
          console.log(`       ${issue.path.join(".")}: ${issue.message}`);
        }
        invalid++;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        missing++;
      } else {
        console.log(errorMsg(`${label}: ${err instanceof Error ? err.message : "parse error"}`));
        invalid++;
      }
    }
  }

  console.log(`\n${valid} valid, ${invalid} invalid, ${missing} missing.\n`);

  if (invalid > 0) {
    process.exit(1);
  }
}
