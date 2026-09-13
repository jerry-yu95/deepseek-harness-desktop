import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-api-workspace-controller'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SessionRequestId, SessionListValue } from '@deepseek-ai/dsh-api-session-controller/types'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/types'
import type { RpcResponse } from '@deepseek-ai/dsh-client-connection/client'
import type { RpcRequest, SessionModels } from './mobile-contract.ts'
import { z } from 'zod'
import { AssistantStreamAccumulator, assembleAssistantStream, expandAssistantStream } from '@deepseek-ai/dsh-llm/assistant-stream'
import type { AssistantStreamRecord } from '@deepseek-ai/dsh-llm/assistant-stream'
import type { SessionAssistantStreamAttempt } from '@deepseek-ai/dsh-api-session-controller/types'

const identity = z.string().min(1).max(200)
const sessionRequest = z.object({ sessionId: identity })
const sessionId = (value: unknown) => sessionRequest.parse(value).sessionId as SessionId
type Unary<T> = (request: RpcRequest<unknown>) => Promise<RpcResponse<T>>
export interface MobileHost {
  workspace: { list: Unary<{ items: readonly WorkspaceView[] }> }
  sessions: Record<'create' | 'history' | 'search' | 'prompt' | 'models' | 'selectModel' | 'rename', Unary<unknown>> & { list: Unary<SessionListValue> }
  events: { mux(request: RpcRequest<unknown>, signal: AbortSignal): AsyncIterable<{ type: string; payload: unknown }> }
}

