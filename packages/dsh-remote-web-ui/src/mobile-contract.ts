import { z } from 'zod'
import type { ModelCatalog, SessionEventEntry, SessionSummary as OfficialSummary } from '@deepseek-ai/dsh-api-session-controller/types'
export type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/types'
export type { RpcRequest } from '@deepseek-ai/dsh-client-connection/client'
export type SessionSummary = OfficialSummary
export type HistoryEntry = SessionEventEntry
export interface SessionProjectionsBlock { values: Record<string, unknown> }
export type SessionModels = Pick<ModelCatalog, 'groups' | 'failures'> & { current: ModelCatalog['default']; routable: boolean }
const wireEvent = z.object({ type: z.string(), seq: z.number(), time: z.number(), data: z.unknown() }).passthrough()
export const muxFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session/event'), sessionId: z.string(), event: wireEvent }),
  z.object({ type: z.literal('session/snapshot'), sessionId: z.string(), events: z.array(wireEvent) }),
  z.object({ type: z.literal('session/projection'), sessionId: z.string(), key: z.string(), value: z.unknown() }),
  z.object({ type: z.literal('session/assistant'), sessionId: z.string(), value: z.object({
    attemptId: z.string(), startedAfterSeq: z.number(), turn: z.number(), step: z.number(), text: z.string(), reasoning: z.string(),
  }).nullable() }),
])
export type MuxFrame = z.infer<typeof muxFrameSchema>
export const serverRequestSchema = z.object({ type: z.literal('server-request'), payload: z.unknown() })
