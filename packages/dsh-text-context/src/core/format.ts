/** Render compact opaque file references for the composer and transcript. */

import type { MessageKey } from '../client/locales.ts'
import type { FileAttachmentRef } from '../wire.ts'

/**
 * Render one attachment as ordinary markdown text (not an image content block).
 * @param attachment - prepared file.
 * @param dictionary - zh or en copy.
 */
export function formatAttachmentReference(
  attachment: FileAttachmentRef,
  dictionary: Record<MessageKey, string>,
): string {
  return dictionary['block.reference']
    .replace('{name}', attachment.name)
    .replace('{id}', '')
}

/**
 * Join several attachment blocks, preserving selection order.
 * @param blocks - already formatted blocks.
 */
export function joinAttachmentBlocks(blocks: readonly string[]): string {
  return blocks.filter(block => block.length > 0).join('\n')
}
