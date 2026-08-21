import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeDesktopAction, publicRuntimeStatus, registerDesktopIpc } from '../src/ipc.mjs'

test('desktop action validation exposes only fixed recovery operations', () => {
  for (const action of ['retry', 'repair', 'open-logs', 'exit']) {
    assert.equal(normalizeDesktopAction(action), action)
  }
  for (const action of ['run-command', '../repair', '', 42]) {
    assert.throws(() => normalizeDesktopAction(action), /desktop action/)
  }
})

test('public status omits process and filesystem internals', () => {
  assert.deepEqual(
    publicRuntimeStatus({ state: 'crashed', error: 'failed', url: 'http://127.0.0.1:1/', pid: 1234 }),
    { state: 'crashed', error: 'failed', url: undefined, restartAttempt: 0 },
  )
})

test('remote status reports the pairing service without exposing pairing secrets', async () => {
  const handlers = new Map()
  const webContents = { send() {} }
  const mainWindow = { webContents, isDestroyed: () => false }
  const controller = {
    remoteMode: 'personal-public',
    status: { state: 'ready', url: 'http://127.0.0.1:3080/' },
    on() {},
    off() {},
  }
  const ipcMain = {
    removeHandler(channel) { handlers.delete(channel) },
    handle(channel, callback) { handlers.set(channel, callback) },
  }
  const dispose = registerDesktopIpc({
    ipcMain,
    controller,
    getWindow: () => mainWindow,
    metadata: { appId: 'test', productName: 'Test' },
    version: '0.1.8',
    platform: 'darwin',
    ensureProfile: async () => {},
    openLogs: () => {},
    exitApp: () => {},
    revealPath: () => {},
    fetchImpl: async (url) => {
      assert.equal(String(url), 'http://127.0.0.1:3080/api/pair/status')
      return {
        ok: true,
        json: async () => ({
          phase: 'connected',
          lanAvailable: false,
          lanAddresses: [],
          publicUrl: 'https://remote.example.test',
          tunnel: { state: 'running', url: 'https://remote.example.test', error: 'ignore me' },
          deviceCount: 2,
          onlineCount: 1,
          token: 'must-not-leak',
        }),
      }
    },
  })
  const status = await handlers.get('desktop:remote-status')({ sender: webContents })
  assert.deepEqual(status, {
    mode: 'personal-public',
    runtimeState: 'ready',
    reachable: true,
    phase: 'connected',
    lanAvailable: false,
    lanAddresses: [],
    publicUrl: 'https://remote.example.test',
    tunnel: { state: 'running', url: 'https://remote.example.test', error: 'ignore me' },
    deviceCount: 2,
    onlineCount: 1,
  })
  dispose()
})

test('remote enable rejects renderer IPC from a window other than the main window', async () => {
  const handlers = new Map()
  const mainWebContents = { send() {} }
  const controller = {
    remoteMode: 'local',
    status: { state: 'stopped' },
    on() {},
    off() {},
    stop: async () => {},
    setRemoteMode: () => {},
    start: async () => {},
  }
  const ipcMain = {
    removeHandler(channel) { handlers.delete(channel) },
    handle(channel, callback) { handlers.set(channel, callback) },
  }
  const dispose = registerDesktopIpc({
    ipcMain,
    controller,
    getWindow: () => ({ webContents: mainWebContents, isDestroyed: () => false }),
    metadata: {},
    version: '0.1.8',
    platform: 'darwin',
    ensureProfile: async () => {},
    openLogs: () => {},
    exitApp: () => {},
    revealPath: () => {},
  })
  await assert.rejects(
    handlers.get('desktop:remote-enable')({ sender: { send() {} } }, 'personal-public'),
    /unexpected renderer/,
  )
  dispose()
})
