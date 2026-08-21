import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { registerAppUpdateIpc } from '../src/app-update-ipc.mjs'

function fixture(responses = []) {
  const handlers = new Map()
  const sent = []
  const opened = []
  const manager = new EventEmitter()
  manager.value = { phase: 'idle', currentVersion: '0.1.20', supported: true }
  manager.status = () => manager.value
  manager.check = async () => manager.value
  manager.download = async () => {
    manager.value = { ...manager.value, phase: 'downloaded', availableVersion: '0.1.21', updateAvailable: true }
    manager.emit('status', manager.value)
    return manager.value
  }
  manager.install = () => { manager.installed = true }
  const ipcMain = {
    handle(channel, callback) { handlers.set(channel, callback) },
    removeHandler(channel) { handlers.delete(channel) },
  }
  const dialog = { showMessageBox: async () => ({ response: responses.shift() ?? 1 }) }
  const window = { isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) } }
  const registration = registerAppUpdateIpc({
    ipcMain,
    dialog,
    manager,
    getWindow: () => window,
    getWindows: () => [window],
    openReleasePage: async url => opened.push(url),
  })
  return { handlers, manager, opened, registration, sent }
}

test('application update IPC uses a namespace separate from official runtime updates', () => {
  const { handlers, registration } = fixture()
  assert.deepEqual([...handlers.keys()].toSorted(), [
    'app-updates:check',
    'app-updates:check-interactive',
    'app-updates:download',
    'app-updates:install',
    'app-updates:status',
  ])
  registration.dispose()
  assert.equal(handlers.size, 0)
})

test('interactive update downloads and installs only after both confirmations', async () => {
  const { handlers, manager, registration } = fixture([0, 0])
  manager.value = { phase: 'available', currentVersion: '0.1.20', availableVersion: '0.1.21', updateAvailable: true, supported: true }
  const result = await handlers.get('app-updates:check-interactive')()
  assert.equal(result.action, 'installing')
  assert.equal(manager.installed, true)
  registration.dispose()
})

test('manual updates open the release page without downloading', async () => {
  const { handlers, manager, opened, registration } = fixture([0])
  manager.value = {
    phase: 'available',
    currentVersion: '0.1.20',
    availableVersion: '0.1.21',
    updateAvailable: true,
    supported: true,
    installMode: 'manual',
    releaseUrl: 'https://github.com/jerry-yu95/deepseek-harness-desktop/releases/latest',
  }
  let downloads = 0
  manager.download = async () => { downloads += 1 }

  const result = await handlers.get('app-updates:check-interactive')()
  assert.equal(result.action, 'opened-release')
  assert.equal(downloads, 0)
  assert.deepEqual(opened, ['https://github.com/jerry-yu95/deepseek-harness-desktop/releases/latest'])
  registration.dispose()
})

test('status events are published without exposing updater internals', () => {
  const { manager, sent, registration } = fixture()
  manager.emit('status', { phase: 'downloading', progress: { percent: 25 } })
  assert.deepEqual(sent, [['app-updates:status', { phase: 'downloading', progress: { percent: 25 } }]])
  registration.dispose()
})

test('an updater failure offers the fixed GitHub release page', async () => {
  const { handlers, manager, opened, registration } = fixture([0])
  manager.value = {
    phase: 'error',
    currentVersion: '0.1.20',
    error: 'network unavailable',
    releaseUrl: 'https://github.com/jerry-yu95/deepseek-harness-desktop/releases/latest',
  }
  manager.check = async () => { throw new Error('network unavailable') }
  const result = await handlers.get('app-updates:check-interactive')()
  assert.equal(result.action, 'error')
  assert.deepEqual(opened, ['https://github.com/jerry-yu95/deepseek-harness-desktop/releases/latest'])
  registration.dispose()
})
