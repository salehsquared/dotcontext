import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTmpDir, cleanupTmpDir, createFile } from "./helpers.js";
import { loadEnvForCli, loadEnvLocal, parseEnvLine, resolvePathFromArgv } from "../src/utils/env.js";

const TEST_ENV_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "OLLAMA_HOST",
  "CUSTOM_LLM_KEY",
];

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
  for (const key of TEST_ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(async () => {
  for (const key of TEST_ENV_KEYS) {
    delete process.env[key];
  }
  await cleanupTmpDir(tmpDir);
});

describe("parseEnvLine", () => {
  it("parses basic key-value lines", () => {
    expect(parseEnvLine("OPENAI_API_KEY=abc123")).toEqual({
      key: "OPENAI_API_KEY",
      value: "abc123",
    });
  });

  it("parses export-prefixed lines", () => {
    expect(parseEnvLine("export GOOGLE_API_KEY=my-key")).toEqual({
      key: "GOOGLE_API_KEY",
      value: "my-key",
    });
  });

  it("ignores comments and invalid entries", () => {
    expect(parseEnvLine("# comment")).toBeNull();
    expect(parseEnvLine("NOT VALID")).toBeNull();
    expect(parseEnvLine("9INVALID=value")).toBeNull();
  });

  it("handles quoted values and inline comments", () => {
    expect(parseEnvLine("OPENAI_API_KEY=\"sk-test\"")).toEqual({
      key: "OPENAI_API_KEY",
      value: "sk-test",
    });
    expect(parseEnvLine("OPENAI_API_KEY=sk-test # comment")).toEqual({
      key: "OPENAI_API_KEY",
      value: "sk-test",
    });
  });
});

describe("resolvePathFromArgv", () => {
  it("resolves --path value", () => {
    const resolved = resolvePathFromArgv(["node", "context", "status", "--path", "test/project"]);
    expect(resolved).toBeTruthy();
    expect(resolved?.endsWith("test/project")).toBe(true);
  });

  it("resolves -p value", () => {
    const resolved = resolvePathFromArgv(["node", "context", "status", "-p", "test/project"]);
    expect(resolved).toBeTruthy();
    expect(resolved?.endsWith("test/project")).toBe(true);
  });

  it("resolves --path=<value> form", () => {
    const resolved = resolvePathFromArgv(["node", "context", "status", "--path=test/project"]);
    expect(resolved).toBeTruthy();
    expect(resolved?.endsWith("test/project")).toBe(true);
  });

  it("returns undefined when no path is provided", () => {
    expect(resolvePathFromArgv(["node", "context", "status"])).toBeUndefined();
  });
});

describe("loadEnvLocal", () => {
  it("loads variables from .env.local", async () => {
    await createFile(tmpDir, ".env.local", [
      "OPENAI_API_KEY=test-openai",
      "ANTHROPIC_API_KEY=test-anthropic",
      "OLLAMA_HOST=http://localhost:11434",
      "",
    ].join("\n"));

    await loadEnvLocal(tmpDir);

    expect(process.env.OPENAI_API_KEY).toBe("test-openai");
    expect(process.env.ANTHROPIC_API_KEY).toBe("test-anthropic");
    expect(process.env.OLLAMA_HOST).toBe("http://localhost:11434");
  });

  it("does not override already-set environment variables", async () => {
    process.env.OPENAI_API_KEY = "shell-value";
    await createFile(tmpDir, ".env.local", "OPENAI_API_KEY=file-value\n");

    await loadEnvLocal(tmpDir);

    expect(process.env.OPENAI_API_KEY).toBe("shell-value");
  });

  it("is a no-op when .env.local does not exist", async () => {
    await expect(loadEnvLocal(tmpDir)).resolves.toBeUndefined();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
  });
});

describe("loadEnvForCli", () => {
  it("loads cwd first, then --path without overriding existing env vars", async () => {
    const cwdDir = await createTmpDir();
    const pathDir = await createTmpDir();

    try {
      await createFile(cwdDir, ".env.local", [
        "OPENAI_API_KEY=cwd-openai",
        "CUSTOM_LLM_KEY=cwd-custom",
        "",
      ].join("\n"));
      await createFile(pathDir, ".env.local", [
        "OPENAI_API_KEY=path-openai",
        "ANTHROPIC_API_KEY=path-anthropic",
        "CUSTOM_LLM_KEY=path-custom",
        "",
      ].join("\n"));

      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(cwdDir);
      await loadEnvForCli(["node", "context", "status", "--path", pathDir]);
      cwdSpy.mockRestore();

      expect(process.env.OPENAI_API_KEY).toBe("cwd-openai");
      expect(process.env.ANTHROPIC_API_KEY).toBe("path-anthropic");
      expect(process.env.CUSTOM_LLM_KEY).toBe("cwd-custom");
    } finally {
      await cleanupTmpDir(cwdDir);
      await cleanupTmpDir(pathDir);
    }
  });

  it("loads only cwd when no --path is provided", async () => {
    const cwdDir = await createTmpDir();

    try {
      await createFile(cwdDir, ".env.local", "OPENAI_API_KEY=cwd-only\n");
      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(cwdDir);
      await loadEnvForCli(["node", "context", "status"]);
      cwdSpy.mockRestore();

      expect(process.env.OPENAI_API_KEY).toBe("cwd-only");
      expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    } finally {
      await cleanupTmpDir(cwdDir);
    }
  });
});
