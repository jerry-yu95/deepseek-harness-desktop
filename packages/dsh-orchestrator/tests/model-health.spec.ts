import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { WorkflowEngine } from '@deepseek-ai/dsh-workflow'
import type { LlmRuntime, StreamChunk } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assessModelHealth, getModelHealth, recordHealthFeedback, recordHealthSignals, runModelHealthProbe, type HealthSignal } from '../src/model-health.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const at = (offset: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, offset)).toISOString()

describe('model health regression monitor', () => {
  it('requires a baseline and detects sustained degradation', () => {
    const signals: HealthSignal[] = [0, 1, 2, 3, 4].map(index => ({ timestamp: at(index), modelKey: 'deepseek/v4', dimension: 'reasoning', score: 95, source: 'passive' }))
    expect(assessModelHealth('deepseek/v4', signals).status).toBe('insufficient-data')
    signals.push(...[5, 6, 7].map(index => ({ timestamp: at(index), modelKey: 'deepseek/v4', dimension: 'reasoning' as const, score: 55, source: 'passive' as const })))
    const summary = assessModelHealth('deepseek/v4', signals)
    expect(summary.status).toBe('degraded')
    expect(summary.delta).toBeLessThanOrEqual(-15)
  })

  it('redacts anomalies and stores user feedback', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-health-')); roots.push(cwd)
    await recordHealthSignals(cwd, [{ timestamp: at(0), modelKey: 'route/model', dimension: 'instruction', score: 60, source: 'passive', anomaly: 'api_key=top-secret failed' }])
    await recordHealthFeedback(cwd, { timestamp: at(1), modelKey: 'route/model', verdict: 'normal', note: 'false alarm token=secret' })
    const summary = await getModelHealth(cwd, 'route/model')
    expect(summary.anomalies[0]?.summary).not.toContain('top-secret')
    expect(summary.feedback.normal).toBe(1)
  })

  it('runs a deterministic probe once and reuses its cached result', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-health-')); roots.push(cwd)
    const dispose = vi.fn(async () => undefined)
    const start = vi.fn(() => ({ id: 'health-1', meta: { name: 'health', description: 'health' }, cancel: vi.fn(), dispose, result: Promise.resolve({ stopReason: 'completed' as const, agentsStarted: 1, value: { logicAnswer: '42', contextToken: 'H7-KITE-29', structuredMarker: 'structured-ok', toolPlan: ['inspect', 'implement', 'test'], completenessMarkers: ['A', 'B', 'C'] } }) }))
    const request = { cwd, modelKey: 'route/model', parent: {} as Agent, signal: new AbortController().signal, workflowEngine: { start } as unknown as WorkflowEngine }
    expect((await runModelHealthProbe(request)).cached).toBe(false)
    expect((await runModelHealthProbe(request)).cached).toBe(true)
    expect(start).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect((await getModelHealth(cwd, 'route/model')).sampleCount).toBe(6)
  })

  it('falls back to a direct official LLM probe when the session has no Workflow Engine', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-health-direct-')); roots.push(cwd)
    const payload = JSON.stringify({ logicAnswer: '42', contextToken: 'H7-KITE-29', structuredMarker: 'structured-ok', toolPlan: ['inspect', 'implement', 'test'], completenessMarkers: ['A', 'B', 'C'] })
    const stream = vi.fn(async function * (): AsyncIterable<StreamChunk> {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: payload }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })
    const result = await runModelHealthProbe({ cwd, modelKey: 'route/model', parent: { options: { provider: 'route', model: 'model' } } as Agent, signal: new AbortController().signal, llm: { stream } as unknown as LlmRuntime })
    expect(result.cached).toBe(false)
    expect(stream).toHaveBeenCalledTimes(1)
    expect(result.summary.sampleCount).toBe(6)
  })

  it('extracts a probe object from explanatory markdown and normalizes harmless type drift', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-health-tolerant-')); roots.push(cwd)
    const payload = 'Diagnostic result:\n```json\n{"logicAnswer":42,"contextToken":"H7-KITE-29","structuredMarker":"structured-ok","toolPlan":"inspect, implement, test","completenessMarkers":["A","B","C"]}\n```\nDone.'
    const stream = vi.fn(async function * (): AsyncIterable<StreamChunk> {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: payload }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })
    const result = await runModelHealthProbe({ cwd, modelKey: 'route/model', parent: { options: { provider: 'route', model: 'model' } } as Agent, signal: new AbortController().signal, llm: { stream } as unknown as LlmRuntime })
    expect(result.summary.score).toBe(100)
    expect(stream).toHaveBeenCalledTimes(1)
  })

  it('retries once when the provider returns no machine-readable probe result', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-health-retry-')); roots.push(cwd)
    const valid = JSON.stringify({ logicAnswer: '42', contextToken: 'H7-KITE-29', structuredMarker: 'structured-ok', toolPlan: ['inspect', 'implement', 'test'], completenessMarkers: ['A', 'B', 'C'] })
    let call = 0
    const stream = vi.fn(async function * (): AsyncIterable<StreamChunk> {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: call++ === 0 ? 'I cannot format that response.' : valid }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })
    const result = await runModelHealthProbe({ cwd, modelKey: 'route/model', parent: { options: { provider: 'route', model: 'model' } } as Agent, signal: new AbortController().signal, llm: { stream } as unknown as LlmRuntime })
    expect(result.summary.score).toBe(100)
    expect(stream).toHaveBeenCalledTimes(2)
  })
})
