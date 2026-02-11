import { readdir, stat, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { CONTEXT_FILENAME, CONFIG_FILENAME } from "./schema.js";

// Directories always ignored
const ALWAYS_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  "target",       // Rust/Java
  "vendor",       // Go
  ".cache",
  "coverage",
  ".turbo",
  ".vercel",
  ".svelte-kit",
]);

// File extensions considered "source code"
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".pyi",
  ".rs",
  ".go",
  ".java", ".kt", ".kts",
  ".c", ".cpp", ".cc", ".h", ".hpp",
  ".cs",
  ".rb",
  ".php",
  ".swift",
  ".scala",
  ".ex", ".exs",
  ".hs",
  ".lua",
  ".r", ".R",
  ".sql",
  ".sh", ".bash", ".zsh",
  ".yaml", ".yml", ".json", ".toml", ".xml", ".html", ".css", ".scss",
  ".md", ".mdx", ".txt", ".rst",
  ".vue", ".svelte",
  ".tf", ".hcl",
  ".dockerfile",
  ".graphql", ".gql",
  ".proto",
]);

// Config/project files that count as meaningful even without a source extension
const MEANINGFUL_FILES = new Set([
  "Dockerfile",
  "docker-compose.yaml",
  "docker-compose.yml",
  "Makefile",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "Gemfile",
  "Rakefile",
  "CMakeLists.txt",
]);

export interface ScanResult {
  /** Absolute path to the directory */
  path: string;
  /** Relative path from project root */
  relativePath: string;
  /** Source files found directly in this directory */
  files: string[];
  /** Whether a .context.yaml already exists */
  hasContext: boolean;
  /** Child directories that also qualify */
  children: ScanResult[];
}

export interface ScanOptions {
  maxDepth?: number;
  extraIgnore?: string[];
}

/**
 * Scan a project directory tree and find all directories that should
 * have .context.yaml files. Returns a tree of ScanResults.
 */
export async function scanProject(
  rootPath: string,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const gitignorePatterns = await loadGitignore(rootPath);
  const contextIgnorePatterns = await loadContextIgnore(rootPath);
  const allIgnore = [
    ...gitignorePatterns,
    ...contextIgnorePatterns,
    ...(options.extraIgnore ?? []),
  ];

  return scanDir(rootPath, rootPath, 0, options.maxDepth ?? 10, allIgnore);
}

async function scanDir(
  dirPath: string,
  rootPath: string,
  depth: number,
  maxDepth: number,
  ignorePatterns: string[],
): Promise<ScanResult> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const relPath = relative(rootPath, dirPath) || ".";

  const files: string[] = [];
  const childDirs: ScanResult[] = [];
  let hasContext = false;

  for (const entry of entries) {
    if (entry.name === CONTEXT_FILENAME) {
      hasContext = true;
      continue;
    }

    if (entry.name === CONFIG_FILENAME) continue;

    if (entry.isDirectory()) {
      if (ALWAYS_IGNORE.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      if (isIgnored(entry.name, ignorePatterns)) continue;

      if (depth < maxDepth) {
        const childResult = await scanDir(
          join(dirPath, entry.name),
          rootPath,
          depth + 1,
          maxDepth,
          ignorePatterns,
        );
        // Include child if it has files or meaningful children
        if (childResult.files.length > 0 || childResult.children.length > 0) {
          childDirs.push(childResult);
        }
      }
    } else if (entry.isFile()) {
      if (isSourceFile(entry.name)) {
        files.push(entry.name);
      }
    }
  }

  files.sort();

  return {
    path: dirPath,
    relativePath: relPath,
    files,
    hasContext,
    children: childDirs,
  };
}

function isSourceFile(filename: string): boolean {
  if (MEANINGFUL_FILES.has(filename)) return true;
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) return false;
  return SOURCE_EXTENSIONS.has(filename.substring(dotIndex).toLowerCase());
}

function isIgnored(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const clean = pattern.replace(/\/$/, "");
    if (name === clean) return true;
  }
  return false;
}

async function loadGitignore(rootPath: string): Promise<string[]> {
  try {
    const content = await readFile(join(rootPath, ".gitignore"), "utf-8");
    return parseIgnoreFile(content);
  } catch {
    return [];
  }
}

async function loadContextIgnore(rootPath: string): Promise<string[]> {
  try {
    const content = await readFile(join(rootPath, ".contextignore"), "utf-8");
    return parseIgnoreFile(content);
  } catch {
    return [];
  }
}

function parseIgnoreFile(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

/**
 * Flatten a ScanResult tree into a list, bottom-up order
 * (children before parents, for generation ordering).
 */
export function flattenBottomUp(result: ScanResult): ScanResult[] {
  const flat: ScanResult[] = [];

  function walk(node: ScanResult) {
    for (const child of node.children) {
      walk(child);
    }
    flat.push(node);
  }

  walk(result);
  return flat;
}
