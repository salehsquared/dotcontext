import type { ContextFile } from "../core/schema.js";

export const BENCH_SYSTEM_PROMPT = `You are an AI assistant helping a developer understand and work with a codebase.
Answer questions precisely based ONLY on the information provided.
If you don't have enough information to answer, say "I don't know".
Be specific — include exact file paths, package names, or module names when relevant.`;

export function buildBaselinePrompt(
  fileTree: string,
  readme: string | null,
  question: string,
): string {
  let prompt = `Here is the file tree of a project:\n\n${fileTree}\n`;
  if (readme) {
    prompt += `\nREADME:\n${readme}\n`;
  }
  prompt += `\nBased on this information, answer the following question:\n${question}`;
  return prompt;
}

export function buildContextPrompt(
  fileTree: string,
  contextFiles: Map<string, ContextFile>,
  question: string,
): string {
  let prompt = `Here is a project with compressed directory documentation:\n\nFile tree:\n${fileTree}\n\nDirectory documentation:\n`;

  for (const [scope, ctx] of contextFiles) {
    prompt += `\n## ${scope}/\n`;
    prompt += `Summary: ${ctx.summary}\n`;
    if (ctx.exports && ctx.exports.length > 0) {
      prompt += `Exports: ${ctx.exports.join(", ")}\n`;
    }
    if (ctx.dependencies) {
      if (ctx.dependencies.internal && ctx.dependencies.internal.length > 0) {
        prompt += `Internal deps: ${ctx.dependencies.internal.join(", ")}\n`;
      }
      if (ctx.dependencies.external && ctx.dependencies.external.length > 0) {
        prompt += `External deps: ${ctx.dependencies.external.join(", ")}\n`;
      }
    }
    if (ctx.files && ctx.files.length > 0) {
      prompt += `Files:\n`;
      for (const f of ctx.files) {
        prompt += `  - ${f.name}: ${f.purpose}\n`;
      }
    }
    if (ctx.subdirectories && ctx.subdirectories.length > 0) {
      prompt += `Subdirectories:\n`;
      for (const sub of ctx.subdirectories) {
        prompt += `  - ${sub.name}: ${sub.summary}\n`;
      }
    }
  }

  prompt += `\nBased on this project documentation, answer the following question:\n${question}`;
  return prompt;
}

export function buildJudgePrompt(
  question: string,
  response: string,
  referenceFacts: string[],
): string {
  return `You are evaluating an AI's answer about a codebase directory.

Question: ${question}
AI's response: ${response}

Reference facts (from source code analysis):
${referenceFacts.map((f) => `- ${f}`).join("\n")}

Rate accuracy:
0 = wrong or completely off-topic
1 = vague, generic, could apply to any directory
2 = partially correct, captures some specifics
3 = accurate and specific to actual directory contents

Respond with ONLY a single digit: 0, 1, 2, or 3.`;
}
