/**
 * Abstract LLM provider interface.
 * Each provider adapts a specific LLM SDK to this common interface.
 */
export interface LLMProvider {
  /** Generate a response from the LLM */
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
}

export type ProviderName = "anthropic" | "openai" | "google" | "ollama";

export async function createProvider(name: ProviderName, apiKey: string): Promise<LLMProvider> {
  switch (name) {
    case "anthropic": {
      const { AnthropicProvider } = await import("./anthropic.js");
      return new AnthropicProvider(apiKey);
    }
    case "openai": {
      const { OpenAIProvider } = await import("./openai.js");
      return new OpenAIProvider(apiKey);
    }
    case "google": {
      const { GoogleProvider } = await import("./google.js");
      return new GoogleProvider(apiKey);
    }
    case "ollama": {
      const { OllamaProvider } = await import("./ollama.js");
      return new OllamaProvider(apiKey);
    }
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}
