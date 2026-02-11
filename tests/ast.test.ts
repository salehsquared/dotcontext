import { describe, it, expect } from "vitest";
import { detectExportsAST, isTreeSitterAvailable } from "../src/generator/ast.js";

const available = await isTreeSitterAvailable();

describe("detectExportsAST", () => {
  // TypeScript / JavaScript
  it.skipIf(!available)("detects TS export function", async () => {
    const exports = await detectExportsAST(`export function hello() {}`, ".ts");
    expect(exports).toContain("hello");
  });

  it.skipIf(!available)("detects TS async export function", async () => {
    const exports = await detectExportsAST(`export async function fetchData() {}`, ".ts");
    expect(exports).toContain("fetchData");
  });

  it.skipIf(!available)("detects TS multi-line export signature", async () => {
    const code = `export function processItem(
  item: Item,
  options: Options,
): Result { return item; }`;
    const exports = await detectExportsAST(code, ".ts");
    expect(exports).toContain("processItem");
  });

  it.skipIf(!available)("detects TS re-exports", async () => {
    const exports = await detectExportsAST(`export { foo, bar } from './other';`, ".ts");
    expect(exports).toContain("foo");
    expect(exports).toContain("bar");
  });

  it.skipIf(!available)("detects TS type and interface exports", async () => {
    const code = `export type MyType = string;\nexport interface MyInterface {}`;
    const exports = await detectExportsAST(code, ".ts");
    expect(exports).toContain("MyType");
    expect(exports).toContain("MyInterface");
  });

  it.skipIf(!available)("detects TS const and class exports", async () => {
    const code = `export const value = 1;\nexport default class MyClass {}`;
    const exports = await detectExportsAST(code, ".ts");
    expect(exports).toContain("value");
    expect(exports).toContain("MyClass");
  });

  // Python
  it.skipIf(!available)("detects Python decorated function", async () => {
    const code = `@app.route("/api")\ndef api_handler():\n    pass`;
    const exports = await detectExportsAST(code, ".py");
    expect(exports).toContain("api_handler");
  });

  it.skipIf(!available)("detects Python async def", async () => {
    const exports = await detectExportsAST(`async def fetch_data():\n    pass`, ".py");
    expect(exports).toContain("fetch_data");
  });

  it.skipIf(!available)("detects Python class and filters private", async () => {
    const code = `class Handler:\n    pass\n\ndef _private():\n    pass`;
    const exports = await detectExportsAST(code, ".py");
    expect(exports).toContain("Handler");
    expect(exports).not.toContain("_private");
  });

  // Go
  it.skipIf(!available)("detects Go exported functions only", async () => {
    const code = `package main\nfunc HandleRequest() {}\nfunc internal() {}`;
    const exports = await detectExportsAST(code, ".go");
    expect(exports).toContain("HandleRequest");
    expect(exports).not.toContain("internal");
  });

  it.skipIf(!available)("detects Go method receiver", async () => {
    const code = `package main\nfunc (s *Server) ServeHTTP() {}`;
    const exports = await detectExportsAST(code, ".go");
    expect(exports).toContain("ServeHTTP");
  });

  // Rust
  it.skipIf(!available)("detects Rust pub items only", async () => {
    const code = `pub fn process() {}\npub struct Config {}\nfn internal() {}`;
    const exports = await detectExportsAST(code, ".rs");
    expect(exports).toContain("process");
    expect(exports).toContain("Config");
    expect(exports).not.toContain("internal");
  });

  // Fallback
  it("returns null for unsupported extension", async () => {
    const exports = await detectExportsAST("code", ".lua");
    expect(exports).toBeNull();
  });
});
