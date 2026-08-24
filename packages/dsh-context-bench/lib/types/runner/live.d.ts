import { CONTEXT_SCALE_TOKENS } from "../corpus.ts";
export declare const LIVE_CONFIRMATION: "RUN_LIVE_CONTEXT_BENCHMARK";
export declare const DEFAULT_LIVE_SCALE: "32K";
export declare const DEFAULT_LIVE_SEEDS: 3;
export declare const MAX_LIVE_OUTPUT_TOKENS: 16384;
export type LiveContextScale = keyof typeof CONTEXT_SCALE_TOKENS;
export interface LiveBenchmarkOptions {
    live: boolean;
    provider: string;
    model: string;
    scale?: LiveContextScale;
    maxInputTokens: number;
    maxOutputTokens: number;
    confirmation?: string;
    allowFullCapacity?: boolean;
    seeds?: readonly number[];
}
export interface LiveProbeResult {
    criticalRecall: number;
    exactLiteralRecall: number;
    latestStateAccuracy: number;
    hardFailure: boolean;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
}
export interface LiveSample extends LiveProbeResult {
    seed: number;
}
export interface LiveBenchmarkResult {
    tier: "live" | "full-capacity";
    provider: string;
    model: string;
    scale: LiveContextScale;
    requestedInputTokens: number;
    resolvedContextWindow: number;
    samples: readonly LiveSample[];
    summary: {
        meanCriticalRecall: number;
        minCriticalRecall: number;
        stdCriticalRecall: number;
        hardFailureCount: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
    };
}
export interface LiveBenchmarkDependencies {
    /** Host integration must resolve this through the official model/credential seam. */
    resolveContextWindow: (provider: string, model: string) => Promise<number>;
    /** Host integration owns the actual official LLM adapter invocation. */
    runProbe: (input: {
        provider: string;
        model: string;
        scale: LiveContextScale;
        inputTokens: number;
        maxOutputTokens: number;
        seed: number;
    }) => Promise<LiveProbeResult>;
}
export declare function validateLiveOptions(options: LiveBenchmarkOptions): {
    scale: LiveContextScale;
    requestedInputTokens: number;
    seeds: readonly number[];
    tier: "live" | "full-capacity";
};
export declare function runLiveBenchmark(options: LiveBenchmarkOptions, dependencies: LiveBenchmarkDependencies): Promise<LiveBenchmarkResult>;
//# sourceMappingURL=live.d.ts.map