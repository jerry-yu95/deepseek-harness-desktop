import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { BlockAssembler, createUserMessage, type LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { WorkflowEngine } from '@deepseek-ai/dsh-workflow'
import { cacheKey, cached, harnessDir, redactSecrets } from './core.ts'

export type HealthDimension = 'instruction' | 'context' | 'reasoning' | 'structuredOutput' | 'toolPlanning' | 'completeness'
export type HealthStatus = 'healthy' | 'volatile' | 'degraded' | 'insufficient-data'
export interface HealthSignal {
  timestamp: string
  modelKey: string
  dimension: HealthDimension
  score: number
  source: 'passive' | 'probe'
  anomaly?: string
}
export interface HealthFeedback { timestamp: string; modelKey: string; verdict: 'normal' | 'degraded'; note?: string }
interface HealthStore { version: 1; signals: HealthSignal[]; feedback: HealthFeedback[] }
export interface ModelHealthSummary {
  modelKey: string
  status: HealthStatus
  score: number
  baselineScore?: number
  delta?: number
  sampleCount: number
  dimensions: Record<HealthDimension, { score?: number; baseline?: number; delta?: number; samples: number }>
  anomalies: Array<{ timestamp: string; dimension: HealthDimension; summary: string }>
  trend: Array<{ timestamp: string; score: number; dimension: HealthDimension; source: HealthSignal['source'] }>
  feedback: { normal: number; degraded: number }
}

const DIMENSIONS: HealthDimension[] = ['instruction', 'context', 'reasoning', 'structuredOutput', 'toolPlanning', 'completeness']
const PROBE_CONTRACT = 'model-health-probe-v1'
const PROBE_TTL = 6 * 60 * 60 * 1000

function healthPath(cwd: string): string { return join(harnessDir(cwd), 'model-health.json') }
function boundedScore(score: number): number { return Math.max(0, Math.min(100, Math.round(score))) }

export async function loadHealthStore(cwd: string): Promise<HealthStore> {
  try {
    const value = JSON.parse(await readFile(healthPath(cwd), 'utf8')) as HealthStore
    if (value.version !== 1 || !Array.isArray(value.signals) || !Array.isArray(value.feedback)) throw new Error('invalid-model-health-store')
    return value
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, signals: [], feedback: [] }
    return { version: 1, signals: [], feedback: [] }
  }
}

async function saveHealthStore(cwd: string, store: HealthStore): Promise<void> {
  const target = healthPath(cwd)
  await mkdir(dirname(target), { recursive: true })
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, `${JSON.stringify({ ...store, signals: store.signals.slice(-500), feedback: store.feedback.slice(-100) }, null, 2)}\n`, 'utf8')
  await rename(temp, target)
}

export async function recordHealthSignals(cwd: string, signals: HealthSignal[]): Promise<ModelHealthSummary> {
  if (signals.length === 0) throw new Error('health-signals-required')
  const normalized = signals.map(signal => ({
    ...signal,
    timestamp: Number.isNaN(Date.parse(signal.timestamp)) ? new Date().toISOString() : signal.timestamp,
    score: boundedScore(signal.score),
    anomaly: signal.anomaly === undefined ? undefined : redactSecrets(signal.anomaly).slice(0, 500),
  }))
  const store = await loadHealthStore(cwd)
  store.signals.push(...normalized)
  await saveHealthStore(cwd, store)
  return assessModelHealth(normalized[0]!.modelKey, store.signals, store.feedback)
}

export async function recordHealthFeedback(cwd: string, feedback: HealthFeedback): Promise<ModelHealthSummary> {
  const store = await loadHealthStore(cwd)
  store.feedback.push({ ...feedback, timestamp: new Date(feedback.timestamp).toISOString(), ...(feedback.note === undefined ? {} : { note: redactSecrets(feedback.note).slice(0, 500) }) })
  await saveHealthStore(cwd, store)
  return assessModelHealth(feedback.modelKey, store.signals, store.feedback)
}

export async function getModelHealth(cwd: string, modelKey: string): Promise<ModelHealthSummary> {
  const store = await loadHealthStore(cwd)
  return assessModelHealth(modelKey, store.signals, store.feedback)
}

