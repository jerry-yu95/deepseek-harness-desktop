import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { aggregateObservability, recordRuntimeEvent, recordTokenSnapshot } from '../src/observability.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function workspace(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-observability-'))
  roots.push(cwd)
  return cwd
}

describe('runtime observability ledger', () => {
  it('stores only positive token deltas and de-duplicates cumulative snapshots', async () => {
    const cwd = await workspace()
    const base = { cwd, sessionId: 'S1', modelKey: 'deepseek/v4', project: 'demo', timestamp: '2026-08-20T10:00:00.000Z', estimated: false }
    await recordTokenSnapshot({ ...base, usage: { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 80, cacheWriteTokens: 10 } })
    await recordTokenSnapshot({ ...base, timestamp: '2026-08-20T10:01:00.000Z', usage: { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 80, cacheWriteTokens: 10 } })
    await recordTokenSnapshot({ ...base, timestamp: '2026-08-20T10:02:00.000Z', usage: { uncachedInputTokens: 150, outputTokens: 35, cacheReadTokens: 120, cacheWriteTokens: 10 } })

    const summary = await aggregateObservability(cwd, { period: 'all' })
    expect(summary.tokens).toMatchObject({ uncachedInputTokens: 150, outputTokens: 35, cacheReadTokens: 120, cacheWriteTokens: 10, totalTokens: 315 })
    expect(summary.models).toHaveLength(1)
    expect(summary.models[0]).toMatchObject({ modelKey: 'deepseek/v4', totalTokens: 315, calls: 2 })
  })

  it('filters by period and aggregates every model into a stable daily trend', async () => {
    const cwd = await workspace()
    await recordTokenSnapshot({ cwd, sessionId: 'old', modelKey: 'provider/old', project: 'demo', timestamp: '2026-07-01T00:00:00.000Z', estimated: false, usage: { uncachedInputTokens: 500, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 } })
    await recordTokenSnapshot({ cwd, sessionId: 'new', modelKey: 'provider/new', project: 'demo', timestamp: '2026-08-20T00:00:00.000Z', estimated: true, usage: { uncachedInputTokens: 40, outputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 0 } })

    const summary = await aggregateObservability(cwd, { period: '7d', now: '2026-08-21T12:00:00.000Z' })
    expect(summary.tokens.totalTokens).toBe(70)
    expect(summary.models.map(item => item.modelKey)).toEqual(['provider/new'])
    expect(summary.daily).toEqual([{ date: '2026-08-20', totalTokens: 70 }])
    expect(summary.estimatedEvents).toBe(1)
  })

  it('returns recent stage traces and cache benefits without storing full content', async () => {
    const cwd = await workspace()
    await recordRuntimeEvent(cwd, { id: 'run-1:planner', timestamp: '2026-08-21T10:00:00.000Z', kind: 'stage', runId: 'run-1', stage: 'planner', status: 'complete', durationMs: 1234, summary: 'api_key=secret planned safely' })
    await recordRuntimeEvent(cwd, { id: 'run-1:cache', timestamp: '2026-08-21T10:00:01.000Z', kind: 'cache', runId: 'run-1', namespace: 'planner', hit: true, savedMs: 1234, savedTokens: 80 })

    const summary = await aggregateObservability(cwd, { period: 'today', now: '2026-08-21T12:00:00.000Z' })
    expect(summary.traces[0]).toMatchObject({ runId: 'run-1', stage: 'planner', status: 'complete', durationMs: 1234 })
    expect(summary.traces[0]?.summary).toContain('[REDACTED]')
    expect(summary.cache).toEqual({ hits: 1, misses: 0, hitRate: 100, savedMs: 1234, savedTokens: 80 })
  })
})
