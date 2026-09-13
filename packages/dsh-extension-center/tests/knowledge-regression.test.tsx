import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeCaptureDialog } from '../src/client/panel/KnowledgeCaptureDialog.tsx'
import { KnowledgeTab } from '../src/client/panel/KnowledgeTab.tsx'
import { ArticleBlocks } from '../src/client/panel/KnowledgeArticleReader.tsx'

afterEach(cleanup)
const item = { id: 'knowledge_0123456789abcdef0123456789abcdef', kind: 'fact', status: 'candidate', title: '合成回归文章', content: '', tags: [], confidence: .6, source: { kind: 'url', label: '合成来源', uri: 'https://example.com/article', capturedAt: '2026-09-08T00:00:00.000Z' }, article: { format: 'markdown', truncated: false }, createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z' }
const summary = { text: '原摘要', provider: 'fixture', model: 'model', generatedAt: item.updatedAt, sourceTruncated: false, editedByUser: false }
function fixture(withSummary = false) {
  const record = withSummary ? { ...item, summary } : item
  return { record, list: vi.fn().mockResolvedValue([record]), create: vi.fn(), importUrl: vi.fn(), detail: vi.fn().mockResolvedValue({ item: record, body: '合成原文', bodyKind: 'article' }), modelRoutes: vi.fn().mockResolvedValue({ routes: [{ id: 'fixture', displayName: 'Fixture' }], selectedRouteId: 'fixture' }), summarize: vi.fn(), update: vi.fn().mockImplementation(async (_id, update) => ({ ...record, ...update })), editSummary: vi.fn().mockImplementation(async ({ text }) => ({ ...record, summary: { ...summary, text } })), confirm: vi.fn().mockResolvedValue({ ...record, status: 'confirmed' }), dismiss: vi.fn() }
}
async function reader(api: ReturnType<typeof fixture>, close = vi.fn(), saved = vi.fn()) {
  render(<KnowledgeCaptureDialog api={api as never} initialItem={api.record as never} onClose={close} onSaved={saved} />)
  await screen.findByText('合成原文')
  return close
}

describe('remaining knowledge regression contracts', () => {
  it.each([['阅读详情', '原文'], ['编辑', '我的笔记'], ['AI 整理', 'AI 摘要']])('routes %s to %s without invoking the model', async (button, tab) => {
    const api = fixture(true)
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: button }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialog).getByRole('tab', { name: tab }).getAttribute('aria-selected')).toBe('true'))
    expect(api.summarize).not.toHaveBeenCalled()
  })

  it('blocks summary regeneration until local summary edits are saved or cancelled', async () => {
    const api = fixture(true)
    await reader(api)
    fireEvent.click(screen.getByRole('tab', { name: 'AI 摘要' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑摘要' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'AI 摘要' }), { target: { value: '尚未保存的摘要' } })
    expect((screen.getByRole('button', { name: '生成 AI 摘要' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }))
    expect((screen.getByRole('button', { name: '生成 AI 摘要' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('rejects unsupported tag characters before sending an import request', async () => {
    const api = fixture()
    render(<KnowledgeCaptureDialog api={api as never} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '导入链接' }))
    fireEvent.change(screen.getByLabelText('公开 HTTPS 链接'), { target: { value: 'https://example.com/article' } })
    fireEvent.change(screen.getByRole('combobox', { name: '标签' }), { target: { value: 'bad/tag' } })
    fireEvent.click(screen.getByRole('button', { name: '开始解析' }))
    expect(api.importUrl).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('标签格式无效')
  })

  it('keeps summary edits across tabs and discards them cleanly before regeneration', async () => {
    const api = fixture(true)
    const newer = { ...summary, text: '重新生成的摘要', generatedAt: '2026-09-13T00:00:00.000Z' }
    api.summarize.mockResolvedValue({ item: { ...item, summary: newer }, suggestedTags: [] })
    await reader(api)
    fireEvent.click(screen.getByRole('tab', { name: 'AI 摘要' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑摘要' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'AI 摘要' }), { target: { value: '跨标签摘要草稿' } })
    fireEvent.click(screen.getByRole('tab', { name: '原文' }))
    fireEvent.click(screen.getByRole('tab', { name: 'AI 摘要' }))
    expect(screen.getByDisplayValue('跨标签摘要草稿')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }))
    fireEvent.click(screen.getByRole('button', { name: '生成 AI 摘要' }))
    await screen.findByText('重新生成的摘要')
    expect(screen.queryByText('原摘要')).toBeNull()
    expect((screen.getByRole('button', { name: '保存修改' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not submit an empty summary or dismiss its draft on save failure', async () => {
    const api = fixture(true)
    await reader(api)
    fireEvent.click(screen.getByRole('tab', { name: 'AI 摘要' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑摘要' }))
    const editor = screen.getByRole('textbox', { name: 'AI 摘要' })
    fireEvent.change(editor, { target: { value: '' } })
    expect((screen.getByRole('button', { name: '保存修改' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(editor, { target: { value: '失败时保留摘要草稿' } })
    api.editSummary.mockRejectedValue(new Error('synthetic-failure'))
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    await screen.findByText('保存失败，编辑内容已保留，请重试。')
    expect(screen.getByDisplayValue('失败时保留摘要草稿')).toBeTruthy()
  })
  it('explains a vanished model route without leaking the backend error', async () => {
    const api = fixture()
    api.summarize.mockRejectedValue(new Error('knowledge-model-route-unavailable'))
    await reader(api)
    fireEvent.click(screen.getByRole('button', { name: '生成 AI 摘要' }))
    await screen.findByText('所选模型已不可用，请选择其他模型后重试；原文仍可保留。')
    expect(screen.getByText('合成原文')).toBeTruthy()
  })
  it('renders cached and failed images between the original text blocks', () => {
    const { container } = render(<ArticleBlocks text={'前段\n\n后段'} images={[{ id: 'image_11111111111111111111111111111111', alt: '中间图', order: 0, offset: 2, status: 'unavailable' }]} />)
    expect([...container.children].map(element => element.tagName)).toEqual(['P', 'FIGURE', 'P'])
    expect(container.children[2].textContent).toBe('后段')
  })
  it('enables save for a pending tag and clears its input only after persistence', async () => {
    const api = fixture()
    await reader(api)
    fireEvent.click(screen.getByRole('tab', { name: '我的笔记' }))
    fireEvent.change(screen.getByRole('combobox', { name: '标签' }), { target: { value: '待提交标签' } })
    const save = screen.getByRole('button', { name: '保存修改' }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(item.id, expect.objectContaining({ tags: ['待提交标签'] }), expect.any(AbortSignal)))
    await waitFor(() => expect((screen.getByRole('combobox', { name: '标签' }) as HTMLInputElement).value).toBe(''))
  })

  it('does not silently drop an overlong comma-separated tag on import', async () => {
    const api = fixture()
    render(<KnowledgeCaptureDialog api={api as never} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '导入链接' }))
    fireEvent.change(screen.getByLabelText('公开 HTTPS 链接'), { target: { value: 'https://example.com/article' } })
    fireEvent.change(screen.getByRole('combobox', { name: '标签' }), { target: { value: `有效,${'长'.repeat(33)},` } })
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '开始解析' }))
    expect(api.importUrl).not.toHaveBeenCalled()
  })

  it('warns for summary edits and saves before closing', async () => {
    const api = fixture(true), close = await reader(api)
    fireEvent.click(screen.getByRole('tab', { name: 'AI 摘要' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑摘要' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'AI 摘要' }), { target: { value: '修改后摘要' } })
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '保存并关闭' }))
    await waitFor(() => expect(api.editSummary).toHaveBeenCalledWith(expect.objectContaining({ text: '修改后摘要' }), expect.any(AbortSignal)))
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  })

  it('keeps draft and dialog when saving before close fails', async () => {
    const api = fixture(), close = await reader(api)
    api.update.mockRejectedValue(new Error('fixture-failed'))
    fireEvent.click(screen.getByRole('tab', { name: '我的笔记' }))
    fireEvent.change(screen.getByRole('textbox', { name: '我的笔记' }), { target: { value: '保留草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并关闭' }))
    await screen.findByText('保存失败，编辑内容已保留，请重试。')
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('保留草稿')).toBeTruthy()
    expect(api.confirm).not.toHaveBeenCalled()
  })

  it('ignores a cancelled noncooperative save response and never confirms it', async () => {
    const api = fixture(), saved = vi.fn(), close = vi.fn()
    let resolve!: (value: unknown) => void
    api.update.mockImplementation(() => new Promise(r => { resolve = r }))
    await reader(api, close, saved)
    fireEvent.click(screen.getByRole('tab', { name: '我的笔记' }))
    fireEvent.change(screen.getByRole('textbox', { name: '我的笔记' }), { target: { value: '等待保存' } })
    fireEvent.click(screen.getByRole('button', { name: '确认沉淀' }))
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getByRole('button', { name: /取消等待并关闭/ }))
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    const calls = saved.mock.calls.length
    resolve({ ...item, content: '等待保存' })
    await new Promise(r => setTimeout(r, 0))
    expect(api.confirm).not.toHaveBeenCalled()
    expect(saved).toHaveBeenCalledTimes(calls)
  })

  it('distinguishes loading and arbitrary catalog failure from no configured models', async () => {
    const api = fixture()
    let reject!: (error: Error) => void
    api.modelRoutes.mockImplementation(() => new Promise((_r, j) => { reject = j }))
    await reader(api)
    expect(screen.getByText('正在加载模型列表')).toBeTruthy()
    reject(new Error('fixture-unavailable'))
    await screen.findByText('模型列表暂时不可用，请重试；原文仍可保留。')
    expect(screen.queryByText('暂无可用模型，可先保留原文')).toBeNull()
  })

  it('switches to a generated summary and preserves an unsaved note', async () => {
    const api = fixture()
    api.summarize.mockResolvedValue({ item: { ...item, summary }, suggestedTags: [] })
    await reader(api)
    fireEvent.click(screen.getByRole('tab', { name: '我的笔记' }))
    fireEvent.change(screen.getByRole('textbox', { name: '我的笔记' }), { target: { value: '跨页草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '生成 AI 摘要' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'AI 摘要' }).getAttribute('aria-selected')).toBe('true'))
    expect(screen.getByText('原摘要')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '我的笔记' }))
    expect(screen.getByDisplayValue('跨页草稿')).toBeTruthy()
  })

  it('keeps confirmation successful when the list refresh fails', async () => {
    const api = fixture(), notify = vi.fn()
    api.list.mockResolvedValueOnce([item]).mockRejectedValue(new Error('fixture-refresh'))
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={notify} />)
    fireEvent.click(await screen.findByRole('button', { name: '阅读详情' }))
    await screen.findByText('合成原文')
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: '确认沉淀' })
    fireEvent.click(confirm); fireEvent.click(confirm)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('tab', { name: /已沉淀/ }).getAttribute('aria-selected')).toBe('true')
    expect(notify.mock.calls.filter(call => call[0] === '已确认并沉淀到我的大脑')).toHaveLength(1)
    await waitFor(() => expect(notify).toHaveBeenCalledWith('已保存，但列表刷新失败；请稍后刷新。', true))
    expect(screen.getByText(item.title)).toBeTruthy()
  })
})
