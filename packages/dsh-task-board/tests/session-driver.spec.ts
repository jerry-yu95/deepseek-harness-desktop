import { expect, it, vi } from 'vitest'
import { createSessionDriver } from '../src/client/session-driver.ts'

it('observes failures from a never-opened background session and cancels its follow on settlement', async () => {
  let signal: AbortSignal | undefined
  const off = vi.fn()
  const driver = createSessionDriver({
    session: { rename: async () => {}, prompt: async () => ({ ok: true }), getSnapshot: () => ({ running: false, lastAgentError: null }), subscribe: () => off },
    list: { subscribe: () => off }, running: () => false, initialEvents: () => [],
    follow: async function* (value) {
      signal = value
      yield { type: 'snapshot', records: [{ event: { type: 'turn/end', time: 1000, data: { turn: 1, reason: { kind: 'error' } } } }] }
    },
  })
  expect(driver.getSnapshot().turnEnds.size).toBe(0)
  const listener = vi.fn()
  const stop = driver.subscribe(listener)
  await vi.waitFor(() => expect(listener).toHaveBeenCalled())
  expect(driver.getSnapshot()).toMatchObject({ running: false, lastAgentError: 'agent turn failed' })
  expect(driver.getSnapshot().turnEnds.size).toBe(1)
  stop()
  expect(signal?.aborted).toBe(true)
  expect(off).toHaveBeenCalledTimes(2)
})
