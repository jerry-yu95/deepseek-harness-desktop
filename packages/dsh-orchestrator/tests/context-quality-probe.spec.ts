import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LlmRuntime, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { TokenMeter } from '@deepseek-ai/dsh-token-meter'
import { contextQualityExpectations, runContextQualityProbe } from '../src/context-quality-probe.ts'

function fakeTokenMeter(): TokenMeter {
  return { estimateMessage: (message: Message) => Math.ceil(((message.content[0] as { text: string }).text.length) / 4) + 4 } as TokenMeter
}

function fakeLlm(contextWindow = 1_000_000): LlmRuntime {
  let call = 0
  return {
    resolveModelInfo: async () => ({ provider: 'fixture', id: 'model', name: 'Fixture', context: { contextWindow } }),
    stream: async function* (): AsyncGenerator<StreamChunk> {
      const expected = contextQualityExpectations(call++)
      const text = JSON.stringify({
        criticalFacts: expected.criticalFacts,
        exactLiteral: expected.exactLiteral,
        latestState: expected.latestState,
        constraints: expected.constraints,
        pendingWork: expected.pendingWork,
        toolPairs: expected.toolPairs,
      })
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'usage', usage: { inputTokens: 30_000, outputTokens: 220, cacheReadTokens: 100 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  } as LlmRuntime
}

describe('context quality live probe', () => {
  it('requires explicit confirmation before any model call', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'context-quality-probe-'))
    await expect(runContextQualityProbe({ cwd, modelKey: 'fixture/model', provider: 'fixture', model: 'model', scale: '32K', confirmed: false, llm: fakeLlm(), tokenMeter: fakeTokenMeter(), signal: new AbortController().signal })).rejects.toThrow('context-quality-confirmation-required')
  })

  it('fails closed when the adapter capacity is absent or too small', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'context-quality-probe-'))
    const missing = { resolveModelInfo: async () => ({ provider: 'fixture', id: 'model', name: 'Fixture' }) } as LlmRuntime
    const base = { cwd, modelKey: 'fixture/model', provider: 'fixture', model: 'model', scale: '32K' as const, confirmed: true, tokenMeter: fakeTokenMeter(), signal: new AbortController().signal }
    await expect(runContextQualityProbe({ ...base, llm: missing })).rejects.toThrow('context-quality-capacity-unknown')
    await expect(runContextQualityProbe({ ...base, llm: fakeLlm(16_384) })).rejects.toThrow('context-quality-capacity-insufficient')
  })

  it('runs three seeded samples and persists only metric summaries', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'context-quality-probe-'))
    const result = await runContextQualityProbe({ cwd, modelKey: 'fixture/model', provider: 'fixture', model: 'model', scale: '32K', confirmed: true, llm: fakeLlm(), tokenMeter: fakeTokenMeter(), signal: new AbortController().signal })
    expect(result.run.status).toBe('pass')
    expect(result.run.hardFailureCount).toBe(0)
    expect(result.run.usage).toEqual({ inputTokens: 90_000, outputTokens: 660, cacheReadTokens: 300 })
    expect(result.summary.totalRuns).toBe(1)
    expect(JSON.stringify(result)).not.toContain('CQ-EXACT')
  })
})
