import { describe, expect, it, vi } from 'vitest'

import { zh } from '../src/client/locales.ts'
import {
  createFileReferenceSource,
  decodeFileReference,
  encodeFileReference,
  fileReferenceInsert,
  insertFileReference,
} from '../src/client/reference.ts'
import type { FileAttachmentRef } from '../src/wire.ts'

const attachment: FileAttachmentRef = {
  id: 'file_0123456789abcdef0123456789abcdef',
  name: 'mcp.json',
  mediaType: 'application/json',
  bytes: 42,
  kind: 'text',
  redacted: true,
}

describe('native file references', () => {
  it('renders only the basename in the composer reference', () => {
    const insert = fileReferenceInsert(attachment)
    expect(insert.label).toBe('mcp.json')
    expect(insert.appearance).toBe('file')
    expect(insert.clipboardText).toBe('@mcp.json')
    expect(insert.label).not.toContain(attachment.id)
    expect(insert.label).not.toContain('attachment_read')
  })

  it('serializes a normal Markdown attachment link without exposing tool instructions', async () => {
    const source = createFileReferenceSource(zh)
    const ref = encodeFileReference(attachment)
    expect(decodeFileReference(ref)).toEqual(attachment)
    await expect(source.codec?.serialize(ref, new AbortController().signal)).resolves.toBe(
      '文件附件：mcp.json',
    )
    expect(source.codec?.clipboardText(ref)).toBe('@mcp.json')
  })

  it('inserts through the official session input machine at the caret', () => {
    document.body.replaceChildren()
    const textarea = document.createElement('textarea')
    textarea.value = '请读取 '
    textarea.setSelectionRange(4, 4)
    document.body.append(textarea)
    const insertReference = vi.fn(() => true)
    const state = { draft: '请读取 ', draftRev: 7 }
    const actx = {}
    const ctx = {
      sessions: {
        list: { getSnapshot: () => ({ current: 'session-1' }) },
        scope: () => actx,
      },
      conversation: {
        input: { for: () => ({ state: { getSnapshot: () => state }, insertReference }) },
      },
    }

    expect(insertFileReference(ctx as never, textarea, attachment)).toBe(true)
    expect(insertReference).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'mcp.json', appearance: 'file' }),
      { start: 4, end: 4, draftRev: 7 },
    )
  })

  it('rejects malformed hidden references instead of exposing them', () => {
    expect(() => decodeFileReference('{"id":"bad"}')).toThrow('invalid local file attachment reference')
  })
})
