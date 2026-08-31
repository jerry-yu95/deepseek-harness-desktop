import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'

import { extractOfficeText } from './office.ts'
import { isSensitiveBasename } from './classify.ts'
import type { FileAttachmentRef, FileUploadRequest } from '../wire.ts'

const ID_PATTERN = /^file_[0-9a-f]{32}$/u
const MAX_STORED_BYTES = 20 * 1024 * 1024
const MAX_EXTRACTED_CHARS = 1024 * 1024
const DEFAULT_LINES = 200
const MAX_LINES = 500

interface StoredMetadata extends FileAttachmentRef {
  sha256: string
  createdAt: string
}

export interface ReadAttachmentOptions {
  startLine?: number
  maxLines?: number
}

export interface AttachmentSelector {
  attachmentId?: string
  name?: string
}

export interface ReadAttachmentResult {
  attachment: FileAttachmentRef
  text: string
  startLine: number
  endLine: number
  totalLines: number
  truncated: boolean
}

export class FileAttachmentStore {
  readonly root: string

  constructor(root = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'desktop', 'file-attachments', 'v1')) {
    this.root = root
  }

  async save(input: FileUploadRequest): Promise<FileAttachmentRef> {
    validateUpload(input)
    const data = Buffer.from(input.base64, 'base64')
    if (data.byteLength !== input.bytes) throw new Error('attachment byte length does not match payload')
    if (data.byteLength === 0 || data.byteLength > MAX_STORED_BYTES) throw new Error('attachment size is outside the supported range')
    const id = `file_${randomUUID().replaceAll('-', '')}`
    const directory = join(this.root, id)
    const digest = createHash('sha256').update(data).digest('hex')
    const attachment: FileAttachmentRef = {
      id,
      name: basename(input.name),
      mediaType: input.mediaType,
      bytes: data.byteLength,
      kind: input.kind,
      redacted: input.redacted,
    }
    const metadata: StoredMetadata = { ...attachment, sha256: digest, createdAt: new Date().toISOString() }
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await atomicWrite(join(directory, 'content.bin'), data)
    await atomicWrite(join(directory, 'metadata.json'), Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`))
    return attachment
  }

  async read(id: string, options: ReadAttachmentOptions = {}): Promise<ReadAttachmentResult> {
    if (!ID_PATTERN.test(id)) throw new Error('invalid attachment id')
    const directory = join(this.root, id)
    const metadata = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8')) as StoredMetadata
    validateMetadata(metadata, id)
    const data = await readFile(join(directory, 'content.bin'))
    if (data.byteLength !== metadata.bytes) throw new Error('stored attachment size mismatch')
    const digest = createHash('sha256').update(data).digest('hex')
    if (digest !== metadata.sha256) throw new Error('stored attachment integrity check failed')
    const extracted = metadata.kind === 'office'
      ? await extractOfficeText(metadata.name, data, MAX_EXTRACTED_CHARS)
      : decodeText(data)
    const lines = extracted.replace(/\r\n?/gu, '\n').split('\n')
    const startLine = clampInteger(options.startLine, 1, Math.max(1, lines.length), 1)
    const maxLines = clampInteger(options.maxLines, 1, MAX_LINES, DEFAULT_LINES)
    const selected = lines.slice(startLine - 1, startLine - 1 + maxLines)
    const endLine = Math.min(lines.length, startLine + selected.length - 1)
    return {
      attachment: stripMetadata(metadata),
      text: selected.join('\n'),
      startLine,
      endLine,
      totalLines: lines.length,
      truncated: endLine < lines.length,
    }
  }

  async resolve(selector: AttachmentSelector = {}): Promise<FileAttachmentRef> {
    if (selector.attachmentId !== undefined) return this.metadata(selector.attachmentId)
    const requestedName = selector.name === undefined ? undefined : basename(selector.name)
    if (selector.name !== undefined && (requestedName === '' || requestedName !== selector.name)) throw new Error('invalid attachment name')
    const entries = await readdir(this.root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    const candidates: StoredMetadata[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) continue
      try {
        const metadata = await this.storedMetadata(entry.name)
        if (requestedName === undefined || metadata.name === requestedName) candidates.push(metadata)
      } catch {
        // Ignore damaged or concurrently removed entries and continue looking.
      }
    }
    candidates.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    if (candidates.length === 0) throw new Error(requestedName === undefined ? 'no file attachment is available' : `attachment not found: ${requestedName}`)
    return stripMetadata(candidates[0])
  }

  async readSelected(selector: AttachmentSelector = {}, options: ReadAttachmentOptions = {}): Promise<ReadAttachmentResult> {
    const attachment = await this.resolve(selector)
    return this.read(attachment.id, options)
  }

  private async metadata(id: string): Promise<FileAttachmentRef> {
    return stripMetadata(await this.storedMetadata(id))
  }

  private async storedMetadata(id: string): Promise<StoredMetadata> {
    if (!ID_PATTERN.test(id)) throw new Error('invalid attachment id')
    const metadata = JSON.parse(await readFile(join(this.root, id, 'metadata.json'), 'utf8')) as StoredMetadata
    validateMetadata(metadata, id)
    return metadata
  }
}

function validateUpload(input: FileUploadRequest): void {
  if (input === null || typeof input !== 'object') throw new TypeError('invalid attachment upload')
  const name = basename(input.name)
  if (name === '' || name !== input.name || isSensitiveBasename(name)) throw new Error('unsafe attachment name')
  if (input.kind !== 'text' && input.kind !== 'office') throw new Error('unsupported attachment kind')
  if (!Number.isSafeInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_STORED_BYTES) throw new Error('invalid attachment size')
  if (typeof input.mediaType !== 'string' || input.mediaType.length > 160) throw new Error('invalid attachment media type')
  if (typeof input.base64 !== 'string' || input.base64.length > Math.ceil(MAX_STORED_BYTES * 4 / 3) + 8) throw new Error('invalid attachment payload')
}

function validateMetadata(metadata: StoredMetadata, id: string): void {
  if (metadata.id !== id || !ID_PATTERN.test(metadata.id)) throw new Error('stored attachment metadata is invalid')
  if (basename(metadata.name) !== metadata.name || isSensitiveBasename(metadata.name)) throw new Error('stored attachment name is invalid')
  if (!/^[0-9a-f]{64}$/u.test(metadata.sha256)) throw new Error('stored attachment digest is invalid')
}

function decodeText(data: Buffer): string {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(data)
  if (text.includes('\0')) throw new Error('attachment is not valid text')
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isSafeInteger(value)) return fallback
  return Math.min(max, Math.max(min, value as number))
}

function stripMetadata(metadata: StoredMetadata): FileAttachmentRef {
  const { id, name, mediaType, bytes, kind, redacted } = metadata
  return { id, name, mediaType, bytes, kind, redacted }
}

async function atomicWrite(path: string, data: Buffer): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
  await writeFile(temporary, data, { flag: 'wx', mode: 0o600 })
  await rename(temporary, path)
  const info = await stat(path)
  if (!info.isFile()) throw new Error('attachment storage did not create a regular file')
}
