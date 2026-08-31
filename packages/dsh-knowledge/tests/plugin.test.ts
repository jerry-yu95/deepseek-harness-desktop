import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KNOWLEDGE_PROMPT_GUIDANCE, apply, createKnowledgeProposalTool, createKnowledgeRpcHandler } from '../src/index.ts'
import { KnowledgeStore } from '../src/core/store.ts'
import { KNOWLEDGE_RPC_CHANNEL } from '../src/wire.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('knowledge Host contract', () => {
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
    const rpcHandle = vi.fn(() => vi.fn())
    const register = vi.fn(() => vi.fn())
    const section = vi.fn(() => vi.fn())
    const effects: Array<() => unknown> = []
    const ctx = {
      connection: { rpc: { handle: rpcHandle } },
      tools: { register },
      systemPrompt: { section },
      effect: (factory: () => unknown) => { effects.push(factory); return factory() },
    }
    apply(ctx as never)
    expect(rpcHandle).toHaveBeenCalledWith(KNOWLEDGE_RPC_CHANNEL, expect.any(Function), { authority: 'loopback' })
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
