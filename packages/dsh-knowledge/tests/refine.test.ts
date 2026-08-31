import { describe, expect, it } from 'vitest'

import { refineKnowledgeWithModel } from '../src/core/refine.ts'

describe('knowledge model refinement', () => {
  it('uses the selected route and parses a bounded structured note', async () => {
    let request: Record<string, unknown> | undefined
    const stream = async function* () {
      const text = JSON.stringify({ kind: 'method', title: '整理后的标题', content: '可复用的方法', category: '产品', tags: ['复盘'] })
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const update = await refineKnowledgeWithModel({
      llm: { stream: (input: Record<string, unknown>) => { request = input; return stream() } } as never,
      provider: 'zhipu', model: 'glm-5.3-flash', title: '原题', content: '原笔记', tags: [], source: '外部原文', signal: new AbortController().signal,
    })
    expect(request).toMatchObject({ provider: 'zhipu', model: 'glm-5.3-flash', temperature: 0.1 })
    expect(update).toEqual({ kind: 'method', title: '整理后的标题', content: '可复用的方法', category: '产品', tags: ['复盘'] })
  })

  it('fails closed when model output contains credential material', async () => {
    const stream = async function* () {
      const text = JSON.stringify({ kind: 'fact', title: '凭证', content: 'Authorization: Bearer test-redact-value', tags: [] })
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    await expect(refineKnowledgeWithModel({
      llm: { stream: () => stream() } as never,
      provider: 'provider', model: 'model', title: '原题', content: '原笔记', tags: [], source: '外部原文', signal: new AbortController().signal,
    })).rejects.toThrow('sensitive-material')
  })
})
