import { describe, expect, it, vi } from 'vitest'
// The npm SDK's client half is a closure-factory bundle for the GUI's
// __ModuleLoader__ (not importable under vitest); provide the one value
// member the apply chain needs.
vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  createSnapshotStore: (init: unknown) => ({
    get: () => init,
    set: () => {},
    subscribe: () => () => {},
  }),
}))
import { apply } from '../src/client/index.ts'

describe('live-stats client apply', () => {
  it('registers the context readout and plugin settings card', async () => {
    const injected: string[] = []
    const ctx = {
      effect: (fn: () => unknown) => fn(),
      locale: { register: () => () => {}, bind: () => (key: string) => key },
      slots: {
        inject: (key: string) => { injected.push(key); return () => {} },
        register: () => () => {},
      },
      settingsScope: {
        bind: () => ({
          getSnapshot: () => ({ status: 'unavailable' as const, writable: false }),
          subscribe: () => () => {},
          set: async () => {},
          unset: async () => {},
        }),
      },
    }
    apply(ctx as never)
    expect(injected).toEqual(['conversation.composer.dock', 'web-ui.plugin.item'])
  })
})
