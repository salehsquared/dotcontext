import { describe, it, expect } from "vitest";
import {
  contextSchema,
  configSchema,
  CONTEXT_FILENAME,
  CONFIG_FILENAME,
  SCHEMA_VERSION,
  DEFAULT_MAINTENANCE,
} from "../src/core/schema.js";
import { makeValidContext } from "./helpers.js";

describe("contextSchema", () => {
  describe("valid inputs", () => {
    it("accepts a complete context with all optional fields", () => {
      const full = makeValidContext({
        interfaces: [{ name: "POST /login", description: "Authenticates user" }],
        decisions: [{ what: "JWT", why: "Stateless", tradeoff: "Needs blocklist" }],
        constraints: ["All endpoints require auth"],
        dependencies: {
          internal: ["src/db/"],
          external: ["pyjwt ^2.8"],
        },
        current_state: {
          working: ["Login endpoint"],
          broken: ["Refresh race condition"],
          in_progress: ["Rate limiting"],
        },
        subdirectories: [{ name: "tests/", summary: "Test suite" }],
        environment: ["JWT_SECRET"],
        testing: ["npm test"],
        todos: ["Add rate limiting"],
        data_models: ["User model"],
        events: ["user.login"],
        config: ["config.yaml"],
        project: {
          name: "my-service",
          description: "REST API",
          language: "typescript",
          framework: "fastapi",
          package_manager: "npm",
        },
        structure: [{ path: "src/", summary: "Source code" }],
      });

      const result = contextSchema.safeParse(full);
      expect(result.success).toBe(true);
    });

    it("accepts minimal required fields only", () => {
      const minimal = makeValidContext();
      const result = contextSchema.safeParse(minimal);
      expect(result.success).toBe(true);
    });

    it("accepts optional fields selectively", () => {
      const partial = makeValidContext({
        interfaces: [{ name: "hello()", description: "Greets" }],
        dependencies: { external: ["chalk"] },
      });
      const result = contextSchema.safeParse(partial);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.interfaces).toHaveLength(1);
        expect(result.data.decisions).toBeUndefined();
      }
    });
  });

  describe("required field validation", () => {
    it("rejects when version is missing", () => {
      const { version, ...rest } = makeValidContext();
      expect(contextSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects when last_updated is missing", () => {
      const { last_updated, ...rest } = makeValidContext();
      expect(contextSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects when fingerprint is missing", () => {
      const { fingerprint, ...rest } = makeValidContext();
      expect(contextSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects when scope is missing", () => {
      const { scope, ...rest } = makeValidContext();
      expect(contextSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects when summary is missing", () => {
      const { summary, ...rest } = makeValidContext();
      expect(contextSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects when files is missing", () => {
      const { files, ...rest } = makeValidContext();
      expect(contextSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects when maintenance is missing", () => {
      const { maintenance, ...rest } = makeValidContext();
      expect(contextSchema.safeParse(rest).success).toBe(false);
    });
  });

  describe("type validation", () => {
    it("rejects version as string", () => {
      const data = { ...makeValidContext(), version: "1" };
      expect(contextSchema.safeParse(data).success).toBe(false);
    });

    it("rejects version as float", () => {
      const data = { ...makeValidContext(), version: 1.5 };
      expect(contextSchema.safeParse(data).success).toBe(false);
    });

    it("rejects files as string instead of array", () => {
      const data = { ...makeValidContext(), files: "index.ts" };
      expect(contextSchema.safeParse(data).success).toBe(false);
    });

    it("rejects files with invalid entry shape (missing purpose)", () => {
      const data = { ...makeValidContext(), files: [{ name: "x.ts" }] };
      expect(contextSchema.safeParse(data).success).toBe(false);
    });

    it("rejects interfaces with invalid entry shape (missing description)", () => {
      const data = { ...makeValidContext(), interfaces: [{ name: "foo" }] };
      expect(contextSchema.safeParse(data).success).toBe(false);
    });

    it("rejects decisions with invalid entry shape (missing what)", () => {
      const data = { ...makeValidContext(), decisions: [{ why: "reason" }] };
      expect(contextSchema.safeParse(data).success).toBe(false);
    });

    it("rejects subdirectories with invalid entry shape (missing summary)", () => {
      const data = { ...makeValidContext(), subdirectories: [{ name: "src/" }] };
      expect(contextSchema.safeParse(data).success).toBe(false);
    });
  });
});

describe("configSchema", () => {
  it("accepts valid anthropic config", () => {
    expect(configSchema.safeParse({ provider: "anthropic" }).success).toBe(true);
  });

  it("accepts valid openai config with optional fields", () => {
    const config = {
      provider: "openai",
      model: "gpt-4",
      api_key_env: "MY_KEY",
      ignore: ["tmp"],
      max_depth: 5,
    };
    expect(configSchema.safeParse(config).success).toBe(true);
  });

  it("accepts valid google config", () => {
    expect(configSchema.safeParse({ provider: "google" }).success).toBe(true);
  });

  it("accepts valid ollama config", () => {
    expect(configSchema.safeParse({ provider: "ollama" }).success).toBe(true);
  });

  it("rejects unknown provider", () => {
    expect(configSchema.safeParse({ provider: "mistral" }).success).toBe(false);
  });

  it("rejects missing provider", () => {
    expect(configSchema.safeParse({}).success).toBe(false);
  });

  it("rejects max_depth as string", () => {
    expect(configSchema.safeParse({ provider: "openai", max_depth: "5" }).success).toBe(false);
  });
});

describe("constants", () => {
  it("CONTEXT_FILENAME equals .context.yaml", () => {
    expect(CONTEXT_FILENAME).toBe(".context.yaml");
  });

  it("CONFIG_FILENAME equals .context.config.yaml", () => {
    expect(CONFIG_FILENAME).toBe(".context.config.yaml");
  });

  it("SCHEMA_VERSION equals 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it("DEFAULT_MAINTENANCE contains update instruction", () => {
    expect(DEFAULT_MAINTENANCE).toContain("update this .context.yaml");
    expect(DEFAULT_MAINTENANCE).toContain("Do not include secrets");
  });
});
