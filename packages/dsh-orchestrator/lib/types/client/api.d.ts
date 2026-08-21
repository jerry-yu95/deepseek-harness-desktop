import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { OrchestrationMode } from '../core.ts';
import { type HarnessDashboardStatus } from '../wire.ts';
import type { ModelHealthSummary } from '../model-health.ts';
export declare class HarnessClientApi {
    private readonly connection;
    constructor(connection: ConnectionHandle);
    status(sessionId: string, signal?: AbortSignal): Promise<HarnessDashboardStatus>;
    mode(sessionId: string, mode: OrchestrationMode, objective?: string): Promise<HarnessDashboardStatus>;
    probe(sessionId: string, bypassCache?: boolean): Promise<{
        cached: boolean;
        summary: ModelHealthSummary;
    }>;
    feedback(sessionId: string, verdict: 'normal' | 'degraded'): Promise<HarnessDashboardStatus>;
    private call;
}
//# sourceMappingURL=api.d.ts.map