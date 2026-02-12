import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { configCommand } from "../../src/commands/config.js";
import { readConfig } from "../../src/core/writer.js";
import { createTmpDir, cleanupTmpDir } from "../helpers.js";

let tmpDir: string;
let logs: string[];

beforeEach(async () => {
  tmpDir = await createTmpDir();
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args) => {
    logs.push(args.map(String).join(" "));
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTmpDir(tmpDir);
});

describe("configCommand", () => {
  it("shows error when no config exists and no update flags are provided", async () => {
    await configCommand({ path: tmpDir });
    expect(logs.join("\n")).toContain("No .context.config.yaml found");
  });

  it("writes provider, model, max_depth, ignore, and api_key_env", async () => {
    await configCommand({
      path: tmpDir,
      provider: "openai",
      model: "gpt-4o-mini",
      maxDepth: "4",
      ignore: ["tmp", "scratch"],
      apiKeyEnv: "CUSTOM_OPENAI_KEY",
    });

    const config = await readConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config?.provider).toBe("openai");
    expect(config?.model).toBe("gpt-4o-mini");
    expect(config?.max_depth).toBe(4);
    expect(config?.ignore).toEqual(["tmp", "scratch"]);
    expect(config?.api_key_env).toBe("CUSTOM_OPENAI_KEY");
  });

  it("appends ignore values to existing config", async () => {
    await configCommand({ path: tmpDir, provider: "anthropic", ignore: ["dist"] });
    await configCommand({ path: tmpDir, ignore: ["build"] });

    const config = await readConfig(tmpDir);
    expect(config?.ignore).toEqual(["dist", "build"]);
  });

  it("deduplicates ignore values", async () => {
    await configCommand({ path: tmpDir, provider: "anthropic", ignore: ["dist", "node_modules"] });
    await configCommand({ path: tmpDir, ignore: ["dist", "build"] });

    const config = await readConfig(tmpDir);
    expect(config?.ignore).toEqual(["dist", "node_modules", "build"]);
  });

  it("rejects invalid provider", async () => {
    await configCommand({ path: tmpDir, provider: "invalid-provider" });

    const config = await readConfig(tmpDir);
    expect(config).toBeNull();
    expect(logs.join("\n")).toContain("Invalid provider");
  });

  it("rejects invalid max_depth", async () => {
    await configCommand({ path: tmpDir, provider: "openai", maxDepth: "zero" });

    const config = await readConfig(tmpDir);
    expect(config).toBeNull();
    expect(logs.join("\n")).toContain("max_depth must be a positive integer");
  });

  it("rejects max_depth of 0", async () => {
    await configCommand({ path: tmpDir, provider: "openai", maxDepth: "0" });

    const config = await readConfig(tmpDir);
    expect(config).toBeNull();
    expect(logs.join("\n")).toContain("max_depth must be a positive integer");
  });

  it("rejects negative max_depth", async () => {
    await configCommand({ path: tmpDir, provider: "anthropic", maxDepth: "-3" });

    const config = await readConfig(tmpDir);
    expect(config).toBeNull();
    expect(logs.join("\n")).toContain("max_depth must be a positive integer");
  });

  it("prints existing configuration when no update flags are passed", async () => {
    await configCommand({ path: tmpDir, provider: "google", model: "gemini-2.0-flash" });
    logs = [];

    await configCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("Current configuration");
    expect(output).toContain("provider: google");
    expect(output).toContain("model: gemini-2.0-flash");
  });
});
