import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { generateStaticContext } from "../src/generator/static.js";
import { generateLLMContext } from "../src/generator/llm.js";
import { contextSchema, SCHEMA_VERSION, DEFAULT_MAINTENANCE } from "../src/core/schema.js";
import type { ContextFile } from "../src/core/schema.js";
import type { LLMProvider } from "../src/providers/index.js";
import {
  createTmpDir,
  cleanupTmpDir,
  createFile,
  createNestedFile,
  makeScanResult,
  makeValidContext,
} from "./helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await cleanupTmpDir(tmpDir);
});

// --- Static generator tests ---

describe("generateStaticContext", () => {
  it("generates valid ContextFile for directory with .ts files", async () => {
    await createFile(tmpDir, "index.ts", 'export const x = 1;');
    await createFile(tmpDir, "utils.ts", 'export function help() {}');

    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["index.ts", "utils.ts"] });
    const result = await generateStaticContext(scan, new Map());

    expect(contextSchema.safeParse(result).success).toBe(true);
  });

  it("populates required fields correctly", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["index.ts"] });
    const result = await generateStaticContext(scan, new Map());

    expect(result.version).toBe(SCHEMA_VERSION);
    expect(result.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(result.scope).toBe("src");
    expect(result.maintenance).toBe(DEFAULT_MAINTENANCE);
  });

  it("lists all files with purposes", async () => {
    await createFile(tmpDir, "index.ts", "code");
    await createFile(tmpDir, "package.json", '{"name":"test"}');

    const scan = makeScanResult(tmpDir, { relativePath: ".", files: ["index.ts", "package.json"] });
    const result = await generateStaticContext(scan, new Map());

    expect(result.files).toHaveLength(2);
    const pkgFile = result.files.find((f) => f.name === "package.json");
    expect(pkgFile?.purpose).toBe("Node.js project configuration and dependencies");
  });

  it("detects known file purposes", async () => {
    await createFile(tmpDir, "Dockerfile", "FROM node:18");
    await createFile(tmpDir, "tsconfig.json", "{}");
    await createFile(tmpDir, "README.md", "# Hello");

    const scan = makeScanResult(tmpDir, {
      relativePath: ".",
      files: ["Dockerfile", "README.md", "tsconfig.json"],
    });
    const result = await generateStaticContext(scan, new Map());

    expect(result.files.find((f) => f.name === "Dockerfile")?.purpose).toBe("Container build configuration");
    expect(result.files.find((f) => f.name === "tsconfig.json")?.purpose).toBe("TypeScript compiler configuration");
    expect(result.files.find((f) => f.name === "README.md")?.purpose).toBe("Project documentation");
  });

  it("detects TypeScript exports as file purpose", async () => {
    await createFile(tmpDir, "mod.ts", "export function hello() {}\nexport const world = 1;");

    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["mod.ts"] });
    const result = await generateStaticContext(scan, new Map());

    const mod = result.files.find((f) => f.name === "mod.ts");
    expect(mod?.purpose).toContain("Exports:");
    expect(mod?.purpose).toContain("hello");
  });

  it("detects Python exports", async () => {
    await createFile(tmpDir, "module.py", "def greet():\n    pass\n\nclass Handler:\n    pass\n");

    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["module.py"] });
    const result = await generateStaticContext(scan, new Map());

    const mod = result.files.find((f) => f.name === "module.py");
    expect(mod?.purpose).toContain("greet");
    expect(mod?.purpose).toContain("Handler");
  });

  it("detects Go exported functions", async () => {
    await createFile(tmpDir, "main.go", "func HandleRequest() {}\nfunc internal() {}");

    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["main.go"] });
    const result = await generateStaticContext(scan, new Map());

    const mod = result.files.find((f) => f.name === "main.go");
    expect(mod?.purpose).toContain("HandleRequest");
  });

  it("includes subdirectory summaries from child contexts", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const childPath = join(tmpDir, "core");
    await mkdir(childPath);

    const childScan = makeScanResult(childPath, { relativePath: "src/core", files: ["schema.ts"] });
    const scan = makeScanResult(tmpDir, {
      relativePath: "src",
      files: ["index.ts"],
      children: [childScan],
    });

    const childCtx = makeValidContext({ summary: "Core modules and schemas" });
    const childContexts = new Map<string, ContextFile>([[childPath, childCtx]]);

    const result = await generateStaticContext(scan, childContexts);
    expect(result.subdirectories).toBeDefined();
    expect(result.subdirectories![0].summary).toBe("Core modules and schemas");
  });

  it("uses fallback summary when child context not available", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const childPath = join(tmpDir, "core");
    await mkdir(childPath);

    const childScan = makeScanResult(childPath, { relativePath: "src/core", files: ["a.ts", "b.ts"] });
    const scan = makeScanResult(tmpDir, {
      relativePath: "src",
      files: ["index.ts"],
      children: [childScan],
    });

    const result = await generateStaticContext(scan, new Map());
    expect(result.subdirectories![0].summary).toContain("2 source files");
  });

  it("includes project metadata at root", async () => {
    await createFile(tmpDir, "package.json", JSON.stringify({
      name: "myapp",
      description: "A test app",
    }));

    const scan = makeScanResult(tmpDir, { relativePath: ".", files: ["package.json"] });
    const result = await generateStaticContext(scan, new Map());

    expect(result.project).toBeDefined();
    expect(result.project!.name).toBe("myapp");
    expect(result.project!.description).toBe("A test app");
  });

  it("omits project metadata for non-root directories", async () => {
    await createFile(tmpDir, "index.ts", "code");

    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["index.ts"] });
    const result = await generateStaticContext(scan, new Map());

    expect(result.project).toBeUndefined();
  });

  it("includes structure field at root when children exist", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const childPath = join(tmpDir, "src");
    await mkdir(childPath);
    const childScan = makeScanResult(childPath, { relativePath: "src", files: ["app.ts"] });

    const scan = makeScanResult(tmpDir, { relativePath: ".", files: ["index.ts"], children: [childScan] });
    const result = await generateStaticContext(scan, new Map());

    expect(result.structure).toBeDefined();
    expect(result.structure!.length).toBeGreaterThan(0);
  });

  it("caps interfaces at 15", async () => {
    // Create a file with 20 exports
    const exports = Array.from({ length: 20 }, (_, i) => `export function fn${i}() {}`).join("\n");
    await createFile(tmpDir, "big.ts", exports);

    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["big.ts"] });
    const result = await generateStaticContext(scan, new Map());

    expect(result.interfaces).toBeDefined();
    expect(result.interfaces!.length).toBeLessThanOrEqual(15);
  });
});

