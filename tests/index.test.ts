import { describe, it, expect, vi } from "vitest";
import { resolve } from "node:path";
import { createProgram, type CommandHandlers } from "../src/index.js";

function makeHandlers(): CommandHandlers {
  return {
    initCommand: vi.fn(async () => {}),
    statusCommand: vi.fn(async () => {}),
    regenCommand: vi.fn(async () => {}),
    rehashCommand: vi.fn(async () => {}),
    validateCommand: vi.fn(async () => {}),
    showCommand: vi.fn(async () => {}),
    configCommand: vi.fn(async () => {}),
    ignoreCommand: vi.fn(async () => {}),
    watchCommand: vi.fn(async () => {}),
    startMcpServer: vi.fn(async () => {}),
  };
}

async function parse(programArgs: string[], handlers: CommandHandlers): Promise<void> {
  const program = createProgram(handlers);
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  await program.parseAsync(programArgs);
}

describe("CLI wiring", () => {
  it("init defaults to noLlm true", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "init", "-p", "/tmp/project"], handlers);
    expect(handlers.initCommand).toHaveBeenCalledWith({ noLlm: true, path: "/tmp/project" });
  });

  it("init --llm flips noLlm to false", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "init", "--llm", "-p", "/tmp/project"], handlers);
    expect(handlers.initCommand).toHaveBeenCalledWith({ noLlm: false, path: "/tmp/project" });
  });

  it("regen --no-llm maps to noLlm true", async () => {
    const handlers = makeHandlers();
    await parse(
      ["node", "context", "regen", "src", "--no-llm", "--all", "--force", "-p", "/tmp/project"],
      handlers,
    );
    expect(handlers.regenCommand).toHaveBeenCalledWith("src", {
      all: true,
      force: true,
      noLlm: true,
      path: "/tmp/project",
    });
  });

  it("config passes extended option set", async () => {
    const handlers = makeHandlers();
    await parse(
      [
        "node",
        "context",
        "config",
        "--provider",
        "openai",
        "--model",
        "gpt-4o",
        "--max-depth",
        "5",
        "--ignore",
        "tmp",
        "build",
        "--api-key-env",
        "CUSTOM_KEY",
        "-p",
        "/tmp/project",
      ],
      handlers,
    );

    expect(handlers.configCommand).toHaveBeenCalledWith({
      path: "/tmp/project",
      provider: "openai",
      model: "gpt-4o",
      maxDepth: "5",
      ignore: ["tmp", "build"],
      apiKeyEnv: "CUSTOM_KEY",
    });
  });

  it("serve resolves path before calling server start", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "serve", "-p", "relative/path"], handlers);
    expect(handlers.startMcpServer).toHaveBeenCalledWith(resolve("relative/path"));
  });

  it("watch passes interval and path", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "watch", "-p", "/tmp/project", "--interval", "250"], handlers);
    expect(handlers.watchCommand).toHaveBeenCalledWith({ path: "/tmp/project", interval: "250" });
  });
});
