import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { OrchestrationMode } from '../core.ts'
import { HARNESS_RPC_CHANNEL, type HarnessDashboardStatus } from '../wire.ts'
import type { ModelHealthSummary } from '../model-health.ts'

interface RpcErrorValue { error: string }

export class HarnessClientApi {
  constructor(private readonly connection: ConnectionHandle) {}

  status(sessionId: string, signal?: AbortSignal): Promise<HarnessDashboardStatus> {
    return this.call('status', { sessionId }, signal)
  }

  async mode(sessionId: string, mode: OrchestrationMode, objective?: string): Promise<HarnessDashboardStatus> {
    const value = await this.call<{ status: HarnessDashboardStatus }>('mode', { sessionId, mode, ...(objective === undefined ? {} : { objective }) })
    return value.status
  }

  async probe(sessionId: string, bypassCache = false): Promise<{ cached: boolean; summary: ModelHealthSummary }> {
    return this.call('probe', { sessionId, bypassCache })
  }

  async feedback(sessionId: string, verdict: 'normal' | 'degraded'): Promise<HarnessDashboardStatus> {
    const value = await this.call<{ status: HarnessDashboardStatus }>('feedback', { sessionId, verdict })
    return value.status
  }

  private async call<T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<T> {
    const result = await this.connection.rpc.call(HARNESS_RPC_CHANNEL, endpoint, payload, signal)
    if (!result.ok) throw new Error(result.error.message)
    const value = result.value as T | RpcErrorValue
    if (typeof value === 'object' && value !== null && 'error' in value) throw new Error(String(value.error))
    return value as T
  }
}
