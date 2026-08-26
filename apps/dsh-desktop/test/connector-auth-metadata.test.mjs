import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ConnectorAuthMetadataStore, sanitizeConnectorAuthMetadata } from '../src/extensions/connector-auth-metadata.mjs'

test('metadata store migrates existing connectors without inventing secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-auth-metadata-'))
  try {
    const path = join(root, 'desktop', 'connector-auth-metadata.json')
    const store = new ConnectorAuthMetadataStore({ path, now: () => new Date('2026-08-25T10:00:00.000Z') })
    await store.migrate([
      { id: 'github', enabled: true, source: { kind: 'preset', presetId: 'github' } },
      { id: 'local-tools', enabled: false },
    ])
    const entries = await store.list()
    assert.deepEqual(entries.map((entry) => [entry.connectorId, entry.state]), [['github', 'not-configured'], ['local-tools', 'disabled']])
    const serialized = await readFile(path, 'utf8')
    assert.doesNotMatch(serialized, /token|secret|authorization|email|responseBody/iu)
    assert.equal(JSON.parse(serialized).version, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('metadata accepts only safe allowlisted fields and normalizes dates', () => {
  assert.throws(() => sanitizeConnectorAuthMetadata({
    connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'ready',
    expiresAt: '2026-08-25T10:00:00+00:00', lastHealthyAt: '2026-08-25T09:00:00.000Z',
    lastFailureCategory: undefined, retryCount: 1,
    accessToken: 'must-not-be-accepted',
  }), /unsupported field/u)
})

test('metadata rejects credentials, response bodies, account identifiers and invalid state', () => {
  assert.throws(() => sanitizeConnectorAuthMetadata({ connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'ready', token: 'x' }), /unsupported field/u)
  assert.throws(() => sanitizeConnectorAuthMetadata({ connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'ready', responseBody: { error: 'x' } }), /unsupported field/u)
  assert.throws(() => sanitizeConnectorAuthMetadata({ connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'connected' }), /invalid state/u)
  assert.throws(() => sanitizeConnectorAuthMetadata({ connectorId: 'github', providerId: 'github', mode: 'oauth', state: 'ready', lastFailureCategory: 'account-email' }), /lastFailureCategory/u)
})

test('metadata entries can be updated and removed atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-auth-metadata-update-'))
  try {
    const store = new ConnectorAuthMetadataStore({ path: join(root, 'metadata.json') })
    await store.set({ connectorId: 'gitlab', providerId: 'gitlab', mode: 'oauth', state: 'expired', retryAfter: '2026-08-25T11:00:00.000Z' })
    assert.equal((await store.get('gitlab')).state, 'expired')
    assert.equal(await store.remove('gitlab'), true)
    assert.equal(await store.get('gitlab'), undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
