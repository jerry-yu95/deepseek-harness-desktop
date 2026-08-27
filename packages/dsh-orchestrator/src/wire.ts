import type { HarnessSnapshot, OrchestrationMode } from './core.ts'
import type { ModelHealthSummary } from './model-health.ts'
import type { ObservabilityPeriod, ObservabilitySummary } from './observability.ts'
import type { ContextQualityRun, ContextQualityScale, ContextQualitySummary } from './context-quality.ts'

export const HARNESS_RPC_CHANNEL = '/harness-orchestrator'

export interface HarnessDashboardStatus {
  initialized: boolean
  modelKey: string
  harness?: HarnessSnapshot
  health: ModelHealthSummary
  observability: ObservabilitySummary
  contextQuality: Record<ContextQualityScale, ContextQualitySummary>
}

export interface HarnessStatusRequest { sessionId: string; period?: ObservabilityPeriod }
export interface HarnessModeRequest {
  sessionId: string
  mode: OrchestrationMode
  objective?: string
}
export interface HarnessProbeRequest { sessionId: string; bypassCache?: boolean }
export interface HarnessContextQualityRequest { sessionId: string; scale: ContextQualityScale; confirmed: boolean }
export interface HarnessRouteRequest { sessionId: string; objective: string; bypassCache?: boolean }
export interface HarnessFeedbackRequest {
  sessionId: string
  verdict: 'normal' | 'degraded'
  note?: string
}

export type HarnessRpcValue =
  | HarnessDashboardStatus
  | { status: HarnessDashboardStatus }
  | { cached: boolean; summary: ModelHealthSummary }
  | { run: ContextQualityRun; summary: ContextQualitySummary }
