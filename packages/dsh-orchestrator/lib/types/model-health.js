import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { cacheKey, cached, harnessDir, redactSecrets } from "./core.js";
const DIMENSIONS = ['instruction', 'context', 'reasoning', 'structuredOutput', 'toolPlanning', 'completeness'];
const PROBE_CONTRACT = 'model-health-probe-v1';
const PROBE_TTL = 6 * 60 * 60 * 1000;
function healthPath(cwd) { return join(harnessDir(cwd), 'model-health.json'); }
function boundedScore(score) { return Math.max(0, Math.min(100, Math.round(score))); }
export async function loadHealthStore(cwd) {
    try {
        const value = JSON.parse(await readFile(healthPath(cwd), 'utf8'));
        if (value.version !== 1 || !Array.isArray(value.signals) || !Array.isArray(value.feedback))
            throw new Error('invalid-model-health-store');
        return value;
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return { version: 1, signals: [], feedback: [] };
        return { version: 1, signals: [], feedback: [] };
    }
}
async function saveHealthStore(cwd, store) {
    const target = healthPath(cwd);
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temp, `${JSON.stringify({ ...store, signals: store.signals.slice(-500), feedback: store.feedback.slice(-100) }, null, 2)}\n`, 'utf8');
    await rename(temp, target);
}
export async function recordHealthSignals(cwd, signals) {
    if (signals.length === 0)
        throw new Error('health-signals-required');
    const normalized = signals.map(signal => ({
        ...signal,
        timestamp: Number.isNaN(Date.parse(signal.timestamp)) ? new Date().toISOString() : signal.timestamp,
        score: boundedScore(signal.score),
        anomaly: signal.anomaly === undefined ? undefined : redactSecrets(signal.anomaly).slice(0, 500),
    }));
    const store = await loadHealthStore(cwd);
    store.signals.push(...normalized);
    await saveHealthStore(cwd, store);
    return assessModelHealth(normalized[0].modelKey, store.signals, store.feedback);
}
export async function recordHealthFeedback(cwd, feedback) {
    const store = await loadHealthStore(cwd);
    store.feedback.push({ ...feedback, timestamp: new Date(feedback.timestamp).toISOString(), ...(feedback.note === undefined ? {} : { note: redactSecrets(feedback.note).slice(0, 500) }) });
    await saveHealthStore(cwd, store);
    return assessModelHealth(feedback.modelKey, store.signals, store.feedback);
}
export async function getModelHealth(cwd, modelKey) {
    const store = await loadHealthStore(cwd);
    return assessModelHealth(modelKey, store.signals, store.feedback);
}
export function assessModelHealth(modelKey, allSignals, allFeedback = []) {
    const signals = allSignals.filter(signal => signal.modelKey === modelKey).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const dimensions = Object.fromEntries(DIMENSIONS.map(dimension => [dimension, dimensionSummary(signals.filter(signal => signal.dimension === dimension))]));
    const currentSignals = signals.slice(-Math.min(12, signals.length));
    const score = average(currentSignals.map(signal => signal.score)) ?? 0;
    const baselineSignals = signals.length >= 8 ? signals.slice(0, -3) : [];
    const baselineScore = average(baselineSignals.map(signal => signal.score));
    const delta = baselineScore === undefined ? undefined : Math.round(score - baselineScore);
    const degradedDimensions = Object.values(dimensions).filter(item => (item.delta ?? 0) <= -20).length;
    const volatility = standardDeviation(currentSignals.map(signal => signal.score));
    let status = 'healthy';
    if (signals.length < 8 || baselineScore === undefined)
        status = 'insufficient-data';
    else if ((delta ?? 0) <= -15 || degradedDimensions >= 2)
        status = 'degraded';
    else if ((delta ?? 0) <= -8 || volatility >= 18)
        status = 'volatile';
    const feedback = allFeedback.filter(item => item.modelKey === modelKey);
    return {
        modelKey, status, score: Math.round(score), ...(baselineScore === undefined ? {} : { baselineScore: Math.round(baselineScore), delta }), sampleCount: signals.length, dimensions,
        anomalies: signals.filter(signal => signal.anomaly !== undefined).slice(-20).reverse().map(signal => ({ timestamp: signal.timestamp, dimension: signal.dimension, summary: signal.anomaly })),
        trend: signals.slice(-60).map(signal => ({ timestamp: signal.timestamp, score: signal.score, dimension: signal.dimension, source: signal.source })),
        feedback: { normal: feedback.filter(item => item.verdict === 'normal').length, degraded: feedback.filter(item => item.verdict === 'degraded').length },
    };
}
function dimensionSummary(signals) {
    const current = signals.slice(-3);
    const baseline = signals.length >= 6 ? signals.slice(0, -3) : [];
    const score = average(current.map(signal => signal.score));
    const baselineScore = average(baseline.map(signal => signal.score));
    return { ...(score === undefined ? {} : { score: Math.round(score) }), ...(baselineScore === undefined ? {} : { baseline: Math.round(baselineScore), delta: Math.round((score ?? baselineScore) - baselineScore) }), samples: signals.length };
}
function average(values) { return values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length; }
function standardDeviation(values) {
    const mean = average(values);
    if (mean === undefined)
        return 0;
    return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}
