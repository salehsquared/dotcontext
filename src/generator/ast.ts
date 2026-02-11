import { join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Lazy imports — only loaded when tree-sitter is actually used
let Parser: typeof import("web-tree-sitter").Parser | null = null;
let Language: typeof import("web-tree-sitter").Language | null = null;
let QueryClass: typeof import("web-tree-sitter").Query | null = null;

interface LanguageConfig {
  wasmFile: string;
  query: string;
  /** Post-filter: only keep names matching this regex (e.g. Go uppercase exports) */
  nameFilter?: RegExp;
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  ".ts": {
    wasmFile: "tree-sitter-typescript.wasm",
    query: `
      (export_statement (function_declaration name: (identifier) @name))
      (export_statement (lexical_declaration (variable_declarator name: (identifier) @name)))
      (export_statement (type_alias_declaration name: (type_identifier) @name))
      (export_statement (interface_declaration name: (type_identifier) @name))
      (export_statement (class_declaration name: (type_identifier) @name))
      (export_statement (export_clause (export_specifier name: (identifier) @name)))
    `,
  },
  ".tsx": {
    wasmFile: "tree-sitter-typescript.wasm",
    query: `
      (export_statement (function_declaration name: (identifier) @name))
      (export_statement (lexical_declaration (variable_declarator name: (identifier) @name)))
      (export_statement (type_alias_declaration name: (type_identifier) @name))
      (export_statement (interface_declaration name: (type_identifier) @name))
      (export_statement (class_declaration name: (type_identifier) @name))
      (export_statement (export_clause (export_specifier name: (identifier) @name)))
    `,
  },
  ".js": {
    wasmFile: "tree-sitter-javascript.wasm",
    query: `
      (export_statement (function_declaration name: (identifier) @name))
      (export_statement (lexical_declaration (variable_declarator name: (identifier) @name)))
      (export_statement (class_declaration name: (identifier) @name))
      (export_statement (export_clause (export_specifier name: (identifier) @name)))
    `,
  },
  ".jsx": {
    wasmFile: "tree-sitter-javascript.wasm",
    query: `
      (export_statement (function_declaration name: (identifier) @name))
      (export_statement (lexical_declaration (variable_declarator name: (identifier) @name)))
      (export_statement (class_declaration name: (identifier) @name))
      (export_statement (export_clause (export_specifier name: (identifier) @name)))
    `,
  },
  ".py": {
    wasmFile: "tree-sitter-python.wasm",
    query: `
      (module (function_definition name: (identifier) @name))
      (module (decorated_definition (function_definition name: (identifier) @name)))
      (module (class_definition name: (identifier) @name))
      (module (decorated_definition (class_definition name: (identifier) @name)))
    `,
    nameFilter: /^[^_]/,
  },
  ".go": {
    wasmFile: "tree-sitter-go.wasm",
    query: `
      (function_declaration name: (identifier) @name)
      (method_declaration name: (field_identifier) @name)
      (type_declaration (type_spec name: (type_identifier) @name))
    `,
    nameFilter: /^[A-Z]/,
  },
  ".rs": {
    wasmFile: "tree-sitter-rust.wasm",
    query: `
      (function_item (visibility_modifier) name: (identifier) @name)
      (struct_item (visibility_modifier) name: (type_identifier) @name)
      (enum_item (visibility_modifier) name: (type_identifier) @name)
      (trait_item (visibility_modifier) name: (type_identifier) @name)
    `,
  },
};

// Singleton parser and language cache
let parserInstance: InstanceType<typeof import("web-tree-sitter").Parser> | null = null;
const languageCache = new Map<string, InstanceType<typeof import("web-tree-sitter").Language>>();
const queryCache = new Map<string, InstanceType<typeof import("web-tree-sitter").Query>>();

function getGrammarsDir(): string {
  const thisDir = typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : fileURLToPath(new URL(".", import.meta.url));
  return join(thisDir, "../../grammars");
}

async function loadTreeSitter(): Promise<boolean> {
  if (Parser) return true;
  try {
    const mod = await import("web-tree-sitter");
    Parser = mod.Parser;
    Language = mod.Language;
    QueryClass = mod.Query;
    await Parser.init();
    return true;
  } catch {
    return false;
  }
}

async function getParser(): Promise<InstanceType<typeof import("web-tree-sitter").Parser>> {
  if (parserInstance) return parserInstance;
  if (!Parser) throw new Error("tree-sitter not loaded");
  parserInstance = new Parser();
  return parserInstance;
}

async function getLanguage(wasmFile: string): Promise<InstanceType<typeof import("web-tree-sitter").Language>> {
  if (languageCache.has(wasmFile)) return languageCache.get(wasmFile)!;
  if (!Language) throw new Error("tree-sitter not loaded");
  const wasmPath = join(getGrammarsDir(), wasmFile);
  const lang = await Language.load(wasmPath);
  languageCache.set(wasmFile, lang);
  return lang;
}

function getQuery(lang: InstanceType<typeof import("web-tree-sitter").Language>, queryStr: string): InstanceType<typeof import("web-tree-sitter").Query> {
  if (queryCache.has(queryStr)) return queryCache.get(queryStr)!;
  if (!QueryClass) throw new Error("tree-sitter not loaded");
  const q = new QueryClass(lang, queryStr);
  queryCache.set(queryStr, q);
  return q;
}

/**
 * Detect exports from source code using tree-sitter AST parsing.
 * Returns null if tree-sitter is not available or the language is unsupported,
 * signaling the caller to use the regex fallback.
 */
export async function detectExportsAST(
  content: string,
  ext: string,
): Promise<string[] | null> {
  const config = LANGUAGE_CONFIGS[ext];
  if (!config) return null;

  const grammarsDir = getGrammarsDir();
  if (!existsSync(join(grammarsDir, config.wasmFile))) return null;

  try {
    const loaded = await loadTreeSitter();
    if (!loaded) return null;

    const parser = await getParser();
    const language = await getLanguage(config.wasmFile);
    parser.setLanguage(language);

    const tree = parser.parse(content);
    if (!tree) return null;
    const query = getQuery(language, config.query);
    const matches = query.matches(tree.rootNode);

    const exports: string[] = [];
    for (const match of matches) {
      for (const capture of match.captures) {
        if (capture.name === "name") {
          const name = capture.node.text;
          if (config.nameFilter && !config.nameFilter.test(name)) continue;
          if (!exports.includes(name)) {
            exports.push(name);
          }
        }
      }
    }

    return exports;
  } catch {
    return null;
  }
}

/** Check if tree-sitter WASM can load and grammars are available. */
export async function isTreeSitterAvailable(): Promise<boolean> {
  try {
    const loaded = await loadTreeSitter();
    if (!loaded) return false;
    const grammarsDir = getGrammarsDir();
    return existsSync(join(grammarsDir, "tree-sitter-typescript.wasm"));
  } catch {
    return false;
  }
}
