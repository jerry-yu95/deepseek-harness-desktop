import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SkinCenter, type SkinCenterInjected } from './SkinCenter.tsx'
import { en, zh, type SkinCenterKey } from './locales.ts'
import { applyAdaptiveTheme, clearAdaptiveTheme } from './runtime-theme.ts'
import type { AdaptivePalette } from './palette.ts'

export type { SkinCenterComponentProps, SkinCenterInjected } from './SkinCenter.tsx'
export const NS = 'skinCenter'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { skinCenter: SkinCenterKey }
  interface SlotMap { 'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps } }
}

export interface SettingsPluginItemOwnerProps { children?: never }
export const inject = ['slots', 'locale', 'theme', 'settingsScope', 'connection', 'remote']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'adaptive-theme: dictionaries')
  document.body.dataset.dshSkinCenter = ''
  ctx.effect(() => () => { delete document.body.dataset.dshSkinCenter; clearAdaptiveTheme() }, 'adaptive-theme: body scope')
  const theme = ctx.get('theme') as ThemeRuntime
  const injected = (): SkinCenterInjected => ({
    theme: { getTheme: () => theme.getTheme(), subscribe: listener => ctx.on('theme/change', listener), setTheme: id => theme.setTheme(id) },
  })
  void fetch('/api/adaptive-theme/state').then(async response => {
    const state = await response.json() as { ok?: boolean; enabled?: boolean; imageUrl?: string; palette?: AdaptivePalette; visibility?: number }
    if (response.ok && state.ok === true && state.enabled === true && state.imageUrl !== undefined && state.palette !== undefined) {
      theme.setTheme(state.palette.mode)
      applyAdaptiveTheme(state.imageUrl, state.palette, state.visibility)
    }
  }).catch(() => {})
  ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item', id: 'adaptive-theme', order: 110,
    locale: NS, inject: injected,
  }, SkinCenter))
}
