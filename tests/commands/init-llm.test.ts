import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { createTmpDir, cleanupTmpDir } from "../helpers.js";
import { loadConfig, saveConfig } from "../../src/utils/config.js";

const answers = vi.hoisted((): string[] => []);

vi.mock("node:readline", () => ({
  createInterface: () => ({
    question: (_prompt: string, callback: (answer: string) => void) => {
      callback(answers.shift() ?? "");
    },
    close: () => {},
  }),
}));

import { initCommand } from "../../src/commands/init.js";

let tmpDir: string;
const fixturesDir = join(import.meta.dirname, "../fixtures");

async function copyFixture(name: string): Promise<void> {
  await cp(join(fixturesDir, name), tmpDir, { recursive: true });
}

beforeEach(async () => {
  tmpDir = await createTmpDir();
  answers.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.OPENAI_API_KEY;
  await cleanupTmpDir(tmpDir);
});

describe("initCommand (--llm) config persistence", () => {
  it("preserves existing config fields when selecting a new provider", async () => {
    await copyFixture("simple-project");
    await saveConfig(tmpDir, {
      provider: "openai",
      model: "gpt-4o-mini",
      max_depth: 3,
      ignore: ["tmp", "build"],
      api_key_env: "OPENAI_API_KEY",
    });

    process.env.OPENAI_API_KEY = "existing-key";
    answers.push("1"); // Anthropic

    await initCommand({ noLlm: false, path: tmpDir, noAgents: true });

    const config = await loadConfig(tmpDir);
    expect(config).toMatchObject({
      provider: "anthropic",
      model: "gpt-4o-mini",
      max_depth: 3,
      ignore: ["tmp", "build"],
      api_key_env: "OPENAI_API_KEY",
    });
  });
});
