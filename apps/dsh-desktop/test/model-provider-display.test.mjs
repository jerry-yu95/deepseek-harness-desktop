import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { getModelProviderDefault, revealSavedModelKey, registerModelDisplayIpc } from '../src/model-provider-display.mjs'

const options = { catalog: async () => [{ id: 'fixture', baseURL: 'https://example.com/v1' }], environment: {} }
test('shows defaults without returning keys and only reveals a configured model reference', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jiwei-model-display-'))
  try {
    await writeFile(join(root, 'settings.yaml'), 'llm-pi-ai:\n  providers:\n    custom:\n      apiKeyEnv: CUSTOM_MODEL_KEY\n', { mode: 0o600 })
    await writeFile(join(root, '.credentials.yaml'), 'version: 1\nrefs:\n  CUSTOM_MODEL_KEY: synthetic-model-key\n  UNRELATED_KEY: synthetic-unrelated-key\n', { mode: 0o600 })
    assert.deepEqual(await getModelProviderDefault({ providerId: 'fixture' }, options), { baseURL: 'https://example.com/v1' })
    assert.deepEqual(await getModelProviderDefault({ providerId: 'custom' }, options), { baseURL: null })
    assert.deepEqual(await revealSavedModelKey(root, { providerId: 'custom' }, options), { value: 'synthetic-model-key' })
    assert.deepEqual(await revealSavedModelKey(root, { providerId: 'custom' }, { ...options, environment: { CUSTOM_MODEL_KEY: 'synthetic-environment' } }), { value: null, reason: 'environment' })
    assert.equal((await revealSavedModelKey(root, { providerId: 'UNRELATED' }, options)).value, null)
    await assert.rejects(revealSavedModelKey(root, { providerId: 'custom', ref: 'UNRELATED_KEY' }, options), /invalid/u)
    await assert.rejects(revealSavedModelKey(root, { providerId: '../custom' }, options), /invalid/u)
    await chmod(join(root, '.credentials.yaml'), 0o644)
    if (process.platform !== 'win32') await assert.rejects(revealSavedModelKey(root, { providerId: 'custom' }, options), /unavailable/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('rejects credential symlinks and malformed YAML without returning raw contents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jiwei-model-display-'))
  try {
    await writeFile(join(root, 'other.yaml'), 'private: synthetic-unrelated', { mode: 0o600 })
    await symlink(join(root, 'other.yaml'), join(root, '.credentials.yaml'))
    await assert.rejects(revealSavedModelKey(root, { providerId: 'fixture' }, options), /^Error: model-display-unavailable$/u)
    await writeFile(join(root, 'settings.yaml'), 'broken: [synthetic-unrelated', { mode: 0o600 })
    await assert.rejects(revealSavedModelKey(root, { providerId: 'fixture' }, options), /^Error: model-display-unavailable$/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('model display IPC rejects foreign windows and child frames and unregisters handlers', async () => {
  const handlers = new Map()
  const sender = { mainFrame: { url: 'http://127.0.0.1:1234/' } }
  const window = { webContents: sender, isDestroyed: () => false }
  const dispose = registerModelDisplayIpc({ ipcMain: { handle: (key, fn) => handlers.set(key, fn), removeHandler: key => handlers.delete(key) }, getWindow: () => window, getTrustedUrl: () => 'http://127.0.0.1:1234/', dshHome: '/not-used', options })
  const read = handlers.get('models:provider-default')
  await assert.rejects(read({ sender: {}, senderFrame: {} }, { providerId: 'fixture' }), /forbidden/u)
  await assert.rejects(read({ sender, senderFrame: {} }, { providerId: 'fixture' }), /forbidden/u)
  assert.deepEqual(await read({ sender, senderFrame: sender.mainFrame }, { providerId: 'fixture' }), { baseURL: 'https://example.com/v1' })
  sender.mainFrame.url = 'https://example.com'
  await assert.rejects(read({ sender, senderFrame: sender.mainFrame }, { providerId: 'fixture' }), /forbidden/u)
  dispose(); assert.equal(handlers.size, 0)
})

test('installed official catalog exposes the selected Xiaomi provider endpoint', async () => {
  const result = await getModelProviderDefault({ providerId: 'xiaomi-token-plan-ams' })
  assert.ok(result.baseURL?.startsWith('https://'))
})
