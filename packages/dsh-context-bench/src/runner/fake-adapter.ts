import { LlmAdapter, type GenerateOptions, type LlmProviderInfo, type LlmResolvedModelInfo, type StreamChunk } from "@deepseek-ai/dsh-llm";

export class DeterministicCompactionAdapter extends LlmAdapter {
  readonly calls: GenerateOptions[] = [];
  private callIndex = 0;
  readonly abortSeen = { value: false };
  constructor(readonly summary: string | readonly string[], readonly contextWindow = 8_192, readonly blockUntilAbort = false) { super(); }
  providerInfo(provider: string): LlmProviderInfo { return { id: provider, name: "Deterministic benchmark" }; }
  async listModels(provider: string): Promise<readonly LlmResolvedModelInfo[]> { return [{ provider, id: "fixture-model", name: "Fixture model", context: { contextWindow: this.contextWindow } }]; }
  async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: model, context: { contextWindow: this.contextWindow } };
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options);
    if (options.signal?.aborted) throw options.signal.reason;
    if (this.blockUntilAbort) {
      await new Promise<never>((_, reject) => {
        const abort = () => { this.abortSeen.value = true; reject(options.signal?.reason ?? new Error("aborted")); };
        options.signal?.addEventListener("abort", abort, { once: true });
      });
    }
    const summary = typeof this.summary === "string" ? this.summary : this.summary[Math.min(this.callIndex, this.summary.length - 1)]!;
    this.callIndex += 1;
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: summary };
    yield { type: "block-end", index: 0, block: { type: "text", text: summary } };
    yield { type: "usage", usage: { inputTokens: 1_200, outputTokens: 120, cacheReadTokens: 800 } };
    yield { type: "finish", reason: { kind: "stop" } };
  }
}
