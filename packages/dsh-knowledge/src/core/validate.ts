import {
  KNOWLEDGE_KINDS,
  KNOWLEDGE_SOURCE_KINDS,
  KNOWLEDGE_STATUSES,
  ARTICLE_IMAGE_FAILURES,
  type KnowledgeItem,
  type KnowledgeArticleMetadata,
  type KnowledgeArticleImageMetadata,
  type KnowledgeArticleResource,
  type KnowledgeSummary,
  type KnowledgeKind,
  type KnowledgeProposal,
  type KnowledgeSource,
  type KnowledgeSourceKind,
  type KnowledgeStatus,
  type KnowledgeUpdate,
} from './types.ts'

const ID_PATTERN = /^knowledge_[0-9a-f]{32}$/u
const MAX_TITLE = 160
const MAX_CONTENT = 4_000
const MAX_PROJECT = 240
const MAX_CATEGORY = 64
const MAX_TAGS = 8
const MAX_TAG = 32
const MAX_SOURCE_LABEL = 240
const MAX_SESSION_ID = 160
const MAX_SOURCE_URI = 2_048
const MAX_MIME_TYPE = 120
const MAX_AUTHOR = 160
const MAX_ARTICLE_IMAGES = 50
const MAX_ARTICLE_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_ARTICLE_IMAGE_TOTAL_BYTES = 20 * 1024 * 1024
const MAX_PROVIDER = 160
const MAX_MODEL = 160
const MAX_SUMMARY = 4_000
const PROPOSAL_KEYS = new Set(['kind', 'title', 'content', 'project', 'category', 'tags', 'confidence', 'source'])
const UPDATE_KEYS = new Set(['kind', 'title', 'content', 'project', 'category', 'tags'])
const SOURCE_KEYS = new Set(['kind', 'label', 'sessionId', 'uri', 'mimeType', 'hasSnapshot', 'capturedAt'])
const ARTICLE_KEYS = new Set(['author', 'format', 'truncated', 'originalByteLength', 'images', 'imagesTruncated', 'excerpt'])
const SUMMARY_KEYS = new Set(['text', 'provider', 'model', 'generatedAt', 'sourceTruncated', 'editedByUser'])
const ITEM_KEYS = new Set([
  'id', 'status', 'kind', 'title', 'content', 'project', 'category', 'tags', 'confidence', 'source',
  'article', 'summary', 'createdAt', 'updatedAt', 'confirmedAt', 'dismissedAt',
])
const SECRET_PATTERNS = [
  /authorization\s*[:=]\s*bearer\s+[^\s]{12,}/iu,
  /(?:api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*[^\s]{12,}/iu,
  /(?:x-api-key|x-tapd-access-token)\s*:\s*[^\s]{12,}/iu,
] as const

export interface ProposalContext {
  id: string
  now: string
  allowEmptyContent?: boolean
}

export function normalizeProposal(input: unknown, context: ProposalContext): KnowledgeItem {
  const value = objectValue(input, 'proposal')
  rejectUnknownKeys(value, PROPOSAL_KEYS, 'proposal contains a reserved or unknown field')
  const id = knowledgeId(context.id)
  const now = isoTimestamp(context.now, 'now')
  const title = boundedText(value.title, 'title', MAX_TITLE, false)
  const content = boundedText(value.content, 'content', MAX_CONTENT, true, context.allowEmptyContent)
  rejectSecretLike(`${title}\n${content}`)
  const project = optionalText(value.project, 'project', MAX_PROJECT)
  const category = optionalText(value.category, 'category', MAX_CATEGORY)
  const source = normalizeSource(value.source, now)
  return {
    id,
    status: 'candidate',
    kind: enumValue(value.kind, KNOWLEDGE_KINDS, 'kind'),
    title,
    content,
    ...(project === undefined ? {} : { project }),
    ...(category === undefined ? {} : { category }),
    tags: normalizeTags(value.tags),
    confidence: confidenceValue(value.confidence),
    source,
    createdAt: now,
    updatedAt: now,
  }
}

export function validateKnowledgeItem(input: unknown): KnowledgeItem {
  const value = objectValue(input, 'knowledge item')
  rejectUnknownKeys(value, ITEM_KEYS, 'knowledge item contains an unknown field')
  const status = enumValue(value.status, KNOWLEDGE_STATUSES, 'status')
  const createdAt = isoTimestamp(value.createdAt, 'createdAt')
  const updatedAt = isoTimestamp(value.updatedAt, 'updatedAt')
  const confirmedAt = optionalTimestamp(value.confirmedAt, 'confirmedAt')
  const dismissedAt = optionalTimestamp(value.dismissedAt, 'dismissedAt')
  if (status === 'candidate' && (confirmedAt !== undefined || dismissedAt !== undefined)) throw new Error('candidate lifecycle timestamps are invalid')
  if (status === 'confirmed' && (confirmedAt === undefined || dismissedAt !== undefined)) throw new Error('confirmedAt is required only for confirmed knowledge')
  if (status === 'dismissed' && (dismissedAt === undefined || confirmedAt !== undefined)) throw new Error('dismissedAt is required only for dismissed knowledge')
  const title = boundedText(value.title, 'title', MAX_TITLE, false)
  const content = boundedText(value.content, 'content', MAX_CONTENT, true, value.article !== undefined)
  rejectSecretLike(`${title}\n${content}`)
  const project = optionalText(value.project, 'project', MAX_PROJECT)
  const category = optionalText(value.category, 'category', MAX_CATEGORY)
  const article = normalizeArticleMetadata(value.article)
  const summary = normalizeKnowledgeSummary(value.summary)
  return {
    id: knowledgeId(value.id),
    status,
    kind: enumValue(value.kind, KNOWLEDGE_KINDS, 'kind'),
    title,
    content,
    ...(project === undefined ? {} : { project }),
    ...(category === undefined ? {} : { category }),
    tags: normalizeTags(value.tags),
    confidence: confidenceValue(value.confidence),
    source: normalizeStoredSource(value.source),
    ...(article === undefined ? {} : { article }),
    ...(summary === undefined ? {} : { summary }),
    createdAt,
    updatedAt,
    ...(confirmedAt === undefined ? {} : { confirmedAt }),
    ...(dismissedAt === undefined ? {} : { dismissedAt }),
  }
}

export function normalizeKnowledgeUpdate(input: unknown, current: KnowledgeItem, nowInput: string): KnowledgeItem {
  const value = objectValue(input, 'knowledge update')
  rejectUnknownKeys(value, UPDATE_KEYS, 'knowledge update contains an unknown field')
  const title = boundedText(value.title, 'title', MAX_TITLE, false)
  const content = boundedText(value.content, 'content', MAX_CONTENT, true, current.article !== undefined)
  rejectSecretLike(`${title}\n${content}`)
  const project = optionalText(value.project, 'project', MAX_PROJECT)
  const category = optionalText(value.category, 'category', MAX_CATEGORY)
  return validateKnowledgeItem({
    ...current,
    kind: enumValue(value.kind, KNOWLEDGE_KINDS, 'kind'),
    title,
    content,
    ...(project === undefined ? { project: undefined } : { project }),
    ...(category === undefined ? { category: undefined } : { category }),
    tags: normalizeTags(value.tags),
    updatedAt: isoTimestamp(nowInput, 'now'),
  })
}

export function normalizeArticleMetadata(input: unknown): KnowledgeArticleMetadata | undefined {
  if (input === undefined) return undefined
  const value = objectValue(input, 'article metadata')
  rejectUnknownKeys(value, ARTICLE_KEYS, 'article metadata contains an unknown field')
  const author = optionalText(value.author, 'article author', MAX_AUTHOR)
  const format = enumValue(value.format, ['markdown', 'text'] as const, 'article format')
  const truncated = optionalBoolean(value.truncated, 'article truncated')
  if (truncated === undefined) throw new TypeError('article truncated is required')
  const originalByteLength = optionalInteger(value.originalByteLength, 'article originalByteLength')
  const images = normalizeArticleImages(value.images)
  const imagesTruncated = optionalBoolean(value.imagesTruncated, 'article imagesTruncated')
  const excerpt = value.excerpt === undefined ? undefined : boundedText(value.excerpt, 'article excerpt', 180, true)
  return {
    ...(author === undefined ? {} : { author }),
    format,
    truncated,
    ...(originalByteLength === undefined ? {} : { originalByteLength }),
    ...(images === undefined ? {} : { images }),
    ...(imagesTruncated === undefined ? {} : { imagesTruncated }),
    ...(excerpt === undefined ? {} : { excerpt }),
  }
}

function normalizeArticleImages(input: unknown, sparse = false): KnowledgeArticleImageMetadata[] | undefined {
  if (input === undefined) return undefined
  if (!Array.isArray(input) || input.length > MAX_ARTICLE_IMAGES) throw new TypeError(`article images must contain at most ${MAX_ARTICLE_IMAGES} values`)
  const seen = new Set<string>()
  let totalBytes = 0
  const images = input.map((entry, index) => {
    const value = objectValue(entry, 'article image')
    const keys = new Set(['id', 'alt', 'order', 'offset', 'status', 'mimeType', 'byteLength', 'failureReason'])
    rejectUnknownKeys(value, keys, 'article image contains an unknown field')
    if (typeof value.id !== 'string' || !/^image_[0-9a-f]{32}$/u.test(value.id) || seen.has(value.id)) throw new TypeError('article image id is invalid')
    seen.add(value.id)
    const alt = boundedText(value.alt, 'article image alt', 200, true, true)
    if (!Number.isSafeInteger(value.order) || (value.order as number) < 0 || (value.order as number) >= MAX_ARTICLE_IMAGES) throw new TypeError('article image order is invalid')
    if (!sparse && value.order !== index) throw new TypeError('article image order must be stable')
    const offset = optionalInteger(value.offset, 'article image offset')
    if (offset !== undefined && offset > 1_048_576) throw new TypeError('article image offset is too large')
    if (value.status !== 'ready' && value.status !== 'unavailable') throw new TypeError('article image status is invalid')
    const failureReason = value.failureReason === undefined ? undefined : enumValue(value.failureReason, ARTICLE_IMAGE_FAILURES, 'article image failure reason')
    if (value.status === 'ready' && failureReason !== undefined) throw new TypeError('ready image cannot have a failure reason')
    const mimeType = value.mimeType === undefined ? undefined : enumValue(value.mimeType, ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const, 'article image mimeType')
    const byteLength = value.byteLength === undefined ? undefined : optionalInteger(value.byteLength, 'article image byteLength')
    if (value.status === 'ready' && (mimeType === undefined || byteLength === undefined || byteLength === 0 || byteLength > MAX_ARTICLE_IMAGE_BYTES)) throw new TypeError('ready article image metadata is incomplete')
    if (value.status === 'unavailable' && (mimeType !== undefined || byteLength !== undefined)) throw new TypeError('unavailable article image metadata is invalid')
    totalBytes += byteLength ?? 0
    if (totalBytes > MAX_ARTICLE_IMAGE_TOTAL_BYTES) throw new TypeError('article images are too large')
    return {
      id: value.id,
      alt,
      order: value.order as number,
      ...(offset === undefined ? {} : { offset }),
      status: value.status as KnowledgeArticleImageMetadata['status'],
      ...(failureReason === undefined ? {} : { failureReason }),
      ...(mimeType === undefined ? {} : { mimeType }),
      ...(byteLength === undefined ? {} : { byteLength }),
    }
  })
  return images
}

export function normalizeArticleResources(input: unknown): KnowledgeArticleResource[] | undefined {
  if (input === undefined) return undefined
  if (!Array.isArray(input)) throw new TypeError('article resources must be an array')
  const metadata = normalizeArticleImages(input.map(entry => {
    const value = objectValue(entry, 'article resource')
    const { data: _data, ...image } = value
    return image
  }), true)
  if (metadata === undefined) return undefined
  return input.map((entry, index) => {
    const value = objectValue(entry, 'article resource')
    if (typeof value.data !== 'string' || value.data.length === 0) throw new TypeError('article resource data is required')
    const image = metadata[index]
    if (image.status !== 'ready' || image.mimeType === undefined || image.byteLength === undefined) throw new TypeError('article resource must be ready')
    decodeArticleImageData(value.data, image.mimeType, image.byteLength)
    return { ...image, status: 'ready', mimeType: image.mimeType, byteLength: image.byteLength, data: value.data }
  })
}

export function decodeArticleImageData(data: string, mimeType: KnowledgeArticleResource['mimeType'], byteLength: number): Buffer {
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType) || byteLength < 1 || byteLength > MAX_ARTICLE_IMAGE_BYTES || data.length > 4 * Math.ceil(MAX_ARTICLE_IMAGE_BYTES / 3)) throw new TypeError('article resource exceeds allowed bounds')
  // A repeated four-character regex group over multi-MiB data exhausts V8's
  // regexp stack. Canonical round-tripping still rejects bad padding/characters.
  if (data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/u.test(data)) throw new TypeError('article resource data is not valid base64')
  const bytes = Buffer.from(data, 'base64')
  if (bytes.toString('base64') !== data) throw new TypeError('article resource data is not valid base64')
  if (bytes.byteLength !== byteLength) throw new TypeError('article resource byte length does not match')
  const signature = mimeType === 'image/png'
    ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : mimeType === 'image/jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mimeType === 'image/gif'
        ? bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a'
        : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!signature) throw new TypeError('article resource signature does not match mime type')
  return bytes
}