export async function runModelHealthProbe(input) {
    const key = cacheKey('model-health-probe', { modelKey: input.modelKey, contract: PROBE_CONTRACT });
    const producer = async () => executeProbe(input.workflowEngine, input.parent, input.signal);
    const result = input.bypassCache === true ? { value: await producer(), cached: false } : await cached(input.cwd, 'model-health', key, PROBE_CONTRACT, producer, PROBE_TTL);
    if (!result.cached)
        await recordHealthSignals(input.cwd, gradeProbe(input.modelKey, result.value));
    return { cached: result.cached, summary: await getModelHealth(input.cwd, input.modelKey) };
}
const PROBE_SCRIPT = `phase("model-health"); return await agent(args.prompt, { label: "Model health diagnostic", phase: "model-health", schema: args.schema });`;
const PROBE_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['logicAnswer', 'contextToken', 'structuredMarker', 'toolPlan', 'completenessMarkers'],
    properties: {
        logicAnswer: { type: 'string' }, contextToken: { type: 'string' }, structuredMarker: { type: 'string', const: 'structured-ok' },
        toolPlan: { type: 'array', items: { type: 'string' } }, completenessMarkers: { type: 'array', items: { type: 'string' } },
    },
};
async function executeProbe(engine, parent, signal) {
    const prompt = 'This is an isolated diagnostic. Return only the requested structured object. Compute (17*3)-9 as logicAnswer. Preserve token H7-KITE-29 exactly as contextToken. Set structuredMarker to structured-ok. For toolPlan list inspect, implement, test in that order. For completenessMarkers include A, B, and C exactly once.';
    const run = engine.start({ script: PROBE_SCRIPT, meta: { name: 'model-health', description: 'Isolated deterministic model-health probe.', phases: [{ title: 'model-health' }] }, args: { prompt, schema: PROBE_SCHEMA }, parent, signal, maxTotalAgents: 1 });
    try {
        const result = await run.result;
        if (result.stopReason !== 'completed' || result.value === null || typeof result.value !== 'object')
            throw new Error(result.stopReason === 'error' ? (result.error ?? 'health-probe-failed') : `health-probe-${result.stopReason}`);
        return result.value;
    }
    finally {
        await run.dispose();
    }
}
function gradeProbe(modelKey, result) {
    const timestamp = new Date().toISOString();
    const plan = result.toolPlan.map(item => item.toLowerCase());
    const exactMarkers = [...result.completenessMarkers].sort().join(',') === 'A,B,C';
    return [
        signal('reasoning', result.logicAnswer.trim() === '42' ? 100 : 0, result.logicAnswer.trim() === '42' ? undefined : 'Deterministic logic answer mismatch'),
        signal('context', result.contextToken === 'H7-KITE-29' ? 100 : 0, result.contextToken === 'H7-KITE-29' ? undefined : 'Context token was not preserved'),
        signal('structuredOutput', result.structuredMarker === 'structured-ok' ? 100 : 0, result.structuredMarker === 'structured-ok' ? undefined : 'Structured marker mismatch'),
        signal('toolPlanning', plan.join(',') === 'inspect,implement,test' ? 100 : 50, plan.join(',') === 'inspect,implement,test' ? undefined : 'Tool plan order drifted'),
        signal('completeness', exactMarkers ? 100 : 40, exactMarkers ? undefined : 'Response completeness markers were missing'),
        signal('instruction', result.logicAnswer !== '' && result.contextToken !== '' ? 100 : 40, result.logicAnswer !== '' && result.contextToken !== '' ? undefined : 'Required fields were incomplete'),
    ];
    function signal(dimension, score, anomaly) { return { timestamp, modelKey, dimension, score, source: 'probe', ...(anomaly === undefined ? {} : { anomaly }) }; }
}
