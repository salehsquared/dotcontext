import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { showCommand } from "../../src/commands/show.js";
import { writeContext } from "../../src/core/writer.js";
import { createTmpDir, cleanupTmpDir, makeValidContext } from "../helpers.js";

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

describe("showCommand", () => {
  it("prints context file content", async () => {
    await writeContext(
      tmpDir,
      makeValidContext({
        scope: ".",
        summary: "Sample summary",
      }),
    );

    await showCommand(tmpDir);

    const output = logs.join("\n");
    expect(output).toContain("#");
    expect(output).toContain(".context.yaml");
    expect(output).toContain("Sample summary");
  });

  it("prints error when context file is missing", async () => {
    await showCommand(tmpDir);
    expect(logs.join("\n")).toContain("No .context.yaml found");
  });
});
