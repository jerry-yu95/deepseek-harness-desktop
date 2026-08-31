import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-session-projection'
import { resolveEstimatorConfig } from './estimator.ts'
import type { EstimatorConfig } from './estimator.ts'
import { createLiveTokenUsageProjectionDefinition } from './projection.ts'

/** Services required by the host projection plugin. */
export const inject = ['sessionProjections']

/**
 * Settings namespace of the live-stats capability — the section the web
 * settings surface edits. Spelled here rather than imported so the browser
 * half can spell the same value without depending on a Host package.
 */
export const LIVE_STATS_SETTINGS_NAMESPACE = settingsNamespace('live-stats')

/** Plugin configuration for provider-independent token estimation. */
export interface Config extends EstimatorConfig {
  /** Master switch for the plugin (browser half + host projection). */
  enabled?: boolean
}

/** Runtime schema for {@link Config}. */
export const Config: z<Config> = z.object({
  charsPerToken: z.number().min(0.01).default(4),
  blockOverhead: z.number().step(1).min(0).default(4),
  roleOverhead: z.number().step(1).min(0).default(4),
  enabled: z.boolean().default(true),
})

/**
 * Register the replayable live-token projection.
 *
 * The projection definition freezes its estimator spec into the fold's
 * closure at construction, so a settings edit takes effect by re-registering
 * the definition against the authoritative source. `sessionProjections.register`
 * returns the exact disposer, letting us drop the stale fold and fold the
 * session log afresh with the new parameters — the live-estimate row simply
 * re-derives without a restart.
 * @param ctx - host plugin context carrying sessionProjections.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config: Config = {}): void {
  // The authoritative estimation source: the settings scope once the web
  // settings surface serves the namespace, the composition entry otherwise
  // (installSettingsSection swaps it on attach and detach).
  let current: () => Config = () => config ?? {}
  let disposeProjection: (() => void) | undefined
  let projectionCtx: Context | undefined

  const rebuild = (): void => {
    if (disposeProjection !== undefined) {
      disposeProjection()
      disposeProjection = undefined
    }
    if ((current().enabled ?? true) === false || projectionCtx === undefined) return
    const source = current()
    const spec = resolveEstimatorConfig({
      ...(source.charsPerToken === undefined ? {} : { charsPerToken: source.charsPerToken }),
      ...(source.blockOverhead === undefined ? {} : { blockOverhead: source.blockOverhead }),
      ...(source.roleOverhead === undefined ? {} : { roleOverhead: source.roleOverhead }),
    })
    disposeProjection = projectionCtx.sessionProjections.register(createLiveTokenUsageProjectionDefinition(spec))
  }

  // rc.2 projection registrations are scoped effects. Bind through inject so
  // the definition follows service reloads and is owned by this plugin's
  // active dependency fiber instead of assuming an eager service instance.
  ctx.inject(['sessionProjections'], (scope) => {
    projectionCtx = scope
    rebuild()
    scope.effect(() => () => {
      if (projectionCtx !== scope) return
      disposeProjection?.()
      disposeProjection = undefined
      projectionCtx = undefined
    }, 'dsh-live-stats: projection dependency')
  })

  installSettingsSection(ctx, LIVE_STATS_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => { current = source },
    onChange: rebuild,
  })
}

export { createLiveTokenUsageProjectionDefinition } from './projection.ts'
export { resolveEstimatorConfig } from './estimator.ts'
export type { EstimatorConfig, EstimatorSpec } from './estimator.ts'
