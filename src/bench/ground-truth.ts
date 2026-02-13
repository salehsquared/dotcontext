import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { detectExternalDeps, detectInternalDeps } from "../generator/dependencies.js";
import { detectExportsWithFallback } from "../generator/static.js";
import { flattenBottomUp, type ScanResult } from "../core/scanner.js";
import type { DirFacts } from "./types.js";

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

function resolveTrackedScope(sourceScope: string, dirMap: Map<string, ScanResult>): string {
  if (dirMap.has(sourceScope)) return sourceScope;

  let candidate = sourceScope;
  while (candidate.includes("/")) {
    candidate = candidate.substring(0, candidate.lastIndexOf("/"));
    if (dirMap.has(candidate)) return candidate;
  }

  if (dirMap.has(".")) return ".";
  return dirMap.keys().next().value ?? sourceScope;
}

export interface ScopeWindow {
  resolvedScope: string;
  scopes: string[];
}

export function computeScopeWindow(
  sourceScope: string,
  scanResult: ScanResult,
): ScopeWindow {
  const allDirs = flattenBottomUp(scanResult);
  const dirMap = new Map<string, ScanResult>();
  for (const dir of allDirs) {
    dirMap.set(dir.relativePath, dir);
  }

  const resolvedScope = resolveTrackedScope(sourceScope, dirMap);
  const scopeDir = dirMap.get(resolvedScope);

  const scopes: string[] = [];
  const seen = new Set<string>();
  const pushScope = (scope: string) => {
    if (!scope || seen.has(scope) || !dirMap.has(scope)) return;
    seen.add(scope);
    scopes.push(scope);
  };

  // Always include root if available for orientation.
  pushScope(".");

  const parentScope = resolvedScope === "."
    ? undefined
    : resolvedScope.includes("/")
      ? resolvedScope.substring(0, resolvedScope.lastIndexOf("/"))
      : ".";
  if (parentScope) pushScope(parentScope);

  pushScope(resolvedScope);
  if (scopeDir) {
    for (const child of scopeDir.children) {
      pushScope(child.relativePath);
    }
  }

  return { resolvedScope, scopes };
}

const MAX_FILES_PER_SCOPE = 30;

export function buildScopedFileTree(
  sourceScope: string,
  scanResult: ScanResult,
): { tree: string; scopes: string[]; resolvedScope: string } {
  const allDirs = flattenBottomUp(scanResult);
  const dirMap = new Map<string, ScanResult>();
  for (const dir of allDirs) {
    dirMap.set(dir.relativePath, dir);
  }

  const window = computeScopeWindow(sourceScope, scanResult);
  const lines: string[] = [];

  lines.push(`Target scope: ${window.resolvedScope === "." ? "./" : `${window.resolvedScope}/`}`);
  lines.push("Relevant directories:");

  for (const scope of window.scopes) {
    const dir = dirMap.get(scope);
    if (!dir) continue;

    const label = scope === "." ? "./" : `${scope}/`;
    lines.push(`- ${label}`);

    const files = [...dir.files].sort();
    for (const file of files.slice(0, MAX_FILES_PER_SCOPE)) {
      lines.push(`  - ${file}`);
    }
    if (files.length > MAX_FILES_PER_SCOPE) {
      lines.push(`  - ... (+${files.length - MAX_FILES_PER_SCOPE} more files)`);
    }
  }

  return {
    tree: lines.join("\n"),
    scopes: window.scopes,
    resolvedScope: window.resolvedScope,
  };
}
