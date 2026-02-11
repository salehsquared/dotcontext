import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import type { LLMProvider } from "../providers/index.js";
import type { ScanResult } from "../core/scanner.js";
import type { ContextFile } from "../core/schema.js";
import { SCHEMA_VERSION, DEFAULT_MAINTENANCE, contextSchema } from "../core/schema.js";
import { computeFingerprint } from "../core/fingerprint.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";

/**
 * Generate a .context.yaml using an LLM provider.
 * Reads file contents, sends them to the LLM, and parses the structured output.
 */
export async function generateLLMContext(
  provider: LLMProvider,
  scanResult: ScanResult,
  childContexts: Map<string, ContextFile>,
): Promise<ContextFile> {
  // Read file contents
  const fileContents = new Map<string, string>();
  for (const filename of scanResult.files) {
    try {
      const content = await readFile(join(scanResult.path, filename), "utf-8");
      fileContents.set(filename, content);
    } catch {
      // Skip unreadable files
    }
  }

  const isRoot = scanResult.relativePath === ".";
  const userPrompt = buildUserPrompt(scanResult, fileContents, childContexts, isRoot);

  // Call LLM
  const rawResponse = await provider.generate(SYSTEM_PROMPT, userPrompt);

  // Strip markdown fences if present
  const yamlStr = rawResponse
    .replace(/^```ya?ml\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();

  // Parse and merge with required fields
  const llmOutput = parse(yamlStr) as Record<string, unknown>;
  const fingerprint = await computeFingerprint(scanResult.path);

  const context: ContextFile = {
    version: SCHEMA_VERSION,
    last_updated: new Date().toISOString(),
    fingerprint,
    scope: scanResult.relativePath,
    summary: (llmOutput.summary as string) ?? `Directory: ${scanResult.relativePath}`,
    files: (llmOutput.files as ContextFile["files"]) ?? [],
    maintenance: DEFAULT_MAINTENANCE,
  };

  // Merge optional fields from LLM output
  if (llmOutput.interfaces) context.interfaces = llmOutput.interfaces as ContextFile["interfaces"];
  if (llmOutput.decisions) context.decisions = llmOutput.decisions as ContextFile["decisions"];
  if (llmOutput.constraints) context.constraints = llmOutput.constraints as ContextFile["constraints"];
  if (llmOutput.dependencies) context.dependencies = llmOutput.dependencies as ContextFile["dependencies"];
  if (llmOutput.current_state) context.current_state = llmOutput.current_state as ContextFile["current_state"];
  if (llmOutput.project) context.project = llmOutput.project as ContextFile["project"];
  if (llmOutput.structure) context.structure = llmOutput.structure as ContextFile["structure"];

  // Add subdirectories from scan (more reliable than LLM guessing)
  if (scanResult.children.length > 0) {
    context.subdirectories = scanResult.children.map((child) => ({
      name: child.relativePath.split("/").pop()! + "/",
      summary: childContexts.get(child.path)?.summary
        ?? `Contains ${child.files.length} source files`,
    }));
  }

  // Root-level: ensure project and structure always present
  if (scanResult.relativePath === ".") {
    if (!context.project) {
      context.project = {
        name: scanResult.path.split("/").pop() ?? "unknown",
        description: "Project root",
        language: "unknown",
      };
    }
    if (!context.structure) {
      context.structure = scanResult.children.map((child) => ({
        path: child.relativePath,
        summary: childContexts.get(child.path)?.summary
          ?? `Contains ${child.files.length} source files`,
      }));
    }
  }

  // Validate against schema — if it fails, fall back to a minimal valid context
  const result = contextSchema.safeParse(context);
  if (!result.success) {
    console.warn(`Warning: LLM output for ${scanResult.relativePath} failed validation, using minimal context`);
    return {
      version: SCHEMA_VERSION,
      last_updated: new Date().toISOString(),
      fingerprint,
      scope: scanResult.relativePath,
      summary: (llmOutput.summary as string) ?? `Directory: ${scanResult.relativePath}`,
      files: scanResult.files.map((f) => ({ name: f, purpose: "Source file" })),
      maintenance: DEFAULT_MAINTENANCE,
    };
  }

  return result.data;
}
