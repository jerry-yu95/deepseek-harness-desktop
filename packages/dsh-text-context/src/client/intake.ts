/**
 * Document capture listener for paste and drop. Official image files pass
 * through; supported text becomes composer draft; mixed and unsupported
 * batches are blocked with a toast.
 */

import { classifyFile } from '../core/classify.ts'
import { batchLimitError, DEFAULT_LIMITS, type IntakeLimits } from '../core/limits.ts'
import { readTextFile } from '../core/read-text.ts'
import { redactStructured } from '../core/redact.ts'
import type { FileAttachmentRef } from '../wire.ts'
import type { FileAttachmentUploader } from './api.ts'
import { findComposer, isMobileRemoteSurface, composerStillCurrent } from './composer.ts'
import { dictionaryFor, t, type MessageKey } from './locales.ts'
import { clearToasts, showToast } from './toast.ts'

/** Options for tests and the plugin apply() hook. */
export interface InstallOptions {
  /** Document to listen on (jsdom in tests). */
  document?: Document
  /** Override product limits (tests only). */
  limits?: IntakeLimits
  /** Override copy language. */
  lang?: string
  /** Test hook: runs after each file read so the suite can switch sessions. */
  stall?: () => Promise<void>
  /** Host uploader that persists an opaque, tool-readable attachment. */
  uploader?: FileAttachmentUploader
  /** Inserts one uploaded file through the official composer reference machine. */
  attachmentInserter?: (composer: HTMLElement, attachment: FileAttachmentRef) => boolean
  /** Keeps an original JSON document in renderer memory for a later controlled Connector Center preview. */
  connectorImportSource?: (attachment: FileAttachmentRef, text: string) => void
}

interface CaptureRegistry {
  references: number
  disposeActual: () => void
}

const CAPTURE_REGISTRY = Symbol.for('@linxin666/dsh-text-context:capture-registry')

function collectFiles(event: Event): File[] {
  const data = fileCarrierOf(event)
  if (data === null) return []
  const fromList = arrayFromFiles(data.files)
  if (fromList.length > 0) return fromList
  return collectFromItems(data.items)
}

type FileCarrier = {
  files?: ArrayLike<File> | FileList | null
  items?: ArrayLike<FileCarrierItem> | Iterable<FileCarrierItem> | null
}

type FileCarrierItem = {
  kind?: string
  getAsFile?: () => File | null
}

function fileCarrierOf(event: Event): FileCarrier | null {
  const record = event as Event & { dataTransfer?: FileCarrier | null; clipboardData?: FileCarrier | null }
  return record.dataTransfer ?? record.clipboardData ?? null
}

function arrayFromFiles(list: FileCarrier['files']): File[] {
  if (list == null) return []
  return Array.from(list as ArrayLike<File>)
}

function collectFromItems(items: FileCarrier['items']): File[] {
  if (items == null) return []
  const list = typeof (items as Iterable<FileCarrierItem>)[Symbol.iterator] === 'function'
    ? [...(items as Iterable<FileCarrierItem>)]
    : Array.from(items as ArrayLike<FileCarrierItem>)
  const files: File[] = []
  for (const item of list) {
    if (item.kind !== 'file' || typeof item.getAsFile !== 'function') continue
    const file = item.getAsFile()
    if (file !== null) files.push(file)
  }
  return files
}

