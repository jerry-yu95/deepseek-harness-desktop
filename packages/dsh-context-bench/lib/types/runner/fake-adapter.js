import { LlmAdapter } from "@deepseek-ai/dsh-llm";
export class DeterministicCompactionAdapter extends LlmAdapter {
    summary;
    contextWindow;
    blockUntilAbort;
    calls = [];
    callIndex = 0;
    abortSeen = { value: false };
    constructor(summary, contextWindow = 8_192, blockUntilAbort = false) {
        super();
        this.summary = summary;
        this.contextWindow = contextWindow;
        this.blockUntilAbort = blockUntilAbort;
    }
    providerInfo(provider) { return { id: provider, name: "Deterministic benchmark" }; }
    async listModels(provider) { return [{ provider, id: "fixture-model", name: "Fixture model", context: { contextWindow: this.contextWindow } }]; }
    async resolveModel(provider, model) {
        return { provider, id: model, name: model, context: { contextWindow: this.contextWindow } };
    }
    async *stream(options) {
        this.calls.push(options);
        if (options.signal?.aborted)
            throw options.signal.reason;
        if (this.blockUntilAbort) {
            await new Promise((_, reject) => {
                const abort = () => { this.abortSeen.value = true; reject(options.signal?.reason ?? new Error("aborted")); };
                options.signal?.addEventListener("abort", abort, { once: true });
            });
        }
        const summary = typeof this.summary === "string" ? this.summary : this.summary[Math.min(this.callIndex, this.summary.length - 1)];
        this.callIndex += 1;
        yield { type: "block-start", index: 0, blockType: "text" };
        yield { type: "text-delta", index: 0, text: summary };
        yield { type: "block-end", index: 0, block: { type: "text", text: summary } };
        yield { type: "usage", usage: { inputTokens: 1_200, outputTokens: 120, cacheReadTokens: 800 } };
        yield { type: "finish", reason: { kind: "stop" } };
    }
}
