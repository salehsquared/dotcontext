import { describe, it, expect, vi } from "vitest";
import {
  detectAbstention,
  scoreListCoverage,
  scoreTopkRecall,
  scoreTargetHit,
  scoreMrr,
  scoreFileSetF1,
  scoreLlmJudge,
  aggregateResults,
  aggregateMultiRepo,
} from "../../src/bench/scorer.js";
import type { BenchTask, TaskResult } from "../../src/bench/types.js";

describe("detectAbstention", () => {
  it("true for 'I don't know'", () => {
    expect(detectAbstention("I don't know what that directory does.")).toBe(true);
  });

  it("true for 'I'm not sure'", () => {
    expect(detectAbstention("I'm not sure about the purpose.")).toBe(true);
  });

  it("true for 'cannot determine'", () => {
    expect(detectAbstention("I cannot determine the answer from the information given.")).toBe(true);
  });

  it("true for 'unable to answer'", () => {
    expect(detectAbstention("I'm unable to answer this question.")).toBe(true);
  });

  it("false for substantive answers", () => {
    expect(detectAbstention("The src/core directory handles schema validation and scanning.")).toBe(false);
  });

  it("false for empty string", () => {
    expect(detectAbstention("")).toBe(false);
  });
});

describe("scoreListCoverage", () => {
  it("1.0 when all present", () => {
    expect(scoreListCoverage("chalk, commander, yaml", ["chalk", "commander", "yaml"])).toBe(1.0);
  });

  it("0.0 when none present", () => {
    expect(scoreListCoverage("express, lodash", ["chalk", "commander"])).toBe(0.0);
  });

  it("fraction for partial match", () => {
    expect(scoreListCoverage("chalk and express", ["chalk", "commander"])).toBe(0.5);
  });

  it("1.0 for empty expected", () => {
    expect(scoreListCoverage("anything", [])).toBe(1.0);
  });

  it("case insensitive", () => {
    expect(scoreListCoverage("CHALK and Commander", ["chalk", "commander"])).toBe(1.0);
  });
});

describe("scoreTopkRecall", () => {
  it("fraction of expected paths found", () => {
    expect(scoreTopkRecall("src/core/scanner.ts and src/core/schema.ts", [
      "src/core/scanner.ts",
      "src/core/schema.ts",
      "src/core/writer.ts",
    ])).toBeCloseTo(2 / 3);
  });

  it("0.0 when none found", () => {
    expect(scoreTopkRecall("nothing relevant", ["src/foo.ts"])).toBe(0.0);
  });

  it("1.0 for empty expected", () => {
    expect(scoreTopkRecall("anything", [])).toBe(1.0);
  });
});

describe("scoreTargetHit", () => {
  it("1.0 when target path present", () => {
    expect(scoreTargetHit("You should add it to src/commands/", ["src/commands"])).toBe(1.0);
  });

  it("0.0 when target not present", () => {
    expect(scoreTargetHit("Add it to the utils folder", ["src/commands"])).toBe(0.0);
  });

  it("matches any of multiple expected targets", () => {
    expect(scoreTargetHit("The tests/ directory", ["src/commands", "tests"])).toBe(1.0);
  });
});

describe("scoreMrr", () => {
  it("1.0 when first extracted path matches", () => {
    expect(scoreMrr("The file src/core/scanner.ts needs changes", ["src/core/scanner.ts"])).toBe(1.0);
  });

  it("0.5 when second path matches", () => {
    expect(scoreMrr("Check src/utils/helper.ts and src/core/scanner.ts", ["src/core/scanner.ts"])).toBe(0.5);
  });

  it("0.0 when no match", () => {
    expect(scoreMrr("No file paths here", ["src/core/scanner.ts"])).toBe(0.0);
  });
});

