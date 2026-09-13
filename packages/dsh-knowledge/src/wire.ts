import type { KnowledgeArticleMetadata, KnowledgeArticleResource, KnowledgeItem, KnowledgeProposal, KnowledgeStatus, KnowledgeUpdate } from './core/types.ts'

export const KNOWLEDGE_RPC_CHANNEL = '/harness-knowledge-v1'

export interface KnowledgeModelDirectory {
  routes: Array<{ id: string; displayName: string }>
  selectedRouteId?: string
}

export interface KnowledgeListRequest {
  status?: KnowledgeStatus
}

export interface KnowledgeTransitionRequest {
  id: string
}

export interface KnowledgeCreateRequest {
  proposal: KnowledgeProposal
  snapshot?: string
  article?: KnowledgeArticleMetadata
  articleResources?: KnowledgeArticleResource[]
  requestId?: string
}

export interface KnowledgeUpdateRequest {
  id: string
  update: KnowledgeUpdate
}

export interface KnowledgeUrlImportRequest {
  url: string
  requestId?: string
  category?: string
  tags?: string[]
}

export interface KnowledgeRefineRequest {
  id: string
  sessionId: string
  confirmed: true
}

export interface KnowledgeSummarizeRequest {
  id: string
  routeId: string
  sessionId?: string
  expectedUpdatedAt: string
  confirmed: true
}

export interface KnowledgeEditSummaryRequest {
  id: string
  text: string
  expectedUpdatedAt: string
}

export interface KnowledgeMoveTagRequest {
  id: string
  from: string | null
  to: string | null
  expectedUpdatedAt: string
  confirmed: true
}

export interface KnowledgeSummarizeResponse extends KnowledgeTransitionResponse {
  suggestedTags: string[]
}

export interface KnowledgeListResponse {
  items: KnowledgeItem[]
}

export interface KnowledgeTransitionResponse {
  item: KnowledgeItem
}

export interface KnowledgeRefineResponse extends KnowledgeTransitionResponse {
  model: string
}
