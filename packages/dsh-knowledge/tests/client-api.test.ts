import { describe, expect, it, vi } from 'vitest'

import { KnowledgeClientApi } from '../src/client/api.ts'

describe('KnowledgeClientApi', () => {
  it('calls the knowledge channel and projects list and transition results', async () => {
    const item = { id: 'knowledge_0123456789abcdef0123456789abcdef', status: 'candidate' }
    const call = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: { items: [item] } })
      .mockResolvedValueOnce({ ok: true, value: { item: { ...item, status: 'confirmed' } } })
    const api = new KnowledgeClientApi({ rpc: { call } } as never)
    expect(await api.list('candidate')).toEqual([item])
    expect(await api.confirm(item.id)).toMatchObject({ status: 'confirmed' })
    expect(call).toHaveBeenNthCalledWith(1, '/harness-knowledge-v1', 'list', { status: 'candidate' }, undefined)
    expect(call).toHaveBeenNthCalledWith(2, '/harness-knowledge-v1', 'confirm', { id: item.id }, undefined)
  })

  it('turns safe RPC error projections into exceptions', async () => {
    const api = new KnowledgeClientApi({ rpc: { call: vi.fn().mockResolvedValue({ ok: true, value: { error: 'invalid candidate' } }) } } as never)
    await expect(api.list()).rejects.toThrow('invalid candidate')
  })

  it('projects create, update, URL import, and confirmed model refinement without exposing storage paths', async () => {
    const item = { id: 'knowledge_0123456789abcdef0123456789abcdef', status: 'candidate' }
    const call = vi.fn().mockResolvedValue({ ok: true, value: { item } })
    const api = new KnowledgeClientApi({ rpc: { call } } as never)
    const proposal = { kind: 'fact' as const, title: '手动记录', content: '本地内容', source: { kind: 'manual' as const, label: '手动记录' } }
    await api.create(proposal, '原文')
    await api.update(item.id, { kind: 'fact', title: '已编辑', content: '新正文', tags: [] })
    await api.importUrl({ url: 'https://example.com/article', category: '产品' })
    await api.refine(item.id, 'session-1', true)
    expect(call).toHaveBeenNthCalledWith(1, '/harness-knowledge-v1', 'create', { proposal, snapshot: '原文' }, undefined)
    expect(call).toHaveBeenNthCalledWith(2, '/harness-knowledge-v1', 'update', { id: item.id, update: { kind: 'fact', title: '已编辑', content: '新正文', tags: [] } }, undefined)
    expect(call).toHaveBeenNthCalledWith(3, '/harness-knowledge-v1', 'import-url', { url: 'https://example.com/article', category: '产品' }, undefined)
    expect(call).toHaveBeenNthCalledWith(4, '/harness-knowledge-v1', 'refine', { id: item.id, sessionId: 'session-1', confirmed: true }, undefined)
  })
})
