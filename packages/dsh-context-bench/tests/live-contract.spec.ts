import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIVE_SCALE,
  LIVE_CONFIRMATION,
  runLiveBenchmark,
  validateLiveOptions,
} from "../src/runner/live.ts";

const baseOptions = {
  live: true,
  provider: "fixture-provider",
  model: "fixture-model",
  maxInputTokens: 32_768,
  maxOutputTokens: 1_024,
  confirmation: LIVE_CONFIRMATION,
} as const;

describe("live benchmark contract", () => {
  it("fails closed unless live mode and confirmation are explicit", () => {
    expect(() => validateLiveOptions({ ...baseOptions, live: false })).toThrow(/--live/);
    expect(() => validateLiveOptions({ ...baseOptions, confirmation: undefined })).toThrow(/confirmation/);
    expect(() => validateLiveOptions({ ...baseOptions, provider: "" })).toThrow(/provider and model/);
  });

  it("defaults to the 32K tier and three independent seeds", () => {
    const validated = validateLiveOptions(baseOptions);
    expect(validated.scale).toBe(DEFAULT_LIVE_SCALE);
    expect(validated.seeds).toEqual([0, 1, 2]);
    expect(validated.tier).toBe("live");
  });

  it("runs three samples and reports mean, minimum, deviation, and hard failures", async () => {
    const result = await runLiveBenchmark(baseOptions, {
      resolveContextWindow: async () => 32_768,
      runProbe: async ({ seed }) => ({
        criticalRecall: 90 + seed,
        exactLiteralRecall: 95,
        latestStateAccuracy: 100,
        hardFailure: seed === 2,
        inputTokens: 32_000,
        outputTokens: 400,
        cacheReadTokens: 100,
      }),
    });

    expect(result.samples).toHaveLength(3);
    expect(result.summary.meanCriticalRecall).toBe(91);
    expect(result.summary.minCriticalRecall).toBe(90);
    expect(result.summary.stdCriticalRecall).toBeCloseTo(Math.sqrt(2 / 3), 8);
    expect(result.summary.hardFailureCount).toBe(1);
    expect(result.summary.inputTokens).toBe(96_000);
    expect(result.summary.cacheReadTokens).toBe(300);
  });

  it("does not accept API keys or secret-bearing options", () => {
    expect(() => validateLiveOptions({
      ...baseOptions,
      apiKey: "sk-test-secret-value",
    } as typeof baseOptions & { apiKey: string })).toThrow(/secret-bearing/);
  });

  it("fails when capacity is unknown, too small, or beyond the explicit full-capacity gate", async () => {
    await expect(runLiveBenchmark(baseOptions, {
      resolveContextWindow: async () => 0,
      runProbe: async () => ({
        criticalRecall: 100,
        exactLiteralRecall: 100,
        latestStateAccuracy: 100,
        hardFailure: false,
        inputTokens: 1,
        outputTokens: 1,
      }),
    })).rejects.toThrow(/resolved context window/);

    await expect(runLiveBenchmark(baseOptions, {
      resolveContextWindow: async () => 8_192,
      runProbe: async () => {
        throw new Error("must not probe a model below the requested scale");
      },
    })).rejects.toThrow(/smaller/);

    expect(() => validateLiveOptions({
      ...baseOptions,
      scale: "1M-policy",
      maxInputTokens: 1_000_000,
    })).toThrow(/allow-full-capacity/);
  });
});
