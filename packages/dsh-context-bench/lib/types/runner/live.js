import { CONTEXT_SCALE_TOKENS } from "../corpus.js";
export const LIVE_CONFIRMATION = "RUN_LIVE_CONTEXT_BENCHMARK";
export const DEFAULT_LIVE_SCALE = "32K";
export const DEFAULT_LIVE_SEEDS = 3;
export const MAX_LIVE_OUTPUT_TOKENS = 16_384;
const SECRET_FIELD = /(?:api[-_]?key|access[-_]?token|secret|password|credential)/i;
function assertNoSecretFields(value, path = "options") {
    if (!value || typeof value !== "object")
        return;
    for (const [key, child] of Object.entries(value)) {
        const nextPath = `${path}.${key}`;
        if (SECRET_FIELD.test(key)) {
            throw new Error(`live benchmark refuses secret-bearing option: ${nextPath}`);
        }
        assertNoSecretFields(child, nextPath);
    }
}
function assertPositiveInteger(value, label) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${label} must be a positive integer`);
    }
}
function normalizeSeeds(seeds) {
    const normalized = seeds ?? [0, 1, 2];
    if (normalized.length < DEFAULT_LIVE_SEEDS) {
        throw new Error(`live benchmark requires at least ${DEFAULT_LIVE_SEEDS} seeds`);
    }
    if (normalized.some((seed) => !Number.isInteger(seed) || seed < 0)) {
        throw new Error("live benchmark seeds must be non-negative integers");
    }
    if (new Set(normalized).size !== normalized.length) {
        throw new Error("live benchmark seeds must be unique");
    }
    return normalized;
}
export function validateLiveOptions(options) {
    assertNoSecretFields(options);
    if (options.live !== true) {
        throw new Error("live benchmark is disabled; pass --live explicitly");
    }
    if (!options.provider.trim() || !options.model.trim()) {
        throw new Error("live benchmark requires both provider and model");
    }
    assertPositiveInteger(options.maxInputTokens, "maxInputTokens");
    assertPositiveInteger(options.maxOutputTokens, "maxOutputTokens");
    if (options.maxOutputTokens > MAX_LIVE_OUTPUT_TOKENS) {
        throw new Error(`maxOutputTokens exceeds the ${MAX_LIVE_OUTPUT_TOKENS}-token live budget`);
    }
    if (options.confirmation !== LIVE_CONFIRMATION) {
        throw new Error(`live benchmark requires confirmation ${LIVE_CONFIRMATION}`);
    }
    const scale = options.scale ?? DEFAULT_LIVE_SCALE;
    const requestedInputTokens = CONTEXT_SCALE_TOKENS[scale];
    if (options.maxInputTokens < requestedInputTokens) {
        throw new Error(`maxInputTokens must be at least ${requestedInputTokens} for ${scale}`);
    }
    const fullCapacity = requestedInputTokens > CONTEXT_SCALE_TOKENS["128K"];
    if (fullCapacity && options.allowFullCapacity !== true) {
        throw new Error("requests above 128K require --allow-full-capacity");
    }
    return {
        scale,
        requestedInputTokens,
        seeds: normalizeSeeds(options.seeds),
        tier: fullCapacity ? "full-capacity" : "live",
    };
}
function standardDeviation(values, mean) {
    if (values.length === 0)
        return 0;
    return Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length);
}
export async function runLiveBenchmark(options, dependencies) {
    const validated = validateLiveOptions(options);
    const resolvedContextWindow = await dependencies.resolveContextWindow(options.provider, options.model);
    assertPositiveInteger(resolvedContextWindow, "resolved context window");
    if (resolvedContextWindow < validated.requestedInputTokens) {
        throw new Error(`model context window ${resolvedContextWindow} is smaller than the requested ${validated.requestedInputTokens}-token scale`);
    }
    const samples = [];
    for (const seed of validated.seeds) {
        const result = await dependencies.runProbe({
            provider: options.provider,
            model: options.model,
            scale: validated.scale,
            inputTokens: validated.requestedInputTokens,
            maxOutputTokens: options.maxOutputTokens,
            seed,
        });
        samples.push({ ...result, seed });
    }
    const criticalRecalls = samples.map(({ criticalRecall }) => criticalRecall);
    const meanCriticalRecall = criticalRecalls.reduce((sum, value) => sum + value, 0) / criticalRecalls.length;
    return {
        tier: validated.tier,
        provider: options.provider,
        model: options.model,
        scale: validated.scale,
        requestedInputTokens: validated.requestedInputTokens,
        resolvedContextWindow,
        samples,
        summary: {
            meanCriticalRecall,
            minCriticalRecall: Math.min(...criticalRecalls),
            stdCriticalRecall: standardDeviation(criticalRecalls, meanCriticalRecall),
            hardFailureCount: samples.filter(({ hardFailure }) => hardFailure).length,
            inputTokens: samples.reduce((sum, sample) => sum + sample.inputTokens, 0),
            outputTokens: samples.reduce((sum, sample) => sum + sample.outputTokens, 0),
            cacheReadTokens: samples.reduce((sum, sample) => sum + (sample.cacheReadTokens ?? 0), 0),
        },
    };
}
