import { type LlmRuntime } from '@deepseek-ai/dsh-llm';
import type { TokenMeter } from '@deepseek-ai/dsh-token-meter';
import { recordContextQualityRun, type ContextQualityScale, type ContextQualitySummary } from './context-quality.ts';
export interface ContextQualityProbeInput {
    cwd: string;
    modelKey: string;
    provider: string;
    model: string;
    scale: ContextQualityScale;
    confirmed: boolean;
    llm: LlmRuntime;
    tokenMeter: TokenMeter;
    signal: AbortSignal;
}
interface ProbeAnswer {
    criticalFacts: string[];
    exactLiteral: string;
    latestState: string;
    constraints: string[];
    pendingWork: string[];
    toolPairs: string[];
}
export interface ContextQualityExpectation extends ProbeAnswer {
    staleState: string;
}
export declare function contextQualityExpectations(seed: number): ContextQualityExpectation;
export declare function runContextQualityProbe(input: ContextQualityProbeInput): Promise<{
    run: Awaited<ReturnType<typeof recordContextQualityRun>>;
    summary: ContextQualitySummary;
}>;
export {};
//# sourceMappingURL=context-quality-probe.d.ts.map