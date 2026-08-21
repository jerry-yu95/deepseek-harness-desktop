const CHANNELS = [
  'app-updates:status',
  'app-updates:check',
  'app-updates:check-interactive',
  'app-updates:download',
  'app-updates:install',
]

async function showFailure({ dialog, manager, getWindow, openReleasePage }) {
  const status = manager.status()
  const result = await dialog.showMessageBox(getWindow(), {
    type: 'error',
    title: '应用更新未完成',
    message: status.error ?? '无法完成应用更新',
    detail: '你可以稍后重试，或打开 GitHub Releases 手动下载安装包。',
    buttons: ['打开下载页', '关闭'],
    defaultId: 0,
    cancelId: 1,
  })
  if (result.response === 0) await openReleasePage(status.releaseUrl)
  return { action: 'error', status }
}

async function offerUpdate({ dialog, manager, getWindow, openReleasePage, status }) {
  if (status.installMode === 'manual') {
    const manual = await dialog.showMessageBox(getWindow(), {
      type: 'info',
      title: '发现应用更新',
      message: `${status.currentVersion} → ${status.availableVersion}`,
      detail: '当前 macOS 版本未使用付费 Developer ID 签名，需要从 GitHub Releases 手动下载安装。下载后请核对 SHA-256；现有配置和会话不会被覆盖。',
      buttons: ['打开安全下载页', '稍后'],
      defaultId: 0,
      cancelId: 1,
    })
    if (manual.response !== 0) return { action: 'cancelled', status }
    await openReleasePage(status.releaseUrl)
    return { action: 'opened-release', status }
  }

  const first = await dialog.showMessageBox(getWindow(), {
    type: 'info',
    title: '发现应用更新',
    message: `${status.currentVersion} → ${status.availableVersion}`,
    detail: '是否立即下载 Harness Design Desktop 新版本？官方 DSH 内核不会在此步骤中单独切换。',
    buttons: ['立即下载', '稍后'],
    defaultId: 0,
    cancelId: 1,
  })
  if (first.response !== 0) return { action: 'cancelled', status }

  let downloaded
  try {
    downloaded = await manager.download()
  } catch {
    return showFailure({ dialog, manager, getWindow, openReleasePage })
  }
  const second = await dialog.showMessageBox(getWindow(), {
    type: 'info',
    title: '应用更新已下载',
    message: `Harness Design Desktop ${downloaded.availableVersion} 已准备完成`,
    detail: '立即安装会退出并重新启动应用。未保存的输入内容请先保存。',
    buttons: ['退出并安装', '稍后安装'],
    defaultId: 0,
    cancelId: 1,
  })
  if (second.response !== 0) return { action: 'downloaded', status: downloaded }
  manager.install()
  return { action: 'installing', status: manager.status() }
}

export function registerAppUpdateIpc({ ipcMain, dialog, manager, getWindow, getWindows, openReleasePage = async () => {} }) {
  for (const channel of CHANNELS) ipcMain.removeHandler(channel)

  const publish = status => {
    for (const window of getWindows()) {
      if (window && !window.isDestroyed()) window.webContents.send('app-updates:status', status)
    }
    return status
  }
  const onStatus = status => publish(status)
  manager.on('status', onStatus)

  ipcMain.handle('app-updates:status', () => manager.status())
  ipcMain.handle('app-updates:check', () => manager.check())
  ipcMain.handle('app-updates:download', () => manager.download())
  ipcMain.handle('app-updates:install', () => {
    manager.install()
    return manager.status()
  })
  const checkInteractively = async () => {
    let status
    try {
      status = await manager.check()
    } catch {
      return showFailure({ dialog, manager, getWindow, openReleasePage })
    }
    if (status.phase === 'unavailable') {
      await dialog.showMessageBox(getWindow(), {
        type: 'info',
        title: '开发版本不检查应用更新',
        message: `当前版本 ${status.currentVersion}`,
        detail: '安装 GitHub Releases 中的正式安装包后即可使用应用更新。',
        buttons: ['知道了'],
      })
      return { action: 'unavailable', status }
    }
    if (!status.updateAvailable) {
      await dialog.showMessageBox(getWindow(), {
        type: 'info',
        title: '应用已是最新版',
        message: `当前版本 ${status.currentVersion}`,
        buttons: ['知道了'],
      })
      return { action: 'current', status }
    }
    return offerUpdate({ dialog, manager, getWindow, openReleasePage, status })
  }
  ipcMain.handle('app-updates:check-interactive', checkInteractively)

  return {
    publish,
    checkInteractively,
    async checkQuietly() {
      const status = await manager.check()
      if (!status.updateAvailable) return { action: status.phase, status }
      return offerUpdate({ dialog, manager, getWindow, openReleasePage, status })
    },
    dispose() {
      manager.off('status', onStatus)
      for (const channel of CHANNELS) ipcMain.removeHandler(channel)
    },
  }
}
