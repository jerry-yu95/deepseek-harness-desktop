import { describe, expect, it } from 'vitest'

import { formatAttachmentReference, joinAttachmentBlocks } from '../src/core/format.ts'
import { zh } from '../src/client/locales.ts'

describe('formatAttachmentReference', () => {
  it('emits one compact opaque reference without file content', () => {
    const block = formatAttachmentReference({
      id: 'file_00000000000000000000000000000001',
      name: 'mcp.json',
      mediaType: 'application/json',
      bytes: 24,
      kind: 'text',
      redacted: true,
    }, zh)
    expect(block).toBe('文件附件：mcp.json')
    expect(block).not.toContain('attachment_read')
    expect(block).not.toContain('file_')
    expect(block).not.toContain('mcpServers')
    expect(block).not.toMatch(/"type"\s*:\s*"image"/)
    expect(block).not.toMatch(/kind:\s*"image"/)
    expect(block).not.toContain('image block')
  })

  it('joins multiple files in selection order', () => {
    const first = formatAttachmentReference({
      id: 'file_00000000000000000000000000000001', name: 'a.json', mediaType: 'application/json', bytes: 2, kind: 'text', redacted: false,
    }, zh)
    const second = formatAttachmentReference({
      id: 'file_00000000000000000000000000000002', name: 'b.md', mediaType: 'text/markdown', bytes: 4, kind: 'text', redacted: false,
    }, zh)
    const joined = joinAttachmentBlocks([first, second])
    expect(joined.indexOf('a.json')).toBeGreaterThan(-1)
    expect(joined.indexOf('a.json')).toBeLessThan(joined.indexOf('b.md'))
  })
})
