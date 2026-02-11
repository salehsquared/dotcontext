#!/usr/bin/env node
/**
 * Copy pre-built WASM grammar files from node_modules to grammars/.
 * Grammar packages ship with .wasm files, so no compilation needed.
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const grammarsDir = resolve(__dirname, "../grammars");
const nodeModules = resolve(__dirname, "../node_modules");

if (!existsSync(grammarsDir)) {
  mkdirSync(grammarsDir, { recursive: true });
}

const grammars = [
  { pkg: "tree-sitter-javascript", file: "tree-sitter-javascript.wasm" },
  { pkg: "tree-sitter-typescript", file: "tree-sitter-typescript.wasm" },
  { pkg: "tree-sitter-python", file: "tree-sitter-python.wasm" },
  { pkg: "tree-sitter-go", file: "tree-sitter-go.wasm" },
  { pkg: "tree-sitter-rust", file: "tree-sitter-rust.wasm" },
];

for (const grammar of grammars) {
  const src = resolve(nodeModules, grammar.pkg, grammar.file);
  const dest = resolve(grammarsDir, grammar.file);
  copyFileSync(src, dest);
  console.log(`  Copied ${grammar.file}`);
}

console.log(`\n${grammars.length} grammar WASM files copied to grammars/`);
