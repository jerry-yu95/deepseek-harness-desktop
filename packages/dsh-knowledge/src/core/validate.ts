import {
  KNOWLEDGE_KINDS,
  KNOWLEDGE_SOURCE_KINDS,
  KNOWLEDGE_STATUSES,
  type KnowledgeItem,
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
const PROPOSAL_KEYS = new Set(['kind', 'title', 'content', 'project', 'category', 'tags', 'confidence', 'source'])
const UPDATE_KEYS = new Set(['kind', 'title', 'content', 'project', 'category', 'tags'])
const SOURCE_KEYS = new Set(['kind', 'label', 'sessionId', 'uri', 'mimeType', 'hasSnapshot', 'capturedAt'])
const ITEM_KEYS = new Set([
  'id', 'status', 'kind', 'title', 'content', 'project', 'category', 'tags', 'confidence', 'source',
  'createdAt', 'updatedAt', 'confirmedAt', 'dismissedAt',
])
const SECRET_PATTERNS = [
  /authorization\s*[:=]\s*bearer\s+[^\s]{12,}/iu,
  /(?:api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*[^\s]{12,}/iu,
  /(?:x-api-key|x-tapd-access-token)\s*:\s*[^\s]{12,}/iu,
] as const

export interface ProposalContext {
  id: string
  now: string
}

export function normalizeProposal(input: unknown, context: ProposalContext): KnowledgeItem {
  const value = objectValue(input, 'proposal')
  rejectUnknownKeys(value, PROPOSAL_KEYS, 'proposal contains a reserved or unknown field')
  const id = knowledgeId(context.id)
  const now = isoTimestamp(context.now, 'now')
  const title = boundedText(value.title, 'title', MAX_TITLE, false)
  const content = boundedText(value.content, 'content', MAX_CONTENT, true)
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
  const content = boundedText(value.content, 'content', MAX_CONTENT, true)
  rejectSecretLike(`${title}\n${content}`)
  const project = optionalText(value.project, 'project', MAX_PROJECT)
  const category = optionalText(value.category, 'category', MAX_CATEGORY)
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
  const content = boundedText(value.content, 'content', MAX_CONTENT, true)
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

function normalizeTags(input: unknown): string[] {
  if (input === undefined) return []
  if (!Array.isArray(input) || input.length > MAX_TAGS) throw new TypeError(`tags must contain at most ${MAX_TAGS} values`)
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of input) {
    const tag = boundedText(item, 'tag', MAX_TAG, false)
    if (tag.includes('..') || /[\\/]/u.test(tag) || !/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(tag)) throw new TypeError('tag contains unsupported characters')
    const key = tag.toLocaleLowerCase()
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

function boundedText(input: unknown, label: string, max: number, multiline: boolean): string {
  if (typeof input !== 'string') throw new TypeError(`${label} must be text`)
  const value = input.trim()
  if (value.length === 0 || value.length > max) throw new TypeError(`${label} must contain 1-${max} characters`)
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
