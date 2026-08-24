import { z } from "zod";
export declare const BENCHMARK_SCHEMA_VERSION: 1;
export declare const MAX_FIXTURE_BYTES: number;
export declare const BenchmarkFixtureSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    id: z.ZodString;
    title: z.ZodString;
    contextScale: z.ZodEnum<{
        "8K": "8K";
        "32K": "32K";
        "128K": "128K";
        "1M-policy": "1M-policy";
    }>;
    transcript: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        role: z.ZodEnum<{
            user: "user";
            assistant: "assistant";
            tool: "tool";
        }>;
        kind: z.ZodEnum<{
            fact: "fact";
            correction: "correction";
            constraint: "constraint";
            pending: "pending";
            filler: "filler";
            "tool-call": "tool-call";
            "tool-result": "tool-result";
        }>;
        position: z.ZodEnum<{
            early: "early";
            middle: "middle";
            late: "late";
        }>;
        content: z.ZodString;
        toolCallId: z.ZodOptional<z.ZodString>;
        toolName: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    requiredFacts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        category: z.ZodEnum<{
            tool: "tool";
            constraint: "constraint";
            pending: "pending";
            exact: "exact";
            semantic: "semantic";
            mutable: "mutable";
        }>;
        value: z.ZodString;
        aliases: z.ZodDefault<z.ZodArray<z.ZodString>>;
        position: z.ZodEnum<{
            early: "early";
            middle: "middle";
            late: "late";
        }>;
        weight: z.ZodNumber;
        critical: z.ZodBoolean;
    }, z.core.$strict>>;
    supersededFacts: z.ZodArray<z.ZodObject<{
        factId: z.ZodString;
        staleValues: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    toolPairs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        toolName: z.ZodString;
        callSegmentId: z.ZodString;
        resultSegmentId: z.ZodString;
        requiredEvidence: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    expectedNextStep: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const BenchmarkMetricsSchema: z.ZodObject<{
    criticalRecall: z.ZodNumber;
    exactLiteralRecall: z.ZodNumber;
    latestStateAccuracy: z.ZodNumber;
    staleLeakage: z.ZodNumber;
    constraintRecall: z.ZodNumber;
    pendingWorkRecall: z.ZodNumber;
    toolIntegrity: z.ZodNumber;
    sectionCompleteness: z.ZodNumber;
    postCompactionPressure: z.ZodNumber;
    compressionRatio: z.ZodNumber;
    multiCycleRetention: z.ZodArray<z.ZodNumber>;
    cacheReadRatio: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const BenchmarkReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    runId: z.ZodString;
    tier: z.ZodEnum<{
        deterministic: "deterministic";
        live: "live";
        "full-capacity": "full-capacity";
    }>;
    fixtureId: z.ZodString;
    fixtureHash: z.ZodString;
    seed: z.ZodNumber;
    packages: z.ZodRecord<z.ZodString, z.ZodString>;
    adapter: z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        contextWindow: z.ZodNumber;
    }, z.core.$strict>;
    pressure: z.ZodObject<{
        before: z.ZodNumber;
        after: z.ZodNumber;
    }, z.core.$strict>;
    events: z.ZodArray<z.ZodObject<{
        seq: z.ZodNumber;
        type: z.ZodString;
        success: z.ZodBoolean;
        errorCode: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    metrics: z.ZodObject<{
        criticalRecall: z.ZodNumber;
        exactLiteralRecall: z.ZodNumber;
        latestStateAccuracy: z.ZodNumber;
        staleLeakage: z.ZodNumber;
        constraintRecall: z.ZodNumber;
        pendingWorkRecall: z.ZodNumber;
        toolIntegrity: z.ZodNumber;
        sectionCompleteness: z.ZodNumber;
        postCompactionPressure: z.ZodNumber;
        compressionRatio: z.ZodNumber;
        multiCycleRetention: z.ZodArray<z.ZodNumber>;
        cacheReadRatio: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
    usage: z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadTokens: z.ZodNumber;
    }, z.core.$strict>;
    durationMs: z.ZodNumber;
    errors: z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare function parseBenchmarkFixture(input: unknown): BenchmarkFixture;
export type BenchmarkFixture = z.infer<typeof BenchmarkFixtureSchema>;
export type BenchmarkReport = z.infer<typeof BenchmarkReportSchema>;
export type BenchmarkMetrics = z.infer<typeof BenchmarkMetricsSchema>;
//# sourceMappingURL=schema.d.ts.map