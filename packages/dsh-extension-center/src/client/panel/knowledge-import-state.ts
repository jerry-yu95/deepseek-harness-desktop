import type { KnowledgeItem } from '@harness-design/dsh-knowledge/src/core/types.ts'

type Detail = { item: KnowledgeItem; body: string; bodyKind: 'article' | 'legacy-snapshot' | 'legacy-excerpt' }
type Stage = 'input' | 'fetching' | 'structuring' | 'verification' | 'summarizing' | 'preview' | 'saving' | 'error' | 'cancelled'
export type ImportState = {
  stage: Stage
  attemptId: number
  requestId?: string
  detail?: Detail
  error?: string
  suggestedTags: string[]
}
type Event =
  | { type: 'start'; attemptId: number; requestId: string }
  | { type: 'progress'; attemptId: number; stage: 'fetching' | 'structuring' | 'verification' }
  | { type: 'captured'; attemptId: number; detail: Detail }
  | { type: 'summarize' | 'save' | 'cancel' | 'reset'; attemptId: number }
  | { type: 'failed'; attemptId: number; error: string }
  | { type: 'summarized'; attemptId: number; item: KnowledgeItem; suggestedTags: string[] }
  | { type: 'edited'; attemptId: number; item: KnowledgeItem }

export const initialImportState: ImportState = { stage: 'input', attemptId: 0, suggestedTags: [] }
const busy = (stage: Stage) => ['fetching', 'structuring', 'verification', 'summarizing', 'saving'].includes(stage)

/** A cancelled attempt cannot publish late results into a subsequent attempt. */
export function knowledgeImportReducer(state: ImportState, event: Event): ImportState {
  if (event.type === 'start') {
    if (busy(state.stage) || event.attemptId <= state.attemptId) return state
    return { ...initialImportState, stage: 'fetching', attemptId: event.attemptId, requestId: event.requestId }
  }
  if (event.type === 'summarize' || event.type === 'save') {
    if (busy(state.stage) || !state.detail || event.attemptId <= state.attemptId) return state
    return { ...state, attemptId: event.attemptId, stage: event.type === 'save' ? 'saving' : 'summarizing', error: undefined }
  }
  if (event.attemptId !== state.attemptId) return state
  if (event.type === 'edited') return state.detail && state.detail.item.id === event.item.id ? { ...state, detail: { ...state.detail, item: event.item } } : state
  if (event.type === 'reset') return { ...initialImportState, attemptId: state.attemptId }
  if (!busy(state.stage)) return state
  switch (event.type) {
    case 'cancel': return { ...state, stage: 'cancelled' }
    case 'failed': return { ...state, stage: 'error', error: event.error }
    case 'progress':
      return ['fetching', 'structuring', 'verification'].includes(state.stage) ? { ...state, stage: event.stage } : state
    case 'captured':
      return ['fetching', 'structuring', 'verification'].includes(state.stage) ? { ...state, stage: 'preview', detail: event.detail } : state
    case 'summarized':
      return state.stage === 'summarizing' && state.detail && event.item.id === state.detail.item.id
        ? { ...state, stage: 'preview', detail: { ...state.detail, item: event.item }, suggestedTags: event.suggestedTags }
        : state
  }
}
