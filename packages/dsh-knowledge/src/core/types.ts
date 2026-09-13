export const KNOWLEDGE_KINDS = ['decision', 'lesson', 'method', 'fact', 'preference'] as const
export const KNOWLEDGE_STATUSES = ['candidate', 'confirmed', 'dismissed'] as const
export const KNOWLEDGE_SOURCE_KINDS = ['conversation', 'project', 'manual', 'tool', 'url', 'file'] as const

export type KnowledgeKind = typeof KNOWLEDGE_KINDS[number]
export type KnowledgeStatus = typeof KNOWLEDGE_STATUSES[number]
export type KnowledgeSourceKind = typeof KNOWLEDGE_SOURCE_KINDS[number]

export type KnowledgeArticleFormat = 'markdown' | 'text'
export type KnowledgeArticleImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
export const ARTICLE_IMAGE_FAILURES = ['access', 'format', 'limit', 'timeout', 'network', 'cache', 'unknown'] as const
export type ArticleImageFailure = typeof ARTICLE_IMAGE_FAILURES[number]

export interface KnowledgeArticleImageMetadata {
  id: string
  alt: string
  order: number
  /** UTF-16 offset in the immutable text snapshot; absent in legacy records. */
  offset?: number
  status: 'ready' | 'unavailable'
  failureReason?: ArticleImageFailure
  mimeType?: KnowledgeArticleImageMimeType
  byteLength?: number
}

export interface KnowledgeArticleMetadata {
  author?: string
  format: KnowledgeArticleFormat
  truncated: boolean
  originalByteLength?: number
  images?: KnowledgeArticleImageMetadata[]
  imagesTruncated?: boolean
  excerpt?: string
}

/** Binary image data is transport-only and is never stored in the item JSON. */
export interface KnowledgeArticleResource extends KnowledgeArticleImageMetadata {
  status: 'ready'
  mimeType: KnowledgeArticleImageMimeType
  byteLength: number
  data: string
}

export interface KnowledgeSummary {
  text: string
  provider: string
  model: string
  generatedAt: string
  sourceTruncated: boolean
  editedByUser: boolean
}

export interface KnowledgeSource {
  kind: KnowledgeSourceKind
  label: string
  sessionId?: string
  uri?: string
  mimeType?: string
  hasSnapshot?: boolean
  capturedAt: string
}

export interface KnowledgeProposal {
  kind: KnowledgeKind
  title: string
  content: string
  project?: string
  category?: string
  tags?: string[]
  confidence?: number
  source: {
    kind: KnowledgeSourceKind
    label: string
    sessionId?: string
    uri?: string
    mimeType?: string
    capturedAt?: string
  }
}

export interface KnowledgeUpdate {
  kind: KnowledgeKind
  title: string
  content: string
  project?: string
  category?: string
  tags?: string[]
}

export interface KnowledgeItem {
  id: string
  status: KnowledgeStatus
  kind: KnowledgeKind
  title: string
  content: string
  project?: string
  category?: string
  tags: string[]
  confidence: number
  source: KnowledgeSource
  article?: KnowledgeArticleMetadata
  summary?: KnowledgeSummary
  createdAt: string
  updatedAt: string
  confirmedAt?: string
  dismissedAt?: string
}
