import type { BenchmarkFixture } from "./schema.ts";
export declare const CONTEXT_SCALE_TOKENS: {
    readonly "8K": 8192;
    readonly "32K": 32768;
    readonly "128K": 131072;
    readonly "1M-policy": 1000000;
};
export type ContextScale = keyof typeof CONTEXT_SCALE_TOKENS;
export interface CorpusMessage {
    id: string;
    role: "user" | "assistant" | "tool";
    kind: string;
    content: string;
    sourceSegmentId?: string;
    estimatedTokens: number;
}
export interface SyntheticCorpus {
    fixtureId: string;
    seed: number;
    scale: ContextScale;
    targetTokenBudget: number;
    estimatedMaterializedTokens: number;
    policyOnly: boolean;
    placements: Record<string, number>;
    messages: CorpusMessage[];
}
export declare function buildSyntheticCorpus(fixture: BenchmarkFixture, options: {
    seed: number;
    scale?: ContextScale;
}): SyntheticCorpus;
//# sourceMappingURL=corpus.d.ts.map