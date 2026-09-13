import { registerLocalRpc } from '@harness-design/dsh-local-rpc'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { basename } from 'node:path'
export { articleText, boundArticleText } from './core/article-text.ts'

import { KnowledgeStore } from './core/store.ts'
import { refineKnowledgeWithModel, summarizeArticleWithModel } from './core/refine.ts'
import type { ArticleSummaryResult } from './core/refine.ts'
import { assertActive, withDeadline } from './core/cancellation.ts'
import type { KnowledgeSummarizeRequest } from './wire.ts'
import { ModelRouteResolver } from './core/model-route.ts'
import type { KnowledgeModelDirectory } from './wire.ts'
import { importKnowledgeUrl } from './core/url-import.ts'
import { KNOWLEDGE_KINDS, KNOWLEDGE_STATUSES, type KnowledgeProposal, type KnowledgeStatus } from './core/types.ts'
import { KNOWLEDGE_RPC_CHANNEL, type KnowledgeCreateRequest, type KnowledgeListRequest, type KnowledgeMoveTagRequest, type KnowledgeRefineRequest, type KnowledgeTransitionRequest, type KnowledgeUpdateRequest, type KnowledgeUrlImportRequest } from './wire.ts'

export const name = 'knowledge'
export const inject = ['webServer', 'connection', 'tools', 'systemPrompt', 'agents', 'llm', 'agentDefaultModel']

export const KNOWLEDGE_PROMPT_GUIDANCE = 'Only propose knowledge when a durable decision, lesson, method, fact, or user preference is clearly reusable beyond the immediate answer. Use knowledge_propose sparingly, at most a few bounded items after substantive work. Do not dump transcripts, hidden reasoning, raw attachments, credentials, API keys, tokens, cookies, or authorization headers. A proposal is not confirmed memory: only the user can confirm or dismiss it in My Brain.'

const KNOWLEDGE_E2E = process.env.DSH_KNOWLEDGE_E2E === '1'
const KNOWLEDGE_E2E_ROUTE = Object.freeze({ id: 'route_fixture', displayName: 'Fixture model', provider: 'fixture', model: 'fixture-model' })
const KNOWLEDGE_E2E_ERROR_ROUTE = Object.freeze({ id: 'route_fixture_error', displayName: 'Fixture error model', provider: 'fixture', model: 'fixture-error' })

function createKnowledgeE2eModel() {
  return {
    stream: (input: { signal?: AbortSignal }) => (async function* () {
      assertActive(input.signal)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 250)
        input.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('knowledge-cancelled')) }, { once: true })
      })
      assertActive(input.signal)
      const text = JSON.stringify({ overview: '这是一段由隔离测试模型生成的文章摘要。', sections: [{ heading: '关键要点', points: ['先确认目标，再验证最小可行方案。', '保留证据，区分观察与推测。', '将验证结果整理为可复用的知识。'] }, { heading: '适用边界', points: ['这些内容仅用于合成数据验收，不代表真实案例结论。'] }], tags: ['阅读', '合成'] })
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })(),
  }
}

export function apply(ctx: Context): void {
  const store = new KnowledgeStore()
  const routes = new ModelRouteResolver({
    llm: ctx.llm,
    currentDefault: () => ctx.agentDefaultModel.currentSelection(),
    currentSession: sessionId => {
      const agent = ctx.agents.get(sessionId as Parameters<Context['agents']['get']>[0])
      if (!agent?.options.provider || !agent.options.model) return undefined
      return { provider: agent.options.provider, model: agent.options.model }
    },
  })
  ctx.effect(() => registerLocalRpc(ctx, KNOWLEDGE_RPC_CHANNEL, createKnowledgeRpcHandler(store, {
    modelRoutes: KNOWLEDGE_E2E
      ? async () => ({ routes: [KNOWLEDGE_E2E_ROUTE, KNOWLEDGE_E2E_ERROR_ROUTE], selectedRouteId: KNOWLEDGE_E2E_ROUTE.id })
      : (sessionId, signal) => routes.list(sessionId, signal),
    summarize: async (request, signal) => {
      if (KNOWLEDGE_E2E && request.routeId === KNOWLEDGE_E2E_ERROR_ROUTE.id) throw new Error('knowledge-model-output-truncated')
      const detail = await store.readDetail(request.id)
      const route = KNOWLEDGE_E2E
        ? request.routeId === KNOWLEDGE_E2E_ROUTE.id ? KNOWLEDGE_E2E_ROUTE : undefined
        : await routes.resolve(request.routeId, signal)
      if (route === undefined) throw new Error('knowledge-model-route-unavailable')
      assertActive(signal)
      return summarizeArticleWithModel({ llm: KNOWLEDGE_E2E ? createKnowledgeE2eModel() as never : ctx.llm, ...route, title: detail.item.title, tags: detail.item.tags, source: detail.body, sourceTruncated: detail.item.article?.truncated === true || detail.bodyKind === 'legacy-excerpt', signal })
    },
    refine: async (request, signal) => {
      const agent = ctx.agents.get(request.sessionId as Parameters<Context['agents']['get']>[0])
      if (agent === undefined) throw new Error('session-not-live')
      const provider = agent.options.provider
      const model = agent.options.model
      if (provider === undefined || model === undefined) throw new Error('current-model-route-unavailable')
      const item = await store.read(request.id)
      const source = await store.readSnapshot(item.id) ?? item.content
      const update = await refineKnowledgeWithModel({ llm: ctx.llm, provider, model, title: item.title, content: item.content, category: item.category, tags: item.tags, source, signal })
      return { item: await store.update(item.id, update), model: `${provider}/${model}` }
    },
  })), 'dsh-knowledge: loopback rpc')
  ctx.effect(() => ctx.tools.register(createKnowledgeProposalTool(store)), 'dsh-knowledge: proposal tool')
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:knowledge-suggestions',
    order: 150,
    text: KNOWLEDGE_PROMPT_GUIDANCE,
  }), 'dsh-knowledge: suggestion guidance')
}

