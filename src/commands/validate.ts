import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { parse } from "yaml";
import { scanProject, flattenBottomUp, type ScanResult } from "../core/scanner.js";
import { contextSchema, CONTEXT_FILENAME, type ContextFile } from "../core/schema.js";
import { successMsg, errorMsg, warnMsg, dim } from "../utils/display.js";
import { loadScanOptions } from "../utils/scan-options.js";
import { detectExportsWithFallback } from "../generator/static.js";
import { detectInternalDeps } from "../generator/dependencies.js";

interface StrictFinding {
  severity: "warning" | "info";
  message: string;
}

async function crossReference(dir: ScanResult, context: ContextFile): Promise<StrictFinding[]> {
  const findings: StrictFinding[] = [];

  // 1. Files vs filesystem
  const declaredFiles = new Set(context.files.map((f) => f.name));
  const actualFiles = new Set(dir.files);

  for (const name of declaredFiles) {
    if (!actualFiles.has(name)) {
      findings.push({ severity: "warning", message: `phantom file: ${name} (listed but not on disk)` });
    }
  }
  for (const name of actualFiles) {
    if (!declaredFiles.has(name)) {
      findings.push({ severity: "info", message: `unlisted file: ${name} (on disk but not in context)` });
    }
  }

  // 2. Interfaces vs exports
  if (context.interfaces && context.interfaces.length > 0) {
    const actualExports = new Set<string>();
    for (const filename of dir.files) {
      const ext = extname(filename).toLowerCase();
      if (![".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"].includes(ext)) continue;
      try {
        const content = await readFile(join(dir.path, filename), "utf-8");
        const exports = await detectExportsWithFallback(content, ext);
        for (const exp of exports) actualExports.add(exp);
      } catch { /* skip unreadable files */ }
    }

    for (const iface of context.interfaces) {
      // Extract identifier: pure name or function signature "verifyToken(...)".
      // Skip names like "POST /login" where identifier is followed by space+path.
      const identMatch = iface.name.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*\(|$)/);
      if (!identMatch) continue; // Skip non-identifier names (endpoints, CLI commands, etc.)
      const identName = identMatch[1];
      if (!actualExports.has(identName)) {
        findings.push({ severity: "warning", message: `phantom interface: ${iface.name} (declared but not found in code)` });
      }
    }
  }

  // 3. Dependencies vs imports
  if (context.dependencies?.internal && context.dependencies.internal.length > 0) {
    const detected = await detectInternalDeps(dir);
    const declaredSet = new Set(context.dependencies.internal);
    const detectedSet = new Set(detected);

    for (const dep of declaredSet) {
      if (!detectedSet.has(dep)) {
        findings.push({ severity: "info", message: `declared internal dep not found in imports: ${dep}` });
      }
    }
    for (const dep of detectedSet) {
      if (!declaredSet.has(dep)) {
        findings.push({ severity: "info", message: `undeclared internal dep found in imports: ${dep}` });
      }
    }
  }

  return findings;
}

export async function validateCommand(options: { path?: string; strict?: boolean }): Promise<void> {
  const rootPath = resolve(options.path ?? ".");

  const scanOptions = await loadScanOptions(rootPath);
  const scanResult = await scanProject(rootPath, scanOptions);
  const dirs = flattenBottomUp(scanResult);

  let valid = 0;
  let invalid = 0;
  let missing = 0;
  let strictWarnings = 0;
  let strictInfo = 0;

  for (const dir of dirs) {
    const filePath = join(dir.path, CONTEXT_FILENAME);
    const label = dir.relativePath === "." ? "(root)" : dir.relativePath;

    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = parse(content);
      const result = contextSchema.safeParse(parsed);

      if (result.success) {
        if (dir.relativePath === "." && (!result.data.project || !result.data.structure)) {
          console.log(warnMsg(`${label}: root .context.yaml should include 'project' and 'structure' fields`));
        }
        console.log(successMsg(`${label}`));
        valid++;

        if (options.strict) {
          const findings = await crossReference(dir, result.data);
          for (const finding of findings) {
            if (finding.severity === "warning") {
              console.log(warnMsg(`  strict: ${finding.message}`));
              strictWarnings++;
            } else {
              console.log(dim(`    strict: ${finding.message}`));
              strictInfo++;
            }
          }
        }
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

  console.log(`\n${valid} valid, ${invalid} invalid, ${missing} missing.`);

  if (options.strict && (strictWarnings > 0 || strictInfo > 0)) {
    console.log(dim(`strict: ${strictWarnings} warning${strictWarnings !== 1 ? "s" : ""}, ${strictInfo} info across ${dirs.length} director${dirs.length !== 1 ? "ies" : "y"}`));
  }

  console.log("");

  if (invalid > 0) {
    process.exit(1);
  }
}
