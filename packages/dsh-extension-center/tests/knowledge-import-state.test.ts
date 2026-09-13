import { describe, expect, it } from 'vitest'
import { initialImportState, knowledgeImportReducer as reduce } from '../src/client/panel/knowledge-import-state.ts'

const detail = { item: { id: 'fixture', status: 'candidate' }, body: '原文', bodyKind: 'article' } as never

describe('knowledge import attempts', () => {
  it('starts immediately and ignores repeated submit and cancelled late results', () => {
    const running = reduce(initialImportState, { type: 'start', attemptId: 1, requestId: 'request-1' })
    expect(running.stage).toBe('fetching')
    expect(reduce(running, { type: 'start', attemptId: 2, requestId: 'request-2' })).toBe(running)
    const cancelled = reduce(running, { type: 'cancel', attemptId: 1 })
    expect(reduce(cancelled, { type: 'captured', attemptId: 1, detail })).toBe(cancelled)
    const retry = reduce(cancelled, { type: 'start', attemptId: 2, requestId: 'request-2' })
    expect(reduce(retry, { type: 'failed', attemptId: 1, error: 'old' })).toBe(retry)
    expect(reduce(retry, { type: 'reset', attemptId: 1 })).toBe(retry)
  })

  it('preserves the candidate after summary failure and retries only summary', () => {
    let state = reduce(initialImportState, { type: 'start', attemptId: 1, requestId: 'request-1' })
    state = reduce(state, { type: 'progress', attemptId: 1, stage: 'structuring' })
    state = reduce(state, { type: 'captured', attemptId: 1, detail })
    expect(state.stage).toBe('preview')
    state = reduce(state, { type: 'summarize', attemptId: 2 })
    state = reduce(state, { type: 'failed', attemptId: 2, error: 'knowledge-model-timeout' })
    expect(state.detail).toBe(detail)
    state = reduce(state, { type: 'summarize', attemptId: 3 })
    expect(state.stage).toBe('summarizing')
    expect(state.detail).toBe(detail)
    const cancelled = reduce(state, { type: 'cancel', attemptId: 3 })
    expect(cancelled.detail).toBe(detail)
    expect(reduce(cancelled, { type: 'summarized', attemptId: 3, item: { id: 'fixture' } as never, suggestedTags: [] })).toBe(cancelled)
  })
})
