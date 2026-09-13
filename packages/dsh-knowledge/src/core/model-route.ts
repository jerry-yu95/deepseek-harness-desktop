import { createHash } from 'node:crypto'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { KnowledgeModelDirectory } from '../wire.ts'
import { assertActive, withDeadline } from './cancellation.ts'

export interface ModelRoute { provider: string; model: string }

export interface ModelRouteDependencies {
  llm: Pick<LlmRuntime, 'listProviders' | 'listModels'>
  currentDefault: () => ModelRoute | undefined
  currentSession: (sessionId: string) => ModelRoute | undefined
}

/** Only registered, advertised text models are selectable. No endpoint/credential projection. */
export class ModelRouteResolver {
  constructor(private readonly dependencies: ModelRouteDependencies) {}

  private async directory(signal: AbortSignal) {
    return withDeadline(signal, 10_000, async active => {
      const providers = this.dependencies.llm.listProviders()
      const results = await Promise.allSettled(providers.map(async provider => {
        const models = await this.dependencies.llm.listModels(provider.id)
        assertActive(active)
        return models.filter(model => model.provider === provider.id && (!model.inputModalities || model.inputModalities.includes('text'))).map(model => {
          // An endpoint masquerading as model metadata must not be returned to UI.
          for (const label of [provider.id, model.id]) {
            if (!label || label.length > 160 || /[\u0000-\u001f\u007f]|:\/\/|(?:token|cookie|secret|api[_-]?key)\s*[:=]/iu.test(label)) throw new Error('knowledge-model-route-unavailable')
          }
          return { id: routeId({ provider: provider.id, model: model.id }), displayName: `${provider.id} / ${model.id}`, provider: provider.id, model: model.id }
        })
      }))
      assertActive(active)
      const unsafeFailure = results.find(result => result.status === 'rejected' && result.reason instanceof Error && result.reason.message === 'knowledge-model-route-unavailable')
      if (unsafeFailure?.status === 'rejected') throw new Error('knowledge-model-route-unavailable')
      const groups = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
      if (groups.length === 0 && providers.length > 0 && results.some(result => result.status === 'rejected')) throw new Error('knowledge-model-directory-unavailable')
      // Recheck registered providers after asynchronous catalog resolution.
      const live = new Set(this.dependencies.llm.listProviders().map(provider => provider.id))
      return groups.flat().filter(route => live.has(route.provider))
    })
  }

  async list(sessionId?: string, signal = new AbortController().signal): Promise<KnowledgeModelDirectory> {
    const entries = await this.directory(signal)
    assertActive(signal)
    const selection = (sessionId ? this.dependencies.currentSession(sessionId) : undefined) ?? this.dependencies.currentDefault()
    const selectedRouteId = selection && entries.find(entry => entry.id === routeId(selection))?.id
    return { routes: entries.map(({ id, displayName }) => ({ id, displayName })), ...(selectedRouteId ? { selectedRouteId } : {}) }
  }

  async resolve(id: string, signal = new AbortController().signal): Promise<ModelRoute> {
    const entry = (await this.directory(signal)).find(route => route.id === id)
    assertActive(signal)
    if (!entry) throw new Error('knowledge-model-route-unavailable')
    return { provider: entry.provider, model: entry.model }
  }
}

function routeId(route: ModelRoute): string {
  return `route_${createHash('sha256').update(JSON.stringify([route.provider, route.model])).digest('hex')}`
}
