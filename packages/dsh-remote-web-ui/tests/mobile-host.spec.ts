import { describe, expect, it, vi } from 'vitest'
import { AssistantStreamAccumulator } from '@deepseek-ai/dsh-llm/assistant-stream'
import { createMobileHost } from '../src/mobile-host.ts'

const request = (payload: unknown) => ({ rpcId: 'fixture' as never, payload })
const opening = { type: 'snapshot', records: [], projections: { values: {} }, cursor: 0, hasMore: false }
describe('official controller phone adapter', () => {
  it('restores a partial attempt on reconnect, ignores repeated chunks, and delivers authoritative commits', async () => {
    const initial = new AssistantStreamAccumulator()
    initial.push({ time: 1000, chunk: { type: 'text-delta', index: 0, text: 'Hello' } })
    const follow = vi.fn(async function* () {
      yield { ...opening, assistantStream: { revision: 2, activeAttempt: { attemptId: 'attempt', startedAfterSeq: 0, turn: 1, step: 1, nextIndex: 1, stream: initial.snapshot() } } }
      yield { type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'attempt', revision: 3, index: 1, time: 2000, chunk: { type: 'text-delta', index: 0, text: ' world' } } }
      yield { type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'attempt', revision: 3, index: 1, time: 2000, chunk: { type: 'text-delta', index: 0, text: ' world' } } }
      yield { type: 'event', event: { type: 'assistant/message', seq: 1, time: 2100, data: {} } }
      yield { type: 'assistant-stream', frame: { type: 'end', attemptId: 'attempt', revision: 4, index: 2, outcome: { kind: 'committed', eventType: 'assistant/message', seq: 1 } } }
    })
    const host = createMobileHost({ sessionController: { follow, control: async function* () {
      yield { type: 'projection', sessionId: 'other', key: 'permissions', value: 'private' }
      yield { type: 'projection', sessionId: 'selected', key: 'permissions', value: 'fixture' }
    } } } as never)
    const frames: any[] = []
    for await (const frame of host.events.mux(request({ sessionId: 'selected' }), new AbortController().signal)) frames.push(frame.payload)
    expect(follow).toHaveBeenCalledWith(expect.objectContaining({ assistantStream: true, address: { kind: 'session', sessionId: 'selected' } }), expect.any(AbortSignal))
    expect(frames.filter(frame => frame.type === 'session/assistant').map(frame => frame.value?.text ?? null)).toEqual(['Hello', 'Hello world', null])
    expect(frames.some(frame => frame.type === 'session/event')).toBe(true)
    expect(frames.filter(frame => frame.type === 'session/projection')).toEqual([{ type: 'session/projection', sessionId: 'selected', key: 'permissions', value: 'fixture' }])
  })
  it('rejects a missing stream chunk so reconnect can recover from the official baseline', async () => {
    const host = createMobileHost({ sessionController: {
      follow: async function* () {
        yield opening
        yield { type: 'assistant-stream', frame: { type: 'start', attemptId: 'attempt', turn: 1, step: 1, startedAfterSeq: 0 } }
        yield { type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'attempt', index: 2, time: 1000, chunk: { type: 'text-delta', index: 0, text: 'gap' } } }
      }, control: async function* () {},
    } } as never)
    await expect((async () => { for await (const _ of host.events.mux(request({ sessionId: 'selected' }), new AbortController().signal)) {} })()).rejects.toThrow('reconnect required')
  })
  it('validates phone prompts and supplies the official request identity', async () => {
    const prompt = vi.fn(async () => ({ accepted: true }))
    const host = createMobileHost({ sessionController: { prompt } } as never)
    await host.sessions.prompt(request({ sessionId: 'selected', mode: 'queue', content: [{ type: 'text', text: 'Synthetic task' }] }))
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) }), expect.any(AbortSignal))
    await expect(host.sessions.prompt(request({ sessionId: 'selected', mode: 'queue', content: [{ type: 'text', text: '' }] }))).rejects.toThrow()
    expect(prompt).toHaveBeenCalledTimes(1)
  })
})
