import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeContext, readContext, writeConfig, readConfig, UnsupportedVersionError } from "../src/core/writer.js";
import { CONTEXT_FILENAME, CONFIG_FILENAME } from "../src/core/schema.js";
import type { ContextFile, ConfigFile } from "../src/core/schema.js";
import { stringify } from "yaml";
import { createTmpDir, cleanupTmpDir, makeValidContext } from "./helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await cleanupTmpDir(tmpDir);
});

describe("writeContext / readContext", () => {
  it("writeContext creates .context.yaml file on disk", async () => {
    await writeContext(tmpDir, makeValidContext());
    const content = await readFile(join(tmpDir, CONTEXT_FILENAME), "utf-8");
    expect(content).toContain("version:");
    expect(content).toContain("summary:");
  });

  it("readContext returns parsed ContextFile", async () => {
    const data = makeValidContext();
    await writeContext(tmpDir, data);
    const result = await readContext(tmpDir);

    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.scope).toBe(".");
    expect(result!.summary).toBe("Test directory");
    expect(result!.files).toHaveLength(1);
  });

  it("round-trip preserves data including optional fields", async () => {
    const data = makeValidContext({
      interfaces: [{ name: "hello()", description: "Greets user" }],
      subdirectories: [{ name: "tests/", summary: "Test files" }],
      constraints: ["No side effects"],
      dependencies: { internal: ["src/core/"], external: ["chalk"] },
    });

    await writeContext(tmpDir, data);
    const result = await readContext(tmpDir);

    expect(result).not.toBeNull();
    expect(result!.version).toBe(data.version);
    expect(result!.scope).toBe(data.scope);
    expect(result!.summary).toBe(data.summary);
    expect(result!.files).toEqual(data.files);
    expect(result!.interfaces).toEqual(data.interfaces);
    expect(result!.subdirectories).toEqual(data.subdirectories);
    expect(result!.constraints).toEqual(data.constraints);
    expect(result!.dependencies).toEqual(data.dependencies);
  });

  it("readContext returns null for missing file", async () => {
    const result = await readContext(tmpDir);
    expect(result).toBeNull();
  });

  it("readContext returns null for invalid YAML", async () => {
    await writeFile(join(tmpDir, CONTEXT_FILENAME), "{{{{not yaml at all", "utf-8");
    const result = await readContext(tmpDir);
    expect(result).toBeNull();
  });

  it("readContext returns null for YAML that fails schema validation", async () => {
    await writeFile(join(tmpDir, CONTEXT_FILENAME), "version: 1\n", "utf-8");
    const result = await readContext(tmpDir);
    expect(result).toBeNull();
  });

  it("writeContext throws on invalid data - missing required field", async () => {
    const { summary, ...bad } = makeValidContext();
    await expect(writeContext(tmpDir, bad as ContextFile)).rejects.toThrow();
  });

  it("writeContext throws on invalid data - wrong type", async () => {
    const bad = { ...makeValidContext(), version: "1" } as unknown as ContextFile;
    await expect(writeContext(tmpDir, bad)).rejects.toThrow();
  });

  it("throws UnsupportedVersionError for version > SCHEMA_VERSION", async () => {
    await writeFile(join(tmpDir, ".context.yaml"), stringify({ ...makeValidContext(), version: 99 }), "utf-8");
    await expect(readContext(tmpDir)).rejects.toThrow(UnsupportedVersionError);
  });

  it("returns null for version < 1 (schema validation failure, not UnsupportedVersionError)", async () => {
    await writeFile(join(tmpDir, ".context.yaml"), stringify({ ...makeValidContext(), version: 0 }), "utf-8");
    const result = await readContext(tmpDir);
    expect(result).toBeNull();
  });
});

describe("readContext edge cases", () => {
  it("returns null for empty file (0 bytes)", async () => {
    await writeFile(join(tmpDir, CONTEXT_FILENAME), "", "utf-8");
    const result = await readContext(tmpDir);
    expect(result).toBeNull();
  });

  it("returns null for YAML that parses to non-object (scalar string)", async () => {
    await writeFile(join(tmpDir, CONTEXT_FILENAME), '"just a string"\n', "utf-8");
    const result = await readContext(tmpDir);
    expect(result).toBeNull();
  });
});

describe("writeConfig / readConfig", () => {
  it("writeConfig creates .context.config.yaml file", async () => {
    await writeConfig(tmpDir, { provider: "anthropic" });
    const content = await readFile(join(tmpDir, CONFIG_FILENAME), "utf-8");
    expect(content).toContain("provider:");
  });

  it("readConfig returns parsed ConfigFile", async () => {
    await writeConfig(tmpDir, { provider: "anthropic" });
    const result = await readConfig(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("anthropic");
  });

  it("round-trip preserves config data with all optional fields", async () => {
    const config: ConfigFile = {
      provider: "openai",
      model: "gpt-4",
      api_key_env: "MY_KEY",
      ignore: ["tmp", "logs"],
      max_depth: 3,
    };
    await writeConfig(tmpDir, config);
    const result = await readConfig(tmpDir);

    expect(result).not.toBeNull();
    expect(result!.provider).toBe("openai");
    expect(result!.model).toBe("gpt-4");
    expect(result!.api_key_env).toBe("MY_KEY");
    expect(result!.ignore).toEqual(["tmp", "logs"]);
    expect(result!.max_depth).toBe(3);
  });

  it("readConfig returns null for missing file", async () => {
    const result = await readConfig(tmpDir);
    expect(result).toBeNull();
  });

  it("readConfig returns null for invalid config", async () => {
    await writeFile(join(tmpDir, CONFIG_FILENAME), "provider: invalid_provider\n", "utf-8");
    const result = await readConfig(tmpDir);
    expect(result).toBeNull();
  });

  it("writeConfig throws on invalid data", async () => {
    const bad = { provider: "invalid" } as unknown as ConfigFile;
    await expect(writeConfig(tmpDir, bad)).rejects.toThrow();
  });
});
