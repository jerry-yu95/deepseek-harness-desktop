import { describe, expect, it } from "vitest";
import { appendUserText, createOfficialHarness } from "../src/runner/official-harness.ts";
import { parseBenchmarkFixture } from "../src/schema.ts";
import { scoreCheckpoint } from "../src/scoring.ts";

const fixture = parseBenchmarkFixture(JSON.stringify({
  schemaVersion: 1, id: "cycle-score", title: "cycle score", contextScale: "8K",
  transcript: [{ id: "request", role: "user", kind: "fact", position: "early", content: "Retain team-blue and stable release channel." }],
  requiredFacts: [
    { id: "owner", category: "exact", value: "team-blue", aliases: [], position: "early", weight: 1, critical: true },
    { id: "channel", category: "mutable", value: "stable", aliases: [], position: "late", weight: 1, critical: true },
  ], supersededFacts: [{ factId: "channel", staleValues: ["beta"] }], toolPairs: [],
}));

describe("multi-compaction retention", () => {
  it("consolidates three checkpoints while retaining active early facts", async () => {
    const summaries = [
      "Cycle one: active release channel is beta; owner is team-blue.",
      "Cycle two: active release channel is stable; owner remains team-blue.",
      "Cycle three: active release channel is stable; owner remains team-blue; next step is publish.",
    ];
    const { ctx, session } = await createOfficialHarness(summaries);
    session.append("turn/start", { turn: 1 });

    const first = appendUserText(session, "The durable owner is team-blue. " + "a".repeat(600));
    const obsolete = appendUserText(session, "Initial release channel is beta. " + "b".repeat(600));
    await ctx.compaction.compactRegion(first.seq, obsolete.seq, { session, options: { provider: "fixture", model: "fixture-model" } });

    const surface1 = session.surface.nodes;
    const correction = appendUserText(session, "Correction: release channel is stable, not beta. " + "c".repeat(600));
    await ctx.compaction.compactRegion(surface1[0]!, correction.seq, { session, options: { provider: "fixture", model: "fixture-model" } });

    const surface2 = session.surface.nodes;
    const pending = appendUserText(session, "Pending next step: publish. " + "d".repeat(600));
    await ctx.compaction.compactRegion(surface2[0]!, pending.seq, { session, options: { provider: "fixture", model: "fixture-model" } });

    const text = JSON.stringify(session.deriveMessages());
    expect(text).toContain("team-blue");
    expect(text).toContain("stable");
    expect(text).toContain("publish");
    expect(text).not.toContain("Cycle one:");
    expect(session.events.filter(({ type }) => type === "compaction/summary")).toHaveLength(3);
    const cycleScores = summaries.map((summary) => scoreCheckpoint(fixture, summary).metrics.criticalRecall);
    expect(cycleScores.every((score, index) => index === 0 || cycleScores[index - 1]! - score <= 5)).toBe(true);
  });
});
