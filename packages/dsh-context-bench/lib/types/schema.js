import { z } from "zod";
export const BENCHMARK_SCHEMA_VERSION = 1;
export const MAX_FIXTURE_BYTES = 512 * 1024;
const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "must be a lowercase slug");
const contextScale = z.enum(["8K", "32K", "128K", "1M-policy"]);
const position = z.enum(["early", "middle", "late"]);
const role = z.enum(["user", "assistant", "tool"]);
const transcriptSegmentSchema = z.object({
    id: identifier,
    role,
    kind: z.enum(["fact", "correction", "constraint", "pending", "filler", "tool-call", "tool-result"]),
    position,
    content: z.string().min(1).max(64_000),
    toolCallId: identifier.optional(),
    toolName: identifier.optional(),
}).strict();
const expectedFactSchema = z.object({
    id: identifier,
    category: z.enum(["exact", "semantic", "mutable", "constraint", "pending", "tool"]),
    value: z.string().min(1).max(8_192),
    aliases: z.array(z.string().min(1).max(8_192)).max(12).default([]),
    position,
    weight: z.number().int().positive().max(100),
    critical: z.boolean(),
}).strict();
const supersededFactSchema = z.object({
    factId: identifier,
    staleValues: z.array(z.string().min(1).max(8_192)).min(1).max(12),
}).strict();
const toolPairSchema = z.object({
    id: identifier,
    toolName: identifier,
    callSegmentId: identifier,
    resultSegmentId: identifier,
    requiredEvidence: z.array(z.string().min(1).max(8_192)).min(1).max(12),
}).strict();
function addUniqueIssue(values, label, context) {
    if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", message: `${label} must be unique` });
    }
}
export const BenchmarkFixtureSchema = z.object({
    schemaVersion: z.literal(BENCHMARK_SCHEMA_VERSION),
    id: identifier,
    title: z.string().min(1).max(160),
    contextScale,
    transcript: z.array(transcriptSegmentSchema).min(1).max(2_000),
    requiredFacts: z.array(expectedFactSchema).min(1).max(200),
    supersededFacts: z.array(supersededFactSchema).max(100),
    toolPairs: z.array(toolPairSchema).max(100),
    expectedNextStep: z.string().min(1).max(8_192).optional(),
}).strict().superRefine((fixture, context) => {
    const segmentIds = fixture.transcript.map(({ id }) => id);
    const factIds = fixture.requiredFacts.map(({ id }) => id);
    const toolPairIds = fixture.toolPairs.map(({ id }) => id);
    addUniqueIssue(segmentIds, "transcript segment IDs", context);
    addUniqueIssue(factIds, "required fact IDs", context);
    addUniqueIssue(toolPairIds, "tool pair IDs", context);
    const factsById = new Map(fixture.requiredFacts.map((fact) => [fact.id, fact]));
    const segmentsById = new Map(fixture.transcript.map((segment) => [segment.id, segment]));
    for (const superseded of fixture.supersededFacts) {
        const active = factsById.get(superseded.factId);
        if (!active) {
            context.addIssue({ code: "custom", message: `superseded fact ${superseded.factId} must reference a required fact` });
            continue;
        }
        if (superseded.staleValues.includes(active.value)) {
            context.addIssue({ code: "custom", message: `superseded values for ${superseded.factId} must not include its active value` });
        }
    }
    for (const pair of fixture.toolPairs) {
        const call = segmentsById.get(pair.callSegmentId);
        const result = segmentsById.get(pair.resultSegmentId);
        if (call?.kind !== "tool-call" || result?.kind !== "tool-result") {
            context.addIssue({ code: "custom", message: `tool pair ${pair.id} must reference tool-call and tool-result segments` });
        }
        if (call?.toolCallId !== pair.id || result?.toolCallId !== pair.id) {
            context.addIssue({ code: "custom", message: `tool pair ${pair.id} must use the same toolCallId` });
        }
        if (call?.toolName !== pair.toolName || result?.toolName !== pair.toolName) {
            context.addIssue({ code: "custom", message: `tool pair ${pair.id} must use the declared tool name` });
        }
    }
});
const percentage = z.number().min(0).max(100);
export const BenchmarkMetricsSchema = z.object({
    criticalRecall: percentage,
    exactLiteralRecall: percentage,
    latestStateAccuracy: percentage,
    staleLeakage: percentage,
    constraintRecall: percentage,
    pendingWorkRecall: percentage,
    toolIntegrity: percentage,
    sectionCompleteness: percentage,
    postCompactionPressure: z.number().nonnegative(),
    compressionRatio: z.number().nonnegative(),
    multiCycleRetention: z.array(percentage).min(1),
    cacheReadRatio: z.number().min(0).max(1).optional(),
}).strict();
export const BenchmarkReportSchema = z.object({
    schemaVersion: z.literal(BENCHMARK_SCHEMA_VERSION),
    runId: identifier,
    tier: z.enum(["deterministic", "live", "full-capacity"]),
    fixtureId: identifier,
    fixtureHash: z.string().regex(/^[a-f0-9]{64}$/),
    seed: z.number().int().nonnegative(),
    packages: z.record(z.string(), z.string().min(1)),
    adapter: z.object({
        provider: z.string().min(1),
        model: z.string().min(1),
        contextWindow: z.number().int().positive(),
    }).strict(),
    pressure: z.object({ before: z.number().nonnegative(), after: z.number().nonnegative() }).strict(),
    events: z.array(z.object({
        seq: z.number().int().nonnegative(),
        type: z.string().min(1),
        success: z.boolean(),
        errorCode: z.string().min(1).optional(),
    }).strict()),
    metrics: BenchmarkMetricsSchema,
    usage: z.object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        cacheReadTokens: z.number().int().nonnegative(),
    }).strict(),
    durationMs: z.number().nonnegative(),
    errors: z.array(z.object({ code: z.string().min(1), message: z.string().min(1) }).strict()),
}).strict();
const credentialPatterns = [
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /\bsk-[A-Za-z0-9_-]{16,}\b/,
    /\bBearer\s+[A-Za-z0-9._~-]{20,}\b/i,
    /(?:api[_-]?key|token|secret)\s*[:=]\s*[A-Za-z0-9._~-]{16,}/i,
];
const homePathPatterns = [
    /\/Users\/[^/\s]+\//,
    /\b[A-Za-z]:\\Users\\[^\\\s]+\\/i,
    /\/home\/[^/\s]+\//,
];
function parseUnknown(input) {
    if (typeof input !== "string")
        return input;
    try {
        return JSON.parse(input);
    }
    catch (error) {
        throw new Error("benchmark fixture must be valid JSON", { cause: error });
    }
}
export function parseBenchmarkFixture(input) {
    const value = parseUnknown(input);
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, "utf8") > MAX_FIXTURE_BYTES) {
        throw new Error(`benchmark fixture exceeds the ${MAX_FIXTURE_BYTES}-byte maximum`);
    }
    if (credentialPatterns.some((pattern) => pattern.test(serialized))) {
        throw new Error("benchmark fixture contains a credential-shaped value");
    }
    if (homePathPatterns.some((pattern) => pattern.test(serialized))) {
        throw new Error("benchmark fixture contains an absolute user home path");
    }
    return BenchmarkFixtureSchema.parse(value);
}
