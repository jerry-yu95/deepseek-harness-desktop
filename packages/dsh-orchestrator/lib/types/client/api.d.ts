import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { OrchestrationMode } from '../core.ts';
import { type HarnessDashboardStatus } from '../wire.ts';
import type { ModelHealthSummary } from '../model-health.ts';
import type { ObservabilityPeriod } from '../observability.ts';
import type { ContextQualityRun, ContextQualityScale, ContextQualitySummary } from '../context-quality.ts';
import type { ModelConnectionResult } from '../model-connection.ts';
export declare class HarnessClientApi {
    private readonly connection;
    constructor(connection: ConnectionHandle);
    status(sessionId: string, signal?: AbortSignal, period?: ObservabilityPeriod): Promise<HarnessDashboardStatus>;
    mode(sessionId: string, mode: OrchestrationMode, objective?: string): Promise<HarnessDashboardStatus>;
    probe(sessionId: string, bypassCache?: boolean): Promise<{
        cached: boolean;
        summary: ModelHealthSummary;
    }>;
    testConnection(sessionId: string, signal?: AbortSignal): Promise<ModelConnectionResult>;
    contextQuality(sessionId: string, scale: ContextQualityScale, confirmed: boolean): Promise<{
        run: ContextQualityRun;
        summary: ContextQualitySummary;
    }>;
    feedback(sessionId: string, verdict: 'normal' | 'degraded'): Promise<HarnessDashboardStatus>;
    private call;
}
//# sourceMappingURL=api.d.ts.map