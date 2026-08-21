import type { Agent } from '@deepseek-ai/dsh-agent';
import { type LlmRuntime } from '@deepseek-ai/dsh-llm';
import type { WorkflowEngine } from '@deepseek-ai/dsh-workflow';
export type HealthDimension = 'instruction' | 'context' | 'reasoning' | 'structuredOutput' | 'toolPlanning' | 'completeness';
export type HealthStatus = 'healthy' | 'volatile' | 'degraded' | 'insufficient-data';
export interface HealthSignal {
    timestamp: string;
    modelKey: string;
    dimension: HealthDimension;
    score: number;
    source: 'passive' | 'probe';
    anomaly?: string;
}
export interface HealthFeedback {
    timestamp: string;
    modelKey: string;
    verdict: 'normal' | 'degraded';
    note?: string;
}
interface HealthStore {
    version: 1;
    signals: HealthSignal[];
    feedback: HealthFeedback[];
}
export interface ModelHealthSummary {
    modelKey: string;
    status: HealthStatus;
    score: number;
    baselineScore?: number;
    delta?: number;
    sampleCount: number;
    dimensions: Record<HealthDimension, {
        score?: number;
        baseline?: number;
        delta?: number;
        samples: number;
    }>;
    anomalies: Array<{
        timestamp: string;
        dimension: HealthDimension;
        summary: string;
    }>;
    trend: Array<{
        timestamp: string;
        score: number;
        dimension: HealthDimension;
        source: HealthSignal['source'];
    }>;
    feedback: {
        normal: number;
        degraded: number;
    };
}
export declare function loadHealthStore(cwd: string): Promise<HealthStore>;
export declare function recordHealthSignals(cwd: string, signals: HealthSignal[]): Promise<ModelHealthSummary>;
export declare function recordHealthFeedback(cwd: string, feedback: HealthFeedback): Promise<ModelHealthSummary>;
export declare function getModelHealth(cwd: string, modelKey: string): Promise<ModelHealthSummary>;
export declare function assessModelHealth(modelKey: string, allSignals: HealthSignal[], allFeedback?: HealthFeedback[]): ModelHealthSummary;
export declare function runModelHealthProbe(input: {
    cwd: string;
    modelKey: string;
    parent: Agent;
    signal: AbortSignal;
    workflowEngine?: WorkflowEngine;
    llm?: LlmRuntime;
    bypassCache?: boolean;
}): Promise<{
    cached: boolean;
    summary: ModelHealthSummary;
}>;
export {};
//# sourceMappingURL=model-health.d.ts.map