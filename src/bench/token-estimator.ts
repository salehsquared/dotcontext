interface TokenProfile {
  charsPerToken: number;
  requestOverhead: number;
  messageOverhead: number;
}

const DEFAULT_PROFILE: TokenProfile = {
  charsPerToken: 4.0,
  requestOverhead: 10,
  messageOverhead: 4,
};

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

export function resolveTokenProfile(provider: string, model: string): TokenProfile {
  const p = normalize(provider);
  const m = normalize(model);

  let profile: TokenProfile;
  switch (p) {
    case "anthropic":
      profile = { charsPerToken: 3.7, requestOverhead: 12, messageOverhead: 4 };
      break;
    case "openai":
      profile = { charsPerToken: 3.9, requestOverhead: 10, messageOverhead: 4 };
      break;
    case "google":
      profile = { charsPerToken: 4.2, requestOverhead: 8, messageOverhead: 4 };
      break;
    case "ollama":
      profile = { charsPerToken: 3.8, requestOverhead: 10, messageOverhead: 4 };
      break;
    default:
      profile = { ...DEFAULT_PROFILE };
  }

  // Lightweight model-level calibration.
  if (/claude|haiku|sonnet|opus/.test(m)) {
    profile.charsPerToken = 3.6;
  } else if (/gpt|o\d|o1|o3|o4/.test(m)) {
    profile.charsPerToken = 3.9;
  } else if (/gemini/.test(m)) {
    profile.charsPerToken = 4.2;
  } else if (/llama|mistral|qwen|deepseek/.test(m)) {
    profile.charsPerToken = 3.7;
  }

  return profile;
}

export function estimateInputTokens(options: {
  provider: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): number {
  const profile = resolveTokenProfile(options.provider, options.model);
  const systemTokens = Math.ceil(options.systemPrompt.length / profile.charsPerToken);
  const userTokens = Math.ceil(options.userPrompt.length / profile.charsPerToken);

  // Request-level envelope + two messages (system + user).
  const total = profile.requestOverhead
    + profile.messageOverhead * 2
    + systemTokens
    + userTokens;

  return Math.max(1, total);
}
