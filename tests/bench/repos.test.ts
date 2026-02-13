import { describe, it, expect } from "vitest";
import { DEFAULT_REPOS } from "../../src/bench/repos.js";

describe("DEFAULT_REPOS", () => {
  it("has 7 entries", () => {
    expect(DEFAULT_REPOS.length).toBe(7);
  });

  it("all have url, name, lang fields", () => {
    for (const repo of DEFAULT_REPOS) {
      expect(repo.url).toBeDefined();
      expect(repo.url).toMatch(/^https:\/\/github\.com\//);
      expect(repo.name).toBeDefined();
      expect(repo.name.length).toBeGreaterThan(0);
      expect(repo.lang).toBeDefined();
      expect(repo.lang.length).toBeGreaterThan(0);
    }
  });

  it("covers multiple languages", () => {
    const langs = new Set(DEFAULT_REPOS.map(r => r.lang));
    expect(langs.size).toBeGreaterThanOrEqual(3);
    expect(langs.has("js")).toBe(true);
    expect(langs.has("ts")).toBe(true);
    expect(langs.has("go")).toBe(true);
  });

  it("includes expected repos", () => {
    const names = DEFAULT_REPOS.map(r => r.name);
    expect(names).toContain("express");
    expect(names).toContain("zod");
    expect(names).toContain("chainlink");
    expect(names).toContain("openclaw");
  });
});
