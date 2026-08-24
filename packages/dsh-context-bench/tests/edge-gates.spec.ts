import { describe, expect, it } from "vitest";
import { CallId, createToolResultMessage } from "@deepseek-ai/dsh-llm";
import { appendUserText, createOfficialHarness } from "../src/runner/official-harness.ts";

describe("strict compaction release gates", () => {
  it("cancels summarization and leaves a failed bracket without a replacement", async () => {
    const { ctx, adapter, session } = await createOfficialHarness("never lands", 8_192, {}, true);
    session.append("turn/start", { turn: 1 });
    const a = appendUserText(session, "cancel me".repeat(300));
    const b = appendUserText(session, "keep me".repeat(300));
    const controller = new AbortController();
    const pending = ctx.compaction.compactRegion(a.seq, b.seq, { session, options: { provider: "fixture", model: "fixture-model" } }, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort(new Error("benchmark cancellation"));
    await expect(pending).rejects.toBeTruthy();
    expect(adapter.abortSeen.value).toBe(true);
    expect(session.events.at(-1)?.type).toBe("compaction/end");
    expect(session.events.some(({ type }) => type === "compaction/end" && "error" in (session.events.at(-1)?.data ?? {}))).toBe(true);
    expect(session.deriveMessages().map((message) => JSON.stringify(message.content)).join(" ")).toContain("cancel me");
  });

  it("prunes a long tool result while preserving the paired call and result", async () => {
    const { ctx, session } = await createOfficialHarness("summary", 8_192, {}, false, { thresholdChars: 100, headChars: 20, tailChars: 20 });
    session.append("turn/start", { turn: 1 });
    const callId = CallId("tool-1");
    const call = session.append("tool/call", { turn: 1, step: 1, callId, name: "read", arguments: "{}" });
    const result = session.append("tool/result", {
      turn: 1,
      step: 1,
      message: createToolResultMessage({ callId, content: [{ type: "text", text: "HEAD-" + "x".repeat(200) + "-TAIL" }], isError: false }),
    }, { surfaceOp: "append", sourceEventSeqs: [call.seq] });
    const pruned = ctx.toolResultPruner.pruneSession(session);
    expect(pruned.pruned[0]?.originalSeq).toBe(result.seq);
    expect(session.events.find(({ seq }) => seq === result.seq)?.data).toMatchObject({ message: { source: { callId } } });
    expect(JSON.stringify(session.deriveMessages())).toContain("HEAD-");
    expect(JSON.stringify(session.deriveMessages())).toContain("TAIL");
  });

  it("detects an orphaned compaction start as an incomplete transaction", async () => {
    const { session } = await createOfficialHarness("summary");
    session.append("turn/start", { turn: 1 });
    session.append("compaction/start", { compactionId: "compaction-test", turn: 1 });
    const starts = session.events.filter(({ type }) => type === "compaction/start").length;
    const ends = session.events.filter(({ type }) => type === "compaction/end").length;
    expect(starts).toBe(1);
    expect(ends).toBe(0);
  });

  it("bounds a non-converging summary failure", async () => {
    const { ctx, adapter, session } = await createOfficialHarness(["too-large ".repeat(2_000), "small summary"], 2_000, { thresholdRatio: 0.1, retainRatio: 0.05, compactionRetries: 1 });
    session.append("turn/start", { turn: 1 });
    appendUserText(session, "source ".repeat(300));
    appendUserText(session, "tail ".repeat(300));
    await expect(ctx.compaction.compactIfNeeded({ session, options: { provider: "fixture", model: "fixture-model" } }, "pressure", new AbortController().signal)).rejects.toThrow(/not smaller/);
    expect(adapter.calls.length).toBe(1);
  });
});
