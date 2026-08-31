import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import { basename } from 'node:path'

import { KnowledgeStore } from './core/store.ts'
import { refineKnowledgeWithModel } from './core/refine.ts'
import { importKnowledgeUrl } from './core/url-import.ts'
import { KNOWLEDGE_KINDS, KNOWLEDGE_STATUSES, type KnowledgeProposal, type KnowledgeStatus } from './core/types.ts'
import { KNOWLEDGE_RPC_CHANNEL, type KnowledgeCreateRequest, type KnowledgeListRequest, type KnowledgeRefineRequest, type KnowledgeTransitionRequest, type KnowledgeUpdateRequest, type KnowledgeUrlImportRequest } from './wire.ts'

export const name = 'knowledge'
export const inject = ['connection', 'tools', 'systemPrompt', 'agents', 'llm']

export const KNOWLEDGE_PROMPT_GUIDANCE = 'Only propose knowledge when a durable decision, lesson, method, fact, or user preference is clearly reusable beyond the immediate answer. Use knowledge_propose sparingly, at most a few bounded items after substantive work. Do not dump transcripts, hidden reasoning, raw attachments, credentials, API keys, tokens, cookies, or authorization headers. A proposal is not confirmed memory: only the user can confirm or dismiss it in My Brain.'

export function apply(ctx: Context): void {
  const store = new KnowledgeStore()
  ctx.effect(() => ctx.connection.rpc.handle(KNOWLEDGE_RPC_CHANNEL, createKnowledgeRpcHandler(store, {
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
  }), { authority: 'loopback' }), 'dsh-knowledge: loopback rpc')
  ctx.effect(() => ctx.tools.register(createKnowledgeProposalTool(store)), 'dsh-knowledge: proposal tool')
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:knowledge-suggestions',
    order: 150,
    text: KNOWLEDGE_PROMPT_GUIDANCE,
  }), 'dsh-knowledge: suggestion guidance')
}

export interface KnowledgeRpcDependencies {
  refine?: (request: KnowledgeRefineRequest, signal: AbortSignal) => Promise<{ item: Awaited<ReturnType<KnowledgeStore['read']>>; model: string }>
}

export function createKnowledgeRpcHandler(store: KnowledgeStore, dependencies: KnowledgeRpcDependencies = {}): (endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<{ ok: true; value: unknown }> {
  return async (endpoint: string, payload: unknown, signal?: AbortSignal) => {
    try {
      if (endpoint === 'list') {
        const request = objectPayload(payload)
        const status = optionalStatus(request.status)
        return { ok: true, value: { items: await store.list(status === undefined ? {} : { status }) } }
      }
      if (endpoint === 'confirm' || endpoint === 'dismiss') {
        const request = objectPayload(payload) as unknown as KnowledgeTransitionRequest
        if (typeof request.id !== 'string') throw new TypeError('knowledge id is required')
        const item = endpoint === 'confirm' ? await store.confirm(request.id) : await store.dismiss(request.id)
        return { ok: true, value: { item } }
      }
      if (endpoint === 'create') {
        const request = objectPayload(payload) as unknown as KnowledgeCreateRequest
        const item = await store.propose(request.proposal, request.snapshot === undefined ? {} : { snapshot: request.snapshot })
        return { ok: true, value: { item } }
      }
      if (endpoint === 'update') {
        const request = objectPayload(payload) as unknown as KnowledgeUpdateRequest
        if (typeof request.id !== 'string') throw new TypeError('knowledge id is required')
        return { ok: true, value: { item: await store.update(request.id, request.update) } }
      }
      if (endpoint === 'import-url') {
        const request = objectPayload(payload) as unknown as KnowledgeUrlImportRequest
        if (typeof request.url !== 'string') throw new TypeError('knowledge URL is required')
        const imported = await importKnowledgeUrl(request.url)
        const item = await store.propose({
          kind: 'fact',
          title: imported.title,
          content: imported.content,
          category: request.category,
          tags: request.tags,
          confidence: 0.6,
          source: imported.source,
        }, { snapshot: imported.snapshot })
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
      return { ok: true, value: { error: safeError(error) } }
    }
  }
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
export * from './wire.ts'
