import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SummaryBlockEditor, summaryEditBlocks, summaryEditText } from '../src/client/panel/SummaryBlockEditor.tsx'

afterEach(cleanup)

it('edits structured headings and points without exposing their Markdown markers', () => {
  const changed = vi.fn()
  const text = '总述。\n\n## 关键要点\n\n- 第一点\n- 第二点'
  render(<SummaryBlockEditor text={text} disabled={false} onChange={changed} />)
  expect(changed).not.toHaveBeenCalled()
  expect(screen.getAllByRole('textbox').map(node => (node as HTMLTextAreaElement).value)).toEqual(['总述。', '关键要点', '第一点', '第二点'])
  fireEvent.change(screen.getByDisplayValue('第一点'), { target: { value: '修改后的第一点' } })
  expect(changed).toHaveBeenLastCalledWith('总述。\n\n## 关键要点\n\n- 修改后的第一点\n- 第二点')
})

it('makes a legacy wall of text editable in paragraphs without writing on open', () => {
  const text = '这是一段合成的业务经验，不改变任何事实。'.repeat(30)
  const changed = vi.fn()
  render(<SummaryBlockEditor text={text} disabled={false} onChange={changed} />)
  expect(screen.getAllByRole('textbox').length).toBeGreaterThan(2)
  expect(changed).not.toHaveBeenCalled()
  expect(summaryEditText(summaryEditBlocks(text)).replace(/\n/gu, '')).toBe(text)
})

it('allows adding and removing blocks and reports aggregate overflow', () => {
  const changed = vi.fn()
  render(<SummaryBlockEditor text={'文'.repeat(3900)} disabled={false} onChange={changed} />)
  fireEvent.click(screen.getByRole('button', { name: '添加段落' }))
  fireEvent.change(screen.getByRole('textbox', { name: '第 2 块内容' }), { target: { value: '段'.repeat(200) } })
  expect(screen.getByRole('alert').textContent).toContain('4000')
  fireEvent.click(screen.getByRole('button', { name: '删除第 2 块' }))
  expect(screen.queryByRole('alert')).toBeNull()
})
