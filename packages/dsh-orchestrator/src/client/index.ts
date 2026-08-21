import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { HarnessClientApi } from './api.ts'
import { HarnessComposerControls, HarnessSettingsCard, type HarnessFace } from './HarnessHealthPanel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } }
  }
}

export const inject = ['slots', 'connection']

export function apply(ctx: ClientContext): void {
  const api = new HarnessClientApi(ctx.get('connection') as unknown as ConnectionHandle)
  const inject = (): HarnessFace => ({ api })
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'harness-health', order: 80, inject }, HarnessComposerControls))
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({ name: 'settings.plugin.item', id: 'agent-harness', order: 70, inject }, HarnessSettingsCard))
}

export { HarnessClientApi } from './api.ts'
export { cacheRate, dimensionLabel, healthLabel, healthTone, sparklinePoints } from './health-ui.ts'
