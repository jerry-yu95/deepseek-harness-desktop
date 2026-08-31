/** Renderer-only handoff from an attachment tool call to Connector Center. */

import type { FileAttachmentRef } from '../wire.ts'
import type { TextContextClientApi } from './api.ts'

export const CONNECTOR_IMPORT_EVENT = 'dsh:connector-import-preview'

interface ImportSource {
  text: string
  name: string
  createdAt: number
}

const MAX_SOURCES = 8
const SOURCE_TTL_MS = 15 * 60 * 1_000
const sources = new Map<string, ImportSource>()

export function rememberConnectorImportSource(attachment: FileAttachmentRef, text: string): void {
  pruneSources()
  sources.set(attachment.id, { text, name: attachment.name, createdAt: Date.now() })
  while (sources.size > MAX_SOURCES) {
    const oldest = sources.keys().next().value as string | undefined
    if (oldest === undefined) break
    sources.delete(oldest)
  }
}

export function installConnectorImportBridge(
  api: Pick<TextContextClientApi, 'takeConnectorImport'>,
  doc: Document = document,
  intervalMs = 500,
): () => void {
  let disposed = false
  let polling = false
  const poll = async (): Promise<void> => {
    if (disposed || polling) return
    polling = true
    try {
      const request = await api.takeConnectorImport()
      if (request === undefined || disposed) return
      pruneSources()
      const source = sources.get(request.attachmentId)
      if (source === undefined) return
      sources.delete(request.attachmentId)
      doc.dispatchEvent(new CustomEvent(CONNECTOR_IMPORT_EVENT, {
        detail: {
          text: source.text,
          name: source.name,
          requestId: request.requestId,
          ...(request.requestedServerNames === undefined ? {} : { requestedServerNames: request.requestedServerNames }),
        },
      }))
    } catch {
      // Reconnects are normal; the next bounded poll retries without logging data.
    } finally {
      polling = false
    }
  }
  const timer = setInterval(() => { void poll() }, intervalMs)
  void poll()
  return () => {
    disposed = true
    clearInterval(timer)
  }
}

function pruneSources(): void {
  const cutoff = Date.now() - SOURCE_TTL_MS
  for (const [id, source] of sources) {
    if (source.createdAt < cutoff) sources.delete(id)
  }
}
