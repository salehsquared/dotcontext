import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parse } from "yaml";
import type { LLMProvider } from "../providers/index.js";
import type { ScanResult } from "../core/scanner.js";
import type { ContextFile } from "../core/schema.js";
import { SCHEMA_VERSION, DEFAULT_MAINTENANCE, FULL_MAINTENANCE, contextSchema } from "../core/schema.js";
import { computeFingerprint } from "../core/fingerprint.js";
import { SYSTEM_PROMPT, LEAN_SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";
import { detectExternalDeps, detectInternalDeps } from "./dependencies.js";
import { collectBasicEvidence } from "./evidence.js";

/**
 * Generate a .context.yaml using an LLM provider.
 * Reads file contents, sends them to the LLM, and parses the structured output.
 */
export async function generateLLMContext(
  provider: LLMProvider,
  scanResult: ScanResult,
  childContexts: Map<string, ContextFile>,
  options?: { evidence?: boolean; mode?: "lean" | "full" },
): Promise<ContextFile> {
  const mode = options?.mode ?? "lean";
  const isFull = mode === "full";

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
  const preDetectedDeps = await detectExternalDeps(scanResult.path);
  const userPrompt = buildUserPrompt(scanResult, fileContents, childContexts, isRoot, preDetectedDeps, mode);

  // Call LLM
  const systemPrompt = isFull ? SYSTEM_PROMPT : LEAN_SYSTEM_PROMPT;
  const rawResponse = await provider.generate(systemPrompt, userPrompt);

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
    maintenance: isFull ? FULL_MAINTENANCE : DEFAULT_MAINTENANCE,
  };

  // Files: only in full mode
  if (isFull) {
    context.files = (llmOutput.files as ContextFile["files"]) ?? [];
  }

  // Merge optional fields from LLM output
  // Always merge high-value fields (decisions, constraints)
  if (llmOutput.decisions) context.decisions = llmOutput.decisions as ContextFile["decisions"];
  if (llmOutput.constraints) context.constraints = llmOutput.constraints as ContextFile["constraints"];

  // Full-mode-only fields
  if (isFull) {
    if (llmOutput.interfaces) context.interfaces = llmOutput.interfaces as ContextFile["interfaces"];
    if (llmOutput.current_state) context.current_state = llmOutput.current_state as ContextFile["current_state"];
    if (llmOutput.dependencies) context.dependencies = llmOutput.dependencies as ContextFile["dependencies"];
  }

  if (llmOutput.project) context.project = llmOutput.project as ContextFile["project"];
  if (llmOutput.structure) context.structure = llmOutput.structure as ContextFile["structure"];

  // Add subdirectories from scan (more reliable than LLM guessing)
  if (scanResult.children.length > 0) {
    context.subdirectories = scanResult.children.map((child) => ({
      name: basename(child.relativePath) + "/",
      summary: childContexts.get(child.path)?.summary
        ?? `Contains ${child.files.length} source files`,
    }));
  }

  // Root-level: ensure project and structure always present
  if (scanResult.relativePath === ".") {
    if (!context.project) {
      context.project = {
        name: basename(scanResult.path) || "unknown",
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

  // Overlay machine-derived dependencies (more reliable than LLM guessing)
  const internalDeps = isFull ? await detectInternalDeps(scanResult) : [];

  if (preDetectedDeps.length > 0) {
    context.dependencies = context.dependencies ?? {};
    context.dependencies.external = preDetectedDeps;
  }
  if (internalDeps.length > 0) {
    context.dependencies = context.dependencies ?? {};
    context.dependencies.internal = internalDeps;
  }

  // Collect evidence (root only, opt-in)
  if (isRoot && options?.evidence) {
    const evidence = await collectBasicEvidence(scanResult.path);
    if (evidence) context.evidence = evidence;
  }

  // Build derived_fields (only fields that came from static analysis, not LLM)
  const derivedFields = ["version", "last_updated", "fingerprint", "scope"];
  if (preDetectedDeps.length > 0) derivedFields.push("dependencies.external");
  if (internalDeps.length > 0) derivedFields.push("dependencies.internal");
  if (context.subdirectories) derivedFields.push("subdirectories");
  if (context.project) derivedFields.push("project");
  if (context.evidence) derivedFields.push("evidence");
  context.derived_fields = derivedFields;

  // Validate against schema — if it fails, fall back to a minimal valid context
  const result = contextSchema.safeParse(context);
  if (!result.success) {
    console.warn(`Warning: LLM output for ${scanResult.relativePath} failed validation, using minimal context`);
    const fallback: ContextFile = {
      version: SCHEMA_VERSION,
      last_updated: new Date().toISOString(),
      fingerprint,
      scope: scanResult.relativePath,
      summary: (llmOutput.summary as string) ?? `Directory: ${scanResult.relativePath}`,
      maintenance: isFull ? FULL_MAINTENANCE : DEFAULT_MAINTENANCE,
    };
    if (isFull) {
      fallback.files = scanResult.files.map((f) => ({ name: f, purpose: "Source file" }));
    }
    if (scanResult.relativePath === ".") {
      fallback.project = {
        name: basename(scanResult.path) || "unknown",
        description: "Project root",
        language: "unknown",
      };
      if (scanResult.children.length > 0) {
        fallback.structure = scanResult.children.map((child) => ({
          path: child.relativePath,
          summary: childContexts.get(child.path)?.summary
            ?? `Contains ${child.files.length} source files`,
        }));
      }
    }
    return fallback;
  }

  return result.data;
}
