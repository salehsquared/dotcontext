import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { validateCommand } from "../../src/commands/validate.js";
import { writeContext } from "../../src/core/writer.js";
import { computeFingerprint } from "../../src/core/fingerprint.js";
import { CONTEXT_FILENAME } from "../../src/core/schema.js";
import { createTmpDir, cleanupTmpDir, createFile, makeValidContext } from "../helpers.js";

let tmpDir: string;
let logs: string[];
let exitCode: number | undefined;

beforeEach(async () => {
  tmpDir = await createTmpDir();
  logs = [];
  exitCode = undefined;
  vi.spyOn(console, "log").mockImplementation((...args) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process, "exit").mockImplementation((code?: string | number | null | undefined) => {
    exitCode = typeof code === "number" ? code : 0;
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTmpDir(tmpDir);
});

describe("validateCommand", () => {
  it("reports valid for correct context", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    await validateCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toContain("valid");
    expect(exitCode).toBeUndefined();
  });

  it("reports invalid for malformed YAML", async () => {
    await createFile(tmpDir, "index.ts", "code");
    await writeFile(join(tmpDir, CONTEXT_FILENAME), "not: valid\ncontext: file\n");

    await expect(validateCommand({ path: tmpDir })).rejects.toThrow("process.exit");

    const output = logs.join("\n");
    expect(output).toContain("invalid");
  });

  it("calls process.exit(1) on failure", async () => {
    await createFile(tmpDir, "index.ts", "code");
    await writeFile(join(tmpDir, CONTEXT_FILENAME), "garbage: true\n");

    await expect(validateCommand({ path: tmpDir })).rejects.toThrow("process.exit");
    expect(exitCode).toBe(1);
  });

  it("does not exit when all valid", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    await validateCommand({ path: tmpDir });

    expect(exitCode).toBeUndefined();
  });

  it("reports count summary", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    await validateCommand({ path: tmpDir });

    const output = logs.join("\n");
    expect(output).toMatch(/\d+ valid, \d+ invalid, \d+ missing/);
  });

  it("shows field-level error path", async () => {
    await createFile(tmpDir, "index.ts", "code");
    // Write context missing required 'summary' field
    await writeFile(
      join(tmpDir, CONTEXT_FILENAME),
      [
        "version: 1",
        'last_updated: "2026-01-01T00:00:00.000Z"',
        "fingerprint: abc12345",
        'scope: "."',
        "files:",
        '  - name: "index.ts"',
        '    purpose: "Entry point"',
        'maintenance: "Keep updated"',
        "",
      ].join("\n"),
    );

    await expect(validateCommand({ path: tmpDir })).rejects.toThrow("process.exit");

    const output = logs.join("\n");
    expect(output).toContain("summary");
  });
});
