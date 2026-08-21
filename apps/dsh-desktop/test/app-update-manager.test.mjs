import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { AppUpdateManager } from '../src/app-update-manager.mjs'

class FakeUpdater extends EventEmitter {
  constructor(result) {
    super()
    this.result = result
    this.autoDownload = true
    this.autoInstallOnAppQuit = true
    this.downloads = 0
    this.installs = 0
  }

  async checkForUpdates() {
    this.emit('checking-for-update')
    if (this.result?.updateInfo) this.emit('update-available', this.result.updateInfo)
    else this.emit('update-not-available', { version: '0.1.20' })
    return this.result
  }

  async downloadUpdate() {
    this.downloads += 1
    this.emit('download-progress', { percent: 42.25, transferred: 42, total: 100, bytesPerSecond: 10 })
    this.emit('update-downloaded', this.result.updateInfo)
  }

  quitAndInstall() {
    this.installs += 1
  }
}

test('development builds expose an unavailable state without network access', async () => {
  const updater = new FakeUpdater({ updateInfo: { version: '0.1.21' } })
  const manager = new AppUpdateManager({ updater, currentVersion: '0.1.20', packaged: false, platform: 'darwin' })
  const status = await manager.check()
  assert.equal(status.phase, 'unavailable')
  assert.equal(status.supported, false)
  assert.equal(updater.autoDownload, false)
})

test('packaged builds publish available, progress, and downloaded states', async () => {
  const updater = new FakeUpdater({ updateInfo: { version: '0.1.21', releaseName: 'Desktop 0.1.21' } })
  const manager = new AppUpdateManager({ updater, currentVersion: '0.1.20', packaged: true, platform: 'win32' })
  const phases = []
  manager.on('status', status => phases.push(status.phase))

  const checked = await manager.check()
  assert.equal(checked.updateAvailable, true)
  assert.equal(checked.availableVersion, '0.1.21')
  assert.equal(updater.autoDownload, false)

  const downloaded = await manager.download()
  assert.equal(downloaded.phase, 'downloaded')
  assert.equal(downloaded.progress.percent, 100)
  assert.ok(phases.includes('downloading'))
  assert.equal(updater.downloads, 1)

  manager.install()
  assert.equal(updater.installs, 1)
})

test('unsigned macOS builds detect updates but require manual installation', async () => {
  const updater = new FakeUpdater({ updateInfo: { version: '0.1.21' } })
  const manager = new AppUpdateManager({ updater, currentVersion: '0.1.20', packaged: true, platform: 'darwin' })

  const checked = await manager.check()
  assert.equal(checked.updateAvailable, true)
  assert.equal(checked.installMode, 'manual')
  await assert.rejects(() => manager.download(), /manual installation/)
  assert.equal(updater.downloads, 0)
})

test('updater errors are reduced to a serializable public message', async () => {
  const updater = new FakeUpdater()
  updater.checkForUpdates = async () => {
    updater.emit('error', new Error('request failed token=secret-value'))
    throw new Error('request failed token=secret-value')
  }
  const manager = new AppUpdateManager({ updater, currentVersion: '0.1.20', packaged: true, platform: 'win32' })
  await assert.rejects(() => manager.check(), /request failed/)
  const status = manager.status()
  assert.equal(status.phase, 'error')
  assert.doesNotMatch(status.error, /secret-value/)
})

test('install is rejected before a verified download completes', () => {
  const updater = new FakeUpdater({ updateInfo: { version: '0.1.21' } })
  const manager = new AppUpdateManager({ updater, currentVersion: '0.1.20', packaged: true, platform: 'win32' })
  assert.throws(() => manager.install(), /not ready/)
})