export interface KnowledgeRpcDependencies {
  modelRoutes?: (sessionId: string | undefined, signal: AbortSignal) => Promise<KnowledgeModelDirectory>
  summarize?: (request: KnowledgeSummarizeRequest, signal: AbortSignal) => Promise<ArticleSummaryResult>
  refine?: (request: KnowledgeRefineRequest, signal: AbortSignal) => Promise<{ item: Awaited<ReturnType<KnowledgeStore['read']>>; model: string }>
}

export function createKnowledgeRpcHandler(store: KnowledgeStore, dependencies: KnowledgeRpcDependencies = {}): (endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<{ ok: true; value: unknown }> {
  return async (endpoint: string, payload: unknown, signal?: AbortSignal) => {
    try {
      if (endpoint === 'model-routes') {
        const request = objectPayload(payload)
        if (Object.keys(request).some(key => key !== 'sessionId') || (request.sessionId !== undefined && (typeof request.sessionId !== 'string' || request.sessionId.length > 160))) throw new Error('knowledge-invalid-request')
        assertActive(signal)
        if (!dependencies.modelRoutes) throw new Error('knowledge-model-unavailable')
        return { ok: true, value: await dependencies.modelRoutes(request.sessionId as string | undefined, signal ?? new AbortController().signal) }
      }
      if (endpoint === 'detail' || endpoint === 'edit-summary' || endpoint === 'summarize') {
        const request = objectPayload(payload)
        const allowed = endpoint === 'detail' ? ['id'] : endpoint === 'edit-summary' ? ['id', 'text', 'expectedUpdatedAt'] : ['id', 'routeId', 'sessionId', 'expectedUpdatedAt', 'confirmed']
        if (Object.keys(request).some(key => !allowed.includes(key)) || typeof request.id !== 'string' || !/^knowledge_[0-9a-f]{32}$/u.test(request.id)) throw new Error('knowledge-invalid-request')
        assertActive(signal)
        if (endpoint === 'detail') return { ok: true, value: await store.readDetail(request.id) }
        if (typeof request.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(request.expectedUpdatedAt))) throw new Error('knowledge-invalid-request')
        if (endpoint === 'edit-summary') {
          if (typeof request.text !== 'string') throw new Error('knowledge-invalid-request')
          return { ok: true, value: { item: await store.editSummary(request.id, request.text, request.expectedUpdatedAt, { signal }) } }
        }
        if (request.confirmed !== true) throw new Error('knowledge-consent-required')
        if (typeof request.routeId !== 'string' || !request.routeId || request.routeId.length > 160 || (request.sessionId !== undefined && (typeof request.sessionId !== 'string' || request.sessionId.length > 160))) throw new Error('knowledge-invalid-request')
        const current = await store.read(request.id)
        if (current.status === 'dismissed') throw new Error('knowledge-invalid-request')
        if (current.updatedAt !== request.expectedUpdatedAt) throw new Error('knowledge revision conflict')
        if (!dependencies.summarize) throw new Error('knowledge-model-unavailable')
        const result = await withDeadline(signal ?? new AbortController().signal, 60_000, active => dependencies.summarize!(request as unknown as KnowledgeSummarizeRequest, active))
        assertActive(signal)
        const item = await store.updateSummary(request.id, result.summary, request.expectedUpdatedAt, { signal })
        return { ok: true, value: { item, suggestedTags: result.suggestedTags } }
      }
      if (endpoint === 'list') {
        const request = objectPayload(payload)
        const status = optionalStatus(request.status)
        return { ok: true, value: { items: await store.list(status === undefined ? {} : { status }) } }
      }
      if (endpoint === 'trash-list' || endpoint === 'trash' || endpoint === 'restore') {
        const request = objectPayload(payload)
        if (endpoint === 'trash-list') {
          if (Object.keys(request).length) throw new Error('knowledge-invalid-request')
          return { ok: true, value: { items: await store.list({}, true) } }
        }
        const allowed = endpoint === 'trash' ? ['id', 'expectedUpdatedAt', 'confirmed'] : ['id', 'confirmed']
        if (Object.keys(request).some(key => !allowed.includes(key)) || typeof request.id !== 'string' || !/^knowledge_[0-9a-f]{32}$/u.test(request.id)) throw new Error('knowledge-invalid-request')
        if (request.confirmed !== true) throw new Error('knowledge-consent-required')
        if (endpoint === 'restore') return { ok: true, value: { item: await store.restore(request.id, { signal }) } }
        if (typeof request.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(request.expectedUpdatedAt))) throw new Error('knowledge-invalid-request')
        await store.trash(request.id, request.expectedUpdatedAt, { signal })
        return { ok: true, value: { deleted: true } }
      }
      if (endpoint === 'confirm' || endpoint === 'dismiss') {
        const request = objectPayload(payload) as unknown as KnowledgeTransitionRequest
        if (typeof request.id !== 'string') throw new TypeError('knowledge id is required')
        const item = endpoint === 'confirm' ? await store.confirm(request.id, { signal }) : await store.dismiss(request.id, { signal })
        return { ok: true, value: { item } }
      }
      if (endpoint === 'move-tag') {
        const request = objectPayload(payload) as unknown as KnowledgeMoveTagRequest
        if (Object.keys(request).some(key => !['id', 'from', 'to', 'expectedUpdatedAt', 'confirmed'].includes(key)) || typeof request.id !== 'string' || !/^knowledge_[0-9a-f]{32}$/u.test(request.id) || (request.from !== null && (typeof request.from !== 'string' || request.from.length > 32)) || (request.to !== null && (typeof request.to !== 'string' || request.to.length > 32)) || typeof request.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(request.expectedUpdatedAt))) throw new Error('knowledge-invalid-request')
        if (request.confirmed !== true) throw new Error('knowledge-consent-required')
        const item = await store.moveTag(request.id, { from: request.from, to: request.to }, request.expectedUpdatedAt)
        return { ok: true, value: { item } }
      }
      if (endpoint === 'create') {
        const request = objectPayload(payload) as unknown as KnowledgeCreateRequest
        if (Object.keys(request).some(key => !['proposal', 'snapshot', 'article', 'articleResources', 'requestId'].includes(key))) throw new Error('knowledge-invalid-request')
        const options = { snapshot: request.snapshot, article: request.article, articleResources: request.articleResources, signal }
        const item = request.requestId === undefined ? await store.propose(request.proposal, options) : await store.proposeOnce(request.requestId, request.proposal, options)
        return { ok: true, value: { item } }
      }
      if (endpoint === 'update') {
        const request = objectPayload(payload) as unknown as KnowledgeUpdateRequest
        if (typeof request.id !== 'string') throw new TypeError('knowledge id is required')
        return { ok: true, value: { item: await store.update(request.id, request.update, { signal }) } }
      }
      if (endpoint === 'import-url') {
        const request = objectPayload(payload) as unknown as KnowledgeUrlImportRequest
        if (typeof request.url !== 'string') throw new TypeError('knowledge URL is required')
        if (Object.keys(request).some(key => !['url', 'category', 'tags', 'requestId'].includes(key)) || (request.requestId !== undefined && (typeof request.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/u.test(request.requestId)))) throw new Error('knowledge-invalid-request')
        const imported = await importKnowledgeUrl(request.url, undefined, signal)
        assertActive(signal)
        const proposal: KnowledgeProposal = {
          kind: 'fact',
          title: imported.title,
          content: imported.content,
          category: request.category,
          tags: request.tags,
          confidence: 0.6,
          source: imported.source,
        }
        const options = { snapshot: imported.snapshot, article: imported.article, articleResources: imported.articleResources, signal }
        const item = request.requestId === undefined ? await store.propose(proposal, options) : await store.proposeOnce(request.requestId, proposal, options)
        return { ok: true, value: { item } }
      }
      if (endpoint === 'refine') {
        const request = objectPayload(payload) as unknown as KnowledgeRefineRequest
        if (request.confirmed !== true) throw new Error('knowledge model processing requires explicit confirmation')
        if (typeof request.id !== 'string' || typeof request.sessionId !== 'string' || request.sessionId.trim() === '') throw new TypeError('knowledge refine request is invalid')
        if (dependencies.refine === undefined) throw new Error('knowledge model processing is unavailable')
        return { ok: true, value: await dependencies.refine(request, signal ?? new AbortController().signal) }
      }
      return { ok: true, value: { error: 'unknown-endpoint' } }
    } catch (error) {
      return { ok: true, value: { error: endpoint === 'move-tag' ? tagError(error) : ['create', 'import-url', 'detail', 'edit-summary', 'summarize', 'model-routes', 'trash', 'trash-list', 'restore'].includes(endpoint) ? articleError(error) : safeError(error) } }
    }
  }
}

