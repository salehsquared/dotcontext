import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generateAgentsMd,
  generateAgentsSection,
  detectAgentsAction,
  applyAgentsSection,
} from "../generator/markdown.js";
import type { AgentsEntry } from "../generator/markdown.js";

export const AGENTS_FILENAME = "AGENTS.md";

/**
 * Read AGENTS.md from project root. Returns null if not found.
 */
export async function readAgentsMd(rootPath: string): Promise<string | null> {
  try {
    return await readFile(join(rootPath, AGENTS_FILENAME), "utf-8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Write AGENTS.md to project root.
 */
export async function writeAgentsMd(rootPath: string, content: string): Promise<void> {
  await writeFile(join(rootPath, AGENTS_FILENAME), content, "utf-8");
}

/**
 * Orchestrate AGENTS.md creation/update at the project root.
 * Encapsulates the full read → detect → apply → write cycle.
 */
export async function updateAgentsMd(
  rootPath: string,
  entries: AgentsEntry[],
  projectName: string,
): Promise<"created" | "appended" | "replaced" | "skipped"> {
  const existing = await readAgentsMd(rootPath);
  const newSection = generateAgentsSection(entries);
  const action = detectAgentsAction(existing, newSection);

  if (action === "create") {
    await writeAgentsMd(rootPath, generateAgentsMd(projectName, entries));
    return "created";
  }

  if (action === "skip") {
    return "skipped";
  }

  // "append" or "replace"
  const updated = applyAgentsSection(existing!, newSection, action);
  await writeAgentsMd(rootPath, updated);
  return action === "append" ? "appended" : "replaced";
}
