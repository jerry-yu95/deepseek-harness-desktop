import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createMessage, createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { AssistantStreamAccumulator } from '@deepseek-ai/dsh-llm/assistant-stream'
import SessionStore from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { apply, inject, resolveEstimatorConfig } from '../src/index.ts'
import { createLiveTokenUsageProjectionDefinition } from '../src/projection.ts'
import { estimateMessageTokens } from '../src/estimator.ts'

const spec = resolveEstimatorConfig({})
const definition = () => createLiveTokenUsageProjectionDefinition(spec)
const message = (text: string) => createMessage({ role: 'assistant', content: [{ type: 'text', text }], source: { kind: 'model', provider: 'fixture', model: 'fixture' } })
const streamOf = (chunks: Array<[number, StreamChunk]>) => {
  const stream = new AssistantStreamAccumulator()
  for (const [time, chunk] of chunks) stream.push({ time, chunk })
  return stream.snapshot()
}
function fold() {
  const def = definition()
  let state = def.init(), seq = 0
  const events: SessionEvent[] = []
  return {
    push(type: string, data: unknown, surfaceOp?: unknown) {
      const event = { type, seq: seq++, time: 5000, data, ...(surfaceOp ? { surfaceOp } : {}) } as SessionEvent
      events.push(event)
      state = def.apply(state, event)
      return event.seq
    },
    view: () => def.wire.view(state), events,
  }
}

describe('Session V3 usage projection', () => {
  it('validates estimator parameters', () => {
    expect(resolveEstimatorConfig({ charsPerToken: 2, blockOverhead: 1, roleOverhead: 3 })).toEqual({ charsPerToken: 2, blockOverhead: 1, roleOverhead: 3 })
    expect(() => resolveEstimatorConfig({ charsPerToken: 0 })).toThrow('charsPerToken')
    expect(() => resolveEstimatorConfig({ blockOverhead: 0.5 })).toThrow('blockOverhead')
    expect(() => resolveEstimatorConfig({ unknown: 1 } as never)).toThrow('unknown config key')
  })
  it('prices system messages and compacted stream timing, with exact usage and replay parity', () => {
    const f = fold()
    const system = createSystemMessage({ content: [{ type: 'text', text: 'fixture instructions' }] })
    f.push('system/message', { message: system }, 'append')
    f.push('step/start', { turn: 1, step: 1 })
    expect(f.view().uncachedInputTokens).toBe(estimateMessageTokens(system, spec))
    f.push('assistant/message', { turn: 1, step: 1, message: message('abcdefgh'), stream: streamOf([
      [2000, { type: 'text-delta', index: 0, text: 'abcd' }],
      [3000, { type: 'text-delta', index: 0, text: 'efgh' }],
      [4000, { type: 'usage', usage: { inputTokens: 20, outputTokens: 30, cacheReadTokens: 80 } }],
    ]) }, 'append')
    f.push('step/end', { turn: 1, step: 1 })
    expect(f.view()).toEqual({ uncachedInputTokens: 20, outputTokens: 30, cacheReadTokens: 80, cacheWriteTokens: 0, estimated: false, tokensPerSecond: 15 })
    const def = definition()
    expect(def.wire.view(f.events.reduce((state, event) => def.apply(state, event), def.init()))).toEqual(f.view())
  })
  it('retains exact usage against trailing deltas', () => {
    const f = fold()
    f.push('step/start', { turn: 1, step: 1 })
    f.push('assistant/message', { turn: 1, step: 1, message: message('done'), stream: streamOf([
      [1000, { type: 'usage', usage: { inputTokens: 5, outputTokens: 30 } }],
      [2000, { type: 'text-delta', index: 0, text: 'trailing' }],
    ]) }, 'append')
    expect(f.view()).toMatchObject({ outputTokens: 30, estimated: false })
  })
  it('replaces failed attempts on retry and removes aborted estimates', () => {
    const f = fold()
    f.push('step/start', { turn: 1, step: 1 })
    f.push('assistant/attempt', { turn: 1, step: 1, stream: streamOf([[1000, { type: 'text-delta', index: 0, text: 'discarded '.repeat(50) }]]) })
    expect(f.view().outputTokens).toBeGreaterThan(50)
    f.push('assistant/message', { turn: 1, step: 1, message: message('done'), stream: streamOf([[2000, { type: 'text-delta', index: 0, text: 'done' }]]) }, 'append')
    expect(f.view().outputTokens).toBe(9)
    f.push('step/end', { turn: 1, step: 1 })
    f.push('turn/end', { turn: 1, reason: { kind: 'aborted' } })
    expect(f.view()).toMatchObject({ outputTokens: 0, estimated: false })
  })
  it('prices sparse mixed blocks and retains throughput between steps', () => {
    const f = fold()
    f.push('step/start', { turn: 1, step: 1 })
    f.push('assistant/message', { turn: 1, step: 1, message: message('done'), stream: streamOf([
      [1000, { type: 'text-delta', index: 0, text: '' }],
      [1100, { type: 'reasoning-delta', index: 0, text: 'think' }],
      [1200, { type: 'reasoning-delta', index: 0, text: 'more' }],
      [1300, { type: 'tool-call-delta', index: 2000, id: 'fixture' as never, name: 'bash', argumentsDelta: '{}' }],
      [1400, { type: 'block-end', index: 0, block: { type: 'text', text: 'fixed' } }],
      [1500, { type: 'text-delta', index: 3, text: 'tail' }],
    ]) }, 'append')
    expect(f.view().outputTokens).toBe(21)
    expect(f.view().tokensPerSecond).toBeGreaterThan(0)
    f.push('step/end', { turn: 1, step: 1 })
    const rate = f.view().tokensPerSecond
    f.push('step/start', { turn: 2, step: 1 })
    f.push('step/end', { turn: 2, step: 1 })
    expect(f.view().tokensPerSecond).toBe(rate)
  })
  it('uses startSeq/endSeq surface replacements and rejects invalid ranges', () => {
    const f = fold()
    const user = (text: string) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
    const startSeq = f.push('user/message', user('one'), 'append')
    const endSeq = f.push('user/message', user('two'), 'append')
    f.push('user/message', user('three'), { op: 'replace', startSeq, endSeq })
    f.push('step/start', { turn: 1, step: 1 })
    expect(f.view().uncachedInputTokens).toBe(10)
    expect(() => f.push('user/message', user('bad'), { op: 'replace', startSeq: 20, endSeq: 0 })).toThrow('invalid current range')
  })
  it('registers with the official V3 registry and reads real Session events', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin({ inject, apply })
    const session = ctx.sessions.create()
    session.append('step/start', { turn: 1, step: 1 })
    session.append('assistant/message', { turn: 1, step: 1, message: message(''), stream: streamOf([
      [1000, { type: 'usage', usage: { inputTokens: 5, outputTokens: 0 } }],
    ]) }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    expect(ctx.sessionProjections.snapshot(session).values.liveTokenUsage).toMatchObject({ uncachedInputTokens: 5, outputTokens: 0, estimated: false })
  })
})
