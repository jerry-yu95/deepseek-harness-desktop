/**
 * Classify dropped or pasted files so the capture listener can decide
 * whether to pass through to the official image path, intercept as text,
 * or reject as unsupported.
 */

/** Official image MIME types that normally stay on the official image path. */
export const OFFICIAL_IMAGE_MIME_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

/** Fence / redaction syntax for a supported text file. */
export type TextSyntax = 'json' | 'jsonc' | 'markdown' | 'text' | 'csv' | 'xml' | 'yaml'

/** File-like shape used by classification (browser File satisfies this). */
export interface FileRef {
  /** File name as supplied by the browser (may include a path on some hosts). */
  name: string
  /** MIME type from File.type; empty string when the OS omitted it. */
  type: string
  /** Byte length. */
  size: number
}

/** Classification outcome. */
export type FileClass =
  | { kind: 'image' }
  | { kind: 'text'; syntax: TextSyntax; mime: string; basename: string }
  | { kind: 'office'; mime: string; basename: string }
  | { kind: 'sensitive-file'; basename: string }
  | { kind: 'unsupported' }

const TEXT_EXTENSION_SYNTAX: Readonly<Record<string, TextSyntax>> = {
  json: 'json',
  jsonc: 'jsonc',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  csv: 'csv',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
}

