import { afterEach, describe, expect, it, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'

import { MAX_FILE_BYTES, REDACTED_VALUE } from '../src/core/limits.ts'
import { zh } from '../src/client/locales.ts'
import {
  appendComposer,
  dispatchFiles,
  install,
  makeFile,
  mountComposer,
  SAMPLE_SECRET,
  settle,
  toastMessages,
  uploadedFiles,
} from './helpers.ts'

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-dsh-extension-active')
})

const png = makeFile('shot.png', new Uint8Array([137, 80, 78, 71]), 'image/png')

describe('tool-readable file intake', () => {
  it('leaves official image MIME types on the native image path', () => {
    const stop = install()
    mountComposer()
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      let officialRan = false
      const listener = () => { officialRan = true }
      document.addEventListener('drop', listener)
      const event = dispatchFiles('drop', [makeFile(`shot.${type.split('/')[1]}`, new Uint8Array([1, 2, 3]), type)])
      document.removeEventListener('drop', listener)
      expect(event.defaultPrevented).toBe(false)
      expect(officialRan).toBe(true)
    }
    expect(uploadedFiles).toHaveLength(0)
    stop()
  })

  it('stores JSON and inserts only one native file label, never protocol or body', async () => {
    const connectorImportSource = vi.fn()
    const stop = install({ connectorImportSource })
    const ta = mountComposer({ value: 'draft-note' }) as HTMLTextAreaElement
    const event = dispatchFiles('drop', [makeFile('mcp.json', '{"mcpServers":{"demo":{}}}', 'application/json')])
    expect(event.defaultPrevented).toBe(true)
    await settle()
    expect(ta.value).toContain('draft-note')
    expect(ta.value).toContain('@mcp.json')
    expect(ta.value).not.toContain('attachment_read')
    expect(ta.value).not.toContain('file_')
    expect(ta.value).not.toContain('mcpServers')
    expect(uploadedFiles).toHaveLength(1)
    expect(decodedUpload(0)).toContain('mcpServers')
    expect(connectorImportSource).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'mcp.json' }),
      '{"mcpServers":{"demo":{}}}',
    )
    expect(toastMessages().some(text => text.includes('已添加 1 个可读取文件'))).toBe(true)
    stop()
  })

  it('uses filename fallback for empty, binary, and incorrect image MIME', async () => {
    const stop = install()
    const ta = mountComposer() as HTMLTextAreaElement
    for (const type of ['', 'application/octet-stream', 'image/png']) {
      ta.value = ''
      dispatchFiles('paste', [makeFile('mcp.json', '{"ok":true}', type)])
      await settle()
      expect(ta.value).toContain('@mcp.json')
      expect(ta.value).not.toContain('"ok"')
    }
    expect(toastMessages()).not.toContain(zh['toast.unsupported'])
    stop()
  })

  it('handles one paste once when the client plugin is mounted five times', async () => {
    const stops = Array.from({ length: 5 }, () => install())
    const ta = mountComposer() as HTMLTextAreaElement
    dispatchFiles('paste', [makeFile('mcp.json', '{}', 'application/json')])
    await settle()
    expect(ta.value.match(/@mcp\.json/gu)).toHaveLength(1)
    expect(toastMessages().filter(text => text.includes('已添加 1 个可读取文件'))).toHaveLength(1)
    stops.forEach(stop => stop())
  })

  it('keeps multi-file order and distinct opaque ids', async () => {
    const stop = install()
    const ta = mountComposer() as HTMLTextAreaElement
    dispatchFiles('drop', [
      makeFile('a.json', '{"a":1}', 'application/json'),
      makeFile('b.md', '# b', 'text/markdown'),
    ])
    await settle()
    expect(ta.value.indexOf('a.json')).toBeLessThan(ta.value.indexOf('b.md'))
    expect(ta.value).not.toContain('file_')
    expect(uploadedFiles).toHaveLength(2)
    expect(ta.value).not.toContain('{"a"')
    expect(ta.value).not.toContain('# b')
    stop()
  })

  it('enforces text and batch size limits before upload', async () => {
    const stop = install({ limits: { maxFiles: 4, maxFileBytes: 1000, maxTotalBytes: 1500 } })
    const ta = mountComposer() as HTMLTextAreaElement
    dispatchFiles('drop', [makeFile('big.json', new Uint8Array(1001), 'application/json')])
    await settle()
    expect(ta.value).toBe('')
    expect(toastMessages()).toContain(zh['toast.tooLarge'])
    dispatchFiles('drop', [makeFile('a.json', 'x'.repeat(800), 'application/json'), makeFile('b.json', 'y'.repeat(800), 'application/json')])
    await settle()
    expect(ta.value).toBe('')
    expect(toastMessages()).toContain(zh['toast.totalTooLarge'])
    stop()
  })

  it('rejects text over the product limit, NUL, and invalid UTF-8', async () => {
    const stop = install()
    const ta = mountComposer() as HTMLTextAreaElement
    dispatchFiles('drop', [makeFile('big.json', new Uint8Array(MAX_FILE_BYTES + 1), 'application/json')])
    await settle()
    expect(ta.value).toBe('')
    dispatchFiles('drop', [makeFile('nul.json', new Uint8Array([0x7b, 0x00, 0x7d]), 'application/json')])
    await settle()
    expect(toastMessages()).toContain(zh['toast.binary'])
    dispatchFiles('drop', [makeFile('bad.json', new Uint8Array([0xff]), 'application/json')])
    await settle()
    expect(toastMessages()).toContain(zh['toast.invalidUtf8'])
    stop()
  })

  it('accepts docx as an opaque Office attachment without expanding XML', async () => {
    const stop = install()
    const ta = mountComposer() as HTMLTextAreaElement
    const bytes = zipSync({ 'word/document.xml': strToU8('<w:document><w:p><w:t>Hello Office</w:t></w:p></w:document>') })
    dispatchFiles('drop', [makeFile('brief.docx', bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')])
    await settle()
    expect(ta.value).toContain('@brief.docx')
    expect(ta.value).not.toContain('Hello Office')
    expect(uploadedFiles[0]?.kind).toBe('office')
    expect(uploadedFiles[0]?.bytes).toBe(bytes.byteLength)
    stop()
  })

  it('rejects PDF, ZIP, and mixed image/document batches', async () => {
    const stop = install()
    const ta = mountComposer() as HTMLTextAreaElement
    dispatchFiles('drop', [makeFile('doc.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'application/pdf')])
    await settle()
    expect(toastMessages()).toContain(zh['toast.unsupported'])
    dispatchFiles('drop', [makeFile('a.zip', new Uint8Array([0x50, 0x4b]), 'application/zip')])
    await settle()
    expect(ta.value).toBe('')
    const mixed = dispatchFiles('drop', [png, makeFile('mcp.json', '{}', 'application/json')])
    expect(mixed.defaultPrevented).toBe(true)
    await settle()
    expect(toastMessages()).toContain(zh['toast.mixed'])
    stop()
  })

  it('redacts credentials in the stored derivative while composer and toasts reveal neither body nor secret', async () => {
    const stop = install()
    const ta = mountComposer() as HTMLTextAreaElement
    const payload = JSON.stringify({ command: 'npx', args: ['--header', `Authorization: Bearer ${SAMPLE_SECRET}`], GITHUB_TOKEN: SAMPLE_SECRET })
    dispatchFiles('drop', [makeFile('mcp.json', payload, 'application/json')])
    await settle()
    const stored = decodedUpload(0)
    expect(stored).toContain(REDACTED_VALUE)
    expect(stored).not.toContain(SAMPLE_SECRET)
    expect(uploadedFiles[0]?.redacted).toBe(true)
    expect(ta.value).not.toContain(REDACTED_VALUE)
    expect(ta.value).not.toContain('Authorization')
    expectNoSecretSurfaces(ta.value)
    expect(toastMessages()).toContain(zh['toast.redacted'])
    stop()
  })

  it('redacts env assignments in txt but leaves ordinary prose in the stored derivative', async () => {
    const stop = install()
    mountComposer()
    dispatchFiles('paste', [makeFile('note.txt', `API_KEY=${SAMPLE_SECRET}\nplease mention token in passing`, 'text/plain')])
    await settle()
    expect(decodedUpload(0)).toContain(`API_KEY=${REDACTED_VALUE}`)
    expect(decodedUpload(0)).toContain('please mention token in passing')
    expect(decodedUpload(0)).not.toContain(SAMPLE_SECRET)
    stop()
  })

  it('blocks sensitive filenames and unsafe redaction without storing anything', async () => {
    const stop = install()
    const ta = mountComposer({ value: 'keep-draft' }) as HTMLTextAreaElement
    dispatchFiles('drop', [makeFile('.env.local', `API_KEY=${SAMPLE_SECRET}`, 'text/plain')])
    await settle()
    expect(toastMessages()).toContain(zh['toast.sensitiveFile'])
    dispatchFiles('drop', [makeFile('broken.json', `{ "api_key": "${SAMPLE_SECRET}`, 'application/json')])
    await settle()
    expect(ta.value).toBe('keep-draft')
    expect(uploadedFiles).toHaveLength(0)
    expect(toastMessages()).toContain(zh['toast.unsafeRedact'])
    stop()
  })

  it('does not inject without a visible composer or while extension center is open', async () => {
    const stop = install()
    dispatchFiles('drop', [makeFile('mcp.json', '{}', 'application/json')])
    await settle()
    expect(toastMessages()).toContain(zh['toast.noComposer'])
    const ta = mountComposer({ extensionOpen: true }) as HTMLTextAreaElement
    dispatchFiles('drop', [makeFile('mcp.json', '{}', 'application/json')])
    await settle()
    expect(ta.value).toBe('')
    expect(uploadedFiles).toHaveLength(0)
    stop()
  })

  it('does not write a reference into a new session if the composer changes during intake', async () => {
    const first = mountComposer({ value: 'old-draft' }) as HTMLTextAreaElement
    let entered!: () => void
    const sawStall = new Promise<void>(resolve => { entered = resolve })
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const stop = install({ stall: async () => { entered(); await gate } })
    dispatchFiles('drop', [makeFile('mcp.json', '{"ok":true}', 'application/json')])
    await sawStall
    first.remove()
    const second = appendComposer({ value: 'new-draft' })
    release()
    await settle()
    expect(second.value).toBe('new-draft')
    expect(uploadedFiles).toHaveLength(0)
    expect(toastMessages()).toContain(zh['toast.sessionSwitched'])
    stop()
  })

  it('shows a bounded generic error when Host storage fails', async () => {
    const stop = install({ uploader: { upload: async () => { throw new Error(`token=${SAMPLE_SECRET}`) } } })
    const ta = mountComposer() as HTMLTextAreaElement
    dispatchFiles('drop', [makeFile('mcp.json', '{}', 'application/json')])
    await settle()
    expect(ta.value).toBe('')
    expect(toastMessages()).toContain(zh['toast.storeFailed'])
    expectNoSecretSurfaces(ta.value)
    stop()
  })

  it('removes capture listeners on uninstall', async () => {
    const stop = install()
    const ta = mountComposer() as HTMLTextAreaElement
    stop()
    let officialRan = false
    document.addEventListener('drop', () => { officialRan = true }, { once: true })
    const event = dispatchFiles('drop', [makeFile('mcp.json', '{}', 'application/json')])
    await settle()
    expect(event.defaultPrevented).toBe(false)
    expect(officialRan).toBe(true)
    expect(ta.value).toBe('')
  })
})

function decodedUpload(index: number): string {
  const base64 = uploadedFiles[index]?.base64 ?? ''
  return new TextDecoder().decode(Uint8Array.from(atob(base64), char => char.charCodeAt(0)))
}

function expectNoSecretSurfaces(composerValue: string): void {
  expect(composerValue).not.toContain(SAMPLE_SECRET)
  expect(JSON.stringify(toastMessages())).not.toContain(SAMPLE_SECRET)
}