describe("scoreFileSetF1", () => {
  it("1.0 for perfect match", () => {
    expect(scoreFileSetF1(
      "Modify src/core/scanner.ts and src/core/schema.ts",
      ["src/core/scanner.ts", "src/core/schema.ts"],
    )).toBe(1.0);
  });

  it("0.0 for complete miss", () => {
    expect(scoreFileSetF1("No paths here at all", ["src/core/scanner.ts"])).toBe(0.0);
  });

  it("correct F1 for partial overlap", () => {
    // predicted: scanner.ts, schema.ts (2 items)
    // expected: scanner.ts, writer.ts (2 items)
    // correct: 1 (scanner.ts)
    // precision: 1/2, recall: 1/2, F1 = 2*(0.5*0.5)/(0.5+0.5) = 0.5
    expect(scoreFileSetF1(
      "Modify src/core/scanner.ts and src/core/schema.ts",
      ["src/core/scanner.ts", "src/core/writer.ts"],
    )).toBeCloseTo(0.5);
  });

  it("1.0 for empty expected", () => {
    expect(scoreFileSetF1("anything", [])).toBe(1.0);
  });
});

describe("scoreLlmJudge", () => {
  it("parses '3' as 1.0", async () => {
    const mockProvider = { generate: vi.fn().mockResolvedValue("3") };
    const score = await scoreLlmJudge(mockProvider, "q", "r", ["fact"]);
    expect(score).toBeCloseTo(1.0);
  });

  it("parses '0' as 0.0", async () => {
    const mockProvider = { generate: vi.fn().mockResolvedValue("0") };
    const score = await scoreLlmJudge(mockProvider, "q", "r", ["fact"]);
    expect(score).toBe(0.0);
  });

  it("parses '2' as ~0.667", async () => {
    const mockProvider = { generate: vi.fn().mockResolvedValue("2") };
    const score = await scoreLlmJudge(mockProvider, "q", "r", ["fact"]);
    expect(score).toBeCloseTo(2 / 3);
  });

  it("returns 0.0 for unparseable", async () => {
    const mockProvider = { generate: vi.fn().mockResolvedValue("great answer!") };
    const score = await scoreLlmJudge(mockProvider, "q", "r", ["fact"]);
    expect(score).toBe(0.0);
  });

  it("returns 0.0 on provider error", async () => {
    const mockProvider = { generate: vi.fn().mockRejectedValue(new Error("fail")) };
    const score = await scoreLlmJudge(mockProvider, "q", "r", ["fact"]);
    expect(score).toBe(0.0);
  });
});

describe("aggregateResults", () => {
  const tasks: BenchTask[] = [
    {
      id: "t1", category: "comprehension", question: "q1",
      scoring: "llm_judge", expected: [], source_scope: "src",
      scope_tokens: { baseline: 1000, context: 50 },
    },
    {
      id: "t2", category: "dependency", question: "q2",
      scoring: "list_coverage", expected: ["a"], source_scope: "src",
      scope_tokens: { baseline: 800, context: 40 },
    },
  ];

  const results: TaskResult[] = [
    { task_id: "t1", condition: "baseline", iteration: 0, response: "r", score: 0.3, abstained: false, latency_ms: 500, scope_tokens_est: 1000 },
    { task_id: "t2", condition: "baseline", iteration: 0, response: "r", score: 0.5, abstained: false, latency_ms: 600, scope_tokens_est: 800 },
    { task_id: "t1", condition: "context", iteration: 0, response: "r", score: 0.8, abstained: false, latency_ms: 700, scope_tokens_est: 50 },
    { task_id: "t2", condition: "context", iteration: 0, response: "r", score: 0.9, abstained: false, latency_ms: 800, scope_tokens_est: 40 },
  ];

  it("correct mean score", () => {
    const report = aggregateResults("/root", "anthropic", "haiku", 1, 42, tasks, results);
    expect(report.baseline.mean_score).toBeCloseTo(0.4);
    expect(report.context.mean_score).toBeCloseTo(0.85);
  });

  it("correct stddev", () => {
    const report = aggregateResults("/root", "anthropic", "haiku", 1, 42, tasks, results);
    expect(report.baseline.stddev_score).toBeCloseTo(0.1);
  });

  it("correct abstention_rate", () => {
    const resultsWithAbstention: TaskResult[] = [
      ...results.slice(0, 3),
      { ...results[3], abstained: true, score: 0.0 },
    ];
    const report = aggregateResults("/root", "anthropic", "haiku", 1, 42, tasks, resultsWithAbstention);
    expect(report.context.abstention_rate).toBeCloseTo(0.5);
  });

  it("correct delta values", () => {
    const report = aggregateResults("/root", "anthropic", "haiku", 1, 42, tasks, results);
    expect(report.delta.accuracy_gain).toBeCloseTo(0.45);
    expect(report.delta.token_reduction).toBeGreaterThan(0.9);
  });

  it("correct cost_per_correct", () => {
    const report = aggregateResults("/root", "anthropic", "haiku", 1, 42, tasks, results);
    // baseline: 0 tasks >= 0.7, so Infinity
    expect(report.baseline.cost_per_correct).toBe(Infinity);
    // context: both tasks >= 0.7, tokens = 90, so 90/2 = 45
    expect(report.context.cost_per_correct).toBeCloseTo(45);
  });

  it("correct category breakdown", () => {
    const report = aggregateResults("/root", "anthropic", "haiku", 1, 42, tasks, results);
    expect(report.baseline.by_category["comprehension"]?.mean_score).toBeCloseTo(0.3);
    expect(report.context.by_category["dependency"]?.mean_score).toBeCloseTo(0.9);
  });
});

