import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ConnectorAuthMetadataStore } from '../src/extensions/connector-auth-metadata.mjs'
import { ConnectorSessionManager } from '../src/extensions/connector-session-manager.mjs'
import { transitionConnectorLifecycle } from '../src/extensions/connector-lifecycle.mjs'
import { verifyResourceDirectory } from '../../../scripts/verify-connector-auth-evidence.mjs'

async function makeMetadataStore() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-lifecycle-'))
  const store = new ConnectorAuthMetadataStore({ path: join(root, 'connector-auth-metadata.json') })
  return { root, store }
}

test('expiring authorization refreshes once, rotates secrets, and persists safe metadata', async () => {
  const { root, store } = await makeMetadataStore()
  const committed = []
  const manager = new ConnectorSessionManager({
    metadataStore: store,
    secretStore: { setMany: async (values) => { committed.push(values) } },
    maxAttempts: 2,
    baseDelayMs: 0,
    random: () => 0.5,
  })
  let calls = 0
  const result = await manager.refresh('github', async () => {
    calls += 1
    return {
      providerId: 'github',
      mode: 'oauth',
      state: 'ready',
      expiresAt: '2026-08-26T12:00:00.000Z',
      credentials: {
        DSH_CONNECTOR_GITHUB_OAUTH_ACCESS_TOKEN: 'access-secret-fixture',
        DSH_CONNECTOR_GITHUB_OAUTH_REFRESH_TOKEN: 'refresh-secret-fixture',
      },
    }
  })
  assert.equal(result.state, 'ready')
  assert.equal(calls, 1)
  assert.equal(committed.length, 1)
  const metadata = await store.get('github')
  assert.equal(metadata.state, 'ready')
  assert.equal(metadata.expiresAt, '2026-08-26T12:00:00.000Z')
  assert.doesNotMatch(await readFile(join(root, 'connector-auth-metadata.json'), 'utf8'), /access-secret-fixture|refresh-secret-fixture/u)
  manager.shutdown()
})

test('revocation after one retry becomes reauthorization-required without a refresh storm', async () => {
  const { store } = await makeMetadataStore()
  const manager = new ConnectorSessionManager({ metadataStore: store, maxAttempts: 1, baseDelayMs: 0 })
  let requests = 0
  const result = await manager.runWithRefresh('gitlab', async () => {
    requests += 1
    const error = new Error('unauthorized fixture')
    error.status = 401
    throw error
  }, async () => ({ providerId: 'gitlab', mode: 'oauth', state: 'ready' }))
  assert.equal(requests, 2)
  assert.equal(result.state, 'reauthorization-required')
  assert.equal((await store.get('gitlab')).lastFailureCategory, 'revoked')
  manager.shutdown()
})

test('disconnect and disable remain terminal against a late provider response', () => {
  let state = transitionConnectorLifecycle('ready', 'disable')
  assert.equal(state.state, 'disabled')
  assert.throws(() => transitionConnectorLifecycle(state, 'authorize-succeeded'), /invalid connector lifecycle transition/u)
  state = transitionConnectorLifecycle(state, 'disconnect')
  assert.equal(state.state, 'not-configured')
})

test('resource scan rejects a sentinel credential if a future integration leaks it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-resource-scan-'))
  await writeFile(join(root, 'profile.json'), JSON.stringify({ connector: 'github', token: 'fixture-secret' }))
  await assert.rejects(() => verifyResourceDirectory(root, { sentinels: ['fixture-secret'] }), /credential sentinel/u)
})
