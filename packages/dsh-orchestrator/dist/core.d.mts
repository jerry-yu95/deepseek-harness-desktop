//#region src/core.d.ts
type HarnessPhase = 'planning' | 'executing' | 'evaluating' | 'repairing' | 'complete' | 'blocked';
type FeatureStatus = 'pending' | 'in_progress' | 'passed' | 'failed';
interface HarnessRun {
  version: 1;
  objective: string;
  phase: HarnessPhase;
  createdAt: string;
  updatedAt: string;
}
interface HarnessFeature {
  id: string;
  title: string;
  acceptance: string;
  status: FeatureStatus;
  evidence: string[];
}
interface HarnessSnapshot {
  run: HarnessRun;
  features: HarnessFeature[];
  progress: string;
}
declare const harnessDir: (cwd: string) => string;
declare function loadHarness(cwd: string): Promise<HarnessSnapshot | undefined>;
declare function initHarness(cwd: string, objective: string, featureTitles?: string[]): Promise<HarnessSnapshot>;
declare function transitionHarness(cwd: string, phase: HarnessPhase): Promise<HarnessSnapshot>;
declare function updateFeature(cwd: string, id: string, status: FeatureStatus, evidence?: string): Promise<HarnessSnapshot>;
declare function appendProgress(cwd: string, note: string): Promise<HarnessSnapshot>;
declare function redactSecrets(text: string): string;
interface TrajectoryItem {
  kind: 'user' | 'assistant' | 'tool' | 'thinking' | 'credential';
  text?: string;
  name?: string;
  ok?: boolean;
}
declare function sanitizeTrajectory(items: TrajectoryItem[], maxChars?: number): string;
declare function retrieveMemory(query: string, memory: string, maxSnippets?: number, maxChars?: number): string[];
declare function harnessContext(cwd: string): Promise<string>;
declare function harnessContextSync(cwd: string): string;
//#endregion
export { FeatureStatus, HarnessFeature, HarnessPhase, HarnessRun, HarnessSnapshot, TrajectoryItem, appendProgress, harnessContext, harnessContextSync, harnessDir, initHarness, loadHarness, redactSecrets, retrieveMemory, sanitizeTrajectory, transitionHarness, updateFeature };
//# sourceMappingURL=core.d.mts.map