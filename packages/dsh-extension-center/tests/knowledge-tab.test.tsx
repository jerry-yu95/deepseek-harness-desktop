import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KnowledgeTab } from '../src/client/panel/KnowledgeTab.tsx'
import { ExtensionPanel } from '../src/client/panel/ExtensionPanel.tsx'
import { PanelController } from '../src/client/panel/controller.ts'

afterEach(cleanup)

const candidate = {
  id: 'knowledge_0123456789abcdef0123456789abcdef',
  status: 'candidate' as const,
  kind: 'lesson' as const,
  title: '先验证工具链再扩大实现范围',
  content: '附件、连接器和模型能力要拆成独立链路验证。',
  project: 'dsh-design-desktop',
  tags: ['Harness', '验证'],
  confidence: 0.86,
  source: { kind: 'conversation' as const, label: '附件与连接器排查', capturedAt: '2026-08-31T08:00:00.000Z' },
  createdAt: '2026-08-31T08:00:00.000Z',
  updatedAt: '2026-08-31T08:00:00.000Z',
}

const confirmed = {
  ...candidate,
  id: 'knowledge_abcdef0123456789abcdef0123456789',
  status: 'confirmed' as const,
  title: 'MCP 导入走受控工具',
  confirmedAt: '2026-08-31T09:00:00.000Z',
  updatedAt: '2026-08-31T09:00:00.000Z',
}

