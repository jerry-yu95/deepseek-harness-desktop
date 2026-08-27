import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { aggregateContextQuality, loadContextQualityHistory, recordContextQualityRun, type ContextQualityRunInput } from '../src/context-quality.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function workspace(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-context-quality-'))
  roots.push(cwd)
  return cwd
}

function sample(overrides: Partial<ContextQualityRunInput> = {}): ContextQualityRunInput {
  return {
    timestamp: '2026-08-27T08:00:00.000Z',
    modelKey: 'deepseek-official/deepseek-v4',
    scale: '32K',
    requestedInputTokens: 32_768,
    resolvedContextWindow: 1_000_000,
    sampleCount: 3,
    status: 'pass',
    metrics: {
      criticalRecall: 100,
      exactLiteralRecall: 98,
      latestStateAccuracy: 100,
      staleLeakage: 0,
      constraintRecall: 96,
      pendingWorkRecall: 95,
      toolIntegrity: 100,
      sectionCompleteness: 100,
    },
    usage: { inputTokens: 96_000, outputTokens: 2_400, cacheReadTokens: 12_000 },
    durationMs: 42_000,
    hardFailureCount: 0,
    ...overrides,
  }
}

describe('context quality history', () => {
  it('persists sanitized metric-only runs and summarizes the active route and scale', async () => {
    const cwd = await workspace()
    await recordContextQualityRun(cwd, sample())
    await recordContextQualityRun(cwd, sample({ timestamp: '2026-08-27T09:00:00.000Z', scale: '128K', requestedInputTokens: 131_072, metrics: { ...sample().metrics, pendingWorkRecall: 88 }, status: 'fail', hardFailureCount: 1 }))

    const summary = await aggregateContextQuality(cwd, { modelKey: 'deepseek-official/deepseek-v4', scale: '128K' })
    expect(summary.totalRuns).toBe(1)
    expect(summary.passRate).toBe(0)
    expect(summary.latest?.metrics.pendingWorkRecall).toBe(88)
    expect(summary.trend).toEqual([{ timestamp: '2026-08-27T09:00:00.000Z', score: 98, status: 'fail' }])

    const stored = await readFile(join(cwd, '.dsh-harness', 'context-quality.json'), 'utf8')
    expect(stored).not.toContain('prompt')
    expect(stored).not.toContain('completion')
  })

  it('rejects secret-shaped routes, absolute home paths, invalid timestamps, and out-of-range metrics', async () => {
    const cwd = await workspace()
    await expect(recordContextQualityRun(cwd, sample({ modelKey: 'provider/api_key=sk-test-secret-value' }))).rejects.toThrow(/sensitive/)
    await expect(recordContextQualityRun(cwd, sample({ modelKey: '/Users/example/private/model' }))).rejects.toThrow(/local path/)
    await expect(recordContextQualityRun(cwd, sample({ timestamp: 'not-a-date' }))).rejects.toThrow(/timestamp/)
    await expect(recordContextQualityRun(cwd, sample({ metrics: { ...sample().metrics, staleLeakage: 101 } }))).rejects.toThrow(/staleLeakage/)
  })

  it('keeps only the latest 120 runs in chronological order', async () => {
    const cwd = await workspace()
    for (let index = 0; index < 125; index += 1) {
      await recordContextQualityRun(cwd, sample({ timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString() }))
    }
    const history = await loadContextQualityHistory(cwd)
    expect(history.runs).toHaveLength(120)
    expect(history.runs[0]?.timestamp).toBe('2026-01-01T00:00:05.000Z')
    expect(history.runs.at(-1)?.timestamp).toBe('2026-01-01T00:02:04.000Z')
  })

  it('fails closed to an empty history when a local history file is malformed', async () => {
    const cwd = await workspace()
    await recordContextQualityRun(cwd, sample())
    const target = join(cwd, '.dsh-harness', 'context-quality.json')
    await import('node:fs/promises').then(({ writeFile }) => writeFile(target, '{broken', 'utf8'))
    expect(await loadContextQualityHistory(cwd)).toEqual({ version: 1, runs: [] })
  })
})
