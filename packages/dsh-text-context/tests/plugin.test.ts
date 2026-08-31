import { afterEach, describe, expect, it } from 'vitest'

import { apply } from '../src/client/index.ts'
import { isMobileRemoteSurface } from '../src/client/composer.ts'
import { clearToasts } from '../src/client/toast.ts'
import { REDACTED_VALUE } from '../src/core/limits.ts'
import { redactJsonFamily } from '../src/core/redact.ts'
import { SAMPLE_SECRET } from './helpers.ts'
import { FILE_ATTACHMENT_RPC_CHANNEL } from '../src/wire.ts'

afterEach(() => {
  clearToasts()
  document.body.replaceChildren()
})

describe('secret hygiene', () => {
  it('keeps redacted output and errors free of the sample secret', () => {
    const result = redactJsonFamily(JSON.stringify({ token: SAMPLE_SECRET, api_key: SAMPLE_SECRET }), 'json')
    const dumped = JSON.stringify(result)
    expect(dumped).toContain(REDACTED_VALUE)
    expect(dumped).not.toContain(SAMPLE_SECRET)
  })
})

describe('plugin apply', () => {
  it('uses a valid non-reserved dsh-client-connection channel', () => {
    expect(FILE_ATTACHMENT_RPC_CHANNEL).toMatch(/^\/[A-Za-z0-9._~-]+$/u)
    expect(FILE_ATTACHMENT_RPC_CHANNEL).not.toBe('/api')
  })

  it('registers capture listeners through ctx.effect on the desktop web GUI', () => {
    expect(isMobileRemoteSurface({ pathname: '/' })).toBe(false)
    let installed = 0
    const stops: Array<() => void> = []
    apply({
      get: () => ({ rpc: { call: async () => ({ ok: true, value: {} }) } }),
      effect: (factory: () => () => void) => {
        installed += 1
        const stop = factory()
        stops.push(stop)
        return stop
      },
      inputTriggers: { registerSource: () => () => {} },
    } as never)
    expect(installed).toBe(3)
    stops.forEach(stop => stop())
  })
})
