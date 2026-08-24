import { describe, expect, it } from "vitest";
import { assertBaselineComparable, assertSafeReport, formatBenchmarkReportMarkdown } from "../src/report.ts";
import type { BenchmarkReport } from "../src/schema.ts";

function report(overrides: Partial<BenchmarkReport> = {}): BenchmarkReport {
  return {
    schemaVersion: 1,
    runId: "deterministic-00",
    tier: "deterministic",
    fixtureId: "fixture-one",
    fixtureHash: "a".repeat(64),
    seed: 0,
    packages: { official: "rc.6" },
    adapter: { provider: "fixture", model: "fixture", contextWindow: 32_768 },
    pressure: { before: 100, after: 30 },
    events: [{ seq: 0, type: "score", success: true }],
    metrics: {
      criticalRecall: 100,
      exactLiteralRecall: 100,
      latestStateAccuracy: 100,
      staleLeakage: 0,
      constraintRecall: 100,
      pendingWorkRecall: 100,
      toolIntegrity: 100,
      sectionCompleteness: 100,
      postCompactionPressure: 0.3,
      compressionRatio: 0.35,
      multiCycleRetention: [100],
    },
    usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0 },
    durationMs: 1,
    errors: [],
    ...overrides,
  };
}

describe("benchmark reports", () => {
  it("validates safe reports and renders a concise human summary", () => {
    const safe = assertSafeReport(report());
    expect(formatBenchmarkReportMarkdown(safe)).toContain("Critical recall: 100%");
    expect(formatBenchmarkReportMarkdown(safe)).not.toContain("/Users/");
  });

  it("rejects credentials and detects deterministic baseline drift", () => {
    expect(() => assertSafeReport(report({ errors: [{ code: "x", message: "Bearer abcdefghijklmnopqrstuvwxyz" }] }))).toThrow(/credential/);
    expect(() => assertBaselineComparable([report()], {
      schemaVersion: 1,
      tier: "deterministic",
      officialPackages: { official: "rc.6" },
      adapter: { provider: "fixture", model: "fixture" },
      fixtures: { "fixture-one": "b".repeat(64) },
      contextWindows: { "fixture-one": 32_768 },
      gates: { criticalRecall: 100, exactLiteralRecall: 100, latestStateAccuracy: 100, staleLeakage: 0, toolIntegrity: 100, sectionCompleteness: 100 },
    })).toThrow(/changed/);
  });
});
