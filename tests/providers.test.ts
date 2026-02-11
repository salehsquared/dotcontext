import { describe, it, expect } from "vitest";
import { createProvider } from "../src/providers/index.js";

describe("createProvider", () => {
  it("returns AnthropicProvider for 'anthropic'", async () => {
    const provider = await createProvider("anthropic", "test-key");
    expect(provider).toBeDefined();
    expect(typeof provider.generate).toBe("function");
  });

  it("returns OpenAIProvider for 'openai'", async () => {
    const provider = await createProvider("openai", "test-key");
    expect(provider).toBeDefined();
    expect(typeof provider.generate).toBe("function");
  });

  it("returns GoogleProvider for 'google'", async () => {
    const provider = await createProvider("google", "test-key");
    expect(provider).toBeDefined();
    expect(typeof provider.generate).toBe("function");
  });

  it("returns OllamaProvider for 'ollama'", async () => {
    const provider = await createProvider("ollama", "http://localhost:11434");
    expect(provider).toBeDefined();
    expect(typeof provider.generate).toBe("function");
  });

  it("throws for unknown provider name", async () => {
    await expect(createProvider("mistral" as any, "key")).rejects.toThrow("Unknown provider");
  });
});
