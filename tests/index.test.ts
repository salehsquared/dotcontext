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
    doctorCommand: vi.fn(async () => {}),
    startMcpServer: vi.fn(async () => {}),
  };
}

async function parse(programArgs: string[], handlers: CommandHandlers): Promise<void> {
  const program = createProgram(handlers);
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  await program.parseAsync(programArgs);
}

describe("CLI wiring", () => {
  it("init defaults to noLlm true and noAgents false", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "init", "-p", "/tmp/project"], handlers);
    expect(handlers.initCommand).toHaveBeenCalledWith(expect.objectContaining({
      noLlm: true,
      path: "/tmp/project",
      noAgents: false,
    }));
  });

  it("init --llm flips noLlm to false", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "init", "--llm", "-p", "/tmp/project"], handlers);
    expect(handlers.initCommand).toHaveBeenCalledWith(expect.objectContaining({
      noLlm: false,
      path: "/tmp/project",
      noAgents: false,
    }));
  });

  it("init --no-agents sets noAgents to true", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "init", "--no-agents", "-p", "/tmp/project"], handlers);
    expect(handlers.initCommand).toHaveBeenCalledWith(expect.objectContaining({
      noLlm: true,
      path: "/tmp/project",
      noAgents: true,
    }));
  });

  it("regen --no-llm maps to noLlm true", async () => {
    const handlers = makeHandlers();
    await parse(
      ["node", "context", "regen", "src", "--no-llm", "--all", "--force", "-p", "/tmp/project"],
      handlers,
    );
    expect(handlers.regenCommand).toHaveBeenCalledWith("src", expect.objectContaining({
      all: true,
      force: true,
      noLlm: true,
      path: "/tmp/project",
      noAgents: false,
    }));
  });

  it("regen --no-agents sets noAgents to true", async () => {
    const handlers = makeHandlers();
    await parse(
      ["node", "context", "regen", "--all", "--no-agents", "-p", "/tmp/project"],
      handlers,
    );
    expect(handlers.regenCommand).toHaveBeenCalledWith(undefined, expect.objectContaining({
      all: true,
      noAgents: true,
    }));
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

  it("regen --stale passes stale: true", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "regen", "--stale", "--all", "-p", "/tmp/project"], handlers);
    expect(handlers.regenCommand).toHaveBeenCalledWith(undefined, expect.objectContaining({
      stale: true,
      all: true,
    }));
  });

  it("regen --dry-run passes dryRun: true", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "regen", "--dry-run", "--all", "-p", "/tmp/project"], handlers);
    expect(handlers.regenCommand).toHaveBeenCalledWith(undefined, expect.objectContaining({
      dryRun: true,
    }));
  });

  it("regen --parallel 4 passes parallel: 4", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "regen", "--parallel", "4", "--all", "-p", "/tmp/project"], handlers);
    expect(handlers.regenCommand).toHaveBeenCalledWith(undefined, expect.objectContaining({
      parallel: 4,
    }));
  });

  it("regen --parallel invalid (NaN) returns error", async () => {
    const handlers = makeHandlers();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await parse(["node", "context", "regen", "--parallel", "abc", "--all", "-p", "/tmp/project"], handlers);
    expect(handlers.regenCommand).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    errorSpy.mockRestore();
    process.exitCode = 0;
  });

  it("init --parallel 4 passes parallel: 4", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "init", "--parallel", "4", "-p", "/tmp/project"], handlers);
    expect(handlers.initCommand).toHaveBeenCalledWith(expect.objectContaining({
      parallel: 4,
    }));
  });

  it("status --json passes json: true", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "status", "--json", "-p", "/tmp/project"], handlers);
    expect(handlers.statusCommand).toHaveBeenCalledWith({
      path: "/tmp/project",
      json: true,
    });
  });

  it("doctor command calls doctorCommand", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "doctor", "-p", "/tmp/project"], handlers);
    expect(handlers.doctorCommand).toHaveBeenCalledWith({
      path: "/tmp/project",
    });
  });

  it("doctor --json passes json: true", async () => {
    const handlers = makeHandlers();
    await parse(["node", "context", "doctor", "--json", "-p", "/tmp/project"], handlers);
    expect(handlers.doctorCommand).toHaveBeenCalledWith({
      path: "/tmp/project",
      json: true,
    });
  });
});
