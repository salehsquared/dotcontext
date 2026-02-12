import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AGENTS_FILENAME,
  readAgentsMd,
  writeAgentsMd,
  updateAgentsMd,
} from "../../src/core/markdown-writer.js";
import { AGENTS_SECTION_START, AGENTS_SECTION_END } from "../../src/generator/markdown.js";
import { createTmpDir, cleanupTmpDir } from "../helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await cleanupTmpDir(tmpDir);
});

describe("readAgentsMd", () => {
  it("returns content when AGENTS.md exists", async () => {
    await writeFile(join(tmpDir, AGENTS_FILENAME), "# AGENTS\n", "utf-8");
    const result = await readAgentsMd(tmpDir);
    expect(result).toBe("# AGENTS\n");
  });

  it("returns null when AGENTS.md does not exist", async () => {
    const result = await readAgentsMd(tmpDir);
    expect(result).toBeNull();
  });

  it("rethrows non-ENOENT read errors", async () => {
    await mkdir(join(tmpDir, AGENTS_FILENAME));
    await expect(readAgentsMd(tmpDir)).rejects.toThrow();
  });
});

describe("writeAgentsMd", () => {
  it("writes AGENTS.md to root path", async () => {
    await writeAgentsMd(tmpDir, "# Test content\n");
    const content = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");
    expect(content).toBe("# Test content\n");
  });

  it("overwrites existing AGENTS.md", async () => {
    await writeFile(join(tmpDir, AGENTS_FILENAME), "Old content", "utf-8");
    await writeAgentsMd(tmpDir, "New content");
    const content = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");
    expect(content).toBe("New content");
  });
});

describe("updateAgentsMd", () => {
  const entries = [
    { scope: ".", summary: "Root project" },
    { scope: "src", summary: "Source code" },
  ];

  it("creates new AGENTS.md when none exists", async () => {
    const action = await updateAgentsMd(tmpDir, entries, "my-project");
    expect(action).toBe("created");

    const content = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");
    expect(content).toContain("# AGENTS.md");
    expect(content).toContain(AGENTS_SECTION_START);
    expect(content).toContain(AGENTS_SECTION_END);
    expect(content).toContain("Root project");
    expect(content).toContain("Source code");
  });

  it("appends section when AGENTS.md exists without markers", async () => {
    await writeFile(
      join(tmpDir, AGENTS_FILENAME),
      "# Custom AGENTS\n\nMy custom instructions.\n",
      "utf-8",
    );

    const action = await updateAgentsMd(tmpDir, entries, "my-project");
    expect(action).toBe("appended");

    const content = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");
    expect(content).toContain("# Custom AGENTS");
    expect(content).toContain("My custom instructions.");
    expect(content).toContain(AGENTS_SECTION_START);
    expect(content).toContain("Root project");
  });

  it("replaces section when content has changed", async () => {
    // Create initial AGENTS.md
    await updateAgentsMd(tmpDir, [{ scope: ".", summary: "Old summary" }], "my-project");

    // Update with new entries
    const action = await updateAgentsMd(tmpDir, entries, "my-project");
    expect(action).toBe("replaced");

    const content = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");
    expect(content).not.toContain("Old summary");
    expect(content).toContain("Root project");
    expect(content).toContain("Source code");
  });

  it("skips when content is identical", async () => {
    await updateAgentsMd(tmpDir, entries, "my-project");
    const action = await updateAgentsMd(tmpDir, entries, "my-project");
    expect(action).toBe("skipped");
  });

  it("preserves user content around markers after replace", async () => {
    // Create initial with custom content around it
    await updateAgentsMd(tmpDir, [{ scope: ".", summary: "Old" }], "my-project");
    const initial = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");

    // Add user content before and after the markers
    const withUserContent =
      "# My Custom Header\n\nImportant notes.\n\n" +
      initial.slice(initial.indexOf(AGENTS_SECTION_START)) +
      "\n\n## My Footer\n\nFooter content.\n";
    await writeFile(join(tmpDir, AGENTS_FILENAME), withUserContent, "utf-8");

    // Update with new entries
    await updateAgentsMd(tmpDir, entries, "my-project");
    const result = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");

    expect(result).toContain("# My Custom Header");
    expect(result).toContain("Important notes.");
    expect(result).toContain("## My Footer");
    expect(result).toContain("Footer content.");
    expect(result).toContain("Root project");
  });

  it("does not multiply markers on repeated runs", async () => {
    await updateAgentsMd(tmpDir, entries, "my-project");
    await updateAgentsMd(tmpDir, entries, "my-project");
    await updateAgentsMd(tmpDir, entries, "my-project");

    const content = await readFile(join(tmpDir, AGENTS_FILENAME), "utf-8");
    const startCount = content.split(AGENTS_SECTION_START).length - 1;
    const endCount = content.split(AGENTS_SECTION_END).length - 1;
    expect(startCount).toBe(1);
    expect(endCount).toBe(1);
  });
});
