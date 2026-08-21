import { describe, expect, it, vi } from 'vitest'
import { bindWorkspaceReferenceContext, copyWorkspaceReference, createWorkspaceReferenceSource, installWorkspaceReferencePasteBridge, pasteWorkspaceEntry, rememberWorkspaceReference } from '../src/client/workspaceReference.ts'

describe('workspace reference input source', () => {
  it('turns remembered files into native hot @ references', () => {
    const name = rememberWorkspaceReference('docs/brief.md')
    expect(name).toBe('docs/brief.md')
    const source = createWorkspaceReferenceSource({ sessions: { list: { getSnapshot: vi.fn() } } } as never, {} as never)
    expect(source.lexicon?.({ sessionId: 's1' as never })).toContain('docs/brief.md')
    expect(source.onPick({ candidate: { name }, session: { sessionId: 's1' as never }, position: 'inline', via: 'menu', span: { start: 0, end: 1, draftRev: 1 } }))
      .toEqual({ insert: { source: 'workspace-file', ref: name, label: name, clipboardText: '@docs/brief.md' } })
  })

  it('searches the active session workspace for @ candidates', async () => {
    const search = vi.fn().mockResolvedValue({
      ok: true,
      value: { hits: [{ name: 'plan.md', path: 'docs/plan.md', isDir: false }], truncated: false },
    })
    const ctx = { sessions: { list: { getSnapshot: () => ({ byId: { s1: { cwd: '/workspace' } } }) } } }
    const source = createWorkspaceReferenceSource(ctx as never, { search } as never)
    const candidates = await source.candidates(
      { sessionId: 's1' as never },
      { query: 'plan', position: 'inline', signal: new AbortController().signal },
    )
    expect(search).toHaveBeenCalledWith('/workspace', 'plan')
    expect(candidates).toEqual([{ name: 'docs/plan.md', description: 'Workspace file', icon: '·' }])
  })

  it('adds Explorer files as native reference occurrences instead of plain @ text', async () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'Please review '
    textarea.selectionStart = textarea.value.length
    textarea.selectionEnd = textarea.value.length
    Object.defineProperty(textarea, 'offsetParent', { value: document.body })
    document.body.append(textarea)

    const insertReference = vi.fn().mockReturnValue(true)
    const input = {
      state: { getSnapshot: () => ({ draft: 'Please review ', draftRev: 7 }) },
      insertReference,
    }
    const actx = {}
    const ctx = {
      sessions: {
        list: { getSnapshot: () => ({ current: 's1' }) },
        scope: vi.fn().mockReturnValue(actx),
      },
      conversation: { input: { for: vi.fn().mockReturnValue(input) } },
    }
    const dispose = bindWorkspaceReferenceContext(ctx as never)

    await expect(pasteWorkspaceEntry('/workspace', 'docs/brief.md', false)).resolves.toBe(true)
    expect(insertReference).toHaveBeenCalledWith({
      source: 'workspace-file',
      ref: 'docs/brief.md',
      label: 'docs/brief.md',
      clipboardText: '@docs/brief.md',
    }, { start: 14, end: 14, draftRev: 7 })
    expect(textarea.value).toBe('Please review ')

    dispose()
    textarea.remove()
  })

  it('preserves native file identity across Explorer copy and composer paste', async () => {
    const textarea = document.createElement('textarea')
    textarea.value = ''
    Object.defineProperty(textarea, 'offsetParent', { value: document.body })
    document.body.append(textarea)

    const insertReference = vi.fn().mockReturnValue(true)
    const actx = {}
    const ctx = {
      sessions: {
        list: { getSnapshot: () => ({ current: 's1' }) },
        scope: vi.fn().mockReturnValue(actx),
      },
      conversation: {
        input: {
          for: vi.fn().mockReturnValue({
            state: { getSnapshot: () => ({ draft: '', draftRev: 2 }) },
            insertReference,
          }),
        },
      },
    }
    const disposeContext = bindWorkspaceReferenceContext(ctx as never)
    const disposePaste = installWorkspaceReferencePasteBridge()
    const copied = copyWorkspaceReference('/workspace', 'docs/brief.md', false)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type: string) => type === 'text/plain' ? copied : '' },
    })

    textarea.dispatchEvent(event)
    await vi.waitFor(() => expect(insertReference).toHaveBeenCalledTimes(1))
    expect(event.defaultPrevented).toBe(true)
    expect(textarea.value).toBe('')

    disposePaste()
    disposeContext()
    textarea.remove()
  })
})
