export type TaskCategory =
  | "comprehension"
  | "dependency"
  | "change_impact"
  | "task_routing"
  | "bug_localization"
  | "patch_planning";

export type ScoringMethod =
  | "llm_judge"
  | "list_coverage"
  | "topk_recall"
  | "target_hit"
  | "mrr"
  | "file_set_f1";

export type ConditionName = "baseline" | "context";

export interface BenchTask {
  id: string;
  category: TaskCategory;
  question: string;
  scoring: ScoringMethod;
  expected: string[];
  source_scope: string;
  scope_tokens: {
    baseline: number;
    context: number;
  };
}

export interface TaskResult {
  task_id: string;
  condition: ConditionName;
  iteration: number;
  response: string;
  score: number;
  abstained: boolean;
  latency_ms: number;
  scope_tokens_est: number;
}

export interface ConditionSummary {
  condition: ConditionName;
  tasks_run: number;
  mean_score: number;
  stddev_score: number;
  abstention_rate: number;
  mean_latency_ms: number;
  total_tokens_est: number;
  cost_per_correct: number;
  by_category: Record<string, { count: number; mean_score: number }>;
}

export interface BenchReport {
  root: string;
  repo?: string;
  provider: string;
  model: string;
  iterations: number;
  seed: number;
  timestamp: string;
  task_count: number;
  baseline: ConditionSummary;
  context: ConditionSummary;
  delta: {
    accuracy_gain: number;
    abstention_reduction: number;
    token_reduction: number;
    cost_per_correct_reduction: number;
  };
  tasks: BenchTask[];
  results: TaskResult[];
}

export interface MultiRepoReport {
  provider: string;
  model: string;
  timestamp: string;
  repos: BenchReport[];
  aggregate: {
    baseline_mean: number;
    context_mean: number;
    accuracy_gain: number;
    by_category: Record<string, { baseline: number; context: number; delta: number }>;
  };
}

export interface Commit {
  sha: string;
  message: string;
  files: string[];
}

export interface DirFacts {
  files: string[];
  exports: string[];
  fileCount: number;
}

export interface BenchOptions {
  path?: string;
  json?: boolean;
  iterations?: number;
  tasks?: string;
  maxTasks?: number;
  seed?: number;
  category?: TaskCategory;
  out?: string;
  allowStale?: boolean;
  repo?: string;
  defaultRepos?: boolean;
}
