import { describe, expect, it } from "vitest";
import { appendUserText, createOfficialHarness } from "../src/runner/official-harness.ts";

describe("official structural compaction", () => {
  it("commits the official bracket and replacement through ctx.compaction", async () => {
    const { ctx, adapter, session } = await createOfficialHarness("## Primary Request and Intent\n- preserve benchmark facts");
    session.append("turn/start", { turn: 1 });
    const first = appendUserText(session, "A".repeat(1_000));
    const second = appendUserText(session, "B".repeat(1_000));
    const result = await ctx.compaction.compactRegion(first.seq, second.seq, { session, options: { provider: "fixture", model: "fixture-model" } });
    expect(result.shadowedSeqs).toEqual([first.seq, second.seq]);
    expect(session.events.slice(-4).map(({ type }) => type)).toEqual(["compaction/start", "compaction/summary", "user/message", "compaction/end"]);
    expect(session.deriveMessages()).toHaveLength(1);
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]?.purpose).toBe("compaction");
    expect(adapter.calls[0]?.messages.at(-1)?.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("## Critical Context") });
  });
});
