import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KNOWLEDGE_PROMPT_GUIDANCE, apply, createKnowledgeProposalTool, createKnowledgeRpcHandler } from '../src/index.ts'
import { KnowledgeStore } from '../src/core/store.ts'
import { KNOWLEDGE_RPC_CHANNEL } from '../src/wire.ts'
import { registerLocalRpc } from '@harness-design/dsh-local-rpc'

// Business wiring uses a captured handler. The real transport/authentication
// boundary is exercised independently in dsh-local-rpc and desktop integration.
vi.mock('@harness-design/dsh-local-rpc', () => ({ registerLocalRpc: vi.fn() }))

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('knowledge Host contract', () => {
  it('requires explicit consent and current revision for trash and isolates deleted items from retrieval', async () => {
    const store = await makeStore()
    const item = await store.propose(proposal('合成回收站'))
    const handle = createKnowledgeRpcHandler(store)
    const request = { id: item.id, expectedUpdatedAt: item.updatedAt, confirmed: true }
    expect(await handle('trash', { ...request, confirmed: false })).toMatchObject({ value: { error: 'knowledge-consent-required' } })
    expect(await handle('trash', { ...request, expectedUpdatedAt: '2020-01-01T00:00:00Z' })).toMatchObject({ value: { error: 'knowledge-revision-conflict' } })
    expect(await handle('trash', { ...request, path: '/outside' })).toMatchObject({ value: { error: 'knowledge-invalid-request' } })
    expect(await handle('trash', request)).toMatchObject({ value: { deleted: true } })
    expect(await handle('list', {})).toMatchObject({ value: { items: [] } })
    expect(await handle('trash-list', {})).toMatchObject({ value: { items: [item] } })
    expect(await handle('restore', { id: item.id, confirmed: false })).toMatchObject({ value: { error: 'knowledge-consent-required' } })
    expect(await handle('restore', { id: item.id, confirmed: true })).toMatchObject({ value: { item } })
  })
  it('forwards article metadata and cancellation and creates only one record per import request', async () => {
    const store = await makeStore()
    const handle = createKnowledgeRpcHandler(store)
    const input = { requestId: 'fixture-import', proposal: proposal('文章'), snapshot: '合成完整原文', article: { format: 'markdown', truncated: false } }
    const result = await handle('create', input)
    expect(result).toMatchObject({ value: { item: { article: input.article } } })
    expect(await handle('create', input)).toEqual(result)
    expect(await store.list()).toHaveLength(1)
    const controller = new AbortController(); controller.abort()
    expect(await handle('create', { ...input, requestId: 'cancelled-import' }, controller.signal)).toMatchObject({ value: { error: 'knowledge-cancelled' } })
    expect(await store.list()).toHaveLength(1)
  })

  it('uses the configured default without opening a session through the actual plugin wiring', async () => {
    const root = await mkdtemp(join(tmpdir(), 'knowledge-default-route-'))
    roots.push(root)
    vi.stubEnv('DSH_HOME', root)
    let handle!: ReturnType<typeof createKnowledgeRpcHandler>
    vi.mocked(registerLocalRpc).mockImplementation((_ctx, _channel, handler) => { handle = handler as typeof handle; return () => {} })
    const stream = vi.fn(function* () {
      const text = JSON.stringify({ text: '无会话摘要', tags: ['建议'] })
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })
    const get = vi.fn(() => undefined)
    apply({
      llm: { listProviders: () => [{ id: 'fixture', name: 'Fixture' }], listModels: async () => [{ provider: 'fixture', id: 'model', name: 'Model' }], stream },
      agents: { get },
      agentDefaultModel: { currentSelection: () => ({ provider: 'fixture', model: 'model' }) },
      effect: (factory: () => unknown) => factory(), tools: { register: () => () => {} }, systemPrompt: { section: () => () => {} },
    } as never)
    const directory = (await handle('model-routes', {})).value as { selectedRouteId: string }
    expect(directory.selectedRouteId).toMatch(/^route_/)
    const created = (await handle('create', { proposal: proposal('合成文章'), snapshot: '合成原文' })).value as { item: { id: string; updatedAt: string } }
    const request = { id: created.item.id, expectedUpdatedAt: created.item.updatedAt, confirmed: true, routeId: directory.selectedRouteId }
    expect(await handle('summarize', { ...request, confirmed: false })).toMatchObject({ value: { error: 'knowledge-consent-required' } })
    expect(stream).not.toHaveBeenCalled()
    expect(await handle('summarize', request)).toMatchObject({ value: { item: { summary: { text: '无会话摘要', provider: 'fixture', model: 'model' } } } })
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({ provider: 'fixture', model: 'model' }))
    expect(get).not.toHaveBeenCalled()
  })

  it('times out a noncooperative model and does not expose raw provider errors', async () => {
    const store = await makeStore()
    const item = await store.propose(proposal('超时'))
    const request = { id: item.id, routeId: 'route', expectedUpdatedAt: item.updatedAt, confirmed: true }
    const handle = createKnowledgeRpcHandler(store, { summarize: () => new Promise(() => {}) })
    vi.useFakeTimers()
    const pending = handle('summarize', request)
    // Let the real file read settle before advancing the timeout clock.
    await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await pending).toMatchObject({ value: { error: 'knowledge-model-timeout' } })
    vi.useRealTimers()
    const failing = createKnowledgeRpcHandler(store, { summarize: async () => { throw new Error('fixture upstream response which must remain private') } })
    expect(await failing('summarize', request)).toEqual({ ok: true, value: { error: 'knowledge-operation-failed' } })
    expect((await store.read(item.id)).summary).toBeUndefined()
  })
  it('reads detail only on demand and handles invalid IDs safely', async () => {
    const store = await makeStore()
    const item = await store.propose(proposal('文章'), { snapshot: 'UNIQUE_SYNTHETIC_BODY' })
    const handle = createKnowledgeRpcHandler(store)
    expect(JSON.stringify(await handle('list', {}))).not.toContain('UNIQUE_SYNTHETIC_BODY')
    expect(await handle('detail', { id: item.id })).toMatchObject({ value: { body: 'UNIQUE_SYNTHETIC_BODY', bodyKind: 'legacy-snapshot' } })
    expect(await handle('detail', { id: '../outside' })).toMatchObject({ value: { error: 'knowledge-invalid-request' } })
  })

  it('requires consent, persists only summary, and blocks late cancelled writes', async () => {
    const store = await makeStore()
    const item = await store.propose(proposal('独立摘要'), { snapshot: 'IMMUTABLE_SOURCE' })
    const controller = new AbortController()
    const summarize = vi.fn(async () => ({ summary: { text: '摘要', provider: 'fixture', model: 'fixture-model', generatedAt: item.updatedAt, sourceTruncated: false, editedByUser: false }, suggestedTags: ['建议'] }))
    const handle = createKnowledgeRpcHandler(store, { summarize })
    const request = { id: item.id, routeId: 'fixture-route', confirmed: true, expectedUpdatedAt: item.updatedAt }
    expect(await handle('summarize', { ...request, confirmed: false })).toMatchObject({ value: { error: 'knowledge-consent-required' } })
    expect(summarize).not.toHaveBeenCalled()
    const result = await handle('summarize', request)
    expect(result).toMatchObject({ value: { item: { content: item.content, status: 'candidate', summary: { text: '摘要' } }, suggestedTags: ['建议'] } })
    const saved = await store.read(item.id)
    expect(await handle('edit-summary', { id: item.id, text: '人工摘要', expectedUpdatedAt: saved.updatedAt })).toMatchObject({ value: { item: { summary: { text: '人工摘要', editedByUser: true, model: 'fixture-model' } } } })
    summarize.mockImplementationOnce(async () => { controller.abort(); return { summary: { ...saved.summary!, text: '迟到结果' }, suggestedTags: [] } })
    expect(await handle('summarize', { ...request, expectedUpdatedAt: (await store.read(item.id)).updatedAt }, controller.signal)).toMatchObject({ value: { error: 'knowledge-cancelled' } })
    expect((await store.read(item.id)).summary?.text).toBe('人工摘要')
    expect(await store.readSnapshot(item.id)).toBe('IMMUTABLE_SOURCE')
  })
  it('lists, confirms, and dismisses through a bounded RPC projection', async () => {
    const store = await makeStore()
    const first = await store.propose(proposal('待确认一'))
    const second = await store.propose(proposal('待确认二'))
    const handle = createKnowledgeRpcHandler(store)

    expect(await handle('list', { status: 'candidate' })).toMatchObject({ ok: true, value: { items: expect.arrayContaining([first, second]) } })
    expect(await handle('confirm', { id: first.id })).toMatchObject({ ok: true, value: { item: { id: first.id, status: 'confirmed' } } })
    expect(await handle('dismiss', { id: second.id })).toMatchObject({ ok: true, value: { item: { id: second.id, status: 'dismissed' } } })
    expect(await handle('unknown', {})).toEqual({ ok: true, value: { error: 'unknown-endpoint' } })
  })

  it('requires explicit confirmation and a confirmed item for move-tag', async () => {
    const store = await makeStore()
    const candidate = await store.propose({ ...proposal('待确认标签'), tags: ['A'] })
    const handle = createKnowledgeRpcHandler(store)
    const missingConfirmation = await handle('move-tag', { id: candidate.id, from: 'A', to: 'B', expectedUpdatedAt: candidate.updatedAt })
    expect(missingConfirmation).toMatchObject({ value: { error: 'knowledge-consent-required' } })
    const confirmed = await store.confirm(candidate.id)
    expect(await handle('move-tag', { id: confirmed.id, from: 'A', to: 'B', expectedUpdatedAt: confirmed.updatedAt, confirmed: true })).toMatchObject({ value: { item: { tags: ['B'], status: 'confirmed' } } })
    expect(await handle('move-tag', { id: confirmed.id, from: 'A', to: 'C', expectedUpdatedAt: confirmed.updatedAt, confirmed: true })).toMatchObject({ value: { error: 'knowledge-revision-conflict' } })
  })

  it('creates and edits manual knowledge through loopback RPC while preserving provenance', async () => {
    const store = await makeStore()
    const handle = createKnowledgeRpcHandler(store)
    const created = await handle('create', { proposal: { kind: 'fact', title: '外部记录', content: '本地正文', category: '研究', source: { kind: 'manual', label: '外部记录' } }, snapshot: '完整原始内容' })
    const item = (created.value as { item: { id: string } }).item
    const updated = await handle('update', { id: item.id, update: { kind: 'lesson', title: '编辑后', content: '用户确认后的正文', category: '复盘', tags: ['方法'] } })
    expect(updated).toMatchObject({ ok: true, value: { item: { title: '编辑后', category: '复盘', source: { label: '外部记录', hasSnapshot: true } } } })
    expect(await store.readSnapshot(item.id)).toBe('完整原始内容')
  })

  it('requires explicit confirmation before invoking the current-session model refiner', async () => {
    const store = await makeStore()
    const item = await store.propose(proposal('本地原文'), { snapshot: '只在用户确认后发送的原始内容' })
    const refine = vi.fn(async () => ({ item: await store.update(item.id, { kind: 'method', title: '模型整理', content: '整理后的内容', tags: ['方法'] }), model: 'provider/model' }))
    const handle = createKnowledgeRpcHandler(store, { refine })
    expect(await handle('refine', { id: item.id, sessionId: 'session-1', confirmed: false })).toMatchObject({ ok: true, value: { error: expect.stringContaining('explicit confirmation') } })
    expect(refine).not.toHaveBeenCalled()
    expect(await handle('refine', { id: item.id, sessionId: 'session-1', confirmed: true })).toMatchObject({ ok: true, value: { item: { title: '模型整理', source: { hasSnapshot: true } }, model: 'provider/model' } })
    expect(refine).toHaveBeenCalledTimes(1)
    expect(await store.readSnapshot(item.id)).toBe('只在用户确认后发送的原始内容')
  })

  it('does not overwrite the source record when model refinement fails', async () => {
    const store = await makeStore()
    const item = await store.propose(proposal('失败前的标题'), { snapshot: '保持不变的原始快照' })
    const handle = createKnowledgeRpcHandler(store, { refine: async () => { throw new Error('model unavailable') } })
    expect(await handle('refine', { id: item.id, sessionId: 'session-1', confirmed: true })).toMatchObject({ ok: true, value: { error: 'model unavailable' } })
    expect(await store.read(item.id)).toMatchObject({ id: item.id, title: '失败前的标题', status: 'candidate' })
    expect(await store.readSnapshot(item.id)).toBe('保持不变的原始快照')
  })

  it('lets the agent propose candidates but exposes no confirmation action or storage path', async () => {
    const store = await makeStore()
    const tool = createKnowledgeProposalTool(store) as unknown as {
      name: string
      parameters: Record<string, unknown>
      execute: (args: Record<string, unknown>, exec: unknown) => Promise<Record<string, unknown>>
    }
    expect(tool.name).toBe('knowledge_propose')
    expect(tool.parameters).not.toHaveProperty('status')
    expect(tool.parameters).not.toHaveProperty('confirm')
    const result = await tool.execute({
      kind: 'method',
      title: '先跑最小探针',
      content: '连接器配置先走受控测试工具，不扫描 app.asar 或猜测存储位置。',
      tags: ['Harness', '连接器'],
      confidence: 0.9,
    }, { agent: { session: { header: { cwd: '/workspace/dsh-design-desktop' } } } })
    expect(result).toMatchObject({ proposed: true, status: 'candidate', title: '先跑最小探针' })
    expect(JSON.stringify(result)).not.toContain(store.root)
    expect(await store.list({ status: 'confirmed' })).toEqual([])
    expect(await store.list({ status: 'candidate' })).toHaveLength(1)
  })

  it('registers loopback RPC, proposal tool, and sparse suggestion guidance', () => {
    vi.mocked(registerLocalRpc).mockImplementation(() => () => {})
    const register = vi.fn(() => vi.fn())
    const section = vi.fn(() => vi.fn())
    const effects: Array<() => unknown> = []
    const ctx = {
      tools: { register },
      systemPrompt: { section },
      effect: (factory: () => unknown) => { effects.push(factory); return factory() },
    }
    apply(ctx as never)
    expect(registerLocalRpc).toHaveBeenCalledWith(ctx, KNOWLEDGE_RPC_CHANNEL, expect.any(Function))
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ name: 'knowledge_propose' }))
    expect(section).toHaveBeenCalledWith(expect.objectContaining({ name: 'plugin:knowledge-suggestions', text: KNOWLEDGE_PROMPT_GUIDANCE }))
    expect(KNOWLEDGE_PROMPT_GUIDANCE).toContain('Only propose')
    expect(KNOWLEDGE_PROMPT_GUIDANCE).toContain('Do not dump transcripts')
  })
})

async function makeStore(): Promise<KnowledgeStore> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-knowledge-plugin-'))
  roots.push(root)
  return new KnowledgeStore(root)
}

function proposal(title: string) {
  return {
    kind: 'lesson' as const,
    title,
    content: `${title}的可复用内容`,
    source: { kind: 'conversation' as const, label: '插件测试' },
  }
}
