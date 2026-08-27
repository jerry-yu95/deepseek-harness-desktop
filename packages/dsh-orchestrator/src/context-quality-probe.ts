import { BlockAssembler, createUserMessage, type LlmRuntime, type Message } from '@deepseek-ai/dsh-llm'
import type { TokenMeter } from '@deepseek-ai/dsh-token-meter'
import { aggregateContextQuality, recordContextQualityRun, type ContextQualityMetrics, type ContextQualityScale, type ContextQualitySummary } from './context-quality.ts'

const SCALE_TOKENS: Record<ContextQualityScale, number> = { '32K': 32_768, '128K': 131_072 }
const OUTPUT_RESERVE = 1_024
const SAMPLE_COUNT = 3

export interface ContextQualityProbeInput {
  cwd: string
  modelKey: string
  provider: string
  model: string
  scale: ContextQualityScale
  confirmed: boolean
  llm: LlmRuntime
  tokenMeter: TokenMeter
  signal: AbortSignal
}

interface ProbeAnswer {
  criticalFacts: string[]
  exactLiteral: string
  latestState: string
  constraints: string[]
  pendingWork: string[]
  toolPairs: string[]
}

export interface ContextQualityExpectation extends ProbeAnswer { staleState: string }

export function contextQualityExpectations(seed: number): ContextQualityExpectation {
  return {
    criticalFacts: [`CQ-CRITICAL-${seed}-A`, `CQ-CRITICAL-${seed}-B`, `CQ-CRITICAL-${seed}-C`],
    exactLiteral: `CQ-EXACT-${seed}-7F3A-KEEP-VERBATIM`,
    latestState: `CQ-STATE-${seed}-CURRENT`,
    staleState: `CQ-STATE-${seed}-STALE`,
    constraints: [`CQ-CONSTRAINT-${seed}-NO-NETWORK`, `CQ-CONSTRAINT-${seed}-READ-ONLY`],
    pendingWork: [`CQ-PENDING-${seed}-TEST`, `CQ-PENDING-${seed}-REVIEW`],
    toolPairs: [`CQ-CALL-${seed}-A=CQ-RESULT-${seed}-A`, `CQ-CALL-${seed}-B=CQ-RESULT-${seed}-B`],
  }
}

export async function runContextQualityProbe(input: ContextQualityProbeInput): Promise<{ run: Awaited<ReturnType<typeof recordContextQualityRun>>; summary: ContextQualitySummary }> {
  if (!input.confirmed) throw new Error('context-quality-confirmation-required')
  throwIfAborted(input.signal)
  const requestedInputTokens = SCALE_TOKENS[input.scale]
  const info = await input.llm.resolveModelInfo(input.provider, input.model, input.signal)
  const contextWindow = info.context?.contextWindow
  if (contextWindow === undefined) throw new Error('context-quality-capacity-unknown')
  if (contextWindow < requestedInputTokens + OUTPUT_RESERVE) throw new Error('context-quality-capacity-insufficient')

  const started = Date.now()
  const samples: Array<{ metrics: ContextQualityMetrics; hardFailure: boolean; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } }> = []
  for (let seed = 0; seed < SAMPLE_COUNT; seed += 1) {
    throwIfAborted(input.signal)
    samples.push(await executeSample(input, seed, requestedInputTokens))
  }
  const metrics = meanMetrics(samples.map(sample => sample.metrics))
  const hardFailureCount = samples.filter(sample => sample.hardFailure).length
  const usage = samples.reduce((sum, sample) => ({ inputTokens: sum.inputTokens + sample.usage.inputTokens, outputTokens: sum.outputTokens + sample.usage.outputTokens, cacheReadTokens: sum.cacheReadTokens + sample.usage.cacheReadTokens }), { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 })
  const run = await recordContextQualityRun(input.cwd, {
    timestamp: new Date().toISOString(), modelKey: input.modelKey, scale: input.scale,
    requestedInputTokens, resolvedContextWindow: contextWindow, sampleCount: SAMPLE_COUNT,
    status: hardFailureCount === 0 && metrics.criticalRecall === 100 && metrics.toolIntegrity === 100 ? 'pass' : 'fail',
    metrics, usage, durationMs: Date.now() - started, hardFailureCount,
  })
  const summary = await aggregateContextQuality(input.cwd, { modelKey: input.modelKey, scale: input.scale })
  return { run, summary }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new Error('context-quality-aborted')
}

