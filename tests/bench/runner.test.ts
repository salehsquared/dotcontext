import { describe, it, expect, vi } from "vitest";
import { runBench } from "../../src/bench/runner.js";
import { makeScanResult, makeValidContext } from "../helpers.js";
import type { BenchTask } from "../../src/bench/types.js";

describe("runBench", () => {
  const tasks: BenchTask[] = [
    {
      id: "t1",
      category: "comprehension",
      question: "What does src/ do?",
      scoring: "llm_judge",
      expected: ["Files: a.ts"],
      source_scope: "src",
    },
  ];

  const contextFiles = new Map([
    [".", makeValidContext({ scope: ".", summary: "Project root" })],
    ["src", makeValidContext({ scope: "src", summary: "Main source" })],
    ["tests", makeValidContext({ scope: "tests", summary: "Unrelated tests" })],
  ]);

  const srcScan = makeScanResult("/tmp/project/src", {
    relativePath: "src",
    files: ["index.ts", "core.ts"],
  });
  const testsScan = makeScanResult("/tmp/project/tests", {
    relativePath: "tests",
    files: ["runner.test.ts"],
  });
  const scanResult = makeScanResult("/tmp/project", {
    files: ["README.md"],
    children: [srcScan, testsScan],
  });

  it("calls provider for each task x condition x iteration", async () => {
    const mockProvider = {
      generate: vi.fn().mockResolvedValue("2"),
    };

    const results = await runBench({
      tasks,
      provider: mockProvider,
      providerName: "anthropic",
      modelName: "claude-3-5-haiku-latest",
      scanResult,
      readme: "# Test",
      contextFiles,
      iterations: 1,
    });

    // 1 task * 2 conditions * 1 iteration = 2 calls for the main task
    // + 2 judge calls (one per condition for llm_judge scoring)
    expect(mockProvider.generate).toHaveBeenCalledTimes(4);
    expect(results.length).toBe(2);
  });

  it("baseline prompt includes file tree + README", async () => {
    const mockProvider = {
      generate: vi.fn().mockResolvedValue("2"),
    };

    await runBench({
      tasks,
      provider: mockProvider,
      providerName: "anthropic",
      modelName: "claude-3-5-haiku-latest",
      scanResult,
      readme: "My README content",
      contextFiles,
      iterations: 1,
    });

    // First call should be baseline
    const firstCallArgs = mockProvider.generate.mock.calls[0];
    const userPrompt = firstCallArgs[1];
    expect(userPrompt).toContain("Target scope: src/");
    expect(userPrompt).toContain("My README content");
  });

  it("context prompt includes .context.yaml contents", async () => {
    const mockProvider = {
      generate: vi.fn().mockResolvedValue("2"),
    };

    await runBench({
      tasks,
      provider: mockProvider,
      providerName: "anthropic",
      modelName: "claude-3-5-haiku-latest",
      scanResult,
      readme: null,
      contextFiles,
      iterations: 1,
    });

    // Third call is context condition (after baseline + judge)
    const contextCallArgs = mockProvider.generate.mock.calls[2];
    const userPrompt = contextCallArgs[1];
    expect(userPrompt).toContain("Main source");
    expect(userPrompt).toContain("scoped project documentation");
    expect(userPrompt).not.toContain("Unrelated tests");
  });

  it("records latency and prompt token estimates", async () => {
    const mockProvider = {
      generate: vi.fn().mockResolvedValue("2"),
    };

    const results = await runBench({
      tasks,
      provider: mockProvider,
      providerName: "anthropic",
      modelName: "claude-3-5-haiku-latest",
      scanResult,
      readme: "README section with enough content to inflate baseline prompt.\n".repeat(20),
      contextFiles,
      iterations: 1,
    });

    for (const r of results) {
      expect(r.latency_ms).toBeGreaterThanOrEqual(0);
      expect(r.answer_input_tokens_est).toBeGreaterThan(0);
      expect(r.total_input_tokens_est).toBeGreaterThanOrEqual(r.answer_input_tokens_est);
    }

    // baseline should have higher token estimate than context
    const baselineResult = results.find(r => r.condition === "baseline")!;
    const contextResult = results.find(r => r.condition === "context")!;
    expect(baselineResult.total_input_tokens_est).toBeGreaterThan(contextResult.total_input_tokens_est);
  });

  it("includes judge token estimates for llm_judge tasks", async () => {
    const mockProvider = {
      generate: vi.fn().mockResolvedValue("2"),
    };

    const results = await runBench({
      tasks,
      provider: mockProvider,
      providerName: "openai",
      modelName: "gpt-4o-mini",
      scanResult,
      readme: null,
      contextFiles,
      iterations: 1,
    });

    for (const r of results) {
      expect(r.judge_input_tokens_est).toBeGreaterThan(0);
      expect(r.total_input_tokens_est).toBe(
        r.answer_input_tokens_est + r.judge_input_tokens_est,
      );
    }
  });

  it("reports progress", async () => {
    const mockProvider = {
      generate: vi.fn().mockResolvedValue("2"),
    };

    const progressCalls: Array<[number, number]> = [];

    await runBench({
      tasks,
      provider: mockProvider,
      providerName: "anthropic",
      modelName: "claude-3-5-haiku-latest",
      scanResult,
      readme: null,
      contextFiles,
      iterations: 1,
      onProgress: (completed, total) => {
        progressCalls.push([completed, total]);
      },
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    // Last progress call should be total
    const lastCall = progressCalls[progressCalls.length - 1];
    expect(lastCall[0]).toBe(lastCall[1]);
  });

  it("handles provider errors gracefully", async () => {
    const mockProvider = {
      generate: vi.fn()
        .mockRejectedValueOnce(new Error("API error"))
        .mockResolvedValue("2"),
    };

    const results = await runBench({
      tasks,
      provider: mockProvider,
      providerName: "anthropic",
      modelName: "claude-3-5-haiku-latest",
      scanResult,
      readme: null,
      contextFiles,
      iterations: 1,
    });

    // First result (baseline, which errored) should have score 0
    expect(results[0].score).toBe(0);
    expect(results.length).toBe(2);
  });

  it("runs baseline before context", async () => {
    const mockProvider = {
      generate: vi.fn().mockResolvedValue("2"),
    };

    const results = await runBench({
      tasks,
      provider: mockProvider,
      providerName: "anthropic",
      modelName: "claude-3-5-haiku-latest",
      scanResult,
      readme: null,
      contextFiles,
      iterations: 1,
    });

    expect(results[0].condition).toBe("baseline");
    expect(results[1].condition).toBe("context");
  });

  it("handles multiple iterations", async () => {
    const mockProvider = {
      generate: vi.fn().mockResolvedValue("2"),
    };

    const results = await runBench({
      tasks,
      provider: mockProvider,
      providerName: "anthropic",
      modelName: "claude-3-5-haiku-latest",
      scanResult,
      readme: null,
      contextFiles,
      iterations: 2,
    });

    // 1 task * 2 conditions * 2 iterations = 4 results
    expect(results.length).toBe(4);
    expect(results.filter(r => r.condition === "baseline").length).toBe(2);
    expect(results.filter(r => r.condition === "context").length).toBe(2);
  });
});
