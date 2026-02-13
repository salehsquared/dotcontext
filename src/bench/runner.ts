import type { LLMProvider } from "../providers/index.js";
import type { ContextFile } from "../core/schema.js";
import type { ScanResult } from "../core/scanner.js";
import type { BenchTask, ConditionName, TaskResult } from "./types.js";
import {
  BENCH_SYSTEM_PROMPT,
  buildBaselinePrompt,
  buildContextPrompt,
  buildJudgePrompt,
  buildReadmeSnippet,
} from "./prompts.js";
import { detectAbstention, scoreTask, JUDGE_SYSTEM_PROMPT } from "./scorer.js";
import { buildScopedFileTree } from "./ground-truth.js";
import { estimateInputTokens } from "./token-estimator.js";

export interface RunBenchOptions {
  tasks: BenchTask[];
  provider: LLMProvider;
  providerName: string;
  modelName: string;
  scanResult: ScanResult;
  readme: string | null;
  contextFiles: Map<string, ContextFile>;
  iterations: number;
  onProgress?: (completed: number, total: number) => void;
}

export async function runBench(options: RunBenchOptions): Promise<TaskResult[]> {
  const {
    tasks,
    provider,
    providerName,
    modelName,
    scanResult,
    readme,
    contextFiles,
    iterations,
    onProgress,
  } = options;

  const readmeSnippet = buildReadmeSnippet(readme);
  const results: TaskResult[] = [];
  const totalCalls = tasks.length * iterations * 2; // 2 conditions
  let completed = 0;

  const conditions: ConditionName[] = ["baseline", "context"];
  const scopeCache = new Map<string, { tree: string; scopes: string[]; resolvedScope: string }>();

  for (const condition of conditions) {
    for (const task of tasks) {
      for (let iter = 0; iter < iterations; iter++) {
        const start = Date.now();
        let response = "";
        let score = 0;
        let abstained = false;
        let answerInputTokensEst = 0;
        let judgeInputTokensEst = 0;

        try {
          const scoped = scopeCache.get(task.source_scope)
            ?? (() => {
              const computed = buildScopedFileTree(task.source_scope, scanResult);
              scopeCache.set(task.source_scope, computed);
              return computed;
            })();

          const scopedContexts = new Map<string, ContextFile>();
          for (const scope of scoped.scopes) {
            const ctx = contextFiles.get(scope);
            if (ctx) scopedContexts.set(scope, ctx);
          }

          const userPrompt =
            condition === "baseline"
              ? buildBaselinePrompt(scoped.tree, readmeSnippet, task.question, scoped.resolvedScope)
              : buildContextPrompt(scoped.tree, scopedContexts, task.question, scoped.resolvedScope);

          answerInputTokensEst = estimateInputTokens({
            provider: providerName,
            model: modelName,
            systemPrompt: BENCH_SYSTEM_PROMPT,
            userPrompt,
          });

          response = await provider.generate(BENCH_SYSTEM_PROMPT, userPrompt);
          abstained = detectAbstention(response);

          if (!abstained && task.scoring === "llm_judge") {
            const judgePrompt = buildJudgePrompt(task.question, response, task.expected);
            judgeInputTokensEst = estimateInputTokens({
              provider: providerName,
              model: modelName,
              systemPrompt: JUDGE_SYSTEM_PROMPT,
              userPrompt: judgePrompt,
            });
          }

          score = abstained
            ? 0.0
            : await scoreTask(provider, task, response);
        } catch {
          score = 0.0;
        }

        const latency = Date.now() - start;
        const totalInputTokensEst = answerInputTokensEst + judgeInputTokensEst;

        results.push({
          task_id: task.id,
          condition,
          iteration: iter,
          response,
          score,
          abstained,
          latency_ms: latency,
          answer_input_tokens_est: answerInputTokensEst,
          judge_input_tokens_est: judgeInputTokensEst,
          total_input_tokens_est: totalInputTokensEst,
          // Legacy alias retained for backward compatibility with older report parsers.
          scope_tokens_est: totalInputTokensEst,
        });

        completed++;
        onProgress?.(completed, totalCalls);
      }
    }
  }

  return results;
}
