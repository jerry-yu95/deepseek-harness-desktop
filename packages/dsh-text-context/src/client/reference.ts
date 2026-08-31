/** Native composer references for tool-readable local attachments. */

import type { InputTriggerSource, ReferenceInsert } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { formatAttachmentReference } from '../core/format.ts'
import type { FileAttachmentRef } from '../wire.ts'
import type { MessageKey } from './locales.ts'

export const FILE_REFERENCE_SOURCE = 'local-file-attachment'

interface NativeReferenceContext {
  sessions: {
    list: { getSnapshot(): { current?: string } }
    scope(id: string): unknown
  }
  conversation: {
    input: {
      for(scope: unknown): {
        state: { getSnapshot(): { draft: string; draftRev: number } }
        insertReference(reference: ReferenceInsert, span: {
          start: number
          end: number
          draftRev: number
        }): boolean
      }
    }
  }
}

/**
 * Encode source-owned reference metadata. The value is retained by the input
 * machine but never rendered in the textarea; only the basename label is.
 */
export function encodeFileReference(attachment: FileAttachmentRef): string {
  return JSON.stringify(attachment)
}

/** Decode and validate one source-owned reference. */
export function decodeFileReference(ref: string): FileAttachmentRef {
  const value = JSON.parse(ref) as Partial<FileAttachmentRef>
  if (
    typeof value.id !== 'string'
    || !/^file_[a-f0-9]{32}$/u.test(value.id)
    || typeof value.name !== 'string'
    || value.name.length === 0
    || value.name.length > 255
    || typeof value.mediaType !== 'string'
    || typeof value.bytes !== 'number'
    || !Number.isSafeInteger(value.bytes)
    || value.bytes < 0
    || (value.kind !== 'text' && value.kind !== 'office')
    || typeof value.redacted !== 'boolean'
  ) throw new Error('invalid local file attachment reference')
  return value as FileAttachmentRef
}

/** Create the native @-reference source used for submit-time serialization. */
export function createFileReferenceSource(
  dictionary: Record<MessageKey, string>,
): InputTriggerSource {
  return {
    trigger: '@',
    name: FILE_REFERENCE_SOURCE,
    order: 100,
    showGroupTitle: false,
    async candidates() { return [] },
    onPick() { return undefined },
    codec: {
      clipboardText(ref) {
        const attachment = decodeFileReference(ref)
        return `@${attachment.name}`
      },
      async serialize(ref) {
        return formatAttachmentReference(decodeFileReference(ref), dictionary)
      },
    },
  }
}

/** Build the official file-appearance reference inserted into the input machine. */
export function fileReferenceInsert(attachment: FileAttachmentRef): ReferenceInsert {
  return {
    source: FILE_REFERENCE_SOURCE,
    ref: encodeFileReference(attachment),
    label: attachment.name,
    appearance: 'file',
    clipboardText: `@${attachment.name}`,
  }
}

/**
 * Insert an uploaded file through the official input machine. The composer
 * renders a native file chip while the model receives the opaque tool protocol
 * only when the draft is submitted.
 */
export function insertFileReference(
  ctx: NativeReferenceContext,
  composer: HTMLElement,
  attachment: FileAttachmentRef,
): boolean {
  const sessionId = ctx.sessions.list.getSnapshot().current
  if (sessionId === undefined) return false
  const actx = ctx.sessions.scope(sessionId)
  if (actx === undefined) return false

  const input = ctx.conversation.input.for(actx)
  const state = input.state.getSnapshot()
  let start = state.draft.length
  let end = start
  if (composer instanceof HTMLTextAreaElement && composer.value === state.draft) {
    start = composer.selectionStart ?? start
    end = composer.selectionEnd ?? start
  }
  const inserted = input.insertReference(
    fileReferenceInsert(attachment),
    { start, end, draftRev: state.draftRev },
  )
  if (inserted) composer.focus()
  return inserted
}
