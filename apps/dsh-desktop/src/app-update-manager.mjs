import { EventEmitter } from 'node:events'

const SUPPORTED_PLATFORMS = new Set(['darwin', 'win32'])

function publicError(error) {
  return String(error?.message ?? error ?? 'unknown update error')
    .replace(/(token|authorization|password|secret)\s*[=:]\s*[^\s,;]+/giu, '$1=[redacted]')
    .slice(0, 500)
}

function progressValue(progress = {}) {
  const percent = Number(progress.percent)
  return {
    percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
    transferred: Number(progress.transferred) || 0,
    total: Number(progress.total) || 0,
    bytesPerSecond: Number(progress.bytesPerSecond) || 0,
  }
}

export class AppUpdateManager extends EventEmitter {
  constructor({ updater, currentVersion, packaged, platform, releaseUrl = 'https://github.com/jerry-yu95/deepseek-harness-desktop/releases/latest' }) {
    super()
    if (!updater) throw new TypeError('an electron updater adapter is required')
    this.updater = updater
    this.currentVersion = currentVersion
    this.packaged = Boolean(packaged)
    this.platform = platform
    this.releaseUrl = releaseUrl
    this.state = {
      phase: 'idle',
      availableVersion: undefined,
      updateAvailable: false,
      progress: undefined,
      error: undefined,
      releaseName: undefined,
    }
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    this.#bind()
  }

  #bind() {
    this.updater.on('checking-for-update', () => this.#set({ phase: 'checking', error: undefined }))
    this.updater.on('update-available', info => this.#set({
      phase: 'available',
      updateAvailable: true,
      availableVersion: info?.version,
      releaseName: info?.releaseName,
      error: undefined,
    }))
    this.updater.on('update-not-available', () => this.#set({
      phase: 'current',
      updateAvailable: false,
      availableVersion: undefined,
      progress: undefined,
      error: undefined,
    }))
    this.updater.on('download-progress', progress => this.#set({ phase: 'downloading', progress: progressValue(progress) }))
    this.updater.on('update-downloaded', info => this.#set({
      phase: 'downloaded',
      updateAvailable: true,
      availableVersion: info?.version ?? this.state.availableVersion,
      progress: { ...progressValue(this.state.progress), percent: 100 },
      error: undefined,
    }))
    this.updater.on('error', error => this.#set({ phase: 'error', error: publicError(error) }))
  }

  #set(patch) {
    Object.assign(this.state, patch)
    const status = this.status()
    this.emit('status', status)
    return status
  }

  status() {
    return {
      currentVersion: this.currentVersion,
      platform: this.platform,
      supported: this.packaged && SUPPORTED_PLATFORMS.has(this.platform),
      releaseUrl: this.releaseUrl,
      ...structuredClone(this.state),
    }
  }

  async check() {
    if (!this.status().supported) return this.#set({ phase: 'unavailable', updateAvailable: false })
    try {
      const result = await this.updater.checkForUpdates()
      if (this.state.phase === 'checking') {
        const info = result?.updateInfo
        if (info?.version && info.version !== this.currentVersion) {
          return this.#set({ phase: 'available', updateAvailable: true, availableVersion: info.version, releaseName: info.releaseName })
        }
        return this.#set({ phase: 'current', updateAvailable: false })
      }
      return this.status()
    } catch (error) {
      this.#set({ phase: 'error', error: publicError(error) })
      throw error
    }
  }

  async download() {
    if (!this.state.updateAvailable) throw new Error('no desktop update is available')
    this.#set({ phase: 'downloading', progress: progressValue() })
    try {
      await this.updater.downloadUpdate()
      return this.status()
    } catch (error) {
      this.#set({ phase: 'error', error: publicError(error) })
      throw error
    }
  }

  install() {
    if (this.state.phase !== 'downloaded') throw new Error('desktop update is not ready to install')
    this.#set({ phase: 'installing' })
    this.updater.quitAndInstall(false, true)
  }
}

export async function loadElectronUpdater() {
  const module = await import('electron-updater')
  const updater = module.autoUpdater ?? module.default?.autoUpdater
  if (!updater) throw new Error('electron-updater did not expose autoUpdater')
  return updater
}
