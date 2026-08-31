import { lstat, readFile } from 'node:fs/promises'
import { basename, posix } from 'node:path'

const MAX_CLIPBOARD_FILES = 4
const MAX_TEXT_BYTES = 1024 * 1024
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_OFFICE_BYTES = 20 * 1024 * 1024

const TEXT_MIME_BY_EXTENSION = Object.freeze({
  json: 'application/json',
  jsonc: 'application/json',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
})

const IMAGE_MIME_BY_EXTENSION = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
})

const OFFICE_MIME_BY_EXTENSION = Object.freeze({
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
})

function extensionOf(name) {
  const dot = name.lastIndexOf('.')
  return dot <= 0 || dot === name.length - 1 ? '' : name.slice(dot + 1).toLowerCase()
}

function decodeXml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

function pathFromReference(value) {
  const candidate = value.trim().replaceAll('\0', '')
  if (candidate === '') return undefined
  if (candidate.startsWith('file:')) {
    try {
      const url = new URL(candidate)
      if (url.protocol !== 'file:' || (url.hostname !== '' && url.hostname !== 'localhost')) return undefined
      // Finder references always use POSIX paths. Parsing them through
      // fileURLToPath() would apply the CI host's path rules and turn valid
      // macOS references into invalid Windows paths during cross-platform
      // verification.
      const path = decodeURIComponent(url.pathname)
      if (!posix.isAbsolute(path)) return undefined
      // Finder can publish both a real path and an opaque `/.file/id=...`
      // alias for the same selection. The alias has no useful basename and
      // would turn a valid mcp.json paste into a mixed unsupported batch.
      if (path.startsWith('/.file/id=')) return undefined
      return path
    } catch {
      return undefined
    }
  }
  if (!posix.isAbsolute(candidate) || candidate.startsWith('/.file/id=')) return undefined
  return candidate
}

function referencesFromUriList(value) {
  return value.split(/\r?\n/gu)
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'))
}

function referencesFromFilenamePlist(value) {
  const matches = value.matchAll(/<string>([\s\S]*?)<\/string>/gu)
  return [...matches].map(match => decodeXml(match[1] ?? ''))
}

function safelyReadClipboardFormat(clipboard, format) {
  try {
    const value = clipboard.read(format)
    if (typeof value === 'string' && value.trim() !== '') return value
  } catch {}
  try {
    const value = clipboard.readBuffer(format)
    if (Buffer.isBuffer(value) && value.length > 0) return value.toString('utf8')
  } catch {}
  return ''
}

/**
 * Read native file references copied from Finder before its icon preview is
 * mistaken for a real image. Only local absolute paths are returned.
 */
export function clipboardFilePaths(clipboard, platform = process.platform) {
  if (platform !== 'darwin' || clipboard === null || typeof clipboard !== 'object') return []
  let formats = []
  try {
    formats = clipboard.availableFormats()
  } catch {}
  const normalized = new Set(formats.map(format => String(format).toLowerCase()))
  const references = []

  const advertisesFiles = normalized.has('public.file-url')
    || normalized.has('text/uri-list')
    || normalized.has('nsfilenamespboardtype')
  if (advertisesFiles) {
    // Electron 43 maps Finder's file pasteboard to `text/uri-list` in
    // availableFormats(), but reading that mapped name returns an empty value.
    // The native aliases still carry the URL / plist and must be probed even
    // when they are not separately advertised.
    references.push(...referencesFromUriList(safelyReadClipboardFormat(clipboard, 'text/uri-list')))
    references.push(...referencesFromUriList(safelyReadClipboardFormat(clipboard, 'public.file-url')))
    references.push(...referencesFromFilenamePlist(safelyReadClipboardFormat(clipboard, 'NSFilenamesPboardType')))
  }

  const paths = []
  const seen = new Set()
  for (const reference of references) {
    const path = pathFromReference(reference)
    if (path === undefined || seen.has(path)) continue
    seen.add(path)
    paths.push(path)
    if (paths.length >= MAX_CLIPBOARD_FILES) break
  }
  return paths
}

function mimeAndLimit(name) {
  const extension = extensionOf(name)
  const textMime = TEXT_MIME_BY_EXTENSION[extension]
  if (textMime !== undefined) return { mime: textMime, limit: MAX_TEXT_BYTES, readable: true }
  const imageMime = IMAGE_MIME_BY_EXTENSION[extension]
  if (imageMime !== undefined) return { mime: imageMime, limit: MAX_IMAGE_BYTES, readable: true }
  const officeMime = OFFICE_MIME_BY_EXTENSION[extension]
  if (officeMime !== undefined) return { mime: officeMime, limit: MAX_OFFICE_BYTES, readable: true }
  return { mime: 'application/octet-stream', limit: 0, readable: false }
}

/**
 * Materialize copied local files without exposing their directories to the
 * renderer. Unsupported, missing, symbolic-link, and oversized files become
 * metadata-only payloads so the renderer can show its normal safe rejection.
 */
export async function prepareClipboardFiles(paths) {
  const prepared = []
  for (const path of paths.slice(0, MAX_CLIPBOARD_FILES)) {
    const name = basename(path) || 'file'
    const policy = mimeAndLimit(name)
    let bytes = Buffer.alloc(0)
    try {
      const stat = await lstat(path)
      if (stat.isFile() && !stat.isSymbolicLink() && policy.readable) {
        if (stat.size > policy.limit) bytes = Buffer.alloc(policy.limit + 1)
        else bytes = await readFile(path)
      }
    } catch {}
    prepared.push({ name, type: policy.mime, bytes })
  }
  return prepared
}

/** Build a main-world paste carrying the original basenames and bytes. */
export function buildNativeFilePasteScript(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_CLIPBOARD_FILES) return undefined
  const payload = files.map(file => ({
    name: String(file.name),
    type: String(file.type),
    base64: Buffer.from(file.bytes).toString('base64'),
  }))
  return `(() => {
    const payload = ${JSON.stringify(payload)};
    const transfer = new DataTransfer();
    for (const item of payload) {
      const binary = atob(item.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      transfer.items.add(new File([bytes], item.name, { type: item.type }));
    }
    const target = document.activeElement || document.body;
    return target.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
  })()`
}