describe('My Brain knowledge review', () => {
  it.each([candidate, confirmed])('deletes and restores $status with confirmation and separate trash actions', async item => {
    let active = [item], deleted: typeof active = []
    const api = {
      list: vi.fn(async () => active), listTrash: vi.fn(async () => deleted),
      trash: vi.fn(async () => { active = []; deleted = [item] }),
      restore: vi.fn(async () => { active = [item]; deleted = []; return item }),
    }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true)
    try {
      render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} />)
      fireEvent.click(await screen.findByRole('button', { name: '删除' }))
      expect(api.trash).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: '删除' }))
      await waitFor(() => expect(screen.queryByText(item.title)).toBeNull())
      expect(api.trash).toHaveBeenCalledWith(item.id, item.updatedAt)
      fireEvent.click(screen.getByRole('tab', { name: /回收站/u }))
      expect(await screen.findByText(item.title)).toBeTruthy()
      expect(screen.queryByRole('button', { name: '编辑' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: '恢复' }))
      await waitFor(() => expect(screen.queryByText(item.title)).toBeNull())
      fireEvent.click(screen.getByRole('tab', { name: /全部/u }))
      expect(await screen.findByText(item.title)).toBeTruthy()
    } finally { confirm.mockRestore() }
  })
  it('bounds long article cards and loads the original only after opening details', async () => {
    const article = { ...candidate, content: '长文'.repeat(1000) + 'LIST_SENTINEL', source: { ...candidate.source, kind: 'url' as const }, article: { format: 'markdown' as const, truncated: false } }
    const api = { list: vi.fn().mockResolvedValue([article]), detail: vi.fn().mockResolvedValue({ item: article, body: '完整原文 BODY_SENTINEL', bodyKind: 'article' }), modelRoutes: vi.fn().mockResolvedValue({ routes: [] }) }
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} />)
    const title = await screen.findByText(article.title)
    const card = title.closest('article')!
    expect(card.textContent).not.toContain('LIST_SENTINEL')
    expect(within(card).getByText('正文摘录')).toBeTruthy()
    expect(api.detail).not.toHaveBeenCalled()
    fireEvent.click(within(card).getByRole('button', { name: '阅读详情' }))
    expect(await screen.findByText('完整原文 BODY_SENTINEL')).toBeTruthy()
    expect(api.detail).toHaveBeenCalledTimes(1)
  })

  it('renders My Brain as a dedicated first-level destination without extension tabs', async () => {
    const controller = new PanelController()
    controller.open('knowledge')
    const api = { list: vi.fn().mockResolvedValue([]), confirm: vi.fn(), dismiss: vi.fn() }
    render(<ExtensionPanel controller={controller} bridge={undefined} knowledgeApi={api as never} getSessionId={() => undefined} />)

    expect(screen.getByRole('heading', { name: '我的大脑', level: 2 })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '技能' })).toBeNull()
    expect(await screen.findByText('可以切换筛选条件，或从右上角导入第一条知识。')).toBeTruthy()
  })

  it('shows provenance and moves a confirmed candidate out of pending', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce([candidate, confirmed])
      .mockResolvedValueOnce([{ ...candidate, status: 'confirmed', confirmedAt: '2026-08-31T10:00:00.000Z' }, confirmed])
    const api = {
      list,
      confirm: vi.fn().mockResolvedValue({ ...candidate, status: 'confirmed' }),
      dismiss: vi.fn(),
    }
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} />)

    expect(await screen.findByText('先验证工具链再扩大实现范围')).toBeTruthy()
    expect(screen.getAllByText('附件与连接器排查')).toHaveLength(2)
    expect(screen.getAllByText('dsh-design-desktop')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '确认沉淀' }))

    await waitFor(() => { expect(api.confirm).toHaveBeenCalledWith(candidate.id) })
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText('MCP 导入走受控工具')).toBeTruthy()
  })

  it('dismisses a candidate and explains the confirmation boundary in the empty state', async () => {
    const list = vi.fn().mockResolvedValueOnce([candidate]).mockResolvedValueOnce([])
    const api = { list, confirm: vi.fn(), dismiss: vi.fn().mockResolvedValue({ ...candidate, status: 'dismissed' }) }
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '忽略' }))
    await waitFor(() => { expect(api.dismiss).toHaveBeenCalledWith(candidate.id) })
    expect(await screen.findByText('可以切换筛选条件，或从右上角导入第一条知识。')).toBeTruthy()
  })

  it('edits confirmed knowledge without changing its provenance', async () => {
    const updated = { ...confirmed, title: '更新后的标题', category: '连接器' }
    const api = {
      list: vi.fn().mockResolvedValueOnce([confirmed]).mockResolvedValueOnce([updated]),
      confirm: vi.fn(), dismiss: vi.fn(), create: vi.fn(), importUrl: vi.fn(),
      update: vi.fn().mockResolvedValue(updated),
    }
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('标题'), { target: { value: '更新后的标题' } })
    fireEvent.change(within(dialog).getByLabelText('分类'), { target: { value: '连接器' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }))
    await waitFor(() => { expect(api.update).toHaveBeenCalledWith(confirmed.id, expect.objectContaining({ title: '更新后的标题', category: '连接器' })) })
    expect(api.update.mock.calls[0][1]).not.toHaveProperty('source')
    expect(await screen.findByText('更新后的标题')).toBeTruthy()
  })

  it('edits candidate knowledge before confirmation and keeps the confirmation action explicit', async () => {
    const updated = { ...candidate, title: '更新后的候选', content: '用户先修订，再决定是否沉淀。', category: '复盘' }
    const api = {
      list: vi.fn().mockResolvedValueOnce([candidate]).mockResolvedValueOnce([updated]),
      confirm: vi.fn(), dismiss: vi.fn(), create: vi.fn(), importUrl: vi.fn(), refine: vi.fn(),
      update: vi.fn().mockResolvedValue(updated),
    }
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('标题'), { target: { value: '更新后的候选' } })
    fireEvent.change(within(dialog).getByLabelText('正文'), { target: { value: '用户先修订，再决定是否沉淀。' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }))
    await waitFor(() => { expect(api.update).toHaveBeenCalledWith(candidate.id, expect.objectContaining({ title: '更新后的候选', content: '用户先修订，再决定是否沉淀。' })) })
    expect(api.confirm).not.toHaveBeenCalled()
    expect(await screen.findByText('更新后的候选')).toBeTruthy()
  })

  it('keeps filtered and empty views inside one full-width knowledge workspace', async () => {
    const categorizedCandidate = { ...candidate, category: '连接器' }
    const categorizedConfirmed = { ...confirmed, category: '产品设计' }
    const api = { list: vi.fn().mockResolvedValue([categorizedCandidate, categorizedConfirmed]), confirm: vi.fn(), dismiss: vi.fn(), create: vi.fn(), update: vi.fn(), importUrl: vi.fn(), refine: vi.fn() }
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} />)

    expect(await screen.findByText('先验证工具链再扩大实现范围')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('分类'), { target: { value: '连接器' } })
    expect(screen.getByText('先验证工具链再扩大实现范围')).toBeTruthy()
    expect(screen.queryByText('MCP 导入走受控工具')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /待确认/u }))
    expect(screen.getByText('先验证工具链再扩大实现范围')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /已沉淀/u }))
    expect(screen.getByText('这里暂时没有内容')).toBeTruthy()
    const emptyWorkspace = screen.getByText('这里暂时没有内容').closest('section')
    expect(emptyWorkspace?.className).toContain('knowledgeWorkspace')
  })

  it('captures pasted content locally as a candidate with a source snapshot', async () => {
    const created = { ...candidate, title: '手动记录', source: { kind: 'manual' as const, label: '手动记录', capturedAt: candidate.createdAt } }
    const api = {
      list: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([created]),
      confirm: vi.fn(), dismiss: vi.fn(), update: vi.fn(), importUrl: vi.fn(),
      create: vi.fn().mockResolvedValue(created),
      detail: vi.fn().mockResolvedValue({ item: created, body: '只保存在本机的原文', bodyKind: 'legacy-snapshot' }),
    }
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '记录或导入' }))
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '手动记录' } })
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '只保存在本机的原文' } })
    fireEvent.click(screen.getByRole('button', { name: '保存为待确认' }))
    await waitFor(() => { expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ title: '手动记录' }), '只保存在本机的原文', expect.any(AbortSignal), { requestId: expect.any(String) }) })
    expect(await screen.findByRole('tabpanel')).toBeTruthy()
  })

  it('imports an external HTTPS URL into the candidate inbox without confirming it', async () => {
    const api = {
      list: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
      confirm: vi.fn(), dismiss: vi.fn(), create: vi.fn(), update: vi.fn(), refine: vi.fn(),
      importUrl: vi.fn().mockResolvedValue({ ...candidate, status: 'candidate' }),
      detail: vi.fn().mockResolvedValue({ item: candidate, body: '导入原文', bodyKind: 'article' }),
    }
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '记录或导入' }))
    fireEvent.click(screen.getByRole('button', { name: '导入链接' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('公开 HTTPS 链接'), { target: { value: 'https://example.com/article' } })
    fireEvent.change(within(dialog).getByLabelText('分类'), { target: { value: '阅读' } })
    fireEvent.change(within(dialog).getByLabelText(/^标签/u), { target: { value: '输入, 复盘' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '开始解析' }))
    await waitFor(() => { expect(api.importUrl).toHaveBeenCalledWith({ url: 'https://example.com/article', category: '阅读', tags: ['输入', '复盘'], requestId: expect.any(String) }, expect.any(AbortSignal)) })
    expect(api.confirm).not.toHaveBeenCalled()
  })

  it('closes the article reader and selects confirmed after modal confirmation', async () => {
    const pending = { ...candidate, source: { kind: 'url' as const, label: '合成文章', uri: 'https://example.com/article', capturedAt: candidate.createdAt }, article: { format: 'markdown' as const, truncated: false } }
    const confirmedArticle = { ...pending, status: 'confirmed' as const, confirmedAt: '2026-09-08T09:00:00.000Z' }
    const list = vi.fn().mockResolvedValueOnce([pending]).mockResolvedValueOnce([confirmedArticle])
    const api = {
      list, confirm: vi.fn().mockResolvedValue(confirmedArticle), dismiss: vi.fn(), update: vi.fn(), editSummary: vi.fn(),
      importUrl: vi.fn(), create: vi.fn(), detail: vi.fn().mockResolvedValue({ item: pending, body: '合成正文', bodyKind: 'article' }),
      modelRoutes: vi.fn().mockResolvedValue({ routes: [] }), summarize: vi.fn(),
    }
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} />)
    const card = await screen.findByText(pending.title)
    fireEvent.click(within(card.closest('article')!).getByRole('button', { name: '阅读详情' }))
    await screen.findByText('合成正文')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认沉淀' }))
    await waitFor(() => expect(api.confirm).toHaveBeenCalledWith(pending.id, expect.any(AbortSignal)))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('tab', { name: /已沉淀/u }).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByText(pending.title)).toBeTruthy()
  })

  it('sends a source to the current model only after a second explicit confirmation', async () => {
    const refined = { ...confirmed, title: '模型整理后的知识' }
    const api = {
      list: vi.fn().mockResolvedValueOnce([confirmed]).mockResolvedValueOnce([refined]),
      confirm: vi.fn(), dismiss: vi.fn(), create: vi.fn(), update: vi.fn(), importUrl: vi.fn(),
      refine: vi.fn().mockResolvedValue({ item: refined, model: 'zhipu/glm-5.3-flash' }),
    }
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} getSessionId={() => 'session-1'} />)
    fireEvent.click(await screen.findByRole('button', { name: 'AI 整理' }))
    expect(api.refine).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/密码、令牌、Cookie/u)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '确认并发送' }))
    await waitFor(() => { expect(api.refine).toHaveBeenCalledWith(confirmed.id, 'session-1', true) })
    expect(await screen.findByText('模型整理后的知识')).toBeTruthy()
  })
})
