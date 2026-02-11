import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, buildUserPrompt } from "../src/generator/prompts.js";
import type { ContextFile } from "../src/core/schema.js";
import { makeScanResult, makeValidContext } from "./helpers.js";

describe("SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("contains instructions about YAML output", () => {
    expect(SYSTEM_PROMPT).toContain("YAML");
  });

  it("contains instruction to not include secrets", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("secret");
  });
});

describe("buildUserPrompt", () => {
  it("includes directory path in prompt", () => {
    const scan = makeScanResult("/project/src/core", { relativePath: "src/core", files: ["index.ts"] });
    const prompt = buildUserPrompt(scan, new Map(), new Map(), false);
    expect(prompt).toContain("src/core");
  });

  it("includes file contents in prompt", () => {
    const scan = makeScanResult("/project/src", { relativePath: "src", files: ["index.ts"] });
    const fileContents = new Map([["index.ts", "export const x = 1;"]]);
    const prompt = buildUserPrompt(scan, fileContents, new Map(), false);
    expect(prompt).toContain("### index.ts");
    expect(prompt).toContain("export const x = 1;");
  });

  it("truncates files over 8000 characters", () => {
    const scan = makeScanResult("/project", { files: ["big.ts"] });
    const bigContent = "x".repeat(9000);
    const fileContents = new Map([["big.ts", bigContent]]);
    const prompt = buildUserPrompt(scan, fileContents, new Map(), false);
    expect(prompt).toContain("(truncated)");
    expect(prompt).not.toContain("x".repeat(9000));
  });

  it("does not truncate files under 8000 characters", () => {
    const scan = makeScanResult("/project", { files: ["small.ts"] });
    const smallContent = "x".repeat(7000);
    const fileContents = new Map([["small.ts", smallContent]]);
    const prompt = buildUserPrompt(scan, fileContents, new Map(), false);
    expect(prompt).not.toContain("truncated");
  });

  it("includes child context summaries", () => {
    const scan = makeScanResult("/project/src", { relativePath: "src", files: [] });
    const childCtx = makeValidContext({ summary: "Core logic modules" });
    const childContexts = new Map<string, ContextFile>([["/project/src/core", childCtx]]);
    const prompt = buildUserPrompt(scan, new Map(), childContexts, false);
    expect(prompt).toContain("Core logic modules");
  });

  it("root prompt includes project fields section", () => {
    const scan = makeScanResult("/project", { relativePath: ".", files: [] });
    const prompt = buildUserPrompt(scan, new Map(), new Map(), true);
    expect(prompt).toContain("PROJECT ROOT");
    expect(prompt).toContain("project:");
    expect(prompt).toContain("structure:");
  });

  it("non-root prompt omits project fields", () => {
    const scan = makeScanResult("/project/src", { relativePath: "src", files: [] });
    const prompt = buildUserPrompt(scan, new Map(), new Map(), false);
    expect(prompt).not.toContain("PROJECT ROOT");
  });

  it("prompt contains instruction to output only YAML", () => {
    const scan = makeScanResult("/project", { files: [] });
    const prompt = buildUserPrompt(scan, new Map(), new Map(), false);
    expect(prompt).toContain("Output ONLY the YAML");
  });

  it("handles empty file contents map", () => {
    const scan = makeScanResult("/project", { files: ["a.ts"] });
    const prompt = buildUserPrompt(scan, new Map(), new Map(), false);
    expect(prompt).toContain("Files in this directory");
    // Should not crash
  });

  it("maintains file order from scan result", () => {
    const scan = makeScanResult("/project", { files: ["a.ts", "b.ts"] });
    const fileContents = new Map([
      ["a.ts", "const a = 1;"],
      ["b.ts", "const b = 2;"],
    ]);
    const prompt = buildUserPrompt(scan, fileContents, new Map(), false);
    const aIdx = prompt.indexOf("### a.ts");
    const bIdx = prompt.indexOf("### b.ts");
    expect(aIdx).toBeLessThan(bIdx);
  });
});
