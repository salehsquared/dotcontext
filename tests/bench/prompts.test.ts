import { describe, it, expect } from "vitest";
import {
  buildBaselinePrompt,
  buildContextPrompt,
  buildJudgePrompt,
  buildReadmeSnippet,
} from "../../src/bench/prompts.js";
import { makeValidContext } from "../helpers.js";

describe("buildBaselinePrompt", () => {
  const tree = ".\n  src/\n    index.ts";

  it("includes file tree", () => {
    const prompt = buildBaselinePrompt(tree, null, "What does src do?");
    expect(prompt).toContain(tree);
  });

  it("includes README when available", () => {
    const prompt = buildBaselinePrompt(tree, "# My Project\nA great tool.", "q?");
    expect(prompt).toContain("README excerpt:");
    expect(prompt).toContain("A great tool.");
  });

  it("omits README section when not available", () => {
    const prompt = buildBaselinePrompt(tree, null, "q?");
    expect(prompt).not.toContain("README excerpt:");
  });

  it("includes the question", () => {
    const prompt = buildBaselinePrompt(tree, null, "What does src do?");
    expect(prompt).toContain("What does src do?");
  });

  it("includes source scope label when provided", () => {
    const prompt = buildBaselinePrompt(tree, null, "q?", "src");
    expect(prompt).toContain("centered on `src/`");
  });
});

describe("buildContextPrompt", () => {
  const tree = ".\n  src/\n    index.ts";

  it("includes file tree", () => {
    const ctxFiles = new Map([["src", makeValidContext({ summary: "Source code" })]]);
    const prompt = buildContextPrompt(tree, ctxFiles, "q?");
    expect(prompt).toContain(tree);
  });

  it("includes formatted context per directory", () => {
    const ctxFiles = new Map([["src", makeValidContext({ summary: "Main source directory" })]]);
    const prompt = buildContextPrompt(tree, ctxFiles, "q?");
    expect(prompt).toContain("## src/");
    expect(prompt).toContain("Summary: Main source directory");
  });

  it("includes exports and dependencies", () => {
    const ctx = makeValidContext({
      summary: "Core",
      exports: ["runCli()", "createProgram()"],
      dependencies: { internal: ["./utils.js"], external: ["chalk"] },
    });
    const ctxFiles = new Map([["src", ctx]]);
    const prompt = buildContextPrompt(tree, ctxFiles, "q?");
    expect(prompt).toContain("Exports: runCli(), createProgram()");
    expect(prompt).toContain("Internal deps: ./utils.js");
    expect(prompt).toContain("External deps: chalk");
  });

  it("includes the question", () => {
    const ctxFiles = new Map([["src", makeValidContext({ summary: "x" })]]);
    const prompt = buildContextPrompt(tree, ctxFiles, "What does this project do?");
    expect(prompt).toContain("What does this project do?");
  });
});

describe("buildReadmeSnippet", () => {
  it("returns null for empty input", () => {
    expect(buildReadmeSnippet(null)).toBeNull();
    expect(buildReadmeSnippet("   ")).toBeNull();
  });

  it("returns full content when below threshold", () => {
    const text = "# Readme\nShort";
    expect(buildReadmeSnippet(text, 100)).toBe(text);
  });

  it("truncates and annotates long content", () => {
    const text = "x".repeat(200);
    const snippet = buildReadmeSnippet(text, 50);
    expect(snippet).toContain("... [truncated 150 chars]");
  });
});

describe("buildJudgePrompt", () => {
  it("includes question, response, and reference facts", () => {
    const prompt = buildJudgePrompt(
      "What does src/ do?",
      "It handles routing",
      ["Files: index.ts, scanner.ts", "Exports: runCli"],
    );
    expect(prompt).toContain("What does src/ do?");
    expect(prompt).toContain("It handles routing");
    expect(prompt).toContain("Files: index.ts, scanner.ts");
    expect(prompt).toContain("Exports: runCli");
  });

  it("includes 0-3 rubric", () => {
    const prompt = buildJudgePrompt("q", "r", ["fact"]);
    expect(prompt).toContain("0 = wrong");
    expect(prompt).toContain("3 = accurate");
    expect(prompt).toContain("ONLY a single digit");
  });
});
