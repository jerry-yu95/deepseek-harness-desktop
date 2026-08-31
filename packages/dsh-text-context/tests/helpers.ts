/** Shared test helpers. No credential-shaped strings live here. */

import { installTextContextCapture, type InstallOptions } from '../src/client/intake.ts'
import { insertIntoComposer } from '../src/client/composer.ts'
import type { FileUploadRequest } from '../src/wire.ts'

/** Harmless placeholder used in redaction tests — not a real token. */
export const SAMPLE_SECRET = 'test-redact-value'

export const uploadedFiles: FileUploadRequest[] = []

/**
 * Build a File for jsdom events.
 * @param name - basename.
 * @param content - text or bytes.
 * @param type - MIME; empty string exercises the extension fallback.
 */
export function makeFile(name: string, content: string | Uint8Array, type: string): File {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : Uint8Array.from(content)
  const file = new File([bytes], name, { type })
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  return file
}

/**
 * Mount a visible official-style composer textarea.
 * @param options - draft value, hidden, or extension-center overlay.
 */
export function mountComposer(options: {
  value?: string
  hidden?: boolean
  extensionOpen?: boolean
  contenteditable?: boolean
} = {}): HTMLElement {
  document.body.replaceChildren()
  document.documentElement.lang = 'zh-CN'
  if (options.extensionOpen === true) {
    document.documentElement.setAttribute('data-dsh-extension-active', '')
  } else {
    document.documentElement.removeAttribute('data-dsh-extension-active')
  }

  const pane = document.createElement('div')
  pane.dataset.pane = 'conversation'

  if (options.contenteditable === true) {
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.setAttribute('placeholder', '给智能体发消息')
    editor.textContent = options.value ?? ''
    if (options.hidden === true) editor.style.display = 'none'
    pane.append(editor)
    document.body.append(pane)
    return editor
  }

  const textarea = document.createElement('textarea')
  textarea.dataset.phase = 'idle'
  textarea.setAttribute('placeholder', '给智能体发消息')
  textarea.value = options.value ?? ''
  if (options.hidden === true) textarea.style.display = 'none'
  pane.append(textarea)
  document.body.append(pane)
  return textarea
}

/**
 * Dispatch a cancelable paste or drop carrying files.
 * @param type - paste or drop.
 * @param files - ordered files.
 */
export function dispatchFiles(type: 'paste' | 'drop', files: File[]): Event {
  const carrier = {
    files,
    items: files.map(file => ({ kind: 'file', getAsFile: () => file })),
  }
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, type === 'paste' ? 'clipboardData' : 'dataTransfer', { value: carrier })
  document.dispatchEvent(event)
  return event
}

/** Flush File.arrayBuffer and the intake microtasks. */
export async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => {
    setTimeout(resolve, 0)
  })
}

/**
 * Install capture listeners with zh copy and optional limit overrides.
 * @param options - extra install options.
 */
export function install(options: InstallOptions = {}): () => void {
  uploadedFiles.length = 0
  const uploader = options.uploader ?? {
    upload: async (input: FileUploadRequest) => {
      uploadedFiles.push(input)
      return {
        id: `file_${String(uploadedFiles.length).padStart(32, '0')}`,
        name: input.name,
        mediaType: input.mediaType,
        bytes: input.bytes,
        kind: input.kind,
        redacted: input.redacted,
      } as const
    },
  }
  const attachmentInserter = options.attachmentInserter ?? ((composer, attachment) => (
    insertIntoComposer(composer, `@${attachment.name}`)
  ))
  return installTextContextCapture({ lang: 'zh-CN', document, ...options, uploader, attachmentInserter })
}

/** Toast copy currently in the document. */
export function toastMessages(): string[] {
  return [...document.querySelectorAll('[data-dsh-text-context-toast]')].map(el => el.textContent ?? '')
}

/**
 * Add another official-style composer without wiping existing nodes.
 * @param options - optional draft.
 */
export function appendComposer(options: { value?: string } = {}): HTMLTextAreaElement {
  const pane = document.createElement('div')
  pane.dataset.pane = 'conversation'
  const textarea = document.createElement('textarea')
  textarea.dataset.phase = 'idle'
  textarea.setAttribute('placeholder', '给智能体发消息')
  textarea.value = options.value ?? ''
  pane.append(textarea)
  document.body.append(pane)
  return textarea
}
