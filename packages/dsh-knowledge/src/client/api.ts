import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { KnowledgeItem, KnowledgeProposal, KnowledgeStatus, KnowledgeUpdate } from '../core/types.ts'
import type { KnowledgeArticleDetail } from '../core/store.ts'
import type { KnowledgeSummarizeRequest, KnowledgeSummarizeResponse, KnowledgeEditSummaryRequest, KnowledgeModelDirectory } from '../wire.ts'
import {
  KNOWLEDGE_RPC_CHANNEL,
  type KnowledgeListResponse,
  type KnowledgeCreateRequest,
  type KnowledgeRefineRequest,
  type KnowledgeRefineResponse,
  type KnowledgeTransitionResponse,
  type KnowledgeUpdateRequest,
  type KnowledgeUrlImportRequest,
} from '../wire.ts'

interface RpcErrorValue { error: string }

/** Thin renderer-side projection of the knowledge Host RPC. */
export class KnowledgeClientApi {
  constructor(private readonly connection: ConnectionHandle) {}

  async detail(id: string, signal?: AbortSignal): Promise<KnowledgeArticleDetail> {
    return this.call<KnowledgeArticleDetail>('detail', { id }, signal)
  }

  async summarize(request: KnowledgeSummarizeRequest, signal?: AbortSignal): Promise<KnowledgeSummarizeResponse> {
    return this.call<KnowledgeSummarizeResponse>('summarize', request, signal)
  }

  async editSummary(request: KnowledgeEditSummaryRequest, signal?: AbortSignal): Promise<KnowledgeItem> {
    return (await this.call<KnowledgeTransitionResponse>('edit-summary', request, signal)).item
  }

  async moveTag(id: string, from: string | null, to: string | null, expectedUpdatedAt: string, signal?: AbortSignal): Promise<KnowledgeItem> {
    return (await this.call<KnowledgeTransitionResponse>('move-tag', { id, from, to, expectedUpdatedAt, confirmed: true }, signal)).item
  }

  async modelRoutes(sessionId?: string, signal?: AbortSignal): Promise<KnowledgeModelDirectory> {
    return this.call<KnowledgeModelDirectory>('model-routes', sessionId === undefined ? {} : { sessionId }, signal)
  }

  async list(status?: KnowledgeStatus, signal?: AbortSignal): Promise<KnowledgeItem[]> {
    const value = await this.call<KnowledgeListResponse>('list', status === undefined ? {} : { status }, signal)
    return value.items
  }

  async confirm(id: string, signal?: AbortSignal): Promise<KnowledgeItem> {
    const value = await this.call<KnowledgeTransitionResponse>('confirm', { id }, signal)
    return value.item
  }

  async dismiss(id: string, signal?: AbortSignal): Promise<KnowledgeItem> {
    const value = await this.call<KnowledgeTransitionResponse>('dismiss', { id }, signal)
    return value.item
  }

  async trash(id: string, expectedUpdatedAt: string, signal?: AbortSignal): Promise<void> {
    await this.call('trash', { id, expectedUpdatedAt, confirmed: true }, signal)
  }

  async listTrash(signal?: AbortSignal): Promise<KnowledgeItem[]> {
    return (await this.call<KnowledgeListResponse>('trash-list', {}, signal)).items
  }

  async restore(id: string, signal?: AbortSignal): Promise<KnowledgeItem> {
    return (await this.call<KnowledgeTransitionResponse>('restore', { id, confirmed: true }, signal)).item
  }

  async create(proposal: KnowledgeProposal, snapshot?: string, signal?: AbortSignal, options: Pick<KnowledgeCreateRequest, 'article' | 'articleResources' | 'requestId'> = {}): Promise<KnowledgeItem> {
    const request: KnowledgeCreateRequest = { proposal, ...(snapshot === undefined ? {} : { snapshot }), ...options }
    const value = await this.call<KnowledgeTransitionResponse>('create', request, signal)
    return value.item
  }

  async update(id: string, update: KnowledgeUpdate, signal?: AbortSignal): Promise<KnowledgeItem> {
    const request: KnowledgeUpdateRequest = { id, update }
    const value = await this.call<KnowledgeTransitionResponse>('update', request, signal)
    return value.item
  }

  async importUrl(request: KnowledgeUrlImportRequest, signal?: AbortSignal): Promise<KnowledgeItem> {
    const value = await this.call<KnowledgeTransitionResponse>('import-url', request, signal)
    return value.item
  }

  async refine(id: string, sessionId: string, confirmed: true, signal?: AbortSignal): Promise<KnowledgeRefineResponse> {
    const request: KnowledgeRefineRequest = { id, sessionId, confirmed }
    return this.call<KnowledgeRefineResponse>('refine', request, signal)
  }

  private async call<T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<T> {
    const result = await this.connection.rpc.call(KNOWLEDGE_RPC_CHANNEL, endpoint, payload, signal)
    if (!result.ok) throw new Error(result.error.message)
    const value = result.value as T | RpcErrorValue
    if (typeof value === 'object' && value !== null && 'error' in value) throw new Error(String(value.error))
    return value as T
  }
}
