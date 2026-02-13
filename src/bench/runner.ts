import type { LLMProvider } from "../providers/index.js";
import type { ContextFile } from "../core/schema.js";
import type { BenchTask, ConditionName, TaskResult } from "./types.js";
import {
  BENCH_SYSTEM_PROMPT,
  buildBaselinePrompt,
  buildContextPrompt,
} from "./prompts.js";
import { detectAbstention, scoreTask } from "./scorer.js";

export interface RunBenchOptions {
  tasks: BenchTask[];
  provider: LLMProvider;
  fileTree: string;
  readme: string | null;
  contextFiles: Map<string, ContextFile>;
  iterations: number;
  onProgress?: (completed: number, total: number) => void;
}

export async function runBench(options: RunBenchOptions): Promise<TaskResult[]> {
  const {
    tasks,
    provider,
    fileTree,
    readme,
    contextFiles,
    iterations,
    onProgress,
  } = options;

  const results: TaskResult[] = [];
  const totalCalls = tasks.length * iterations * 2; // 2 conditions
  let completed = 0;

  const conditions: ConditionName[] = ["baseline", "context"];

  for (const condition of conditions) {
    for (const task of tasks) {
      for (let iter = 0; iter < iterations; iter++) {
        const start = Date.now();
        let response = "";
        let score = 0;
        let abstained = false;

        try {
          const userPrompt =
            condition === "baseline"
              ? buildBaselinePrompt(fileTree, readme, task.question)
              : buildContextPrompt(fileTree, contextFiles, task.question);

          response = await provider.generate(BENCH_SYSTEM_PROMPT, userPrompt);
          abstained = detectAbstention(response);
          score = abstained
            ? 0.0
            : await scoreTask(provider, task, response);
        } catch {
          score = 0.0;
        }

        const latency = Date.now() - start;
        const scopeTokens =
          condition === "baseline"
            ? task.scope_tokens.baseline
            : task.scope_tokens.context;

        results.push({
          task_id: task.id,
          condition,
          iteration: iter,
          response,
          score,
          abstained,
          latency_ms: latency,
          scope_tokens_est: scopeTokens,
        });

        completed++;
        onProgress?.(completed, totalCalls);
      }
    }
  }

  return results;
}
