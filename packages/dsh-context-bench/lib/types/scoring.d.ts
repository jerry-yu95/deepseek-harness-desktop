import type { BenchmarkFixture, BenchmarkMetrics } from "./schema.ts";
export declare const OFFICIAL_CHECKPOINT_SECTIONS: readonly ["Primary Request and Intent", "Key Technical Concepts", "Files and Code", "Errors and Fixes", "Pending Jobs", "Current Work", "Next Step", "Critical Context"];
export interface ScoreResult {
    metrics: BenchmarkMetrics;
    hardFailure: boolean;
    missingCriticalFacts: string[];
    staleLeaks: string[];
    fabricatedClaims: string[];
}
export declare function scoreCheckpoint(fixture: BenchmarkFixture, checkpoint: string, retainedTail?: string): ScoreResult;
//# sourceMappingURL=scoring.d.ts.map