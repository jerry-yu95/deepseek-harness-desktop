export interface TokenBuckets {
    uncachedInputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
}
export type ObservabilityPeriod = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom';
export interface ObservabilityQuery {
    period: ObservabilityPeriod;
    now?: string;
    from?: string;
    to?: string;
}
interface TokenEvent extends TokenBuckets {
    id: string;
    timestamp: string;
    kind: 'tokens';
    sessionId: string;
    modelKey: string;
    project: string;
    estimated: boolean;
}
export interface StageEvent {
    id: string;
    timestamp: string;
    kind: 'stage';
    runId: string;
    stage: string;
    status: 'running' | 'complete' | 'failed';
    durationMs?: number;
    summary?: string;
}
export interface CacheEvent {
    id: string;
    timestamp: string;
    kind: 'cache';
    runId: string;
    namespace: string;
    hit: boolean;
    savedMs?: number;
    savedTokens?: number;
}
export type RuntimeEvent = TokenEvent | StageEvent | CacheEvent;
export interface ObservabilitySummary {
    period: ObservabilityPeriod;
    tokens: TokenBuckets & {
        totalTokens: number;
    };
    models: Array<TokenBuckets & {
        modelKey: string;
        totalTokens: number;
        calls: number;
    }>;
    daily: Array<{
        date: string;
        totalTokens: number;
    }>;
    estimatedEvents: number;
    traces: Array<Omit<StageEvent, 'kind' | 'id'>>;
    cache: {
        hits: number;
        misses: number;
        hitRate?: number;
        savedMs: number;
        savedTokens: number;
    };
}
export declare function recordTokenSnapshot(input: {
    cwd: string;
    sessionId: string;
    modelKey: string;
    project: string;
    timestamp: string;
    estimated: boolean;
    usage: TokenBuckets;
}): Promise<void>;
export declare function recordRuntimeEvent(cwd: string, event: StageEvent | CacheEvent): Promise<void>;
export declare function aggregateObservability(cwd: string, query: ObservabilityQuery): Promise<ObservabilitySummary>;
export {};
//# sourceMappingURL=observability.d.ts.map