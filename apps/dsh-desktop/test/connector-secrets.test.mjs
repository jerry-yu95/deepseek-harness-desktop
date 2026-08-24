import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ConnectorSecretStore, oauthCredentialReferences } from '../src/extensions/connector-secrets.mjs'

function cryptoBackend() {
  return {
    isEncryptionAvailable: () => true,
    encrypt: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decrypt: (value) => {
      const text = Buffer.from(value).toString('utf8')
      if (!text.startsWith('encrypted:')) throw new Error('bad ciphertext')
      return text.slice('encrypted:'.length)
    },
  }
}

test('OAuth credential references are provider-scoped and opaque', () => {
  assert.deepEqual(oauthCredentialReferences('github'), {
    accessToken: 'DSH_CONNECTOR_GITHUB_OAUTH_ACCESS_TOKEN',
    refreshToken: 'DSH_CONNECTOR_GITHUB_OAUTH_REFRESH_TOKEN',
  })
  assert.throws(() => oauthCredentialReferences('unknown'), /unsupported OAuth provider/)
})

test('connector secret store encrypts values and reloads them without plaintext persistence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-secrets-'))
  try {
    const path = join(root, 'connector-secrets.json')
    const first = new ConnectorSecretStore({ path, ...cryptoBackend() })
    await first.load()
    await first.setMany({ DSH_CONNECTOR_TAPD_TAPD_TOKEN: 'real-token-value' })
    const stored = await readFile(path, 'utf8')
    assert.doesNotMatch(stored, /real-token-value/)
    assert.match(stored, /ZW5jcnlwdGVkOnJlYWwtdG9rZW4tdmFsdWU=/)
    if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600)

    const restarted = new ConnectorSecretStore({ path, ...cryptoBackend() })
    await restarted.load()
    assert.equal(restarted.has('DSH_CONNECTOR_TAPD_TAPD_TOKEN'), true)
    assert.deepEqual(restarted.environment(), { DSH_CONNECTOR_TAPD_TAPD_TOKEN: 'real-token-value' })
    assert.deepEqual(restarted.resolveMany(['DSH_CONNECTOR_TAPD_TAPD_TOKEN']), { DSH_CONNECTOR_TAPD_TAPD_TOKEN: 'real-token-value' })
    await restarted.removeMany(['DSH_CONNECTOR_TAPD_TAPD_TOKEN'])
    assert.equal(restarted.has('DSH_CONNECTOR_TAPD_TAPD_TOKEN'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('connector secret store refuses persistent values when encryption is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-secrets-'))
  try {
    const store = new ConnectorSecretStore({ path: join(root, 'secrets.json'), ...cryptoBackend(), isEncryptionAvailable: () => false })
    await store.load()
    await assert.rejects(store.setMany({ DSH_CONNECTOR_GITHUB_GITHUB_TOKEN: 'token' }), /secure-storage-unavailable/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('connector secret store fails closed on corrupt ciphertext and never returns partial secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-secrets-'))
  try {
    const path = join(root, 'secrets.json')
    await writeFile(path, JSON.stringify({
      version: 1,
      entries: {
        DSH_CONNECTOR_OK_TOKEN: Buffer.from('encrypted:ok').toString('base64'),
        DSH_CONNECTOR_BAD_TOKEN: Buffer.from('corrupt').toString('base64'),
      },
    }))
    const store = new ConnectorSecretStore({ path, ...cryptoBackend() })
    await store.load()
    assert.throws(() => store.resolveMany(['DSH_CONNECTOR_OK_TOKEN', 'DSH_CONNECTOR_BAD_TOKEN']), /secure-storage-corrupt/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('connector secret store validates generated references and exposes only reference-shaped environment keys', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-connector-secrets-'))
  try {
    const store = new ConnectorSecretStore({ path: join(root, 'secrets.json'), ...cryptoBackend() })
    await store.load()
    await assert.rejects(store.setMany({ TOKEN: 'not-allowed' }), /credential reference/)
    await store.setMany({ DSH_CONNECTOR_FEISHU_APP_TOKEN: 'secret' })
    assert.deepEqual(Object.keys(store.environment()), ['DSH_CONNECTOR_FEISHU_APP_TOKEN'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