function articleError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  const codes = ['knowledge-invalid-request', 'knowledge-consent-required', 'knowledge-cancelled', 'knowledge-fetch-timeout', 'knowledge-model-timeout', 'knowledge-model-response-invalid', 'knowledge-model-output-truncated', 'knowledge-model-failed', 'knowledge-model-response-contains-sensitive-material', 'knowledge-model-unavailable', 'knowledge-model-route-unavailable', 'knowledge-model-directory-unavailable']
  if (codes.includes(message)) return message
  if (message === 'knowledge revision conflict') return 'knowledge-revision-conflict'
  if (message === 'knowledge snapshot is too large') return 'knowledge-source-too-large'
  return 'knowledge-operation-failed'
}

function tagError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message === 'knowledge tag source is not present') return 'knowledge-tag-source-missing'
  if (message === 'only confirmed knowledge can be tagged') return 'knowledge-tag-confirmed-required'
  if (message === 'knowledge revision conflict') return 'knowledge-revision-conflict'
  if (message === 'tag destination is reserved') return 'knowledge-tag-other-reserved'
  if (message.includes('cannot exceed 8')) return 'knowledge-tag-limit'
  if (message === 'knowledge-consent-required' || message === 'knowledge-invalid-request') return message
  return 'knowledge-tag-operation-failed'
}