function intercept(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

/**
 * Install capture-phase paste/drop listeners. Returns a disposer that removes them.
 * @param options - document, limits, language.
 */
export function installTextContextCapture(options: InstallOptions = {}): () => void {
  const doc = options.document ?? document
  const registryOwner = doc as Document & Record<symbol, CaptureRegistry | undefined>
  const activeRegistry = registryOwner[CAPTURE_REGISTRY]
  if (activeRegistry !== undefined) {
    activeRegistry.references += 1
    let released = false
    return () => {
      if (released) return
      released = true
      activeRegistry.references -= 1
      if (activeRegistry.references === 0) activeRegistry.disposeActual()
    }
  }

  const limits = options.limits ?? DEFAULT_LIMITS
  const dict = dictionaryFor(options.lang ?? doc.documentElement.lang)
  const toast = (key: MessageKey, values?: Record<string, string | number>) => {
    showToast(t(dict, key, values), doc)
  }

  let generation = 0
  let disposed = false

  const onPaste = (event: Event) => { void onCapture(event) }
  const onDrop = (event: Event) => { void onCapture(event) }

  doc.addEventListener('paste', onPaste, true)
  doc.addEventListener('drop', onDrop, true)

  async function onCapture(event: Event): Promise<void> {
    if (disposed) return
    const files = collectFiles(event)
    if (files.length === 0) return

    const classified = files.map(file => ({ file, result: classifyFile(file) }))
    const hasImage = classified.some(entry => entry.result.kind === 'image')
    const hasDocument = classified.some(entry => entry.result.kind === 'text' || entry.result.kind === 'office')
    const hasUnsupported = classified.some(entry => entry.result.kind === 'unsupported')
    const hasSensitive = classified.some(entry => entry.result.kind === 'sensitive-file')

    if (hasImage && !hasDocument && !hasUnsupported && !hasSensitive) return

    intercept(event)

    if (hasImage && hasDocument) {
      toast('toast.mixed')
      return
    }
    if (hasSensitive) {
      toast('toast.sensitiveFile')
      return
    }
    if (hasUnsupported) {
      toast('toast.unsupported')
      return
    }

    const captured = findComposer(doc)
    if (captured === null) {
      toast('toast.noComposer')
      return
    }
    if (options.uploader === undefined) {
      toast('toast.storeFailed')
      return
    }
    if (options.attachmentInserter === undefined) {
      toast('toast.storeFailed')
      return
    }

    const documentEntries = classified.filter((entry): entry is {
      file: File
      result: Extract<typeof entry.result, { kind: 'text' | 'office' }>
    } => entry.result.kind === 'text' || entry.result.kind === 'office')
    const limit = batchLimitError(documentEntries.map(entry => ({
      size: entry.file.size,
      kind: entry.result.kind,
    })), limits)
    if (limit === 'too-many') {
      toast('toast.tooMany')
      return
    }
    if (limit === 'too-large') {
      toast('toast.tooLarge')
      return
    }
    if (limit === 'total-too-large') {
      toast('toast.totalTooLarge')
      return
    }

    const myGen = generation + 1
    generation = myGen

    const prepared: Array<{
      attachment: Awaited<ReturnType<FileAttachmentUploader['upload']>>
      connectorText?: string
    }> = []
    let anyRedacted = false
    let anyJsonInvalid = false

    for (const { file, result } of documentEntries) {
      let bytes: Uint8Array
      let redacted = false
      let jsonInvalid = false
      let connectorText: string | undefined
      if (result.kind === 'text') {
        const read = await readTextFile(file, limits.maxFileBytes)
        if (!read.ok) {
          if (read.reason === 'too-large') toast('toast.tooLarge')
          else if (read.reason === 'utf8') toast('toast.invalidUtf8')
          else toast('toast.binary')
          return
        }
        const rewritten = redactStructured(read.text, result.syntax)
        if (rewritten.blocked) {
          toast('toast.unsafeRedact')
          return
        }
        bytes = new TextEncoder().encode(rewritten.text)
        redacted = rewritten.redacted
        jsonInvalid = rewritten.jsonInvalid
        if ((result.syntax === 'json' || result.syntax === 'jsonc') && looksLikeMcpDocument(read.text)) {
          connectorText = read.text
        }
      } else {
        bytes = new Uint8Array(await file.arrayBuffer())
      }
      if (disposed || generation !== myGen) return
      if (options.stall !== undefined) await options.stall()
      if (disposed || generation !== myGen) return
      if (!composerStillCurrent(captured, doc)) {
        toast('toast.sessionSwitched')
        return
      }
      try {
        const attachment = await options.uploader.upload({
          name: result.basename,
          mediaType: result.mime.length > 0 ? result.mime : file.type,
          bytes: bytes.byteLength,
          base64: bytesToBase64(bytes),
          redacted,
          kind: result.kind,
        })
        prepared.push({ attachment, connectorText })
      } catch {
        toast('toast.storeFailed')
        return
      }
      anyRedacted ||= redacted
      anyJsonInvalid ||= jsonInvalid
    }

    if (!composerStillCurrent(captured, doc)) {
      toast('toast.sessionSwitched')
      return
    }

    for (const { attachment, connectorText } of prepared) {
      if (connectorText !== undefined) options.connectorImportSource?.(attachment, connectorText)
      if (!options.attachmentInserter(captured, attachment)) {
        toast('toast.storeFailed')
        return
      }
    }
    toast('toast.added', { count: prepared.length })
    if (anyRedacted) toast('toast.redacted')
    if (anyJsonInvalid) toast('toast.jsonInvalid')
  }

  const registry: CaptureRegistry = {
    references: 1,
    disposeActual: () => {
      if (registryOwner[CAPTURE_REGISTRY] !== registry) return
      delete registryOwner[CAPTURE_REGISTRY]
      disposed = true
      generation += 1
      doc.removeEventListener('paste', onPaste, true)
      doc.removeEventListener('drop', onDrop, true)
      clearToasts(doc)
    },
  }
  registryOwner[CAPTURE_REGISTRY] = registry

  let released = false
  return () => {
    if (released) return
    released = true
    registry.references -= 1
    if (registry.references > 0) return
    registry.disposeActual()
  }
}

function looksLikeMcpDocument(text: string): boolean {
  try {
    const value = JSON.parse(text) as { mcpServers?: unknown }
    return value !== null && typeof value === 'object' && value.mcpServers !== null && typeof value.mcpServers === 'object' && !Array.isArray(value.mcpServers)
  } catch {
    return false
  }
}

/**
 * Skip the remote mobile page; the desktop web GUI keeps the listeners.
 */
export { isMobileRemoteSurface }

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)))
  }
  return btoa(binary)
}