export function normalizeKnowledgeSummary(input: unknown): KnowledgeSummary | undefined {
  if (input === undefined) return undefined
  const value = objectValue(input, 'knowledge summary')
  rejectUnknownKeys(value, SUMMARY_KEYS, 'knowledge summary contains an unknown field')
  const text = boundedText(value.text, 'summary text', MAX_SUMMARY, true)
  const provider = boundedText(value.provider, 'summary provider', MAX_PROVIDER, false)
  const model = boundedText(value.model, 'summary model', MAX_MODEL, false)
  const generatedAt = isoTimestamp(value.generatedAt, 'summary generatedAt')
  const sourceTruncated = optionalBoolean(value.sourceTruncated, 'summary sourceTruncated')
  const editedByUser = optionalBoolean(value.editedByUser, 'summary editedByUser')
  if (sourceTruncated === undefined || editedByUser === undefined) throw new TypeError('summary metadata is incomplete')
  rejectSecretLike(`${text}\n${provider}\n${model}`)
  return { text, provider, model, generatedAt, sourceTruncated, editedByUser }
}

function normalizeSource(input: unknown, fallbackTime: string): KnowledgeSource {
  const value = objectValue(input, 'source')
  rejectUnknownKeys(value, SOURCE_KEYS, 'source contains an unknown field')
  const sessionId = optionalText(value.sessionId, 'source sessionId', MAX_SESSION_ID)
  const uri = optionalSourceUri(value.uri)
  const mimeType = optionalText(value.mimeType, 'source mimeType', MAX_MIME_TYPE)
  return {
    kind: enumValue(value.kind, KNOWLEDGE_SOURCE_KINDS, 'source kind'),
    label: boundedText(value.label, 'source label', MAX_SOURCE_LABEL, false),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(uri === undefined ? {} : { uri }),
    ...(mimeType === undefined ? {} : { mimeType }),
    capturedAt: value.capturedAt === undefined ? fallbackTime : isoTimestamp(value.capturedAt, 'source capturedAt'),
  }
}

