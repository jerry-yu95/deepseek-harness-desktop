import { type BenchmarkReport } from "./schema.ts";
export declare function sha256(value: string | Uint8Array): string;
export declare function redactReportText(value: string): string;
export declare function assertSafeReport(report: BenchmarkReport): BenchmarkReport;
export interface DeterministicBaseline {
    schemaVersion: 1;
    tier: "deterministic";
    officialPackages: Record<string, string>;
    adapter: {
        provider: string;
        model: string;
    };
    fixtures: Record<string, string>;
    contextWindows: Record<string, number>;
    gates: {
        criticalRecall: number;
        exactLiteralRecall: number;
        latestStateAccuracy: number;
        staleLeakage: number;
        toolIntegrity: number;
        sectionCompleteness: number;
    };
}
export declare function assertBaselineComparable(reports: readonly BenchmarkReport[], baseline: DeterministicBaseline): void;
export declare function formatBenchmarkReportMarkdown(report: BenchmarkReport): string;
export declare function writeBenchmarkReport(report: BenchmarkReport, outputDirectory: string): Promise<{
    jsonPath: string;
    markdownPath: string;
}>;
export declare function readFixtureBytes(path: string): Promise<{
    bytes: Buffer;
    hash: string;
}>;
//# sourceMappingURL=report.d.ts.map