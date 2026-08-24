import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Session, SessionId } from "@deepseek-ai/dsh-session";
import { appendUserText, createOfficialHarness } from "../src/runner/official-harness.ts";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("compaction replay", () => {
  it("replays the same compacted surface and transaction", async () => {
    const { ctx, session } = await createOfficialHarness("stable replay summary");
    session.append("turn/start", { turn: 1 });
    const a = appendUserText(session, "alpha".repeat(200));
    const b = appendUserText(session, "beta".repeat(200));
    await ctx.compaction.compactRegion(a.seq, b.seq, { session, options: { provider: "fixture", model: "fixture-model" } });
    session.append("turn/end", { turn: 1, reason: { kind: "completed" } });
    const replay = Session.create(SessionId("replay-session"), session.events);
    expect(hash(replay.deriveMessages())).toBe(hash(session.deriveMessages()));
    expect(replay.events.filter(({ type }) => type.startsWith("compaction/")).map(({ type }) => type)).toEqual(["compaction/start", "compaction/summary", "compaction/end"]);
  });
});