export function assessModelHealth(modelKey: string, allSignals: HealthSignal[], allFeedback: HealthFeedback[] = []): ModelHealthSummary {
  const signals = allSignals.filter(signal => signal.modelKey === modelKey).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  const dimensions = Object.fromEntries(DIMENSIONS.map(dimension => [dimension, dimensionSummary(signals.filter(signal => signal.dimension === dimension))])) as ModelHealthSummary['dimensions']
  const currentSignals = signals.slice(-Math.min(12, signals.length))
  const score = average(currentSignals.map(signal => signal.score)) ?? 0
  const baselineSignals = signals.length >= 8 ? signals.slice(0, -3) : []
  const baselineScore = average(baselineSignals.map(signal => signal.score))
  const delta = baselineScore === undefined ? undefined : Math.round(score - baselineScore)
  const degradedDimensions = Object.values(dimensions).filter(item => (item.delta ?? 0) <= -20).length
  const volatility = standardDeviation(currentSignals.map(signal => signal.score))
  let status: HealthStatus = 'healthy'
  if (signals.length < 8 || baselineScore === undefined) status = 'insufficient-data'
  else if ((delta ?? 0) <= -15 || degradedDimensions >= 2) status = 'degraded'
  else if ((delta ?? 0) <= -8 || volatility >= 18) status = 'volatile'
  const feedback = allFeedback.filter(item => item.modelKey === modelKey)
  return {
    modelKey, status, score: Math.round(score), ...(baselineScore === undefined ? {} : { baselineScore: Math.round(baselineScore), delta }), sampleCount: signals.length, dimensions,
    anomalies: signals.filter(signal => signal.anomaly !== undefined).slice(-20).reverse().map(signal => ({ timestamp: signal.timestamp, dimension: signal.dimension, summary: signal.anomaly! })),
    trend: signals.slice(-60).map(signal => ({ timestamp: signal.timestamp, score: signal.score, dimension: signal.dimension, source: signal.source })),
    feedback: { normal: feedback.filter(item => item.verdict === 'normal').length, degraded: feedback.filter(item => item.verdict === 'degraded').length },
  }
}

function dimensionSummary(signals: HealthSignal[]): ModelHealthSummary['dimensions'][HealthDimension] {
  const current = signals.slice(-3)
  const baseline = signals.length >= 6 ? signals.slice(0, -3) : []
  const score = average(current.map(signal => signal.score))
  const baselineScore = average(baseline.map(signal => signal.score))
  return { ...(score === undefined ? {} : { score: Math.round(score) }), ...(baselineScore === undefined ? {} : { baseline: Math.round(baselineScore), delta: Math.round((score ?? baselineScore) - baselineScore) }), samples: signals.length }
}

function average(values: number[]): number | undefined { return values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length }
function standardDeviation(values: number[]): number {
  const mean = average(values); if (mean === undefined) return 0
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

export async function runModelHealthProbe(input: { cwd: string; modelKey: string; parent: Agent; signal: AbortSignal; workflowEngine?: WorkflowEngine; llm?: LlmRuntime; bypassCache?: boolean }): Promise<{ cached: boolean; summary: ModelHealthSummary }> {
  const key = cacheKey('model-health-probe', { modelKey: input.modelKey, contract: PROBE_CONTRACT })
  const producer = async () => input.workflowEngine === undefined ? executeDirectProbe(input.llm, input.parent, input.signal) : executeProbe(input.workflowEngine, input.parent, input.signal)
  const result = input.bypassCache === true ? { value: await producer(), cached: false } : await cached(input.cwd, 'model-health', key, PROBE_CONTRACT, producer, PROBE_TTL)
  if (!result.cached) await recordHealthSignals(input.cwd, gradeProbe(input.modelKey, result.value))
  return { cached: result.cached, summary: await getModelHealth(input.cwd, input.modelKey) }
}

interface ProbeResult { logicAnswer: string; contextToken: string; structuredMarker: 'structured-ok'; toolPlan: string[]; completenessMarkers: string[] }
const PROBE_SCRIPT = `phase("model-health"); return await agent(args.prompt, { label: "Model health diagnostic", phase: "model-health", schema: args.schema });`
const PROBE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['logicAnswer', 'contextToken', 'structuredMarker', 'toolPlan', 'completenessMarkers'],
  properties: {
    logicAnswer: { type: 'string' }, contextToken: { type: 'string' }, structuredMarker: { type: 'string', const: 'structured-ok' },
    toolPlan: { type: 'array', items: { type: 'string' } }, completenessMarkers: { type: 'array', items: { type: 'string' } },
  },
} as const

async function executeProbe(engine: WorkflowEngine, parent: Agent, signal: AbortSignal): Promise<ProbeResult> {
  const prompt = 'This is an isolated diagnostic. Return only the requested structured object. Compute (17*3)-9 as logicAnswer. Preserve token H7-KITE-29 exactly as contextToken. Set structuredMarker to structured-ok. For toolPlan list inspect, implement, test in that order. For completenessMarkers include A, B, and C exactly once.'
  const run = engine.start({ script: PROBE_SCRIPT, meta: { name: 'model-health', description: 'Isolated deterministic model-health probe.', phases: [{ title: 'model-health' }] }, args: { prompt, schema: PROBE_SCHEMA }, parent, signal, maxTotalAgents: 1 })
  try {
    const result = await run.result
    if (result.stopReason !== 'completed' || result.value === null || typeof result.value !== 'object') throw new Error(result.stopReason === 'error' ? (result.error ?? 'health-probe-failed') : `health-probe-${result.stopReason}`)
    return result.value as ProbeResult
  } finally { await run.dispose() }
}

