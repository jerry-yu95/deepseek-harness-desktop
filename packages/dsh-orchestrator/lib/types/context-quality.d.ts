export type ContextQualityScale = '32K' | '128K';
export type ContextQualityStatus = 'pass' | 'fail';
export interface ContextQualityMetrics {
    criticalRecall: number;
    exactLiteralRecall: number;
    latestStateAccuracy: number;
    staleLeakage: number;
    constraintRecall: number;
    pendingWorkRecall: number;
    toolIntegrity: number;
    sectionCompleteness: number;
}
export interface ContextQualityUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
}
export interface ContextQualityRunInput {
    timestamp: string;
    modelKey: string;
    scale: ContextQualityScale;
    requestedInputTokens: number;
    resolvedContextWindow: number;
    sampleCount: number;
    status: ContextQualityStatus;
    metrics: ContextQualityMetrics;
    usage: ContextQualityUsage;
    durationMs: number;
    hardFailureCount: number;
}
export interface ContextQualityRun extends ContextQualityRunInput {
    id: string;
}
export interface ContextQualityHistory {
    version: 1;
    runs: ContextQualityRun[];
}
export interface ContextQualitySummary {
    totalRuns: number;
    passedRuns: number;
    passRate?: number;
    latest?: ContextQualityRun;
    trend: Array<{
        timestamp: string;
        score: number;
        status: ContextQualityStatus;
    }>;
}
export declare function loadContextQualityHistory(cwd: string): Promise<ContextQualityHistory>;
export declare function recordContextQualityRun(cwd: string, input: ContextQualityRunInput): Promise<ContextQualityRun>;
export declare function aggregateContextQuality(cwd: string, filter?: {
    modelKey?: string;
    scale?: ContextQualityScale;
}): Promise<ContextQualitySummary>;
export declare function contextQualityScore(metrics: ContextQualityMetrics): number;
//# sourceMappingURL=context-quality.d.ts.map