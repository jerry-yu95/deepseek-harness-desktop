import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'

import { FileAttachmentStore } from '../src/core/store.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('FileAttachmentStore', () => {
  it('persists a private opaque text object and reads bounded line windows', async () => {
    const store = await makeStore()
    const attachment = await save(store, 'note.txt', 'one\ntwo\nthree\nfour', 'text/plain', 'text', false)
    expect(attachment.id).toMatch(/^file_[0-9a-f]{32}$/u)
    expect(attachment.name).toBe('note.txt')
    const result = await store.read(attachment.id, { startLine: 2, maxLines: 2 })
    expect(result.text).toBe('two\nthree')
    expect(result.startLine).toBe(2)
    expect(result.endLine).toBe(3)
    expect(result.totalLines).toBe(4)
    expect(result.truncated).toBe(true)
    const metadata = JSON.parse(await readFile(join(store.root, attachment.id, 'metadata.json'), 'utf8'))
    expect(metadata).not.toHaveProperty('sourcePath')
    expect(metadata.sha256).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('resolves a visible file name without exposing the internal attachment id', async () => {
    const store = await makeStore()
    await save(store, 'mcp.json', '{"mcpServers":{}}', 'application/json', 'text', true)
    const result = await store.readSelected({ name: 'mcp.json' })
    expect(result.attachment.name).toBe('mcp.json')
    expect(result.text).toBe('{"mcpServers":{}}')
  })

  it('extracts Word, Excel, and PowerPoint Open XML text on demand', async () => {
    const store = await makeStore()
    const fixtures = [
      ['brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', { 'word/document.xml': '<w:document><w:p><w:t>Word body</w:t></w:p></w:document>' }],
      ['table.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { 'xl/sharedStrings.xml': '<sst><si><t>Excel value</t></si></sst>', 'xl/worksheets/sheet1.xml': '<worksheet><row><c><v>1</v></c></row></worksheet>' }],
      ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', { 'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>Slide title</a:t></a:r></a:p></p:sld>' }],
    ] as const
    for (const [name, mediaType, entries] of fixtures) {
      const archive = Object.fromEntries(Object.entries(entries).map(([path, xml]) => [path, strToU8(xml)]))
      const data = zipSync(archive)
      const attachment = await saveBytes(store, name, data, mediaType, 'office', false)
      const result = await store.read(attachment.id)
      expect(result.text).toMatch(/Word body|Excel value|Slide title/u)
      expect(result.text).not.toContain('<w:')
      expect(result.text).not.toContain('<a:')
    }
  })

  it('fails closed for path-shaped names, sensitive names, invalid ids, and tampered bytes', async () => {
    const store = await makeStore()
    await expect(save(store, '../note.txt', 'hello', 'text/plain', 'text', false)).rejects.toThrow(/unsafe attachment name/u)
    await expect(save(store, '.env', 'API_KEY=x', 'text/plain', 'text', false)).rejects.toThrow(/unsafe attachment name/u)
    await expect(store.read('file_bad')).rejects.toThrow(/invalid attachment id/u)
    const attachment = await save(store, 'note.txt', 'hello', 'text/plain', 'text', false)
    await writeFile(join(store.root, attachment.id, 'content.bin'), 'changed', 'utf8')
    await expect(store.read(attachment.id)).rejects.toThrow(/size mismatch|integrity/u)
  })
})

async function makeStore(): Promise<FileAttachmentStore> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-file-store-'))
  roots.push(root)
  return new FileAttachmentStore(root)
}

async function save(
  store: FileAttachmentStore,
  name: string,
  text: string,
  mediaType: string,
  kind: 'text' | 'office',
  redacted: boolean,
) {
  return saveBytes(store, name, new TextEncoder().encode(text), mediaType, kind, redacted)
}

async function saveBytes(
  store: FileAttachmentStore,
  name: string,
  data: Uint8Array,
  mediaType: string,
  kind: 'text' | 'office',
  redacted: boolean,
) {
  return store.save({
    name,
    mediaType,
    bytes: data.byteLength,
    base64: Buffer.from(data).toString('base64'),
    kind,
    redacted,
  })
}