async function executeDirectProbe(llm: LlmRuntime | undefined, parent: Agent, signal: AbortSignal): Promise<ProbeResult> {
  const provider = parent.options.provider
  const model = parent.options.model
  if (llm === undefined || provider === undefined || model === undefined) throw new Error('model-health-probe-unavailable')
  const prompt = 'This is an isolated diagnostic. Return only valid JSON with keys logicAnswer, contextToken, structuredMarker, toolPlan, completenessMarkers. Compute (17*3)-9 as logicAnswer. Preserve H7-KITE-29 exactly. structuredMarker must be structured-ok. toolPlan must be ["inspect","implement","test"]. completenessMarkers must be ["A","B","C"].'
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const assembler = new BlockAssembler()
    const request = attempt === 0 ? prompt : `${prompt}\nYour previous response was not machine-readable. Output one JSON object and nothing else.`
    for await (const chunk of llm.stream({ provider, model, messages: [createUserMessage({ content: [{ type: 'text', text: request }], source: { kind: 'user' } })], system: 'Return only the requested JSON object. Do not use markdown fences.', maxTokens: 512, temperature: 0, signal })) assembler.push(chunk)
    const finish = assembler.finish
    if (finish.kind === 'error' || finish.kind === 'aborted') throw new Error(finish.failure.message)
    const text = assembler.blocks().filter((block): block is { type: 'text'; text: string } => block.type === 'text').map(block => block.text).join('').trim()
    try { return parseProbeResult(text) } catch (error) {
      if (attempt === 1) throw new Error('model-health-probe-format-unreadable', { cause: error })
    }
  }
  throw new Error('model-health-probe-format-unreadable')
}

function parseProbeResult(text: string): ProbeResult {
  const json = extractJsonObject(text)
  const value = JSON.parse(json) as Record<string, unknown>
  const toolPlan = stringList(value.toolPlan)
  const completenessMarkers = stringList(value.completenessMarkers)
  const recognized = ['logicAnswer', 'contextToken', 'structuredMarker', 'toolPlan', 'completenessMarkers'].filter(key => key in value).length
  if (recognized < 3) throw new Error('insufficient-probe-fields')
  return {
    logicAnswer: scalarString(value.logicAnswer),
    contextToken: scalarString(value.contextToken),
    structuredMarker: scalarString(value.structuredMarker) as 'structured-ok',
    toolPlan,
    completenessMarkers,
  }
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{')
  if (start < 0) throw new Error('probe-json-object-missing')
  let depth = 0; let quoted = false; let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === '{') depth += 1
    else if (char === '}' && --depth === 0) return text.slice(start, index + 1)
  }
  throw new Error('probe-json-object-incomplete')
}

function scalarString(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : '' }
function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number').map(String)
  if (typeof value === 'string') return value.split(/[,，]/).map(item => item.trim()).filter(Boolean)
  return []
}

function gradeProbe(modelKey: string, result: ProbeResult): HealthSignal[] {
  const timestamp = new Date().toISOString()
  const plan = result.toolPlan.map(item => item.toLowerCase())
  const exactMarkers = [...result.completenessMarkers].sort().join(',') === 'A,B,C'
  return [
    signal('reasoning', result.logicAnswer.trim() === '42' ? 100 : 0, result.logicAnswer.trim() === '42' ? undefined : 'Deterministic logic answer mismatch'),
    signal('context', result.contextToken === 'H7-KITE-29' ? 100 : 0, result.contextToken === 'H7-KITE-29' ? undefined : 'Context token was not preserved'),
    signal('structuredOutput', result.structuredMarker === 'structured-ok' ? 100 : 0, result.structuredMarker === 'structured-ok' ? undefined : 'Structured marker mismatch'),
    signal('toolPlanning', plan.join(',') === 'inspect,implement,test' ? 100 : 50, plan.join(',') === 'inspect,implement,test' ? undefined : 'Tool plan order drifted'),
    signal('completeness', exactMarkers ? 100 : 40, exactMarkers ? undefined : 'Response completeness markers were missing'),
    signal('instruction', result.logicAnswer !== '' && result.contextToken !== '' ? 100 : 40, result.logicAnswer !== '' && result.contextToken !== '' ? undefined : 'Required fields were incomplete'),
  ]
  function signal(dimension: HealthDimension, score: number, anomaly?: string): HealthSignal { return { timestamp, modelKey, dimension, score, source: 'probe', ...(anomaly === undefined ? {} : { anomaly }) } }
}
