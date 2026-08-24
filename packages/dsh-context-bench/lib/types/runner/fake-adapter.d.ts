import { LlmAdapter, type GenerateOptions, type LlmProviderInfo, type LlmResolvedModelInfo, type StreamChunk } from "@deepseek-ai/dsh-llm";
export declare class DeterministicCompactionAdapter extends LlmAdapter {
    readonly summary: string | readonly string[];
    readonly contextWindow: number;
    readonly blockUntilAbort: boolean;
    readonly calls: GenerateOptions[];
    private callIndex;
    readonly abortSeen: {
        value: boolean;
    };
    constructor(summary: string | readonly string[], contextWindow?: number, blockUntilAbort?: boolean);
    providerInfo(provider: string): LlmProviderInfo;
    listModels(provider: string): Promise<readonly LlmResolvedModelInfo[]>;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
//# sourceMappingURL=fake-adapter.d.ts.map