// --- LLM generator tests ---

function createMockProvider(yamlResponse: string): LLMProvider {
  return {
    generate: vi.fn().mockResolvedValue(yamlResponse),
  };
}

describe("generateLLMContext", () => {
  it("strips markdown yaml fences from LLM response", async () => {
    await createFile(tmpDir, "a.ts", "code");
    const provider = createMockProvider("```yaml\nsummary: Fenced test\nfiles:\n  - name: a.ts\n    purpose: Code\n```");
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"] });

    const result = await generateLLMContext(provider, scan, new Map());
    expect(result.summary).toBe("Fenced test");
  });

  it("strips ```yml fences too", async () => {
    await createFile(tmpDir, "a.ts", "code");
    const provider = createMockProvider("```yml\nsummary: YML fenced\nfiles:\n  - name: a.ts\n    purpose: Code\n```");
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"] });

    const result = await generateLLMContext(provider, scan, new Map());
    expect(result.summary).toBe("YML fenced");
  });

  it("handles response without fences", async () => {
    await createFile(tmpDir, "a.ts", "code");
    const provider = createMockProvider("summary: No fences\nfiles:\n  - name: a.ts\n    purpose: Code");
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"] });

    const result = await generateLLMContext(provider, scan, new Map());
    expect(result.summary).toBe("No fences");
  });

  it("merges LLM output with required system fields", async () => {
    await createFile(tmpDir, "a.ts", "code");
    const provider = createMockProvider("summary: LLM summary\nfiles:\n  - name: a.ts\n    purpose: From LLM");
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"] });

    const result = await generateLLMContext(provider, scan, new Map());

    expect(result.version).toBe(SCHEMA_VERSION);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(result.maintenance).toBe(DEFAULT_MAINTENANCE);
    expect(result.scope).toBe("src");
  });

  it("validates output against schema", async () => {
    await createFile(tmpDir, "a.ts", "code");
    const provider = createMockProvider("summary: Valid output\nfiles:\n  - name: a.ts\n    purpose: Code");
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"] });

    const result = await generateLLMContext(provider, scan, new Map());
    expect(contextSchema.safeParse(result).success).toBe(true);
  });

  it("falls back to minimal context on validation failure", async () => {
    await createFile(tmpDir, "a.ts", "code");
    // Return invalid files structure
    const provider = createMockProvider("summary: Bad output\nfiles:\n  - bad_field: oops");
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"] });

    const result = await generateLLMContext(provider, scan, new Map());

    // Should still produce valid context
    expect(contextSchema.safeParse(result).success).toBe(true);
    // Fallback should use scanResult files
    expect(result.files[0].name).toBe("a.ts");
    expect(result.files[0].purpose).toBe("Source file");
  });

  it("subdirectories come from scanner, not LLM output", async () => {
    await createFile(tmpDir, "a.ts", "code");
    const childPath = join(tmpDir, "core");
    await mkdir(childPath);

    const provider = createMockProvider("summary: Test\nfiles:\n  - name: a.ts\n    purpose: Code\nsubdirectories:\n  - name: wrong/\n    summary: LLM guess");
    const childScan = makeScanResult(childPath, { relativePath: "src/core", files: ["b.ts"] });
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"], children: [childScan] });

    const childCtx = makeValidContext({ summary: "Real core summary" });
    const childContexts = new Map<string, ContextFile>([[childPath, childCtx]]);

    const result = await generateLLMContext(provider, scan, childContexts);

    expect(result.subdirectories).toBeDefined();
    expect(result.subdirectories![0].name).toBe("core/");
    expect(result.subdirectories![0].summary).toBe("Real core summary");
  });

  it("passes system prompt and user prompt to provider", async () => {
    await createFile(tmpDir, "a.ts", "code");
    const provider = createMockProvider("summary: Test\nfiles:\n  - name: a.ts\n    purpose: Code");
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"] });

    await generateLLMContext(provider, scan, new Map());

    expect(provider.generate).toHaveBeenCalledOnce();
    const [systemPrompt, userPrompt] = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(systemPrompt).toContain("YAML");
    expect(userPrompt).toContain("src");
  });

  it("merges optional LLM fields when present", async () => {
    await createFile(tmpDir, "a.ts", "code");
    const yaml = `summary: Test
files:
  - name: a.ts
    purpose: Code
interfaces:
  - name: hello()
    description: Greets
decisions:
  - what: Use YAML
    why: Token efficient
constraints:
  - Must be valid YAML`;
    const provider = createMockProvider(yaml);
    const scan = makeScanResult(tmpDir, { relativePath: "src", files: ["a.ts"] });

    const result = await generateLLMContext(provider, scan, new Map());

    expect(result.interfaces).toHaveLength(1);
    expect(result.decisions).toHaveLength(1);
    expect(result.constraints).toHaveLength(1);
  });
});
