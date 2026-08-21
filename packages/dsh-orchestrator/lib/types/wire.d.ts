import type { HarnessSnapshot, OrchestrationMode } from './core.ts';
import type { ModelHealthSummary } from './model-health.ts';
export declare const HARNESS_RPC_CHANNEL = "/harness-orchestrator";
export interface HarnessDashboardStatus {
    initialized: boolean;
    modelKey: string;
    harness?: HarnessSnapshot;
    health: ModelHealthSummary;
}
export interface HarnessStatusRequest {
    sessionId: string;
}
export interface HarnessModeRequest {
    sessionId: string;
    mode: OrchestrationMode;
    objective?: string;
}
export interface HarnessProbeRequest {
    sessionId: string;
    bypassCache?: boolean;
}
export interface HarnessFeedbackRequest {
    sessionId: string;
    verdict: 'normal' | 'degraded';
    note?: string;
}
export type HarnessRpcValue = HarnessDashboardStatus | {
    status: HarnessDashboardStatus;
} | {
    cached: boolean;
    summary: ModelHealthSummary;
};
//# sourceMappingURL=wire.d.ts.map