import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
  handleQueryContext,
  handleCheckFreshness,
  handleListContexts,
  registerTools,
} from "../../src/mcp/tools.js";
import { writeContext } from "../../src/core/writer.js";
import { computeFingerprint } from "../../src/core/fingerprint.js";
import { CONTEXT_FILENAME } from "../../src/core/schema.js";
import {
  createTmpDir,
  cleanupTmpDir,
  createFile,
  createNestedFile,
  makeValidContext,
} from "../helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await cleanupTmpDir(tmpDir);
});

// --- handleQueryContext ---

describe("handleQueryContext", () => {
  it("returns full context when no filter is provided", async () => {
    await createFile(tmpDir, "index.ts", "export const x = 1;");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp, summary: "Core module" }));

    const result = await handleQueryContext({ scope: "." }, tmpDir);
    expect(result.found).toBe(true);
    expect(result.context).toBeDefined();
    expect(result.context!.summary).toBe("Core module");
    expect(result.context!.files).toBeDefined();
    expect(result.context!.maintenance).toBeDefined();
  });

  it("returns filtered fields plus metadata when filter is provided", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({
      fingerprint: fp,
      summary: "Test",
      interfaces: [{ name: "foo()", description: "Does foo" }],
    }));

    const result = await handleQueryContext(
      { scope: ".", filter: ["summary", "interfaces"] },
      tmpDir,
    );
    expect(result.found).toBe(true);
    expect(result.context!.summary).toBe("Test");
    expect(result.context!.interfaces).toHaveLength(1);
    // Metadata always present
    expect(result.context!.version).toBe(1);
    expect(result.context!.scope).toBeDefined();
    expect(result.context!.fingerprint).toBeDefined();
    expect(result.context!.last_updated).toBeDefined();
    // Fields not in filter are absent
    expect(result.context!.files).toBeUndefined();
    expect(result.context!.maintenance).toBeUndefined();
  });

  it("returns found=false when no .context.yaml exists", async () => {
    await createFile(tmpDir, "index.ts", "code");

    const result = await handleQueryContext({ scope: "." }, tmpDir);
    expect(result.found).toBe(false);
    expect(result.error).toContain("No .context.yaml");
  });

  it("returns error for invalid/corrupt .context.yaml", async () => {
    // Write a file that exists but is not valid context YAML
    await writeFile(join(tmpDir, CONTEXT_FILENAME), "not: valid\ncontext: file\n");

    const result = await handleQueryContext({ scope: "." }, tmpDir);
    expect(result.found).toBe(false);
    expect(result.error).toContain("Invalid or corrupt");
  });

  it("resolves subdirectory scopes correctly", async () => {
    const subDir = join(tmpDir, "src", "core");
    await mkdir(subDir, { recursive: true });
    await createFile(subDir, "schema.ts", "export const x = 1;");
    const fp = await computeFingerprint(subDir);
    await writeContext(subDir, makeValidContext({
      scope: "src/core",
      fingerprint: fp,
      summary: "Schema definitions",
    }));

    const result = await handleQueryContext({ scope: "src/core" }, tmpDir);
    expect(result.found).toBe(true);
    expect(result.context!.summary).toBe("Schema definitions");
  });

  it("accepts backslash-separated scopes (Windows-style)", async () => {
    const subDir = join(tmpDir, "src", "core");
    await mkdir(subDir, { recursive: true });
    await createFile(subDir, "schema.ts", "export const x = 1;");
    const fp = await computeFingerprint(subDir);
    await writeContext(subDir, makeValidContext({
      scope: "src/core",
      fingerprint: fp,
      summary: "Schema definitions",
    }));

    const result = await handleQueryContext({ scope: "src\\core" }, tmpDir);
    expect(result.found).toBe(true);
    expect(result.context!.summary).toBe("Schema definitions");
  });

  it("ignores invalid filter values", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    const result = await handleQueryContext(
      { scope: ".", filter: ["summary", "nonexistent_field"] },
      tmpDir,
    );
    expect(result.found).toBe(true);
    expect(result.context!.summary).toBeDefined();
    expect(result.context!["nonexistent_field"]).toBeUndefined();
  });

  it("rejects path traversal", async () => {
    const result = await handleQueryContext({ scope: "../../etc" }, tmpDir);
    expect(result.found).toBe(false);
    expect(result.error).toContain("path traversal");
  });

  it("rejects backslash path traversal", async () => {
    const result = await handleQueryContext({ scope: "..\\..\\etc" }, tmpDir);
    expect(result.found).toBe(false);
    expect(result.error).toContain("path traversal");
  });
});

// --- handleCheckFreshness ---

