import { readFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import type { ScanResult } from "../core/scanner.js";
import type { ContextFile, FileEntry, SubdirectoryEntry } from "../core/schema.js";
import { SCHEMA_VERSION, DEFAULT_MAINTENANCE, FULL_MAINTENANCE } from "../core/schema.js";
import { computeFingerprint } from "../core/fingerprint.js";
import { detectExportsAST } from "./ast.js";
import { detectExternalDeps, detectInternalDeps } from "./dependencies.js";
import { collectBasicEvidence } from "./evidence.js";

/**
 * Generate a .context.yaml using static analysis only (no LLM).
 * Produces structural context: file listings, detected exports, basic metadata.
 */
export async function generateStaticContext(
  scanResult: ScanResult,
  childContexts: Map<string, ContextFile>,
  options?: { evidence?: boolean; mode?: "lean" | "full" },
): Promise<ContextFile> {
  const mode = options?.mode ?? "lean";
  const isFull = mode === "full";

  // Files: only in full mode
  let files: FileEntry[] | undefined;
  if (isFull) {
    files = [];
    for (const filename of scanResult.files) {
      const purpose = await detectFilePurpose(join(scanResult.path, filename));
      const entry: FileEntry = { name: filename, purpose };
      const testFile = detectTestFile(filename, scanResult);
      if (testFile) entry.test_file = testFile;
      files.push(entry);
    }
  }

  const subdirectories: SubdirectoryEntry[] = [];
  for (const child of scanResult.children) {
    const childCtx = childContexts.get(child.path);
    subdirectories.push({
      name: basename(child.relativePath) + "/",
      summary: childCtx?.summary ?? `Contains ${child.files.length} source files`,
    });
  }

  const fingerprint = await computeFingerprint(scanResult.path);
  const now = new Date().toISOString();

  const isRoot = scanResult.relativePath === ".";

  const context: ContextFile = {
    version: SCHEMA_VERSION,
    last_updated: now,
    fingerprint,
    scope: scanResult.relativePath,
    summary: buildSummary(scanResult, isRoot),
    maintenance: isFull ? FULL_MAINTENANCE : DEFAULT_MAINTENANCE,
  };

  if (files) {
    context.files = files;
  }

  if (subdirectories.length > 0) {
    context.subdirectories = subdirectories;
  }

  // Detect interfaces from exports (full mode only)
  if (isFull) {
    const interfaces = await detectInterfaces(scanResult);
    if (interfaces.length > 0) {
      context.interfaces = interfaces;
    }
  }

  // Detect dependencies
  const externalDeps = await detectExternalDeps(scanResult.path);
  const internalDeps = isFull ? await detectInternalDeps(scanResult) : [];
  if (externalDeps.length > 0 || internalDeps.length > 0) {
    context.dependencies = {};
    if (externalDeps.length > 0) context.dependencies.external = externalDeps;
    if (internalDeps.length > 0) context.dependencies.internal = internalDeps;
  }

  // Root-level: always add project metadata and structure
  if (isRoot) {
    context.project = (await detectProjectMeta(scanResult.path)) ?? {
      name: basename(scanResult.path) || "unknown",
      description: "Project root",
      language: "unknown",
    };
    context.structure = scanResult.children.map((child) => ({
      path: child.relativePath,
      summary: childContexts.get(child.path)?.summary
        ?? `Contains ${child.files.length} source files`,
    }));
  }

  // Collect evidence (root only, opt-in)
  if (isRoot && options?.evidence) {
    const evidence = await collectBasicEvidence(scanResult.path);
    if (evidence) context.evidence = evidence;
  }

  // Populate derived_fields
  const derivedFields: string[] = [
    "version", "last_updated", "fingerprint", "scope",
  ];
  if (isFull) {
    derivedFields.push("files");
    if (context.interfaces) derivedFields.push("interfaces");
  }
  if (context.dependencies?.external) derivedFields.push("dependencies.external");
  if (context.dependencies?.internal) derivedFields.push("dependencies.internal");
  if (context.subdirectories) derivedFields.push("subdirectories");
  if (context.project) derivedFields.push("project");
  if (context.structure) derivedFields.push("structure");
  if (context.evidence) derivedFields.push("evidence");
  context.derived_fields = derivedFields;

  return context;
}

function buildSummary(scanResult: ScanResult, isRoot: boolean): string {
  const dirName = scanResult.relativePath === "."
    ? "project root"
    : scanResult.relativePath;

  const fileCount = scanResult.files.length;
  const childCount = scanResult.children.length;

  if (isRoot) {
    return `Project root containing ${fileCount} files and ${childCount} subdirectories. Generated with static analysis — run \`context regen\` with an LLM provider for richer summaries.`;
  }

  return `Directory ${dirName} containing ${fileCount} files${childCount > 0 ? ` and ${childCount} subdirectories` : ""}. Generated with static analysis.`;
}

async function detectFilePurpose(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();
  const filename = basename(filePath);

  // Known config files
  const knownPurposes: Record<string, string> = {
    "package.json": "Node.js project configuration and dependencies",
    "tsconfig.json": "TypeScript compiler configuration",
    "pyproject.toml": "Python project configuration",
    "Cargo.toml": "Rust project configuration",
    "go.mod": "Go module definition",
    "Dockerfile": "Container build configuration",
    "docker-compose.yaml": "Multi-container orchestration",
    "docker-compose.yml": "Multi-container orchestration",
    "Makefile": "Build automation rules",
    ".gitignore": "Git ignore patterns",
    ".env.example": "Environment variable template",
    "README.md": "Project documentation",
    "LICENSE": "Project license",
  };

  if (knownPurposes[filename]) return knownPurposes[filename];

  // Try to detect from file content for source files
  if ([".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go"].includes(ext)) {
    try {
      const content = await readFile(filePath, "utf-8");
      const firstLines = content.split("\n").slice(0, 10).join("\n");

      // Check for file-level doc comments
      const docMatch = firstLines.match(/^(?:\/\*\*|"""|'''|\/\/\/)\s*\n?\s*(.+)/);
      if (docMatch) {
        return docMatch[1].trim().replace(/\*\/|"""|'''/, "").trim();
      }

      // Detect primary exports (tree-sitter with regex fallback)
      const exports = await detectExportsWithFallback(content, ext);
      if (exports.length > 0) {
        return `Exports: ${exports.slice(0, 3).join(", ")}${exports.length > 3 ? ` (+${exports.length - 3} more)` : ""}`;
      }
    } catch {
      // Can't read file, fall through
    }
  }

  // Fallback by extension
  const extPurposes: Record<string, string> = {
    ".ts": "TypeScript source file",
    ".tsx": "TypeScript React component",
    ".js": "JavaScript source file",
    ".jsx": "JavaScript React component",
    ".py": "Python source file",
    ".rs": "Rust source file",
    ".go": "Go source file",
    ".css": "Stylesheet",
    ".scss": "SASS stylesheet",
    ".html": "HTML template",
    ".sql": "SQL queries",
    ".sh": "Shell script",
    ".yaml": "YAML configuration",
    ".yml": "YAML configuration",
    ".json": "JSON data/configuration",
    ".md": "Documentation",
    ".test.ts": "Test file",
    ".spec.ts": "Test file",
  };

  // Check compound extensions first
  for (const [compoundExt, purpose] of Object.entries(extPurposes)) {
    if (filename.endsWith(compoundExt) && compoundExt.split(".").length > 2) {
      return purpose;
    }
  }

  return extPurposes[ext] ?? "Source file";
}

export async function detectExportsWithFallback(content: string, ext: string): Promise<string[]> {
  const astResult = await detectExportsAST(content, ext);
  if (astResult !== null) return astResult;
  return detectExportsFromContent(content, ext);
}

function detectExportsFromContent(content: string, ext: string): string[] {
  const exports: string[] = [];

  if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    // export function/class/const/type/interface
    const exportRegex = /export\s+(?:default\s+)?(?:function|class|const|let|type|interface)\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
  } else if (ext === ".py") {
    // def and class at module level (no indentation)
    const defRegex = /^(?:def|class)\s+(\w+)/gm;
    let match;
    while ((match = defRegex.exec(content)) !== null) {
      if (!match[1].startsWith("_")) {
        exports.push(match[1]);
      }
    }
  } else if (ext === ".go") {
    // Exported (capitalized) functions and types
    const goRegex = /^(?:func|type)\s+([A-Z]\w+)/gm;
    let match;
    while ((match = goRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
  }

  return exports;
}

async function detectInterfaces(scanResult: ScanResult): Promise<Array<{ name: string; description: string }>> {
  const interfaces: Array<{ name: string; description: string }> = [];

  for (const filename of scanResult.files) {
    const ext = extname(filename).toLowerCase();
    if (![".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"].includes(ext)) continue;

    try {
      const content = await readFile(join(scanResult.path, filename), "utf-8");
      const exports = await detectExportsWithFallback(content, ext);

      for (const exp of exports.slice(0, 5)) {
        interfaces.push({
          name: exp,
          description: `Exported from ${filename}`,
        });
      }
    } catch {
      // Skip unreadable files
    }
  }

  return interfaces.slice(0, 15); // Cap at 15 to avoid bloat
}

async function detectProjectMeta(rootPath: string): Promise<ContextFile["project"] | null> {
  // Try package.json
  try {
    const pkg = JSON.parse(await readFile(join(rootPath, "package.json"), "utf-8"));
    return {
      name: pkg.name ?? "unknown",
      description: pkg.description ?? "Node.js project",
      language: "typescript",
      framework: detectFramework(pkg),
      package_manager: "npm",
    };
  } catch { /* not a Node project */ }

  // Try pyproject.toml
  try {
    const content = await readFile(join(rootPath, "pyproject.toml"), "utf-8");
    const nameMatch = content.match(/^name\s*=\s*"(.+)"/m);
    const descMatch = content.match(/^description\s*=\s*"(.+)"/m);
    return {
      name: nameMatch?.[1] ?? "unknown",
      description: descMatch?.[1] ?? "Python project",
      language: "python",
    };
  } catch { /* not a Python project */ }

  // Try Cargo.toml
  try {
    const content = await readFile(join(rootPath, "Cargo.toml"), "utf-8");
    const nameMatch = content.match(/^name\s*=\s*"(.+)"/m);
    return {
      name: nameMatch?.[1] ?? "unknown",
      description: "Rust project",
      language: "rust",
    };
  } catch { /* not a Rust project */ }

  // Try go.mod
  try {
    const content = await readFile(join(rootPath, "go.mod"), "utf-8");
    const moduleMatch = content.match(/^module\s+(.+)/m);
    return {
      name: moduleMatch?.[1]?.split("/").pop() ?? "unknown",
      description: "Go project",
      language: "go",
    };
  } catch { /* not a Go project */ }

  return null;
}

function detectFramework(pkg: Record<string, unknown>): string | undefined {
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };

  if (deps["next"]) return "next";
  if (deps["nuxt"]) return "nuxt";
  if (deps["@sveltejs/kit"]) return "sveltekit";
  if (deps["express"]) return "express";
  if (deps["fastify"]) return "fastify";
  if (deps["react"]) return "react";
  if (deps["vue"]) return "vue";
  if (deps["svelte"]) return "svelte";
  if (deps["@angular/core"]) return "angular";

  return undefined;
}

/**
 * Heuristic: detect the test file for a given source file.
 * Checks colocated patterns (foo.test.ts, foo.spec.ts) in same directory.
 * NOT included in derived_fields — this is a best-effort guess.
 */
function detectTestFile(filename: string, scanResult: ScanResult): string | undefined {
  // Skip test files themselves
  if (/\.(test|spec)\.\w+$/.test(filename)) return undefined;

  const ext = extname(filename);
  const base = filename.slice(0, -ext.length);

  // Check same directory for colocated tests
  for (const suffix of [".test", ".spec"]) {
    const candidate = `${base}${suffix}${ext}`;
    if (scanResult.files.includes(candidate)) {
      return candidate;
    }
  }

  // Check sibling tests/ or __tests__/ directories
  for (const child of scanResult.children) {
    const childDirName = basename(child.relativePath);
    if (childDirName === "tests" || childDirName === "__tests__") {
      for (const suffix of [".test", ".spec"]) {
        const candidate = `${base}${suffix}${ext}`;
        if (child.files.includes(candidate)) {
          return `${childDirName}/${candidate}`;
        }
      }
      // Also check without suffix (tests/foo.ts for foo.ts)
      if (child.files.includes(filename)) {
        return `${childDirName}/${filename}`;
      }
    }
  }

  return undefined;
}

// Re-export for consumers that imported from static.ts
export { collectBasicEvidence } from "./evidence.js";
