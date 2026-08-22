/**
 * Browser-half entry for the extension-center plugin — runs inside the dsh
 * web GUI.
 *
 * Registers the extension-center locale dictionaries and mounts the DOM
 * surfaces: the two sidebar entry rows (Skills / Connectors, toggling the
 * panel on their tab) and the extension-center panel in the center column.
 * All privileged operations ride the desktop IPC bridge when present; in a
 * plain browser session the panel shows a desktop-only notice. Failure
 * policy: DOM mounting problems are logged, never thrown — the web shell
 * fails the whole boot when a plugin apply throws, and an external plugin
 * must not take the GUI down.
 *
 * Export discipline (packages/client rule): the /client surface carries what
 * cordis loading needs plus types only — all value exports stay internal.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { getDesktopBridge } from './bridge.ts'
import { en, zh, type ExtensionCenterKey } from './locales.ts'
import { mountPanel } from './mount.tsx'
import { PanelController } from './panel/controller.ts'
import { mountSidebarEntries } from './sidebar-entry.ts'

/** Locale namespace this plugin owns. */
const NS = 'dsh-extension-center'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** extension-center surface copy. */
    'dsh-extension-center': ExtensionCenterKey
  }
}

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'locale']

/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { DesktopBridge, ConnectorRecord, SkillSummary } from './bridge.ts'
export type { ExtensionTab, PanelControllerSnapshot } from './panel/controller.ts'
export type { ExtensionPanelProps } from './panel/ExtensionPanel.tsx'
export type { ExtensionCenterKey } from './locales.ts'

/**
 * Mount the extension center.
 * @param ctx - client root context (locale service).
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-extension-center: dictionaries')

  const controller = new PanelController()
  const disposers: Array<() => void> = []
  try {
    disposers.push(mountSidebarEntries(controller))
    disposers.push(mountPanel(controller, getDesktopBridge()))
  } catch (error) {
    // DOM failures degrade the panel, never the GUI.
    console.warn('[dsh-extension-center] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-extension-center: ui mounts')
}
