// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkinCenter } from '../src/client/SkinCenter.tsx'
import { apply } from '../src/client/index.ts'

afterEach(() => vi.restoreAllMocks())

describe('adaptive-theme client registration', () => {
  it('passes the visible card as the slot registration component', () => {
    const registered: unknown[][] = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const theme = { getTheme: () => ({ id: 'light' }), setTheme: () => {} }
    const ctx = {
      effect: (fn: () => unknown) => fn(),
      locale: { register: () => () => {} },
      get: (name: string) => name === 'theme' ? theme : undefined,
      on: () => () => {},
      slots: {
        inject: (_name: string, register: () => unknown) => register(),
        register: (...args: unknown[]) => { registered.push(args); return () => {} },
      },
    }

    apply(ctx as never)

    expect(registered).toHaveLength(1)
    expect(registered[0][0]).toMatchObject({ name: 'web-ui.plugin.item', id: 'adaptive-theme', locale: 'skinCenter' })
    expect(registered[0][0]).not.toHaveProperty('component')
    expect(registered[0][1]).toBe(SkinCenter)
  })
})
