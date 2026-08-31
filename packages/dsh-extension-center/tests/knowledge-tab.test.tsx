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

  it('captures pasted content locally as a candidate with a source snapshot', async () => {
    const created = { ...candidate, title: '手动记录', source: { kind: 'manual' as const, label: '手动记录', capturedAt: candidate.createdAt } }
    const api = {
      list: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([created]),
      confirm: vi.fn(), dismiss: vi.fn(), update: vi.fn(), importUrl: vi.fn(),
      create: vi.fn().mockResolvedValue(created),
    }
    render(<KnowledgeTab api={api as never} refreshKey={0} notify={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '记录或导入' }))
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '手动记录' } })
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '只保存在本机的原文' } })
    fireEvent.click(screen.getByRole('button', { name: '保存为待确认' }))
    await waitFor(() => { expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ title: '手动记录' }), '只保存在本机的原文') })
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
