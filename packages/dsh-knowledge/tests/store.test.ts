import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KnowledgeStore } from '../src/core/store.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('KnowledgeStore', () => {
  it.each(['candidate', 'confirmed'] as const)('restores deleted %s knowledge with its original and images across restart', async status => {
    const store = await makeStore()
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const resource = { id: 'image_11111111111111111111111111111111', alt: '合成图片', order: 0, status: 'ready' as const, mimeType: 'image/png' as const, byteLength: Buffer.from(data, 'base64').length }
    let item = await store.proposeOnce('trash-fixture', proposal('合成删除条目'), { snapshot: '合成原文', article: { format: 'markdown', truncated: false, images: [resource] }, articleResources: [{ ...resource, data }] })
    if (status === 'confirmed') item = await store.confirm(item.id)
    const detail = await store.readDetail(item.id)
    await expect(store.trash(item.id, 'stale')).rejects.toThrow('revision conflict')
    const abort = new AbortController(); abort.abort()
    await expect(store.trash(item.id, item.updatedAt, { signal: abort.signal })).rejects.toThrow('knowledge-cancelled')
    await store.trash(item.id, item.updatedAt)
    const restarted = new KnowledgeStore(store.root)
    expect(await restarted.list()).toEqual([])
    expect(await restarted.list({}, true)).toEqual([item])
    await expect(restarted.readDetail(item.id)).rejects.toThrow()
    await expect(restarted.update(item.id, { kind: item.kind, title: 'late', content: 'late', tags: [] })).rejects.toThrow()
    await expect(restarted.proposeOnce('trash-fixture', proposal('late'))).rejects.toThrow('knowledge-deleted')
    expect(await restarted.restore(item.id)).toEqual(item)
    expect(await restarted.readDetail(item.id)).toEqual(detail)
    expect(await restarted.list({}, true)).toEqual([])
  })
  it('persists empty article notes and unnamed images without relaxing manual notes', async () => {
    const store = await makeStore()
    const input = { ...proposal('空白笔记'), content: '' }
    const item = await store.propose(input, { snapshot: '合成原文', article: { format: 'markdown', truncated: false, excerpt: '合成原文', images: [{ id: 'image_11111111111111111111111111111111', alt: '', order: 0, status: 'unavailable' }] } })
    expect((await store.readDetail(item.id)).item.content).toBe('')
    expect((await store.update(item.id, { kind: item.kind, title: item.title, content: '', tags: ['新标签'] })).content).toBe('')
    await expect(store.propose(input)).rejects.toThrow('content')
  })
  it('does not commit note, confirmation or summary edits after cancellation', async () => {
    const store = await makeStore()
    const item = await store.propose(proposal('取消写入'))
    const controller = new AbortController(); controller.abort()
    await expect(store.update(item.id, { kind: item.kind, title: item.title, content: '不应保存', tags: [] }, { signal: controller.signal })).rejects.toThrow('knowledge-cancelled')
    await expect(store.confirm(item.id, { signal: controller.signal })).rejects.toThrow('knowledge-cancelled')
    expect(await store.read(item.id)).toEqual(item)
  })
  it('keeps image positions when an earlier image failed and cleans partial cache writes', async () => {
    const store = await makeStore()
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const first = { id: 'image_11111111111111111111111111111111', alt: '失败', order: 0, offset: 1, status: 'unavailable' as const }
    const ready = { id: 'image_22222222222222222222222222222222', alt: '成功', order: 1, offset: 2, status: 'ready' as const, mimeType: 'image/png' as const, byteLength: Buffer.from(data, 'base64').length }
    const item = await store.propose(proposal('部分图片'), { snapshot: '甲乙丙', article: { format: 'markdown', truncated: false, images: [first, ready] }, articleResources: [{ ...ready, data }] })
    expect((await store.readDetail(item.id)).images).toEqual([first, { ...ready, data }])
    await writeFile(join(store.root, 'resources', item.id, `${ready.id}.bin`), 'broken')
    expect((await store.readDetail(item.id)).images?.[1]).toMatchObject({ status: 'unavailable', offset: 2 })
    const controller = new AbortController()
    const internal = store as unknown as { writeArticleResources: (...args: any[]) => Promise<void> }
    const write = internal.writeArticleResources.bind(store)
    vi.spyOn(internal, 'writeArticleResources').mockImplementation(async (...args) => { await write(...args); controller.abort() })
    await expect(store.propose(proposal('取消图片'), { snapshot: '甲乙丙', article: { format: 'markdown', truncated: false, images: [first, ready] }, articleResources: [{ ...ready, data }], signal: controller.signal })).rejects.toThrow('knowledge-cancelled')
    expect(await readdir(join(store.root, 'resources'))).toEqual([item.id])
  })
  it('cleans a source when cancellation arrives between snapshot and candidate commit', async () => {
    const store = await makeStore()
    const controller = new AbortController()
    const internal = store as unknown as { writeSnapshot: (id: string, text: string, signal?: AbortSignal) => Promise<void> }
    const write = internal.writeSnapshot.bind(store)
    vi.spyOn(internal, 'writeSnapshot').mockImplementation(async (...args) => { await write(...args); controller.abort() })
    await expect(store.propose(proposal('中途取消'), { snapshot: '合成原文', signal: controller.signal })).rejects.toThrow('knowledge-cancelled')
    expect(await store.list()).toEqual([])
    expect(await readdir(join(store.root, 'sources'))).toEqual([])
  })

  it('does not persist cancelled proposals and deduplicates a stable import request', async () => {
    const store = await makeStore()
    const controller = new AbortController()
    controller.abort()
    await expect(store.propose(proposal('取消'), { snapshot: '合成原文', signal: controller.signal })).rejects.toThrow('knowledge-cancelled')
    expect(await store.list()).toEqual([])
    const items = await Promise.all([store.proposeOnce('request-1', proposal('单条'), { snapshot: '固定原文' }), store.proposeOnce('request-1', proposal('单条'), { snapshot: '固定原文' })])
    expect(items[0].id).toBe(items[1].id)
    const restarted = new KnowledgeStore(store.root)
    expect((await restarted.proposeOnce('request-1', proposal('不应覆盖'), { snapshot: '不应覆盖' })).id).toBe(items[0].id)
    expect(await restarted.readSnapshot(items[0].id)).toBe('固定原文')
    expect(await store.list()).toHaveLength(1)
  })

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

  it('moves one confirmed article tag atomically and rejects candidates, missing sources, and stale revisions', async () => {
    const store = await makeStore()
    const candidate = await store.propose({ ...proposal('可移动'), tags: ['A', 'X'] })
    await expect(store.moveTag(candidate.id, { from: 'A', to: 'B' }, candidate.updatedAt)).rejects.toThrow(/confirmed/u)
    const item = await store.confirm(candidate.id, { now: '2026-08-31T10:00:00.000Z' })
    const moved = await store.moveTag(item.id, { from: 'A', to: 'B' }, item.updatedAt)
    expect(moved.tags).toEqual(['X', 'B'])
    expect(moved.confirmedAt).toBe(item.confirmedAt)
    expect(moved.source).toEqual(item.source)
    expect(await store.moveTag(item.id, { from: 'B', to: 'B' }, moved.updatedAt)).toEqual(moved)
    await expect(store.moveTag(item.id, { from: 'missing', to: 'B' }, moved.updatedAt)).rejects.toThrow(/source/u)
    await expect(store.moveTag(item.id, { from: 'B', to: 'C' }, item.updatedAt)).rejects.toThrow(/conflict/u)
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

  it('reads an article detail on demand and saves a summary without changing the source or lifecycle', async () => {
    const store = await makeStore()
    const item = await store.propose({ ...proposal('文章'), content: '用户笔记', source: { kind: 'url', label: '文章', uri: 'https://example.com/article' } }, {
      snapshot: '# 标题\n\n完整原文',
      article: { author: '作者', format: 'markdown', truncated: false, originalByteLength: 20 },
    })
    const detail = await store.readDetail(item.id)
    expect(detail).toMatchObject({ item: { id: item.id, content: '用户笔记' }, body: '# 标题\n\n完整原文', bodyKind: 'article' })
    const confirmed = await store.confirm(item.id, { now: '2026-08-31T14:00:00.000Z' })
    const summarized = await store.updateSummary(item.id, {
      text: '独立摘要', provider: 'zhipu', model: 'glm-test', generatedAt: '2026-08-31T15:00:00.000Z', sourceTruncated: false, editedByUser: false,
    })
    expect(summarized).toMatchObject({ id: item.id, status: 'confirmed', confirmedAt: confirmed.confirmedAt, content: '用户笔记', summary: { text: '独立摘要' }, source: item.source })
    expect(await store.readDetail(item.id)).toMatchObject({ body: '# 标题\n\n完整原文', bodyKind: 'article' })
  })

  it('persists article image bytes separately and returns only validated resources on detail read', async () => {
    const store = await makeStore()
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const byteLength = Buffer.from(data, 'base64').byteLength
    const item = await store.propose(proposal('含图文章'), {
      snapshot: '正文与图片位置',
      article: { format: 'markdown', truncated: false, images: [{ id: 'image_0123456789abcdef0123456789abcdef', alt: '示例图', order: 0, status: 'ready', mimeType: 'image/png', byteLength }] },
      articleResources: [{ id: 'image_0123456789abcdef0123456789abcdef', alt: '示例图', order: 0, status: 'ready', mimeType: 'image/png', byteLength, data }],
    })
    const detail = await store.readDetail(item.id)
    expect(detail.images).toEqual([{ id: 'image_0123456789abcdef0123456789abcdef', alt: '示例图', order: 0, status: 'ready', mimeType: 'image/png', byteLength, data }])
    expect(await readFile(join(store.root, 'items', `${item.id}.json`), 'utf8')).not.toContain(data)
  })

  it('falls back to a legacy excerpt when an old record has no snapshot', async () => {
    const store = await makeStore()
    const item = await store.propose(proposal('旧记录'))
    expect(await store.readDetail(item.id)).toMatchObject({ body: item.content, bodyKind: 'legacy-excerpt' })
  })

  it('edits only summary text and rejects a stale concurrent edit', async () => {
    const store = await makeStore()
    const item = await store.propose(proposal('摘要编辑'))
    const summary = { text: '摘要', provider: 'fixture', model: 'fixture-model', generatedAt: item.updatedAt, sourceTruncated: false, editedByUser: false }
    const first = await store.updateSummary(item.id, summary, item.updatedAt, { now: item.updatedAt })
    expect(first.updatedAt).not.toBe(item.updatedAt)
    const edited = await store.editSummary(item.id, '人工修订', first.updatedAt)
    expect(edited.summary).toEqual({ ...summary, text: '人工修订', editedByUser: true })
    expect(edited.content).toBe(item.content)
    await expect(store.editSummary(item.id, '迟到的修改', first.updatedAt)).rejects.toThrow(/revision/)
    expect((await store.read(item.id)).summary?.text).toBe('人工修订')
  })

  it('bounds reads of damaged oversized snapshots and preserves legacy snapshots', async () => {
    const store = await makeStore()
    const item = await store.propose(proposal('历史快照'), { snapshot: '历史原文' })
    expect((await store.readDetail(item.id)).bodyKind).toBe('legacy-snapshot')
    await writeFile(join(store.root, 'sources', `${item.id}.txt`), 'x'.repeat(1_048_577))
    await expect(store.readDetail(item.id)).rejects.toThrow(/snapshot.*large/)
    await rm(join(store.root, 'sources', `${item.id}.txt`))
    expect((await store.readDetail(item.id)).bodyKind).toBe('legacy-excerpt')
  })

  it('does not create a visible record when snapshot persistence fails', async () => {
    const store = await makeStore()
    await writeFile(join(store.root, 'sources'), 'not a directory')
    await expect(store.propose(proposal('写入失败'), { snapshot: '原文' })).rejects.toThrow()
    expect(await store.list()).toEqual([])
  })

  it('rejects summary updates for dismissed records and invalidates concurrent revisions', async () => {
    const store = await makeStore()
    const item = await store.propose(proposal('摘要状态'))
    const dismissed = await store.dismiss(item.id)
    await expect(store.updateSummary(item.id, { text: '不能写入', provider: 'p', model: 'm', generatedAt: dismissed.updatedAt, sourceTruncated: false, editedByUser: false })).rejects.toThrow(/dismissed/u)
    const other = await store.propose(proposal('并发摘要'))
    const before = await store.read(other.id)
    await expect(store.updateSummary(other.id, { text: '摘要', provider: 'p', model: 'm', generatedAt: before.updatedAt, sourceTruncated: false, editedByUser: false }, before.updatedAt.slice(0, -1) + '1')).rejects.toThrow(/revision/u)
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
