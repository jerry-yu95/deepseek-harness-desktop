import type { HarnessDashboardStatus } from '../wire.ts';
import type { HarnessClientApi } from './api.ts';
export interface HarnessStatusState {
    status?: HarnessDashboardStatus;
    loading: boolean;
    busy: boolean;
    error?: string;
    refresh: () => Promise<void>;
    setMode: (mode: 'standard' | 'enhanced', objective?: string) => Promise<void>;
    probe: (bypassCache?: boolean) => Promise<void>;
    feedback: (verdict: 'normal' | 'degraded') => Promise<void>;
}
export declare function useHarnessStatus(api: HarnessClientApi, sessionId: string): HarnessStatusState;
//# sourceMappingURL=useHarnessStatus.d.ts.map