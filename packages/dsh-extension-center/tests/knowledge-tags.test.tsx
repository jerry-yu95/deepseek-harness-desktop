import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KnowledgeTagPicker, collectKnowledgeTags, normalizeKnowledgeTag } from '../src/client/panel/KnowledgeTagPicker.tsx'
import { KnowledgeTab } from '../src/client/panel/KnowledgeTab.tsx'

afterEach(cleanup)
afterEach(() => vi.restoreAllMocks())

const confirmed = {
  id: 'knowledge_0123456789abcdef0123456789abcdef', status: 'confirmed' as const, kind: 'fact' as const,
  title: '可归类文章', content: '短摘录', tags: ['A'], confidence: 0.8,
  source: { kind: 'url' as const, label: '合成来源', uri: 'https://example.com/article', capturedAt: '2026-09-08T00:00:00.000Z' },
  createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z', confirmedAt: '2026-09-08T00:00:01.000Z',
}
const otherConfirmed = { ...confirmed, id: 'knowledge_abcdef0123456789abcdef0123456789', title: '另一个标签', tags: ['B'] }

describe('knowledge tag semantics', () => {
  it('collects a historical union from active candidates and confirmed items only', () => {
    expect(collectKnowledgeTags([
      { status: 'candidate', tags: ['产品', ' Harness ', '产品'] },
      { status: 'confirmed', tags: ['Harness', '复盘'] },
      { status: 'dismissed', tags: ['不应出现'] },
    ])).toEqual(['产品', '复盘', 'Harness'])
  })

  it('trims and NFC-normalizes without folding case', () => {
    expect(normalizeKnowledgeTag('  Cafe\u0301  ')).toBe('Café')
    expect(normalizeKnowledgeTag('Harness')).toBe('Harness')
    expect(normalizeKnowledgeTag('harness')).toBe('harness')
  })

  it('accepts a searched historical tag or a new tag with Enter and removes chips', () => {
    const onChange = vi.fn()
    function ControlledPicker() {
      const [selected, setSelected] = useState(['Harness'])
      return <KnowledgeTagPicker selected={selected} available={['Harness', '复盘']} onChange={tags => { setSelected(tags); onChange(tags) }} label="标签" />
    }
    render(<ControlledPicker />)

    const input = screen.getByRole('combobox', { name: '标签' })
    fireEvent.change(input, { target: { value: '复' } })
    fireEvent.click(screen.getByRole('option', { name: '复盘' }))
    expect(onChange).toHaveBeenLastCalledWith(['Harness', '复盘'])

    fireEvent.change(input, { target: { value: '新标签' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith(['Harness', '复盘', '新标签'])

    fireEvent.click(within(screen.getByText('Harness').closest('[data-tag-chip]')!).getByRole('button', { name: '移除 Harness' }))
    expect(onChange).toHaveBeenLastCalledWith(['复盘', '新标签'])
  })

  it('does not turn an IME composition Enter into a new tag', () => {
    const onChange = vi.fn()
    render(<KnowledgeTagPicker selected={[]} available={[]} onChange={onChange} label="标签" />)
    const input = screen.getByRole('combobox', { name: '标签' })
    fireEvent.change(input, { target: { value: '中文输入' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows a clear reserved-name hint and never persists the virtual Other tag', () => {
    const onChange = vi.fn()
    render(<KnowledgeTagPicker selected={[]} available={[]} onChange={onChange} label="标签" />)
    const input = screen.getByRole('combobox', { name: '标签' })
    fireEvent.change(input, { target: { value: '其他' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('“其他”是无标签文章的固定分组')
  })

  it('offers AI suggestions as independent accept and dismiss actions', () => {
    const onChange = vi.fn()
    render(<KnowledgeTagPicker selected={[]} available={[]} suggestions={['阅读', '复盘']} onChange={onChange} label="标签" />)
    fireEvent.click(screen.getByRole('button', { name: '添加建议标签 阅读' }))
    expect(onChange).toHaveBeenLastCalledWith(['阅读'])
    fireEvent.click(screen.getByRole('button', { name: '忽略建议标签 复盘' }))
    expect(screen.queryByText('复盘')).toBeNull()
  })

  it('moves a confirmed article from the active tag by drag/drop without sending its text', async () => {
    const moved = { ...confirmed, tags: ['B'], updatedAt: '2026-09-08T00:00:02.000Z' }
    const moveTag = vi.fn().mockResolvedValue(moved)
    render(<KnowledgeTab api={{ list: vi.fn().mockResolvedValue([confirmed, otherConfirmed]), moveTag } as never} refreshKey={0} notify={vi.fn()} />)
    const card = await screen.findByText(confirmed.title)
    fireEvent.click(screen.getByRole('button', { name: /^A\s*1/u }))
    const data: Record<string, string> = {}
    const dataTransfer = { setData: (type: string, value: string) => { data[type] = value }, getData: (type: string) => data[type] ?? '', effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(card.closest('article')!, { dataTransfer })
    fireEvent.drop(screen.getByRole('button', { name: /^B\s*1/u }), { dataTransfer })
    await waitFor(() => expect(moveTag).toHaveBeenCalledWith(confirmed.id, 'A', 'B', confirmed.updatedAt))
    expect(moveTag.mock.calls[0][1]).not.toContain('短摘录')
  })

  it('provides a keyboard menu and confirms before moving an article to virtual Other', async () => {
    const moveTag = vi.fn().mockResolvedValue({ ...confirmed, tags: [] })
    const notify = vi.fn()
    render(<KnowledgeTab api={{ list: vi.fn().mockResolvedValue([confirmed, otherConfirmed]), moveTag } as never} refreshKey={0} notify={notify} />)
    await screen.findByText(confirmed.title)
    const card = screen.getByText(confirmed.title).closest('article')!
    const menu = within(card).getByRole('combobox', { name: '移动到标签' })
    fireEvent.change(menu, { target: { value: 'B' } })
    await waitFor(() => expect(moveTag).toHaveBeenCalledWith(confirmed.id, null, 'B', confirmed.updatedAt))
    expect(notify).toHaveBeenCalledWith('标签已更新')

    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.change(menu, { target: { value: '__other__' } })
    expect(moveTag).toHaveBeenCalledTimes(1)
    confirmation.mockReturnValue(true)
    fireEvent.change(menu, { target: { value: '__other__' } })
    await waitFor(() => expect(moveTag).toHaveBeenCalledWith(confirmed.id, null, null, confirmed.updatedAt))
  })
})
