import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { harnessDir } from "./core.js";
const MAX_RUNS = 120;
const PERCENTAGE_METRICS = [
    'criticalRecall', 'exactLiteralRecall', 'latestStateAccuracy', 'staleLeakage',
    'constraintRecall', 'pendingWorkRecall', 'toolIntegrity', 'sectionCompleteness',
];
const SENSITIVE_TEXT = /(?:api[_-]?key|access[_-]?token|secret|password|credential)\s*[:=]?\s*[^\s,;]*/i;
const CREDENTIAL_VALUE = /(?:\bsk-[a-z0-9_-]{12,}\b|\bgh[pousr]_[a-z0-9]{20,}\b|\bBearer\s+[a-z0-9._~+\/-]{12,})/i;
const LOCAL_HOME_PATH = /(?:\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\)/;
function historyPath(cwd) { return join(harnessDir(cwd), 'context-quality.json'); }
function assertFiniteNonNegative(value, label, integer = false) {
    if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
        throw new Error(`${label} must be a non-negative ${integer ? 'integer' : 'number'}`);
    }
}
function validateRunInput(input) {
    if (Number.isNaN(Date.parse(input.timestamp)))
        throw new Error('context quality timestamp must be an ISO date');
    if (input.modelKey.trim() === '')
        throw new Error('context quality modelKey is required');
    if (SENSITIVE_TEXT.test(input.modelKey) || CREDENTIAL_VALUE.test(input.modelKey))
        throw new Error('context quality modelKey contains sensitive text');
    if (LOCAL_HOME_PATH.test(input.modelKey))
        throw new Error('context quality modelKey contains a local path');
    if (input.scale !== '32K' && input.scale !== '128K')
        throw new Error('context quality scale must be 32K or 128K');
    assertFiniteNonNegative(input.requestedInputTokens, 'requestedInputTokens', true);
    assertFiniteNonNegative(input.resolvedContextWindow, 'resolvedContextWindow', true);
    assertFiniteNonNegative(input.sampleCount, 'sampleCount', true);
    assertFiniteNonNegative(input.durationMs, 'durationMs');
    assertFiniteNonNegative(input.hardFailureCount, 'hardFailureCount', true);
    for (const metric of PERCENTAGE_METRICS) {
        const value = input.metrics[metric];
        if (!Number.isFinite(value) || value < 0 || value > 100)
            throw new Error(`${metric} must be between 0 and 100`);
    }
    for (const [key, value] of Object.entries(input.usage))
        assertFiniteNonNegative(value, key, true);
    return {
        ...input,
        modelKey: input.modelKey.trim().slice(0, 240),
        metrics: { ...input.metrics },
        usage: { ...input.usage },
    };
}
function validateStoredRun(value) {
    const candidate = value;
    if (typeof candidate?.id !== 'string' || candidate.id.trim() === '')
        throw new Error('invalid context quality run id');
    return { id: candidate.id, ...validateRunInput(candidate) };
}
async function atomicWrite(path, content) {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temp, content, 'utf8');
    await rename(temp, path);
}
export async function loadContextQualityHistory(cwd) {
    try {
        const parsed = JSON.parse(await readFile(historyPath(cwd), 'utf8'));
        if (parsed?.version !== 1 || !Array.isArray(parsed.runs))
            throw new Error('invalid context quality history');
        return { version: 1, runs: parsed.runs.map(validateStoredRun).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-MAX_RUNS) };
    }
    catch {
        return { version: 1, runs: [] };
    }
}
export async function recordContextQualityRun(cwd, input) {
    const run = { id: randomUUID(), ...validateRunInput(input) };
    const history = await loadContextQualityHistory(cwd);
    history.runs = [...history.runs, run].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-MAX_RUNS);
    await atomicWrite(historyPath(cwd), `${JSON.stringify(history, null, 2)}\n`);
    return run;
}
export async function aggregateContextQuality(cwd, filter = {}) {
    const history = await loadContextQualityHistory(cwd);
    const runs = history.runs.filter(run => (filter.modelKey === undefined || run.modelKey === filter.modelKey) && (filter.scale === undefined || run.scale === filter.scale));
    const passedRuns = runs.filter(run => run.status === 'pass').length;
    return {
        totalRuns: runs.length,
        passedRuns,
        ...(runs.length === 0 ? {} : { passRate: Math.round((passedRuns / runs.length) * 100), latest: runs.at(-1) }),
        trend: runs.slice(-60).map(run => ({ timestamp: run.timestamp, score: contextQualityScore(run.metrics), status: run.status })),
    };
}
export function contextQualityScore(metrics) {
    const positive = metrics.criticalRecall * 0.25 + metrics.exactLiteralRecall * 0.15 + metrics.latestStateAccuracy * 0.15 + metrics.constraintRecall * 0.1 + metrics.pendingWorkRecall * 0.15 + metrics.toolIntegrity * 0.1 + metrics.sectionCompleteness * 0.1;
    return Math.round(Math.max(0, Math.min(100, positive - metrics.staleLeakage * 0.25)));
}
