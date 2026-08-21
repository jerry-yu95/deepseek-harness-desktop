export type HarnessPhase = 'planning' | 'executing' | 'evaluating' | 'repairing' | 'complete' | 'blocked';
export type FeatureStatus = 'pending' | 'in_progress' | 'passed' | 'failed';
export type OrchestrationMode = 'standard' | 'enhanced';
export type OrchestrationStage = 'idle' | 'planning' | 'executing' | 'reviewing' | 'evaluating' | 'complete' | 'failed' | 'cancelled';
export interface HarnessRun {
    version: 2;
    objective: string;
    phase: HarnessPhase;
    createdAt: string;
    updatedAt: string;
    orchestration: {
        mode: OrchestrationMode;
        stage: OrchestrationStage;
        latestRunId?: string;
        cacheHits: number;
        cacheMisses: number;
        lastFailure?: string;
    };
}
export interface HarnessFeature {
    id: string;
    title: string;
    acceptance: string;
    status: FeatureStatus;
    evidence: string[];
}
export interface HarnessSnapshot {
    run: HarnessRun;
    features: HarnessFeature[];
    progress: string;
}
export interface OrchestrationRunRecord {
    version: 1;
    id: string;
    objective: string;
    startedAt: string;
    finishedAt?: string;
    stage: OrchestrationStage;
    cache: {
        hits: number;
        misses: number;
    };
    roles: Partial<Record<'planner' | 'reviewer' | 'evaluator', {
        cached: boolean;
        summary: string;
    }>>;
    failure?: string;
}
export interface CacheRead<T> {
    hit: boolean;
    value?: T;
}
export declare const harnessDir: (cwd: string) => string;
export declare function loadHarness(cwd: string): Promise<HarnessSnapshot | undefined>;
export declare function initHarness(cwd: string, objective: string, featureTitles?: string[]): Promise<HarnessSnapshot>;
export declare function setOrchestrationMode(cwd: string, mode: OrchestrationMode): Promise<HarnessSnapshot>;
export declare function updateOrchestration(cwd: string, update: Partial<HarnessRun['orchestration']>): Promise<HarnessSnapshot>;
export declare function createRunRecord(objective: string): OrchestrationRunRecord;
export declare function writeRunRecord(cwd: string, record: OrchestrationRunRecord): Promise<void>;
export declare function stableDigest(value: unknown): string;
export declare function cacheKey(namespace: string, inputs: unknown): string;
export declare function readCache<T>(cwd: string, namespace: string, key: string, contract: string, now?: number): Promise<CacheRead<T>>;
export declare function writeCache<T>(cwd: string, namespace: string, key: string, contract: string, value: T, ttlMs?: number): Promise<void>;
export declare function cached<T>(cwd: string, namespace: string, key: string, contract: string, producer: () => Promise<T>, ttlMs?: number): Promise<{
    value: T;
    cached: boolean;
}>;
export declare function transitionHarness(cwd: string, phase: HarnessPhase): Promise<HarnessSnapshot>;
export declare function updateFeature(cwd: string, id: string, status: FeatureStatus, evidence?: string): Promise<HarnessSnapshot>;
export declare function replaceFeatures(cwd: string, features: Array<Pick<HarnessFeature, 'id' | 'title' | 'acceptance'>>): Promise<HarnessSnapshot>;
export declare function appendProgress(cwd: string, note: string): Promise<HarnessSnapshot>;
export declare function redactSecrets(text: string): string;
export interface TrajectoryItem {
    kind: 'user' | 'assistant' | 'tool' | 'thinking' | 'credential';
    text?: string;
    name?: string;
    ok?: boolean;
}
export declare function sanitizeTrajectory(items: TrajectoryItem[], maxChars?: number): string;
export declare function retrieveMemory(query: string, memory: string, maxSnippets?: number, maxChars?: number): string[];
export declare function harnessContext(cwd: string): Promise<string>;
export declare function harnessContextSync(cwd: string): string;
//# sourceMappingURL=core.d.ts.map