export function createKnowledgeProposalTool(store: KnowledgeStore) {
  return defineTool({
    name: 'knowledge_propose',
    description: 'Propose one concise, reusable knowledge candidate for the user to review in My Brain. This never confirms knowledge automatically. Use only after substantive work reveals a durable decision, lesson, method, fact, or user preference.',
    parameters: {
      kind: { type: 'string', required: true, enum: [...KNOWLEDGE_KINDS] },
      title: { type: 'string', required: true, description: 'Concise candidate title, at most 160 characters.' },
      content: { type: 'string', required: true, description: 'Bounded reusable knowledge, not a transcript or hidden reasoning.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional short labels, at most 8.' },
      confidence: { type: 'number', description: 'Advisory confidence from 0 to 1.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderProposalResult(value as { proposed: boolean; title: string }) }],
    },
    async execute(args, exec) {
      const cwd = (exec as { agent?: { session?: { header?: { cwd?: string } } } }).agent?.session?.header?.cwd
      const project = cwd === undefined ? undefined : basename(cwd)
      const proposal = {
        kind: args.kind,
        title: args.title,
        content: args.content,
        tags: args.tags,
        confidence: args.confidence,
        ...(project === undefined ? {} : { project }),
        source: {
          kind: 'conversation',
          label: project === undefined ? 'Harness conversation' : `Harness conversation in ${project}`,
        },
      } as KnowledgeProposal
      const item = await store.propose(proposal)
      return {
        proposed: true,
        id: item.id,
        status: item.status,
        kind: item.kind,
        title: item.title,
        project: item.project ?? null,
      } as Record<string, JsonValue>
    },
  })
}

function objectPayload(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('request payload must be an object')
  return payload as Record<string, unknown>
}

function optionalStatus(value: unknown): KnowledgeStatus | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !(KNOWLEDGE_STATUSES as readonly string[]).includes(value)) throw new TypeError('knowledge status is invalid')
  return value as KnowledgeStatus
}

function renderProposalResult(value: { proposed: boolean; title: string }): string {
  return value.proposed
    ? `Knowledge candidate proposed: ${value.title}. It is waiting for user confirmation in My Brain.`
    : 'Knowledge candidate could not be proposed.'
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'knowledge operation failed'
  return message.replace(/(authorization|api[_-]?key|token|secret|cookie)\s*[:=]\s*\S+/giu, '$1=<REDACTED>').slice(0, 240)
}

export * from './core/types.ts'
export * from './core/validate.ts'
export * from './core/store.ts'
export * from './core/refine.ts'
export * from './core/tags.ts'
export * from './wire.ts'
