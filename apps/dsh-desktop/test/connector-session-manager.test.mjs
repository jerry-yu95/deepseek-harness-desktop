import assert from 'node:assert/strict'
import test from 'node:test'

import { ConnectorSessionManager } from '../src/extensions/connector-session-manager.mjs'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('twenty concurrent refresh callers share one provider request', async () => {
  let calls = 0
  const manager = new ConnectorSessionManager({ maxAttempts: 1, baseDelayMs: 0, random: () => 0.5 })
  const refresh = async () => {
    calls += 1
    await new Promise((resolve) => setImmediate(resolve))
    return { providerId: 'github', mode: 'oauth', state: 'ready', expiresAt: '2026-08-25T11:00:00.000Z' }
  }
  const results = await Promise.all(Array.from({ length: 20 }, () => manager.refresh('github', refresh)))
  assert.equal(calls, 1)
  assert.equal(results.every((result) => result.state === 'ready'), true)
  manager.shutdown()
})

test('refresh rotation commits access and refresh secrets together', async () => {
  const committed = []
  const manager = new ConnectorSessionManager({ secretStore: { setMany: async (values) => { committed.push(values) } }, maxAttempts: 1 })
  const result = await manager.refresh('gitlab', async () => ({
    providerId: 'gitlab', mode: 'oauth', state: 'ready', credentials: { DSH_CONNECTOR_GITLAB_OAUTH_ACCESS_TOKEN: 'access', DSH_CONNECTOR_GITLAB_OAUTH_REFRESH_TOKEN: 'rotated' },
  }))
  assert.equal(result.state, 'ready')
  assert.deepEqual(committed, [{ DSH_CONNECTOR_GITLAB_OAUTH_ACCESS_TOKEN: 'access', DSH_CONNECTOR_GITLAB_OAUTH_REFRESH_TOKEN: 'rotated' }])
  manager.shutdown()
})

test('invalid_grant does not retry and produces reauthorization-required', async () => {
  let calls = 0
  const manager = new ConnectorSessionManager({ maxAttempts: 4, baseDelayMs: 0 })
  const result = await manager.refresh('github', async () => {
    calls += 1
    const error = new Error('invalid grant')
    error.code = 'invalid_grant'
    throw error
  })
  assert.equal(calls, 1)
  assert.equal(result.state, 'reauthorization-required')
  manager.shutdown()
})

test('provider outages retry with bounded backoff and preserve old credentials', async () => {
  let calls = 0
  const manager = new ConnectorSessionManager({ maxAttempts: 3, baseDelayMs: 0, random: () => 0.5 })
  const result = await manager.refresh('dingtalk', async () => {
    calls += 1
    const error = new Error('offline')
    error.code = 'provider-unavailable'
    throw error
  })
  assert.equal(calls, 3)
  assert.equal(result.state, 'provider-unavailable')
  manager.shutdown()
})

test('a post-refresh 401 is treated as revocation rather than an infinite retry', async () => {
  let requests = 0
  const manager = new ConnectorSessionManager({ maxAttempts: 1 })
  const result = await manager.runWithRefresh('github', async () => {
    requests += 1
    const error = new Error('unauthorized')
    error.status = 401
    throw error
  }, async () => ({ providerId: 'github', mode: 'oauth', state: 'ready' }))
  assert.equal(requests, 2)
  assert.equal(result.state, 'reauthorization-required')
  manager.shutdown()
})

test('failed reconnect does not invoke commit or activate a half-authorized session', async () => {
  let committed = false
  const manager = new ConnectorSessionManager({ maxAttempts: 1 })
  const result = await manager.reconnect('feishu', async () => ({ state: 'error' }), async () => { committed = true })
  assert.equal(result.state, 'reauthorization-required')
  assert.equal(committed, false)
  manager.shutdown()
})

test('shutdown rejects a new refresh and cancels retry timers', async () => {
  const manager = new ConnectorSessionManager({ maxAttempts: 2, baseDelayMs: 100 })
  manager.shutdown()
  await assert.rejects(manager.refresh('github', async () => ({})), /closed/u)
})

test('a refresh in flight is stable even when callers receive the same promise', async () => {
  const wait = deferred()
  let calls = 0
  const manager = new ConnectorSessionManager({ maxAttempts: 1 })
  const operation = async () => { calls += 1; return wait.promise }
  const first = manager.refresh('gitlab', operation)
  const second = manager.refresh('gitlab', operation)
  assert.equal(first, second)
  wait.resolve({ providerId: 'gitlab', mode: 'oauth', state: 'ready' })
  await Promise.all([first, second])
  assert.equal(calls, 1)
  manager.shutdown()
})
