import { describe, expect, it } from "vitest";
import { appendUserText, createOfficialHarness } from "../src/runner/official-harness.ts";

describe("official pressure policy boundaries", () => {
  it("does not compact below 80% and compacts after crossing it", async () => {
    const { ctx, session } = await createOfficialHarness("compact summary", 2_000);
    session.append("turn/start", { turn: 1 });
    while (ctx.tokenMeter.measure(session).totalTokens < 1_500) appendUserText(session, "x".repeat(120));
    expect(ctx.tokenMeter.measure(session).totalTokens).toBeLessThan(1_600);
    expect(await ctx.compaction.compactIfNeeded({ session, options: { provider: "fixture", model: "fixture-model" } }, "pressure", new AbortController().signal)).toBeNull();
    while (ctx.tokenMeter.measure(session).totalTokens < 1_600) appendUserText(session, "y".repeat(120));
    const result = await ctx.compaction.compactIfNeeded({ session, options: { provider: "fixture", model: "fixture-model" } }, "pressure", new AbortController().signal);
    expect(result).not.toBeNull();
  });

  it("uses an exact model override ahead of the default threshold", async () => {
    const { ctx } = await createOfficialHarness("summary", 2_000, {
      thresholdRatio: 0.8,
      modelPolicies: [{ provider: "fixture", model: "fixture-model", thresholdRatio: 0.6, retainRatio: 0.16 }],
    });
    expect(ctx.compaction.config.modelPolicies[0]?.thresholdRatio).toBe(0.6);
  });
});
