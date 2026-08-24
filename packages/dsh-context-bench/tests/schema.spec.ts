import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BenchmarkReportSchema,
  parseBenchmarkFixture,
} from "../src/schema.ts";

const fixturesDirectory = fileURLToPath(new URL("../fixtures/", import.meta.url));

function minimalFixture() {
  return {
    schemaVersion: 1,
    id: "schema-test",
    title: "Schema test",
    contextScale: "8K",
    transcript: [
      {
        id: "segment-1",
        role: "user",
        kind: "fact",
        position: "early",
        content: "Release channel is stable.",
      },
    ],
    requiredFacts: [
      {
        id: "release-channel",
        category: "mutable",
        value: "stable",
        aliases: ["stable channel"],
        position: "early",
        weight: 2,
        critical: true,
      },
    ],
    supersededFacts: [],
    toolPairs: [],
    expectedNextStep: "Run the release verification suite.",
  };
}

describe("benchmark fixture schema", () => {
  it("parses every versioned synthetic fixture", () => {
    const files = readdirSync(fixturesDirectory).filter((file) => file.endsWith(".json")).sort();
    expect(files).toHaveLength(7);

    const metadata = files.map((file) => {
      const fixture = parseBenchmarkFixture(readFileSync(`${fixturesDirectory}/${file}`, "utf8"));
      return {
        id: fixture.id,
        scale: fixture.contextScale,
        facts: fixture.requiredFacts.length,
        staleGroups: fixture.supersededFacts.length,
        toolPairs: fixture.toolPairs.length,
      };
    });

    expect(metadata.map(({ id }) => id)).toEqual([
      "bilingual-noise",
      "coding-handoff",
      "multi-compaction",
      "needle-position",
      "superseded-decisions",
      "tool-pairing",
      "user-constraints",
    ]);
    expect(metadata.every(({ facts }) => facts > 0)).toBe(true);
  });

  it("rejects duplicate fact IDs and non-positive weights", () => {
    const fixture = minimalFixture();
    fixture.requiredFacts.push({ ...fixture.requiredFacts[0] });
    expect(() => parseBenchmarkFixture(fixture)).toThrow(/unique/i);

    const invalidWeight = minimalFixture();
    invalidWeight.requiredFacts[0].weight = 0;
    expect(() => parseBenchmarkFixture(invalidWeight)).toThrow();
  });

  it("rejects credentials and absolute user-home paths", () => {
    const credential = minimalFixture();
    credential.transcript[0].content = "token=ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    expect(() => parseBenchmarkFixture(credential)).toThrow(/credential/i);

    const homePath = minimalFixture();
    homePath.transcript[0].content = "/Users/example/private/project";
    expect(() => parseBenchmarkFixture(homePath)).toThrow(/home path/i);
  });

  it("rejects oversized fixture payloads", () => {
    const fixture = minimalFixture();
    fixture.transcript[0].content = "x".repeat(600_000);
    expect(() => parseBenchmarkFixture(fixture)).toThrow(/maximum/i);
  });
});

describe("benchmark report schema", () => {
  it("accepts safe comparable report metadata", () => {
    const report = BenchmarkReportSchema.parse({
      schemaVersion: 1,
      runId: "run-schema-test",
      tier: "deterministic",
      fixtureId: "schema-test",
      fixtureHash: "a".repeat(64),
      seed: 42,
      packages: { "@deepseek-ai/dsh-compaction-basic": "0.1.0-rc.6" },
      adapter: { provider: "fixture", model: "deterministic-v1", contextWindow: 8192 },
      pressure: { before: 0.82, after: 0.18 },
      events: [
        { seq: 1, type: "compaction/start", success: true },
        { seq: 2, type: "compaction/summary", success: true },
        { seq: 3, type: "user/message", success: true },
        { seq: 4, type: "compaction/end", success: true },
      ],
      metrics: {
        criticalRecall: 100,
        exactLiteralRecall: 100,
        latestStateAccuracy: 100,
        staleLeakage: 0,
        constraintRecall: 100,
        pendingWorkRecall: 100,
        toolIntegrity: 100,
        sectionCompleteness: 100,
        postCompactionPressure: 0.18,
        compressionRatio: 4.2,
        multiCycleRetention: [100],
      },
      usage: { inputTokens: 7000, outputTokens: 900, cacheReadTokens: 0 },
      durationMs: 12,
      errors: [],
    });

    expect(report.adapter.contextWindow).toBe(8192);
  });
});