describe("aggregateMultiRepo", () => {
  it("averages across repos", () => {
    const tasks: BenchTask[] = [{
      id: "t1", category: "comprehension", question: "q",
      scoring: "llm_judge", expected: [], source_scope: ".",
      scope_tokens: { baseline: 100, context: 10 },
    }];
    const report1 = aggregateResults("/r1", "anthropic", "haiku", 1, 42, tasks, [
      { task_id: "t1", condition: "baseline", iteration: 0, response: "r", score: 0.3, abstained: false, latency_ms: 100, scope_tokens_est: 100 },
      { task_id: "t1", condition: "context", iteration: 0, response: "r", score: 0.8, abstained: false, latency_ms: 100, scope_tokens_est: 10 },
    ]);
    const report2 = aggregateResults("/r2", "anthropic", "haiku", 1, 42, tasks, [
      { task_id: "t1", condition: "baseline", iteration: 0, response: "r", score: 0.5, abstained: false, latency_ms: 100, scope_tokens_est: 100 },
      { task_id: "t1", condition: "context", iteration: 0, response: "r", score: 0.9, abstained: false, latency_ms: 100, scope_tokens_est: 10 },
    ]);

    const multi = aggregateMultiRepo([report1, report2], "anthropic", "haiku");
    expect(multi.aggregate.baseline_mean).toBeCloseTo(0.4);
    expect(multi.aggregate.context_mean).toBeCloseTo(0.85);
    expect(multi.aggregate.accuracy_gain).toBeCloseTo(0.45);
  });

  it("per-category cross-repo breakdown", () => {
    const tasks: BenchTask[] = [{
      id: "t1", category: "comprehension", question: "q",
      scoring: "llm_judge", expected: [], source_scope: ".",
      scope_tokens: { baseline: 100, context: 10 },
    }];
    const report1 = aggregateResults("/r1", "anthropic", "haiku", 1, 42, tasks, [
      { task_id: "t1", condition: "baseline", iteration: 0, response: "r", score: 0.4, abstained: false, latency_ms: 100, scope_tokens_est: 100 },
      { task_id: "t1", condition: "context", iteration: 0, response: "r", score: 0.8, abstained: false, latency_ms: 100, scope_tokens_est: 10 },
    ]);

    const multi = aggregateMultiRepo([report1], "anthropic", "haiku");
    expect(multi.aggregate.by_category["comprehension"]).toBeDefined();
    expect(multi.aggregate.by_category["comprehension"].delta).toBeCloseTo(0.4);
  });
});
