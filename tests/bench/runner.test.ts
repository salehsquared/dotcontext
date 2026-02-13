import { describe, it, expect, vi } from "vitest";
import { runBench } from "../../src/bench/runner.js";
import { makeValidContext } from "../helpers.js";
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
      scope_tokens: { baseline: 500, context: 25 },
    },
  ];

  const contextFiles = new Map([
    ["src", makeValidContext({ summary: "Main source" })],
  ]);

  it("calls provider for each task x condition x iteration", async () => {
    const mockProvider = {
      generate: vi.fn().mockResolvedValue("2"),
    };

    const results = await runBench({
      tasks,
      provider: mockProvider,
      fileTree: "./\n  src/",
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
      fileTree: "my-tree",
      readme: "My README content",
      contextFiles,
      iterations: 1,
    });

    // First call should be baseline
    const firstCallArgs = mockProvider.generate.mock.calls[0];
    const userPrompt = firstCallArgs[1];
    expect(userPrompt).toContain("my-tree");
    expect(userPrompt).toContain("My README content");
  });

  it("context prompt includes .context.yaml contents", async () => {
    const mockProvider = {
      generate: vi.fn().mockResolvedValue("2"),
    };

    await runBench({
      tasks,
      provider: mockProvider,
      fileTree: "my-tree",
      readme: null,
      contextFiles,
      iterations: 1,
    });

    // Third call is context condition (after baseline + judge)
    const contextCallArgs = mockProvider.generate.mock.calls[2];
    const userPrompt = contextCallArgs[1];
    expect(userPrompt).toContain("Main source");
    expect(userPrompt).toContain("compressed directory documentation");
  });

  it("records latency and token estimates", async () => {
    const mockProvider = {
      generate: vi.fn().mockResolvedValue("2"),
    };

    const results = await runBench({
      tasks,
      provider: mockProvider,
      fileTree: "tree",
      readme: null,
      contextFiles,
      iterations: 1,
    });

    for (const r of results) {
      expect(r.latency_ms).toBeGreaterThanOrEqual(0);
      expect(r.scope_tokens_est).toBeGreaterThan(0);
    }

    // baseline should have higher token estimate than context
    const baselineResult = results.find(r => r.condition === "baseline")!;
    const contextResult = results.find(r => r.condition === "context")!;
    expect(baselineResult.scope_tokens_est).toBeGreaterThan(contextResult.scope_tokens_est);
  });

  it("reports progress", async () => {
    const mockProvider = {
      generate: vi.fn().mockResolvedValue("2"),
    };

    const progressCalls: Array<[number, number]> = [];

    await runBench({
      tasks,
      provider: mockProvider,
      fileTree: "tree",
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
      fileTree: "tree",
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
      fileTree: "tree",
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
      fileTree: "tree",
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