function normalizeStoredSource(input: unknown): KnowledgeSource {
  const value = objectValue(input, 'source')
  rejectUnknownKeys(value, SOURCE_KEYS, 'source contains an unknown field')
  const sessionId = optionalText(value.sessionId, 'source sessionId', MAX_SESSION_ID)
  const uri = optionalSourceUri(value.uri)
  const mimeType = optionalText(value.mimeType, 'source mimeType', MAX_MIME_TYPE)
  const hasSnapshot = optionalBoolean(value.hasSnapshot, 'source hasSnapshot')
  return {
    kind: enumValue(value.kind, KNOWLEDGE_SOURCE_KINDS, 'source kind'),
    label: boundedText(value.label, 'source label', MAX_SOURCE_LABEL, false),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(uri === undefined ? {} : { uri }),
    ...(mimeType === undefined ? {} : { mimeType }),
    ...(hasSnapshot === undefined ? {} : { hasSnapshot }),
    capturedAt: isoTimestamp(value.capturedAt, 'source capturedAt'),
  }
}

function optionalSourceUri(input: unknown): string | undefined {
  if (input === undefined) return undefined
  const value = boundedText(input, 'source uri', MAX_SOURCE_URI, false)
  let url: URL
  try { url = new URL(value) } catch { throw new TypeError('source uri must be a valid URL') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('source uri must use http or https')
  url.username = ''
  url.password = ''
  return url.toString()
}

function optionalBoolean(input: unknown, label: string): boolean | undefined {
  if (input === undefined) return undefined
  if (typeof input !== 'boolean') throw new TypeError(`${label} must be boolean`)
  return input
}

function optionalInteger(input: unknown, label: string): number | undefined {
  if (input === undefined) return undefined
  if (!Number.isSafeInteger(input) || (input as number) < 0) throw new TypeError(`${label} must be a safe byte length`)
  return input as number
}

function normalizeTags(input: unknown): string[] {
  if (input === undefined) return []
  if (!Array.isArray(input) || input.length > MAX_TAGS) throw new TypeError(`tags must contain at most ${MAX_TAGS} values`)
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of input) {
    const tag = boundedText(item, 'tag', MAX_TAG, false).normalize('NFC')
    if (tag === '其他') throw new TypeError('tag “其他” is reserved for the virtual untagged group')
    if (tag.includes('..') || /[\\/]/u.test(tag) || !/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(tag)) throw new TypeError('tag contains unsupported characters')
    const key = tag
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}

function objectValue(input: unknown, label: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError(`${label} must be an object`)
  return input as Record<string, unknown>
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, message: string): void {
  if (Object.keys(value).some(key => !allowed.has(key))) throw new TypeError(message)
}

function enumValue<T extends string>(input: unknown, values: readonly T[], label: string): T {
  if (typeof input !== 'string' || !values.includes(input as T)) throw new TypeError(`${label} is invalid`)
  return input as T
}

function boundedText(input: unknown, label: string, max: number, multiline: boolean, allowEmpty = false): string {
  if (typeof input !== 'string') throw new TypeError(`${label} must be text`)
  const value = input.trim()
  if ((!allowEmpty && value.length === 0) || value.length > max) throw new TypeError(`${label} must contain ${allowEmpty ? 0 : 1}-${max} characters`)
  const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u
  if (controls.test(value)) throw new TypeError(`${label} contains control characters`)
  return value
}

function optionalText(input: unknown, label: string, max: number): string | undefined {
  if (input === undefined) return undefined
  return boundedText(input, label, max, false)
}

function confidenceValue(input: unknown): number {
  if (input === undefined) return 0.7
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0 || input > 1) throw new TypeError('confidence must be between 0 and 1')
  return Math.round(input * 100) / 100
}

function knowledgeId(input: unknown): string {
  if (typeof input !== 'string' || !ID_PATTERN.test(input)) throw new TypeError('knowledge id is invalid')
  return input
}

function isoTimestamp(input: unknown, label: string): string {
  if (typeof input !== 'string') throw new TypeError(`${label} must be an ISO timestamp`)
  const parsed = new Date(input)
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== input) throw new TypeError(`${label} must be an ISO timestamp`)
  return input
}

function optionalTimestamp(input: unknown, label: string): string | undefined {
  return input === undefined ? undefined : isoTimestamp(input, label)
}

function rejectSecretLike(input: string): void {
  if (SECRET_PATTERNS.some(pattern => pattern.test(input))) throw new Error('knowledge content contains a secret-like value')
}

export type { KnowledgeItem, KnowledgeKind, KnowledgeProposal, KnowledgeSourceKind, KnowledgeStatus, KnowledgeUpdate }
