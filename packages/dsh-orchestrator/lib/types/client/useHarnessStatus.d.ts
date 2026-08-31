import type { HarnessDashboardStatus } from '../wire.ts';
import type { ObservabilityPeriod } from '../observability.ts';
import type { ContextQualityScale } from '../context-quality.ts';
import type { ModelConnectionResult } from '../model-connection.ts';
import type { HarnessClientApi } from './api.ts';
export interface HarnessStatusState {
    status?: HarnessDashboardStatus;
    loading: boolean;
    busy: boolean;
    error?: string;
    connectionResult?: ModelConnectionResult;
    period: ObservabilityPeriod;
    refresh: () => Promise<void>;
    setMode: (mode: 'standard' | 'enhanced' | 'adaptive', objective?: string) => Promise<void>;
    probe: (bypassCache?: boolean) => Promise<void>;
    testConnection: () => Promise<void>;
    runContextQuality: (scale: ContextQualityScale) => Promise<void>;
    feedback: (verdict: 'normal' | 'degraded') => Promise<void>;
    setPeriod: (period: ObservabilityPeriod) => void;
}
export declare function useHarnessStatus(api: HarnessClientApi, sessionId: string): HarnessStatusState;
//# sourceMappingURL=useHarnessStatus.d.ts.map