import { Context } from "@deepseek-ai/cordis";
import { LlmRuntime, createUserMessage, createSystemMessage } from "@deepseek-ai/dsh-llm";
import SessionStore, { SessionId } from "@deepseek-ai/dsh-session";
import TokenMeter from "@deepseek-ai/dsh-token-meter";
import SessionProjectionRegistry from "@deepseek-ai/dsh-session-projection";
import BasicCompactionEngine from "@deepseek-ai/dsh-compaction-basic";
import ToolResultPruner from "@deepseek-ai/dsh-compaction-tool-result-pruner";

import { DeterministicCompactionAdapter } from "./fake-adapter.ts";

export async function createOfficialHarness(summary: string | readonly string[], contextWindow = 8_192, compactionConfig: Record<string, unknown> = {}, blockUntilAbort = false, prunerConfig: Record<string, unknown> = {}) {
  const ctx = new Context();
  await ctx.plugin(LlmRuntime);
  await ctx.plugin(SessionStore);
  await ctx.plugin(SessionProjectionRegistry);
  await ctx.plugin(TokenMeter);
  await ctx.plugin(ToolResultPruner, prunerConfig);
  await ctx.plugin(BasicCompactionEngine, { auto: false, summarizationProvider: "fixture", summarizationModel: "fixture-model", ...compactionConfig });
  const adapter = new DeterministicCompactionAdapter(summary, contextWindow, blockUntilAbort);
  ctx.llm.registerAdapter(["fixture"], adapter);
  const session = ctx.sessions.create(SessionId("benchmark-session"));
  session.append("request/header", {
    header: { config: { provider: "fixture", model: "fixture-model" } },
    reason: "initial",
  });
  session.append("system/message", { turn: 0, step: 0, message: createSystemMessage("You are a benchmark agent.", "benchmark") }, { surfaceOp: "append" });
  session.append("request/context", { provider: "fixture", model: "fixture-model", contextWindow });
  return { ctx, adapter, session };
}

export function appendUserText(session: ReturnType<Context["sessions"]["create"]>, text: string) {
  return session.append("user/message", createUserMessage({ content: [{ type: "text", text }], source: { kind: "user" } }), {
    surfaceOp: "append",
  });
}
