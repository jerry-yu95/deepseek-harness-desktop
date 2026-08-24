import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizeForMatch } from "../src/oracle.ts";
import { OFFICIAL_CHECKPOINT_SECTIONS, scoreCheckpoint } from "../src/scoring.ts";
import { parseBenchmarkFixture } from "../src/schema.ts";

function fixture(name: string) {
  return parseBenchmarkFixture(readFileSync(fileURLToPath(new URL(`../fixtures/${name}.json`, import.meta.url)), "utf8"));
}

function structured(body: string): string {
  return OFFICIAL_CHECKPOINT_SECTIONS.map((section) => `## ${section}\n- ${section === "Critical Context" ? body : "(none)"}`).join("\n\n");
}

describe("deterministic checkpoint scoring", () => {
  it("normalizes presentation but preserves identifiers and numbers", () => {
    expect(normalizeForMatch("**Use**  `Port-42`\r\nnow")).toBe("use port-42 now");
    expect(normalizeForMatch("Port-42")).not.toBe(normalizeForMatch("port-43"));
  });

  it("accepts a complete checkpoint with the latest mutable state", () => {
    const result = scoreCheckpoint(fixture("superseded-decisions"), structured("Final decision: keep reports as local JSON artifacts."));
    expect(result.metrics.latestStateAccuracy).toBe(100);
    expect(result.metrics.staleLeakage).toBe(0);
    expect(result.metrics.sectionCompleteness).toBe(100);
    expect(result.hardFailure).toBe(false);
  });

  it("hard-fails when a critical stale value is presented as current", () => {
    const result = scoreCheckpoint(fixture("superseded-decisions"), structured("Use SQLite as the current result store; local JSON artifacts are also mentioned."));
    expect(result.metrics.staleLeakage).toBeGreaterThan(0);
    expect(result.hardFailure).toBe(true);
  });

  it("does not award vague placeholders or fabricated facts", () => {
    const result = scoreCheckpoint(fixture("user-constraints"), structured("Keep the important constraints and use Redis."));
    expect(result.metrics.constraintRecall).toBe(0);
    expect(result.fabricatedClaims).toContain("Redis");
  });
});
