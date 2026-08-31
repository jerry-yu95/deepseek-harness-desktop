import type { KnowledgeItem, KnowledgeProposal, KnowledgeStatus, KnowledgeUpdate } from './core/types.ts'

export const KNOWLEDGE_RPC_CHANNEL = '/harness-knowledge-v1'

export interface KnowledgeListRequest {
  status?: KnowledgeStatus
}

export interface KnowledgeTransitionRequest {
  id: string
}

export interface KnowledgeCreateRequest {
  proposal: KnowledgeProposal
  snapshot?: string
}

export interface KnowledgeUpdateRequest {
  id: string
  update: KnowledgeUpdate
}

export interface KnowledgeUrlImportRequest {
  url: string
  category?: string
  tags?: string[]
}

export interface KnowledgeRefineRequest {
  id: string
  sessionId: string
  confirmed: true
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
