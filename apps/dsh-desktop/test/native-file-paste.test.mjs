import assert from 'node:assert/strict'
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { buildNativeFilePasteScript, clipboardFilePaths, prepareClipboardFiles } from '../src/native-file-paste.mjs'

function clipboardWith(formats) {
  return {
    availableFormats: () => Object.keys(formats),
    read: format => formats[format] ?? '',
    readBuffer: format => Buffer.from(formats[format] ?? ''),
  }
}

test('reads a percent-encoded Finder public.file-url without accepting web URLs', () => {
  const clipboard = clipboardWith({
    'public.file-url': 'file:///Users/test/My%20Files/mcp.json\nhttps://example.com/not-local.json',
  })
  assert.deepEqual(clipboardFilePaths(clipboard, 'darwin'), ['/Users/test/My Files/mcp.json'])
  assert.deepEqual(clipboardFilePaths(clipboard, 'win32'), [])
})

test('reads and deduplicates URI-list and Finder plist file references', () => {
  const clipboard = clipboardWith({
    'text/uri-list': '# copied files\nfile:///tmp/a.json\nfile:///tmp/a.json',
    NSFilenamesPboardType: '<?xml version="1.0"?><plist><array><string>/tmp/b&amp;c.yaml</string></array></plist>',
  })
  assert.deepEqual(clipboardFilePaths(clipboard, 'darwin'), ['/tmp/a.json', '/tmp/b&c.yaml'])
})

test('probes native Finder aliases when Electron advertises only an empty text/uri-list', () => {
  const clipboard = {
    availableFormats: () => ['text/uri-list'],
    read: format => {
      if (format === 'text/uri-list') return 'file:///.file/id=6571367.99389935'
      if (format === 'public.file-url') return 'file:///tmp/mcp.json'
      return ''
    },
    readBuffer: () => Buffer.alloc(0),
  }
  assert.deepEqual(clipboardFilePaths(clipboard, 'darwin'), ['/tmp/mcp.json'])
})

test('drops Finder opaque file ids when the plist also carries the real path', () => {
  const clipboard = clipboardWith({
    'text/uri-list': 'file:///.file/id=6571367.99389935',
    NSFilenamesPboardType: '<?xml version="1.0"?><plist><array><string>/private/tmp/mcp.json</string></array></plist>',
  })
  assert.deepEqual(clipboardFilePaths(clipboard, 'darwin'), ['/private/tmp/mcp.json'])
})

test('materializes JSON with its basename and never exposes the source path in the paste script', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-native-file-'))
  const path = join(root, 'mcp.json')
  await writeFile(path, '{"mcpServers":{}}', 'utf8')
  const files = await prepareClipboardFiles([path])
  assert.equal(files[0].name, 'mcp.json')
  assert.equal(files[0].type, 'application/json')
  assert.equal((await readFile(path)).equals(files[0].bytes), true)
  const script = buildNativeFilePasteScript(files)
  assert.match(script, /mcp\.json/)
  assert.match(script, /new File\(/)
  assert.match(script, /new ClipboardEvent\('paste'/)
  assert.doesNotMatch(script, new RegExp(root.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')))
})

test('generated browser event carries JSON bytes rather than a PNG icon preview', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-native-file-'))
  const path = join(root, 'mcp.json')
  const json = '{"mcpServers":{"tapd":{"url":"https://example.invalid/mcp"}}}'
  await writeFile(path, json, 'utf8')
  const script = buildNativeFilePasteScript(await prepareClipboardFiles([path]))
  let dispatched
  const previous = {
    DataTransfer: globalThis.DataTransfer,
    File: globalThis.File,
    ClipboardEvent: globalThis.ClipboardEvent,
    document: globalThis.document,
  }
  class TestFile extends Blob {
    constructor(parts, name, options) {
      super(parts, options)
      this.name = name
      this.typeValue = options?.type ?? ''
    }
    get type() { return this.typeValue }
  }
  class TestDataTransfer {
    files = []
    items = { add: file => { this.files.push(file) } }
  }
  class TestClipboardEvent {
    constructor(type, options) {
      this.type = type
      this.clipboardData = options.clipboardData
    }
  }
  try {
    globalThis.DataTransfer = TestDataTransfer
    globalThis.File = TestFile
    globalThis.ClipboardEvent = TestClipboardEvent
    globalThis.document = { activeElement: { dispatchEvent: event => { dispatched = event; return true } }, body: {} }
    Function(script)()
    assert.equal(dispatched.clipboardData.files.length, 1)
    const [file] = dispatched.clipboardData.files
    assert.equal(file.name, 'mcp.json')
    assert.equal(file.type, 'application/json')
    assert.equal(await file.text(), json)
  } finally {
    globalThis.DataTransfer = previous.DataTransfer
    globalThis.File = previous.File
    globalThis.ClipboardEvent = previous.ClipboardEvent
    globalThis.document = previous.document
  }
})

test('does not read unsupported or symbolic-link files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-native-file-'))
  const secret = join(root, 'actual.json')
  const link = join(root, 'linked.json')
  const pdf = join(root, 'document.pdf')
  await writeFile(secret, '{"token":"must-not-cross"}', 'utf8')
  await symlink(secret, link)
  await writeFile(pdf, 'not-a-real-pdf', 'utf8')
  const files = await prepareClipboardFiles([link, pdf])
  assert.equal(files[0].bytes.length, 0)
  assert.equal(files[1].bytes.length, 0)
  assert.equal(buildNativeFilePasteScript(files).includes('must-not-cross'), false)
})

test('represents oversized text without reading its content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-native-file-'))
  const path = join(root, 'large.json')
  await writeFile(path, Buffer.alloc(1024 * 1024 + 10, 120))
  const [file] = await prepareClipboardFiles([path])
  assert.equal(file.bytes.length, 1024 * 1024 + 1)
})

test('materializes modern Office files with their official MIME', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-native-file-'))
  const path = join(root, 'brief.docx')
  const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04])
  await writeFile(path, bytes)
  const [file] = await prepareClipboardFiles([path])
  assert.equal(file.name, 'brief.docx')
  assert.equal(file.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  assert.deepEqual(file.bytes, bytes)
})
