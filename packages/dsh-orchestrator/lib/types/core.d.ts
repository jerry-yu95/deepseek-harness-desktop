export type HarnessPhase = 'planning' | 'executing' | 'evaluating' | 'repairing' | 'complete' | 'blocked';
export type FeatureStatus = 'pending' | 'in_progress' | 'passed' | 'failed';
export interface HarnessRun {
    version: 1;
    objective: string;
    phase: HarnessPhase;
    createdAt: string;
    updatedAt: string;
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
export declare const harnessDir: (cwd: string) => string;
export declare function loadHarness(cwd: string): Promise<HarnessSnapshot | undefined>;
export declare function initHarness(cwd: string, objective: string, featureTitles?: string[]): Promise<HarnessSnapshot>;
export declare function transitionHarness(cwd: string, phase: HarnessPhase): Promise<HarnessSnapshot>;
export declare function updateFeature(cwd: string, id: string, status: FeatureStatus, evidence?: string): Promise<HarnessSnapshot>;
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