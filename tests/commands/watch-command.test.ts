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

  it("configures watcher to ignore context files", async () => {
    await createFile(tmpDir, "index.ts", "export const x = 1;");
    const fingerprint = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint }));

    await watchCommand({ path: tmpDir, interval: "100" });

    const [, options] = chokidarWatch.mock.calls[0] as [string[], Record<string, unknown>];
    const ignored = options.ignored as RegExp[];
    expect(ignored.some((pattern) => pattern.test(".context.yaml"))).toBe(true);
    expect(ignored.some((pattern) => pattern.test(".context.config.yaml"))).toBe(true);
  });

  it("does not mark stale when only .context.yaml changes", async () => {
    await createFile(tmpDir, "index.ts", "short");
    const fingerprint = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint }));

    await watchCommand({ path: tmpDir, interval: "10" });

    const allHandler = eventHandlers.get("all");
    expect(allHandler).toBeDefined();
    allHandler?.("change", join(tmpDir, ".context.yaml"));

    await vi.advanceTimersByTimeAsync(20);

    const staleLines = logs.filter((l) => l.includes("files changed"));
    expect(staleLines).toHaveLength(0);
  });

  it("debounces multiple rapid events into a single recheck", async () => {
    // Use real timers for this integration-style debounce test
    vi.useRealTimers();

    await createFile(tmpDir, "index.ts", "short");
    const fingerprint = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint }));

    await watchCommand({ path: tmpDir, interval: "50" });

    // Mutate file so fingerprint becomes stale
    await createFile(tmpDir, "index.ts", "this is much longer content than before");
    const allHandler = eventHandlers.get("all");
    expect(allHandler).toBeDefined();

    // Fire 3 rapid events synchronously (all within debounce window).
    // Each subsequent event clears the previous timer and resets it,
    // so only the last one's timer should fire.
    allHandler?.("change", join(tmpDir, "index.ts"));
    allHandler?.("change", join(tmpDir, "index.ts"));
    allHandler?.("change", join(tmpDir, "index.ts"));

    // Wait for debounce + async recheckDir to complete
    await new Promise((resolve) => setTimeout(resolve, 120));

    // Should have exactly 1 state change (stale + files changed), not 3
    const staleLines = logs.filter((l) => l.includes("files changed"));
    expect(staleLines).toHaveLength(1);

    // Restore fake timers for afterEach cleanup
    vi.useFakeTimers();
  });
});
