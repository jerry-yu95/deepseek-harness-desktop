import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { makeAdaptiveThemeRoutes, ADAPTIVE_THEME_API_PREFIX } from './routes.ts'

export { makeAdaptiveThemeRoutes, ADAPTIVE_THEME_API_PREFIX } from './routes.ts'
export const name = 'ui-skin-center'
export const inject = ['webServer']

export function apply(ctx: Context): void {
  try {
    ctx.effect(() => {
      const disposers: Array<() => void> = []
      for (const route of makeAdaptiveThemeRoutes()) disposers.push(ctx.webServer.register(route))
      return () => { for (const dispose of disposers) dispose() }
    }, 'adaptive-theme: routes')
  } catch (error) {
    console.error('[adaptive-theme] route registration failed:', error)
  }
}
