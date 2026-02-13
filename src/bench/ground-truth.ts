import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { detectExternalDeps, detectInternalDeps } from "../generator/dependencies.js";
import { detectExportsWithFallback } from "../generator/static.js";
import { flattenBottomUp, type ScanResult } from "../core/scanner.js";
import { CONTEXT_FILENAME } from "../core/schema.js";
import type { DirFacts } from "./types.js";

const BYTES_PER_TOKEN = 4;

export async function buildDepSets(
  scanResult: ScanResult,
): Promise<{ external: Map<string, string[]>; internal: Map<string, string[]> }> {
  const external = new Map<string, string[]>();
  const internal = new Map<string, string[]>();
  const allDirs = flattenBottomUp(scanResult);

  for (const dir of allDirs) {
    const extDeps = await detectExternalDeps(dir.path);
    if (extDeps.length > 0) {
      // Normalize: strip version suffix ("chalk ^5" → "chalk")
      external.set(
        dir.relativePath,
        extDeps.map((d) => d.split(/\s+/)[0]),
      );
    }

    const intDeps = await detectInternalDeps(dir);
    if (intDeps.length > 0) {
      internal.set(dir.relativePath, intDeps);
    }
  }

  return { external, internal };
}

export async function buildReverseDeps(
  scanResult: ScanResult,
): Promise<Map<string, string[]>> {
  const directDeps = new Map<string, Set<string>>();
  const allDirs = flattenBottomUp(scanResult);

  for (const dir of allDirs) {
    for (const filename of dir.files) {
      const ext = extname(filename).toLowerCase();
      if (![".ts", ".tsx", ".js", ".jsx", ".py", ".rs"].includes(ext)) continue;

      let content: string;
      try {
        content = await readFile(join(dir.path, filename), "utf-8");
      } catch {
        continue;
      }

      const sourceFile =
        dir.relativePath === "."
          ? filename
          : `${dir.relativePath}/${filename}`;

      const importPaths: string[] = [];

      if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
        for (const match of content.matchAll(
          /import\s+(?:[\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g,
        )) {
          importPaths.push(match[1]);
        }
        for (const match of content.matchAll(
          /require\(["'](\.[^"']+)["']\)/g,
        )) {
          importPaths.push(match[1]);
        }
      } else if (ext === ".py") {
        for (const match of content.matchAll(
          /from\s+(\.[a-zA-Z0-9_.]+)\s+import/g,
        )) {
          importPaths.push(match[1]);
        }
      }

      for (const importPath of importPaths) {
        // Resolve relative import to a relative path from project root
        const resolvedTarget = resolveImport(dir.relativePath, importPath);
        if (!directDeps.has(resolvedTarget)) {
          directDeps.set(resolvedTarget, new Set());
        }
        directDeps.get(resolvedTarget)!.add(sourceFile);
      }
    }
  }

  // Follow transitive deps up to 2 hops
  const result = new Map<string, string[]>();
  for (const [target, directImporters] of directDeps) {
    const allImporters = new Set(directImporters);

    // Hop 2: files that import the direct importers
    for (const importer of directImporters) {
      const hop2 = directDeps.get(importer);
      if (hop2) {
        for (const transitiveImporter of hop2) {
          allImporters.add(transitiveImporter);
        }
      }
    }

    result.set(target, [...allImporters]);
  }

  return result;
}

function resolveImport(dirRelativePath: string, importPath: string): string {
  // Strip file extension variants for matching
  const base = importPath.replace(/\.(js|ts|tsx|jsx|mjs|cjs)$/, "");
  if (dirRelativePath === ".") {
    return base.replace(/^\.\//, "");
  }
  if (base.startsWith("./")) {
    return `${dirRelativePath}/${base.slice(2)}`;
  }
  if (base.startsWith("../")) {
    const parts = dirRelativePath.split("/");
    let importParts = base.split("/");
    while (importParts[0] === "..") {
      parts.pop();
      importParts = importParts.slice(1);
    }
    return [...parts, ...importParts].join("/");
  }
  return base;
}

export async function buildDirFacts(
  scanResult: ScanResult,
): Promise<Map<string, DirFacts>> {
  const result = new Map<string, DirFacts>();
  const allDirs = flattenBottomUp(scanResult);

  for (const dir of allDirs) {
    const exports: string[] = [];

    for (const filename of dir.files) {
      const ext = extname(filename).toLowerCase();
      if (![".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go"].includes(ext)) continue;

      try {
        const content = await readFile(join(dir.path, filename), "utf-8");
        const names = await detectExportsWithFallback(content, ext);
        exports.push(...names);
      } catch {
        // skip unreadable files
      }
    }

    result.set(dir.relativePath, {
      files: dir.files,
      exports: [...new Set(exports)],
      fileCount: dir.files.length,
    });
  }

  return result;
}

export function buildFileTree(scanResult: ScanResult, indent = ""): string {
  const lines: string[] = [];
  const name =
    scanResult.relativePath === "."
      ? scanResult.relativePath
      : scanResult.relativePath.split("/").pop()!;

  lines.push(`${indent}${name}/`);

  const sortedFiles = [...scanResult.files].sort();
  for (const file of sortedFiles) {
    lines.push(`${indent}  ${file}`);
  }

  const sortedChildren = [...scanResult.children].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );
  for (const child of sortedChildren) {
    lines.push(buildFileTree(child, indent + "  "));
  }

  return lines.join("\n");
}

export async function computeScopeTokens(
  sourceScope: string,
  scanResult: ScanResult,
  contextFileSizes: Map<string, number>,
): Promise<{ baseline: number; context: number }> {
  const allDirs = flattenBottomUp(scanResult);
  const dirMap = new Map<string, ScanResult>();
  for (const dir of allDirs) {
    dirMap.set(dir.relativePath, dir);
  }

  // Baseline: sum source file sizes in scope dir + 1 level of children
  let baselineBytes = 0;
  const scopeDir = dirMap.get(sourceScope);
  if (scopeDir) {
    baselineBytes += await sumFileBytes(scopeDir);
    // Include 1 level of subdirectories
    for (const child of scopeDir.children) {
      baselineBytes += await sumFileBytes(child);
    }
  }

  // Context: sum .context.yaml sizes for scope + parent + children
  let contextBytes = 0;
  contextBytes += contextFileSizes.get(sourceScope) ?? 0;

  // Parent scope
  const parentScope = sourceScope.includes("/")
    ? sourceScope.substring(0, sourceScope.lastIndexOf("/"))
    : sourceScope === "." ? "" : ".";
  if (parentScope) {
    contextBytes += contextFileSizes.get(parentScope) ?? 0;
  }

  // Child scopes
  if (scopeDir) {
    for (const child of scopeDir.children) {
      contextBytes += contextFileSizes.get(child.relativePath) ?? 0;
    }
  }

  return {
    baseline: Math.ceil(baselineBytes / BYTES_PER_TOKEN),
    context: Math.max(1, Math.ceil(contextBytes / BYTES_PER_TOKEN)),
  };
}

async function sumFileBytes(dir: ScanResult): Promise<number> {
  let total = 0;
  for (const file of dir.files) {
    try {
      const s = await stat(join(dir.path, file));
      total += s.size;
    } catch { /* skip */ }
  }
  return total;
}
