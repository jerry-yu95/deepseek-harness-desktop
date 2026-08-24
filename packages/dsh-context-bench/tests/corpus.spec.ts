import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildSyntheticCorpus, CONTEXT_SCALE_TOKENS } from "../src/corpus.ts";
import { parseBenchmarkFixture } from "../src/schema.ts";

function loadFixture(name: string) {
  const path = fileURLToPath(new URL(`../fixtures/${name}.json`, import.meta.url));
  return parseBenchmarkFixture(readFileSync(path, "utf8"));
}

describe("synthetic long-context corpus", () => {
  it("is byte-for-byte stable for a fixture and seed", () => {
    const fixture = loadFixture("needle-position");
    const first = buildSyntheticCorpus(fixture, { seed: 7319, scale: "8K" });
    const second = buildSyntheticCorpus(fixture, { seed: 7319, scale: "8K" });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.targetTokenBudget).toBe(8_192);
  });

  it("places source facts at early, middle, and late percentiles", () => {
    const corpus = buildSyntheticCorpus(loadFixture("needle-position"), { seed: 3, scale: "32K" });
    const denominator = corpus.messages.length - 1;
    expect(corpus.placements["early-id"] / denominator).toBeCloseTo(0.1, 1);
    expect(corpus.placements["middle-path"] / denominator).toBeCloseTo(0.5, 1);
    expect(corpus.placements["late-port"] / denominator).toBeCloseTo(0.9, 1);
  });

  it("supports bounded materialization for every policy scale", () => {
    const fixture = loadFixture("user-constraints");
    for (const scale of ["8K", "32K", "128K", "1M-policy"] as const) {
      const corpus = buildSyntheticCorpus(fixture, { seed: 9, scale });
      expect(corpus.targetTokenBudget).toBe(CONTEXT_SCALE_TOKENS[scale]);
      expect(corpus.estimatedMaterializedTokens).toBeGreaterThan(0);
      expect(corpus.estimatedMaterializedTokens).toBeLessThanOrEqual(corpus.targetTokenBudget);
      expect(corpus.policyOnly).toBe(scale === "1M-policy");
    }
  });

  it("materializes both stale and active mutable values", () => {
    const fixture = loadFixture("superseded-decisions");
    const corpus = buildSyntheticCorpus(fixture, { seed: 11, scale: "8K" });
    const text = corpus.messages.map(({ content }) => content).join("\n");
    expect(text).toContain("SQLite");
    expect(text).toContain("Postgres");
    expect(text).toContain("local JSON artifacts");
  });
});
