import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { PanelApi } from './api.ts'

const known = new Set<string>()
const listeners = new Set<() => void>()
let runtimeContext: ClientContext | undefined
let copiedWorkspaceEntry: { root: string; path: string; isDirectory: boolean; text: string } | undefined

/** Bind the live Harness client runtime used by Explorer's direct-add action. */
export function bindWorkspaceReferenceContext(ctx: ClientContext): () => void {
  runtimeContext = ctx
  return () => {
    if (runtimeContext === ctx) runtimeContext = undefined
  }
}

/** Remember a workspace path so Harness's native @-reference renderer can decorate it. */
export function rememberWorkspaceReference(path: string, isDirectory = false): string {
  const name = `${path}${isDirectory && !path.endsWith('/') ? '/' : ''}`
  if (!known.has(name)) {
    known.add(name)
    for (const listener of listeners) listener()
  }
  return name
}

/** Put an Explorer entry on the system clipboard while retaining its native identity in this page. */
export function copyWorkspaceReference(root: string, path: string, isDirectory: boolean): string {
  const text = `@${rememberWorkspaceReference(path, isDirectory)} `
  copiedWorkspaceEntry = { root, path, isDirectory, text }
  return text
}

/** Convert Explorer Command/Ctrl+C then composer paste into the same native reference as the context menu. */
export function installWorkspaceReferencePasteBridge(): () => void {
  const onPaste = (event: ClipboardEvent): void => {
    if (!(event.target instanceof HTMLTextAreaElement)) return
    const copied = copiedWorkspaceEntry
    const text = event.clipboardData?.getData('text/plain')
    if (copied === undefined || text === undefined || text.trimEnd() !== copied.text.trimEnd()) return

    event.preventDefault()
    void pasteWorkspaceEntry(copied.root, copied.path, copied.isDirectory).then((inserted) => {
      if (inserted) return
      const textarea = event.target as HTMLTextAreaElement
      const start = textarea.selectionStart ?? textarea.value.length
      const end = textarea.selectionEnd ?? start
      textarea.setRangeText(copied.text, start, end, 'end')
      textarea.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromPaste',
        data: copied.text,
      }))
    })
  }
  window.addEventListener('paste', onPaste)
  return () => window.removeEventListener('paste', onPaste)
}

/** A native input-trigger source: typed @ searches workspace files and picked paths become chips. */
export function createWorkspaceReferenceSource(ctx: ClientContext, api: PanelApi): InputTriggerSource {
  return {
    trigger: '@',
    name: 'workspace-file',
    order: -20,
    async candidates(session, request) {
      const snapshot = ctx.sessions.list.getSnapshot()
      const root = snapshot.byId[session.sessionId]?.cwd
      if (typeof root !== 'string' || root === '') return []
      const result = await api.search(root, request.query)
      if (!result.ok) return []
      return result.value.hits.slice(0, 30).map(hit => ({
        name: `${hit.path}${hit.isDir ? '/' : ''}`,
        description: hit.isDir ? 'Workspace folder' : 'Workspace file',
        icon: hit.isDir ? '▸' : '·',
      }))
    },
    onPick({ candidate }) {
      const name = rememberWorkspaceReference(candidate.name)
      return {
        insert: {
          source: 'workspace-file',
          ref: name,
          label: name,
          clipboardText: `@${name}`,
        },
      }
    },
    codec: {
      clipboardText: ref => `@${ref}`,
      serialize: async ref => `@${ref}`,
    },
    lexicon() {
      return [...known]
    },
    subscribeLexicon(_session, listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

function visibleComposer(): HTMLTextAreaElement | undefined {
  return [...document.querySelectorAll('textarea')]
    .find(node => node.offsetParent !== null && !node.disabled) as HTMLTextAreaElement | undefined
}

/**
 * Feed a workspace entry through the official composer paste pipeline.
 * Images become real File clipboard items; other entries become hot @ references.
 */
export async function pasteWorkspaceEntry(root: string, path: string, isDirectory: boolean): Promise<boolean> {
  const textarea = visibleComposer()
  const name = rememberWorkspaceReference(path, isDirectory)
  if (textarea === undefined) return false

  let transfer: DataTransfer | undefined
  let attachedImage = false
  const imagePath = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/iu.test(path)
  if (!isDirectory && imagePath) {
    try {
      const response = await fetch(`/aionui-panel/raw?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`)
      const mime = response.headers.get('content-type') ?? ''
      if (response.ok && mime.startsWith('image/')) {
        const blob = await response.blob()
        transfer = new DataTransfer()
        transfer.items.add(new File([blob], path.split('/').pop() ?? 'image', { type: mime }))
        attachedImage = true
      }
    } catch {
      // A raw-read failure falls back to a workspace reference below.
    }
  }
  if (!attachedImage) {
    const ctx = runtimeContext
    if (ctx === undefined) return false
    const sessionId = ctx.sessions.list.getSnapshot().current
    if (sessionId === undefined) return false
    const actx = ctx.sessions.scope(sessionId)
    if (actx === undefined) return false

    const input = ctx.conversation.input.for(actx)
    const state = input.state.getSnapshot()
    const domDraft = textarea.value
    const selectionMatches = domDraft === state.draft
    const start = selectionMatches ? (textarea.selectionStart ?? state.draft.length) : state.draft.length
    const end = selectionMatches ? (textarea.selectionEnd ?? start) : state.draft.length
    const inserted = input.insertReference({
      source: 'workspace-file',
      ref: name,
      label: name,
      clipboardText: `@${name}`,
    }, { start, end, draftRev: state.draftRev })
    if (inserted) textarea.focus()
    return inserted
  }

  textarea.focus()
  textarea.dispatchEvent(new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: transfer,
  }))
  return true
}
