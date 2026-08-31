import { describe, expect, it } from 'vitest'

import { classifyModelConnectionError, testModelConnection } from '../src/model-connection.ts'

describe('model connection diagnostics', () => {
  it('turns 404 provider errors into actionable endpoint guidance', () => {
    const result = classifyModelConnectionError(new Error('404 Not Found'))
    expect(result.category).toBe('endpoint-not-found')
    expect(result.detail).toContain('Base URL')
    expect(result.detail).toContain('/v1')
  })

  it('uses a minimal real inference request and accepts a text response', async () => {
    const stream = async function* () {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'OK' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'OK' } }
      yield { type: 'usage', usage: { inputTokens: 4, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const result = await testModelConnection({
      provider: 'provider', model: 'model', signal: new AbortController().signal,
      llm: {
      resolveModelInfo: async () => ({ provider: 'provider', id: 'model', name: 'Model' }),
      stream: () => stream(),
      } as never,
    })
    expect(result.ok).toBe(true)
    expect(result.category).toBe('ready')
    expect(result.model).toBe('model')
    expect(result.detail).toContain('推理请求成功')
  })

  it('classifies a missing model separately from a generic 404', () => {
    const result = classifyModelConnectionError(new Error('400 model_not_found'))
    expect(result.category).toBe('model-not-found')
    expect(result.detail).toContain('模型 ID')
  })

  it('classifies a 404 thrown by the live stream', async () => {
    const stream = async function* () {
      throw new Error('404 "Not Found"')
      yield undefined
    }
    const result = await testModelConnection({
      provider: 'provider', model: 'model', signal: new AbortController().signal,
      llm: {
      resolveModelInfo: async () => ({ provider: 'provider', id: 'model', name: 'Model' }),
      stream: () => stream(),
      } as never,
    })
    expect(result.ok).toBe(false)
    expect(result.category).toBe('endpoint-not-found')
  })
})