describe("handleCheckFreshness", () => {
  it("returns fresh when fingerprint matches", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    const result = await handleCheckFreshness({ scope: "." }, tmpDir);
    expect(result.state).toBe("fresh");
    expect(result.fingerprint!.stored).toBe(fp);
    expect(result.fingerprint!.computed).toBe(fp);
  });

  it("returns stale when files have changed", async () => {
    await createFile(tmpDir, "index.ts", "short");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    // Write content of different length to guarantee different fingerprint
    await createFile(tmpDir, "index.ts", "this is much longer content that changes the size");

    const result = await handleCheckFreshness({ scope: "." }, tmpDir);
    expect(result.state).toBe("stale");
    expect(result.fingerprint!.stored).toBe(fp);
    expect(result.fingerprint!.computed).not.toBe(fp);
  });

  it("returns missing when no .context.yaml exists", async () => {
    await createFile(tmpDir, "index.ts", "code");

    const result = await handleCheckFreshness({ scope: "." }, tmpDir);
    expect(result.state).toBe("missing");
    expect(result.error).toContain("No .context.yaml");
  });

  it("includes last_updated in result", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({
      fingerprint: fp,
      last_updated: "2026-01-15T10:00:00.000Z",
    }));

    const result = await handleCheckFreshness({ scope: "." }, tmpDir);
    expect(result.last_updated).toBe("2026-01-15T10:00:00.000Z");
  });

  it("accepts backslash-separated scopes for freshness checks", async () => {
    const subDir = join(tmpDir, "src", "core");
    await mkdir(subDir, { recursive: true });
    await createFile(subDir, "schema.ts", "export const x = 1;");
    const fp = await computeFingerprint(subDir);
    await writeContext(subDir, makeValidContext({
      scope: "src/core",
      fingerprint: fp,
      summary: "Schema definitions",
    }));

    const result = await handleCheckFreshness({ scope: "src\\core" }, tmpDir);
    expect(result.state).toBe("fresh");
    expect(result.fingerprint?.stored).toBe(fp);
  });
});

// --- handleListContexts ---

describe("handleListContexts", () => {
  it("lists tracked directories with fresh status", async () => {
    await createFile(tmpDir, "index.ts", "code");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp, summary: "Root" }));

    const result = await handleListContexts({}, tmpDir);
    expect(result.tracked).toBe(1);
    const root = result.entries.find((e) => e.scope === ".");
    expect(root).toBeDefined();
    expect(root!.state).toBe("fresh");
    expect(root!.summary).toBe("Root");
  });

  it("lists untracked directories as missing", async () => {
    await createFile(tmpDir, "index.ts", "code");

    const result = await handleListContexts({}, tmpDir);
    const root = result.entries.find((e) => e.scope === ".");
    expect(root).toBeDefined();
    expect(root!.has_context).toBe(false);
    expect(root!.state).toBe("missing");
  });

  it("handles nested directories", async () => {
    // Root
    await createFile(tmpDir, "index.ts", "root code");
    const rootFp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: rootFp, scope: "." }));

    // Subdirectory
    const subDir = join(tmpDir, "src");
    await mkdir(subDir, { recursive: true });
    await createFile(subDir, "app.ts", "app code");
    const subFp = await computeFingerprint(subDir);
    await writeContext(subDir, makeValidContext({
      fingerprint: subFp,
      scope: "src",
      summary: "App source",
    }));

    const result = await handleListContexts({}, tmpDir);
    expect(result.total_directories).toBe(2);
    expect(result.tracked).toBe(2);
    expect(result.entries).toHaveLength(2);
  });

  it("reports stale directories", async () => {
    await createFile(tmpDir, "index.ts", "short");
    const fp = await computeFingerprint(tmpDir);
    await writeContext(tmpDir, makeValidContext({ fingerprint: fp }));

    // Change file size to force staleness
    await createFile(tmpDir, "index.ts", "this is much longer content that changes the size");

    const result = await handleListContexts({}, tmpDir);
    const root = result.entries.find((e) => e.scope === ".");
    expect(root!.state).toBe("stale");
  });

  it("entries are sorted by scope", async () => {
    // Create multiple directories
    await createFile(tmpDir, "index.ts", "root");

    const srcDir = join(tmpDir, "src");
    await mkdir(srcDir, { recursive: true });
    await createFile(srcDir, "app.ts", "code");

    const libDir = join(tmpDir, "lib");
    await mkdir(libDir, { recursive: true });
    await createFile(libDir, "util.ts", "code");

    const result = await handleListContexts({}, tmpDir);
    const scopes = result.entries.map((e) => e.scope);

    // Should be lexicographically sorted
    const sorted = [...scopes].sort();
    expect(scopes).toEqual(sorted);
  });
});

// --- registerTools ---

describe("registerTools", () => {
  it("registers exactly 3 tools", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const registered: string[] = [];

    // Spy on registerTool by wrapping it
    const originalRegister = server.registerTool.bind(server);
    server.registerTool = (name: string, ...args: any[]) => {
      registered.push(name);
      return originalRegister(name, ...args);
    };

    registerTools(server, tmpDir);
    expect(registered).toHaveLength(3);
  });

  it("all tool names are correct", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const registered: string[] = [];

    const originalRegister = server.registerTool.bind(server);
    server.registerTool = (name: string, ...args: any[]) => {
      registered.push(name);
      return originalRegister(name, ...args);
    };

    registerTools(server, tmpDir);
    expect(registered).toContain("query_context");
    expect(registered).toContain("check_freshness");
    expect(registered).toContain("list_contexts");
  });

  it("tool descriptions are non-empty strings", async () => {
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const descriptions: string[] = [];

    const originalRegister = server.registerTool.bind(server);
    server.registerTool = (name: string, config: any, ...args: any[]) => {
      descriptions.push(config.description);
      return originalRegister(name, config, ...args);
    };

    registerTools(server, tmpDir);
    for (const desc of descriptions) {
      expect(typeof desc).toBe("string");
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});