const TEXT_MIME_SYNTAX: Readonly<Record<string, TextSyntax>> = {
  'application/json': 'json',
  'application/jsonc': 'jsonc',
  'text/json': 'json',
  'text/x-json': 'json',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'text/plain': 'text',
  'text/csv': 'csv',
  'application/csv': 'csv',
  'text/xml': 'xml',
  'application/xml': 'xml',
  'application/yaml': 'yaml',
  'application/x-yaml': 'yaml',
  'text/yaml': 'yaml',
  'text/x-yaml': 'yaml',
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpeg', 'jpg', 'webp', 'gif'])

const OFFICE_EXTENSION_MIME: Readonly<Record<string, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const OFFICE_MIMES = new Set(Object.values(OFFICE_EXTENSION_MIME))

const BLOCKED_EXTENSIONS = new Set([
  'pdf', 'doc', 'xls', 'ppt',
  'zip', 'rar', '7z', 'gz', 'tgz', 'tar', 'bz2', 'xz',
  'exe', 'dmg', 'app', 'bin', 'dll', 'so', 'wasm', 'class', 'jar',
  'apk', 'iso', 'msi', 'scr', 'com',
])

/**
 * Last path segment only; never expose a local directory.
 * @param name - File.name as provided by the browser.
 */
export function fileBasename(name: string): string {
  const normalized = name.replace(/\\/g, '/')
  const base = normalized.split('/').pop() ?? ''
  return base.length > 0 ? base : 'file'
}

/**
 * Lowercase MIME without parameters (`application/json; charset=utf-8` -> `application/json`).
 * @param type - File.type.
 */
export function normalizeMime(type: string): string {
  return type.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

function extensionOf(basename: string): string {
  const dot = basename.lastIndexOf('.')
  if (dot <= 0 || dot === basename.length - 1) return ''
  return basename.slice(dot + 1).toLowerCase()
}

function isOfficialImageMime(mime: string): boolean {
  return (OFFICIAL_IMAGE_MIME_TYPES as readonly string[]).includes(mime)
}

function isGenericBinaryMime(mime: string): boolean {
  return mime === 'application/octet-stream' || mime === 'binary/octet-stream'
}

const SENSITIVE_NAME_FRAGMENTS = [
  'credentials',
  'client-secret',
  'client_secret',
  'client-secrets',
  'client_secrets',
  'private-key',
  'private_key',
  'secrets',
] as const

const PRIVATE_KEY_BASENAME = /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:_sk)?(?:\.pub)?$/u
const SENSITIVE_KEY_EXTENSIONS = new Set(['pem', 'key', 'p12', 'pfx'])

/**
 * True when the basename looks like an env file, private key, or credential dump.
 * Path directories are ignored; mcp.json / settings.json / config.json stay allowed.
 * @param basename - last path segment only.
 */
export function isSensitiveBasename(basename: string): boolean {
  const name = basename.trim()
  if (name.length === 0) return false
  const lower = name.toLowerCase()
  if (lower === '.env' || lower.startsWith('.env.')) return true
  if (lower === '.npmrc' || lower === '.pypirc') return true
  if (PRIVATE_KEY_BASENAME.test(lower)) return true
  const extension = extensionOf(name)
  if (SENSITIVE_KEY_EXTENSIONS.has(extension)) return true
  const folded = lower.replace(/[._]+/gu, '-')
  for (const fragment of SENSITIVE_NAME_FRAGMENTS) {
    const needle = fragment.replace(/_/gu, '-')
    if (lower.includes(fragment) || folded.includes(needle)) return true
  }
  return false
}

/**
 * Classify one file. Sensitive basenames are blocked first. A known safe-text
 * extension then wins over an incorrect OS/Electron image MIME declaration;
 * strict UTF-8/binary validation still runs before the text reaches a draft.
 * This covers Finder/clipboard bridges that report `mcp.json` as an image.
 * @param file - dropped or pasted file.
 */
export function classifyFile(file: FileRef): FileClass {
  const basename = fileBasename(file.name)
  const mime = normalizeMime(file.type)
  const extension = extensionOf(basename)

  if (isSensitiveBasename(basename)) return { kind: 'sensitive-file', basename }

  const extensionSyntax = TEXT_EXTENSION_SYNTAX[extension]
  if (
    extensionSyntax !== undefined
    && (mime.length === 0 || isOfficialImageMime(mime) || isGenericBinaryMime(mime))
  ) {
    return {
      kind: 'text',
      syntax: extensionSyntax,
      mime: TEXT_MIME_SYNTAX[mime] === undefined ? mimeForSyntax(extensionSyntax, extension) : mime,
      basename,
    }
  }

  if (isOfficialImageMime(mime)) return { kind: 'image' }

  const officeMime = OFFICE_EXTENSION_MIME[extension]
  if (officeMime !== undefined && (mime.length === 0 || isGenericBinaryMime(mime) || mime === officeMime)) {
    return { kind: 'office', mime: officeMime, basename }
  }

  if (OFFICE_MIMES.has(mime) && officeMime !== undefined) {
    return { kind: 'office', mime, basename }
  }

  if (mime.length > 0) {
    const syntax = TEXT_MIME_SYNTAX[mime]
    if (syntax !== undefined) {
      return { kind: 'text', syntax, mime, basename }
    }
    return { kind: 'unsupported' }
  }

  if (IMAGE_EXTENSIONS.has(extension)) return { kind: 'image' }
  if (BLOCKED_EXTENSIONS.has(extension)) return { kind: 'unsupported' }
  return { kind: 'unsupported' }
}

function mimeForSyntax(syntax: TextSyntax, extension: string): string {
  if (syntax === 'json' || syntax === 'jsonc') return 'application/json'
  if (syntax === 'markdown') return 'text/markdown'
  if (syntax === 'csv') return 'text/csv'
  if (syntax === 'xml') return 'application/xml'
  if (syntax === 'yaml') return 'application/yaml'
  if (extension === 'txt') return 'text/plain'
  return 'text/plain'
}

/**
 * Fence language for the composer block.
 * @param syntax - classified text syntax.
 */
export function fenceLanguage(syntax: TextSyntax): string {
  if (syntax === 'json' || syntax === 'jsonc') return 'json'
  if (syntax === 'yaml') return 'yaml'
  if (syntax === 'markdown') return 'markdown'
  if (syntax === 'xml') return 'xml'
  if (syntax === 'csv') return 'csv'
  return 'text'
}
