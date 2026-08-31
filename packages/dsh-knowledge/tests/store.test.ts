import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { KnowledgeStore } from '../src/core/store.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('KnowledgeStore', () => {
  it('creates candidates and lists newest records first by status', async () => {
    const store = await makeStore()
    const first = await store.propose(proposal('第一条'), { now: '2026-08-31T08:00:00.000Z' })
    const second = await store.propose(proposal('第二条'), { now: '2026-08-31T09:00:00.000Z' })
    expect(first.status).toBe('candidate')
    expect(await store.list({ status: 'candidate' })).toEqual([second, first])
    expect(await store.list({ status: 'confirmed' })).toEqual([])
  })

  it('confirms or dismisses candidates and keeps final states irreversible', async () => {
    const store = await makeStore()
    const confirmedCandidate = await store.propose(proposal('确认项'))
    const confirmed = await store.confirm(confirmedCandidate.id, { now: '2026-08-31T10:00:00.000Z' })
    expect(confirmed.status).toBe('confirmed')
    expect(confirmed.confirmedAt).toBe('2026-08-31T10:00:00.000Z')
    expect(await store.confirm(confirmed.id, { now: '2026-08-31T11:00:00.000Z' })).toEqual(confirmed)
    await expect(store.dismiss(confirmed.id)).rejects.toThrow(/final state/u)

    const dismissedCandidate = await store.propose(proposal('忽略项'))
    const dismissed = await store.dismiss(dismissedCandidate.id, { now: '2026-08-31T12:00:00.000Z' })
    expect(dismissed.status).toBe('dismissed')
    await expect(store.confirm(dismissed.id)).rejects.toThrow(/final state/u)
  })

  it('uses private files and leaves no temporary files after concurrent transitions', async () => {
    const store = await makeStore()
    const item = await store.propose(proposal('并发项'))
    const results = await Promise.all([
      store.confirm(item.id, { now: '2026-08-31T13:00:00.000Z' }),
      store.confirm(item.id, { now: '2026-08-31T13:00:00.000Z' }),
    ])
    expect(results[0]).toEqual(results[1])
    const names = await readdir(join(store.root, 'items'))
    expect(names).toEqual([`${item.id}.json`])
    const info = await stat(join(store.root, 'items', `${item.id}.json`))
    expect(info.mode & 0o077).toBe(0)
    expect(JSON.parse(await readFile(join(store.root, 'items', `${item.id}.json`), 'utf8')).status).toBe('confirmed')
  })

  it('rejects invalid ids and ignores damaged records during list', async () => {
    const store = await makeStore()
    const good = await store.propose(proposal('有效项'))
    await writeFile(join(store.root, 'items', 'knowledge_ffffffffffffffffffffffffffffffff.json'), '{broken', 'utf8')
    await writeFile(join(store.root, 'items', '../outside.json'), '{}', 'utf8')
    expect(await store.list()).toEqual([good])
    await expect(store.confirm('../outside')).rejects.toThrow(/id/u)
  })

  it('keeps a private immutable source snapshot while editing the knowledge note', async () => {
    const store = await makeStore()
    const item = await store.propose({ ...proposal('导入项'), category: '产品设计', source: { kind: 'manual', label: '外部原文' } }, { snapshot: '未经模型加工的完整原文' })
    expect(item.source.hasSnapshot).toBe(true)
    expect(await store.readSnapshot(item.id)).toBe('未经模型加工的完整原文')
    const updated = await store.update(item.id, { kind: 'method', title: '编辑后的知识', content: '用户修订后的知识正文', category: '方法库', tags: ['复盘'] })
    expect(updated).toMatchObject({ title: '编辑后的知识', category: '方法库', source: item.source })
    expect(await store.readSnapshot(item.id)).toBe('未经模型加工的完整原文')
    const info = await stat(join(store.root, 'sources', `${item.id}.txt`))
    expect(info.mode & 0o077).toBe(0)
  })
})

async function makeStore(): Promise<KnowledgeStore> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-knowledge-store-'))
  roots.push(root)
  return new KnowledgeStore(root)
}

function proposal(title: string) {
  return {
    kind: 'lesson' as const,
    title,
    content: `${title}的可复用内容`,
    project: 'dsh-design-desktop',
    tags: ['Harness'],
    confidence: 0.8,
    source: { kind: 'conversation' as const, label: '知识层实现' },
  }
}
