export const KNOWLEDGE_KINDS = ['decision', 'lesson', 'method', 'fact', 'preference'] as const
export const KNOWLEDGE_STATUSES = ['candidate', 'confirmed', 'dismissed'] as const
export const KNOWLEDGE_SOURCE_KINDS = ['conversation', 'project', 'manual', 'tool', 'url', 'file'] as const

export type KnowledgeKind = typeof KNOWLEDGE_KINDS[number]
export type KnowledgeStatus = typeof KNOWLEDGE_STATUSES[number]
export type KnowledgeSourceKind = typeof KNOWLEDGE_SOURCE_KINDS[number]

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
  createdAt: string
  updatedAt: string
  confirmedAt?: string
  dismissedAt?: string
}