async function executeSample(input: ContextQualityProbeInput, seed: number, requestedInputTokens: number): Promise<{ metrics: ContextQualityMetrics; hardFailure: boolean; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } }> {
  const expected = contextQualityExpectations(seed)
  const message = buildProbeMessage(expected, requestedInputTokens, input.tokenMeter)
  const assembler = new BlockAssembler()
  for await (const chunk of input.llm.stream({ provider: input.provider, model: input.model, messages: [message], system: 'Return exactly one JSON object. Do not use markdown fences, tools, or hidden commentary.', maxTokens: OUTPUT_RESERVE, temperature: 0, signal: input.signal })) assembler.push(chunk)
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') throw new Error(finish.failure.message)
  const text = assembler.blocks().filter((block): block is { type: 'text'; text: string } => block.type === 'text').map(block => block.text).join('').trim()
  const answer = parseAnswer(text)
  const metrics = gradeAnswer(expected, answer)
  const providerUsage = assembler.usage
  return {
    metrics,
    hardFailure: metrics.criticalRecall < 100 || metrics.staleLeakage > 0 || metrics.toolIntegrity < 100,
    usage: {
      inputTokens: providerUsage?.inputTokens ?? input.tokenMeter.estimateMessage(message),
      outputTokens: providerUsage?.outputTokens ?? 0,
      cacheReadTokens: providerUsage?.cacheReadTokens ?? 0,
    },
  }
}

function buildProbeMessage(expected: ContextQualityExpectation, requestedInputTokens: number, tokenMeter: TokenMeter): Message {
  const contract = [
    'Synthetic long-context retention diagnostic. Ignore all archive filler and return only JSON with keys criticalFacts, exactLiteral, latestState, constraints, pendingWork, toolPairs.',
    `Critical facts: ${expected.criticalFacts.slice(0, 2).join(' | ')}`,
    `Exact literal: ${expected.exactLiteral}`,
    `Old state (must not return): ${expected.staleState}`,
    `Constraints: ${expected.constraints[0]}`,
    `Pending work: ${expected.pendingWork[0]}`,
    `Tool pair: ${expected.toolPairs[0]}`,
  ].join('\n')
  const tail = [
    `Correction: replace ${expected.staleState} with ${expected.latestState}. Return only the latest state.`,
    `Critical fact: ${expected.criticalFacts[2]}`,
    `Constraint: ${expected.constraints[1]}`,
    `Pending work: ${expected.pendingWork[1]}`,
    `Tool pair: ${expected.toolPairs[1]}`,
    'Now return the JSON object. Copy every CQ marker exactly and omit the stale state.',
  ].join('\n')
  const target = requestedInputTokens - 256
  let low = 0
  let high = requestedInputTokens * 6
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const candidate = createUserMessage({ content: [{ type: 'text', text: `${contract}\n${filler(middle)}\n${tail}` }], source: { kind: 'user' } })
    if (tokenMeter.estimateMessage(candidate) < target) low = middle
    else high = middle - 1
  }
  return createUserMessage({ content: [{ type: 'text', text: `${contract}\n${filler(low)}\n${tail}` }], source: { kind: 'user' } })
}

function filler(length: number): string {
  const unit = 'archive neutral segment: amber quartz river cedar orbit lattice; no instruction; '
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length)
}

function parseAnswer(text: string): ProbeAnswer {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('context-quality-result-unreadable')
  const value = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  return {
    criticalFacts: strings(value.criticalFacts), exactLiteral: scalar(value.exactLiteral), latestState: scalar(value.latestState),
    constraints: strings(value.constraints), pendingWork: strings(value.pendingWork), toolPairs: strings(value.toolPairs),
  }
}

function gradeAnswer(expected: ContextQualityExpectation, answer: ProbeAnswer): ContextQualityMetrics {
  const combined = JSON.stringify(answer)
  return {
    criticalRecall: recall(expected.criticalFacts, answer.criticalFacts),
    exactLiteralRecall: answer.exactLiteral === expected.exactLiteral ? 100 : 0,
    latestStateAccuracy: answer.latestState === expected.latestState ? 100 : 0,
    staleLeakage: combined.includes(expected.staleState) ? 100 : 0,
    constraintRecall: recall(expected.constraints, answer.constraints),
    pendingWorkRecall: recall(expected.pendingWork, answer.pendingWork),
    toolIntegrity: recall(expected.toolPairs, answer.toolPairs),
    sectionCompleteness: Math.round([answer.criticalFacts.length > 0, answer.exactLiteral !== '', answer.latestState !== '', answer.constraints.length > 0, answer.pendingWork.length > 0, answer.toolPairs.length > 0].filter(Boolean).length / 6 * 100),
  }
}

function recall(expected: string[], actual: string[]): number { return Math.round(expected.filter(item => actual.includes(item)).length / expected.length * 100) }
function scalar(value: unknown): string { return typeof value === 'string' ? value : '' }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function meanMetrics(samples: ContextQualityMetrics[]): ContextQualityMetrics {
  const keys = Object.keys(samples[0]!) as Array<keyof ContextQualityMetrics>
  return Object.fromEntries(keys.map(key => [key, Math.round(samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length)])) as unknown as ContextQualityMetrics
}