/** The phone keeps its bounded RPC vocabulary; the host uses official domain controllers. */
export function createMobileHost(ctx: Context): MobileHost {
  const sessions = ctx.sessionController
  const unary = <T>(fn: (payload: unknown) => Promise<T>) => async (request: RpcRequest<unknown>) => ({ rpcId: request.rpcId, result: { ok: true as const, value: await fn(request.payload) } })
  const snapshot = async (id: SessionId, count: number) => {
    const controller = new AbortController()
    try {
      for await (const frame of sessions.follow({ address: { kind: 'session', sessionId: id }, maxMessages: count }, controller.signal)) {
        if (frame.type === 'snapshot') return frame
      }
      throw new Error('Session history unavailable')
    } finally { controller.abort() }
  }
  return {
    workspace: { list: unary(async () => {
      const controller = new AbortController()
      try {
        for await (const frame of ctx.workspaceController.follow(controller.signal)) {
          if (frame.type === 'baseline') return { items: frame.value.items }
        }
        throw new Error('Workspace list unavailable')
      } finally { controller.abort() }
    }) },
    sessions: {
      list: unary(async () => sessions.list({}, new AbortController().signal)),
      create: unary(async payload => {
        const value = z.object({ workspaceId: identity.optional(), cwd: z.string().min(1).max(4096).optional() }).strict().parse(payload)
        return sessions.create({ ...value, workspaceId: value.workspaceId as WorkspaceId | undefined })
      }),
      history: unary(async payload => {
        const value = sessionRequest.extend({ beforeSeq: z.number().int().nonnegative().optional(), maxMessages: z.number().int().min(1).max(100).default(30) }).strict().parse(payload)
        const first = await snapshot(value.sessionId as SessionId, value.maxMessages)
        const page = value.beforeSeq === undefined ? first : await sessions.page({ address: { kind: 'session', sessionId: value.sessionId as SessionId }, throughSeq: first.cursor, beforeSeq: value.beforeSeq, maxMessages: value.maxMessages }, new AbortController().signal)
        return { events: page.records, hasMore: page.hasMore, projections: first.projections }
      }),
      search: unary(async payload => sessions.search(z.object({ query: z.string().min(1).max(2000) }).strict().parse(payload), new AbortController().signal)),
      prompt: unary(async payload => {
        const value = sessionRequest.extend({ mode: z.literal('queue'), content: z.array(z.object({ type: z.literal('text'), text: z.string().min(1).max(60000) }).strict()).min(1).max(8) }).strict().parse(payload)
        return sessions.prompt({ ...value, sessionId: value.sessionId as SessionId, requestId: randomUUID() as SessionRequestId }, new AbortController().signal)
      }),
      models: unary(async (payload): Promise<SessionModels> => {
        const id = sessionId(payload)
        const catalog = await sessions.modelCatalog()
        const resolved = await sessions.resolveAgent(id)
        if ('error' in resolved) throw new Error('Session model unavailable')
        const options = resolved.agent.options
        const current = options.provider && options.model ? { provider: options.provider, model: options.model, ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}) } : catalog.default
        return { groups: catalog.groups, failures: catalog.failures, current, routable: catalog.routableProviders.includes(current.provider) }
      }),
      selectModel: unary(async payload => {
        const value = sessionRequest.extend({ provider: identity, model: z.string().min(1).max(500), reasoningEffort: z.string().max(80).optional() }).strict().parse(payload)
        return sessions.selectModel({ ...value, sessionId: value.sessionId as SessionId })
      }),
      rename: unary(async payload => {
        const value = sessionRequest.extend({ title: z.string().min(1).max(500) }).strict().parse(payload)
        return sessions.rename({ ...value, sessionId: value.sessionId as SessionId })
      }),
    },
    events: { async *mux(request: RpcRequest<unknown>, signal: AbortSignal) {
      const id = sessionId(request.payload)
      const cancellation = new AbortController()
      const combined = AbortSignal.any([signal, cancellation.signal])
      const history = async function* () {
      let attempt: Pick<SessionAssistantStreamAttempt, 'attemptId' | 'startedAfterSeq' | 'turn' | 'step'> | undefined
      let stream = new AssistantStreamAccumulator()
      let nextIndex = 0
      const presentation = () => {
        if (!attempt) return null
        const blocks = assembleAssistantStream(stream.snapshot()).blocks()
        return { ...attempt, text: blocks.filter(b => b.type === 'text').map(b => b.text).join(''),
          reasoning: blocks.filter(b => b.type === 'reasoning').map(b => b.text).join('') }
      }
      for await (const frame of sessions.follow({ address: { kind: 'session', sessionId: id }, maxMessages: 50, assistantStream: true }, combined)) {
        if (frame.type === 'snapshot') {
          yield { type: 'server-request', payload: { type: 'session/snapshot', sessionId: id, events: frame.records.map(entry => entry.event) } }
          for (const [key, value] of Object.entries(frame.projections.values)) yield { type: 'server-request', payload: { type: 'session/projection', sessionId: id, key, value } }
          attempt = frame.assistantStream?.activeAttempt
          stream = new AssistantStreamAccumulator()
          nextIndex = frame.assistantStream?.activeAttempt?.nextIndex ?? 0
          for (const chunk of expandAssistantStream((frame.assistantStream?.activeAttempt?.stream ?? []) as readonly AssistantStreamRecord[])) stream.push(chunk)
          yield { type: 'server-request', payload: { type: 'session/assistant', sessionId: id, value: presentation() } }
        } else if (frame.type === 'event') yield { type: 'server-request', payload: { type: 'session/event', sessionId: id, event: frame.event } }
        else if (frame.type === 'assistant-stream') {
          const live = frame.frame
          if (live.type === 'start') {
            attempt = live
            stream = new AssistantStreamAccumulator()
            nextIndex = 0
          } else if (live.attemptId !== attempt?.attemptId) continue
          else if (live.type === 'chunk') {
            if (live.index < nextIndex) continue
            if (live.index !== nextIndex) throw new Error('Assistant stream gap; reconnect required')
            // Official domain controller supplies typed stream chunks.
            for (const chunk of expandAssistantStream([{ type: 'chunk', time: live.time, chunk: live.chunk } as AssistantStreamRecord])) stream.push(chunk)
            nextIndex++
          } else {
            // The matching durable event is authoritative after a commit.
            attempt = undefined
          }
          yield { type: 'server-request', payload: { type: 'session/assistant', sessionId: id, value: presentation() } }
        }
      }
      }
      const control = async function* () {
        for await (const frame of sessions.control(combined)) {
          if (frame.type === 'projection' && frame.sessionId === id) yield { type: 'server-request', payload: { type: 'session/projection', sessionId: id, key: frame.key, value: frame.value } }
          else if (frame.type === 'baseline') for (const [key, value] of Object.entries(frame.value.projections[id]?.values ?? {})) yield { type: 'server-request', payload: { type: 'session/projection', sessionId: id, key, value } }
        }
      }
      const iterators = [history()[Symbol.asyncIterator](), control()[Symbol.asyncIterator]()]
      const pending = new Map(iterators.map((iterator, index) => [index, iterator.next().then(result => ({ index, result }))]))
      try {
        while (pending.size && !combined.aborted) {
          const { index, result } = await Promise.race(pending.values())
          pending.delete(index)
          if (result.done) continue
          // Request the next item only after delivering this one (bounded buffering).
          yield result.value
          pending.set(index, iterators[index]!.next().then(result => ({ index, result })))
        }
      } finally {
        cancellation.abort()
        await Promise.allSettled([...pending.values(), ...iterators.map(iterator => iterator.return())])
      }
    } },
  }
}
