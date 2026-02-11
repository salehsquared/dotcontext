import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { writeContext } from "../../src/core/writer.js";
import { computeFingerprint } from "../../src/core/fingerprint.js";
import { createTmpDir, cleanupTmpDir, createFile, makeValidContext } from "../helpers.js";

const eventHandlers = new Map<string, (...args: unknown[]) => void>();
const watcher = {
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    eventHandlers.set(event, handler);
    return watcher;
  }),
  close: vi.fn(async () => {}),
};
const chokidarWatch = vi.fn(() => watcher);

vi.mock("chokidar", () => ({
  watch: chokidarWatch,
}));

const { watchCommand } = await import("../../src/commands/watch.js");

let tmpDir: string;
let logs: string[];

beforeEach(async () => {
  tmpDir = await createTmpDir();
  logs = [];
  eventHandlers.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation((...args) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(process, "on").mockImplementation(() => process as unknown as NodeJS.Process);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await cleanupTmpDir(tmpDir);
});

describe("watchCommand", () => {
  it("initializes watcher with tracked directories", async () => {
    await createFile(tmpDir, "index.ts", "export const x = 1;");
    const fingerprint = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint }));

    await watchCommand({ path: tmpDir, interval: "200" });

    expect(chokidarWatch).toHaveBeenCalledTimes(1);
    const [watchPaths, options] = chokidarWatch.mock.calls[0] as [string[], Record<string, unknown>];
    expect(watchPaths).toEqual([tmpDir]);
    expect(options.depth).toBe(0);
    expect(options.ignoreInitial).toBe(true);
  });

  it("logs state changes when a tracked file becomes stale", async () => {
    await createFile(tmpDir, "index.ts", "short");
    const fingerprint = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint }));

    await watchCommand({ path: tmpDir, interval: "10" });

    await createFile(tmpDir, "index.ts", "this is much longer content than before");
    const allHandler = eventHandlers.get("all");
    expect(allHandler).toBeDefined();
    allHandler?.("change", join(tmpDir, "index.ts"));

    await vi.advanceTimersByTimeAsync(20);

    expect(logs.join("\n")).toContain("stale");
  });
});
