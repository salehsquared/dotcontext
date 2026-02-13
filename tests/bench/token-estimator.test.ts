import { describe, it, expect } from "vitest";
import { estimateInputTokens, resolveTokenProfile } from "../../src/bench/token-estimator.js";

describe("resolveTokenProfile", () => {
  it("uses provider defaults", () => {
    const profile = resolveTokenProfile("openai", "gpt-4o-mini");
    expect(profile.requestOverhead).toBeGreaterThan(0);
    expect(profile.messageOverhead).toBeGreaterThan(0);
  });

  it("applies model-level calibration", () => {
    const claude = resolveTokenProfile("anthropic", "claude-3-5-haiku-latest");
    const gemini = resolveTokenProfile("google", "gemini-2.5-flash");
    expect(claude.charsPerToken).not.toBe(gemini.charsPerToken);
  });
});

describe("estimateInputTokens", () => {
  it("returns positive token counts", () => {
    const tokens = estimateInputTokens({
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: "System prompt",
      userPrompt: "User prompt",
    });
    expect(tokens).toBeGreaterThan(0);
  });

  it("increases with longer prompts", () => {
    const short = estimateInputTokens({
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: "s",
      userPrompt: "short",
    });
    const long = estimateInputTokens({
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: "s",
      userPrompt: "x".repeat(4_000),
    });
    expect(long).toBeGreaterThan(short);
  });

  it("differs across model families for same prompt length", () => {
    const claude = estimateInputTokens({
      provider: "anthropic",
      model: "claude-3-5-haiku-latest",
      systemPrompt: "system",
      userPrompt: "x".repeat(1_000),
    });
    const gemini = estimateInputTokens({
      provider: "google",
      model: "gemini-2.5-flash",
      systemPrompt: "system",
      userPrompt: "x".repeat(1_000),
    });
    expect(claude).not.toBe(gemini);
  });
});
