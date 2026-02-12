import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeConfig } from "../../src/core/writer.js";
import { createTmpDir, cleanupTmpDir, createFile, makeValidContext } from "../helpers.js";

const createProviderMock = vi.fn(async () => ({ generate: vi.fn(async () => "") }));
const generateLLMContextMock = vi.fn(async () => makeValidContext());
const generateStaticContextMock = vi.fn(async () => makeValidContext());

vi.mock("../../src/providers/index.js", () => ({
  createProvider: createProviderMock,
}));

vi.mock("../../src/generator/llm.js", () => ({
  generateLLMContext: generateLLMContextMock,
}));

vi.mock("../../src/generator/static.js", () => ({
  generateStaticContext: generateStaticContextMock,
}));

const { regenCommand } = await import("../../src/commands/regen.js");

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
  createProviderMock.mockClear();
  generateLLMContextMock.mockClear();
  generateStaticContextMock.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTmpDir(tmpDir);
  delete process.env.OPENAI_API_KEY;
  delete process.env.OLLAMA_HOST;
});

describe("regenCommand provider wiring", () => {
  it("passes configured model to cloud providers", async () => {
    await createFile(tmpDir, "index.ts", "export const x = 1;");
    await writeConfig(tmpDir, {
      provider: "openai",
      model: "gpt-4.1-mini",
    });
    process.env.OPENAI_API_KEY = "test-openai-key";

    await regenCommand(undefined, { path: tmpDir, all: true, noLlm: false });

    expect(createProviderMock).toHaveBeenCalledWith("openai", "test-openai-key", "gpt-4.1-mini");
    expect(generateLLMContextMock).toHaveBeenCalled();
  });

  it("creates ollama provider without requiring OLLAMA_HOST", async () => {
    await createFile(tmpDir, "index.ts", "export const x = 1;");
    await writeConfig(tmpDir, {
      provider: "ollama",
      model: "llama3.2",
    });

    await regenCommand(undefined, { path: tmpDir, all: true, noLlm: false });

    expect(createProviderMock).toHaveBeenCalledWith("ollama", undefined, "llama3.2");
    expect(generateLLMContextMock).toHaveBeenCalled();
  });
});
