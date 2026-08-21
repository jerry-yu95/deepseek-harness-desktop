const CHANNELS = ['updates:status', 'updates:check', 'updates:check-interactive', 'updates:install', 'updates:rollback', 'updates:stage-source']

export function registerUpdateIpc({ ipcMain, dialog, updateManager, controller, ensureProfile, getWindow, getWindows }) {
  for (const channel of CHANNELS) ipcMain.removeHandler(channel)

  const publish = async () => {
    const status = await updateManager.status()
    for (const window of getWindows()) {
      if (window && !window.isDestroyed()) window.webContents.send('updates:status', status)
    }
    return status
  }

  const useRuntime = async (operation) => {
    await controller.stop()
    let switched = false
    try {
      await operation()
      switched = true
      const active = await updateManager.activeRuntime()
      controller.setCliPath(active.cliPath)
      await ensureProfile(active.cliPath)
      await controller.start()
      return publish()
    } catch (error) {
      if (switched) await updateManager.rollback().catch(() => {})
      const fallback = await updateManager.activeRuntime()
      try {
        controller.setCliPath(fallback.cliPath)
        await ensureProfile(fallback.cliPath)
        await controller.start()
      } catch {
        // The runtime controller publishes the recovery state.
      }
      throw error
    }
  }

  ipcMain.handle('updates:status', () => updateManager.status())
  ipcMain.handle('updates:check', async () => {
    await updateManager.check()
    return publish()
  })
  ipcMain.handle('updates:check-interactive', async () => {
    await updateManager.check()
    const status = await publish()
    if (!status.updateAvailable) {
      await dialog.showMessageBox(getWindow(), {
        type: 'info',
        title: '官方内核已是最新版',
        message: `当前版本 ${status.currentVersion}`,
        detail: 'DeepSeek Harness 官方内核无需更新。',
        buttons: ['知道了'],
      })
      return { action: 'current', status }
    }
    const choice = await dialog.showMessageBox(getWindow(), {
      type: 'info',
      title: '发现官方内核更新',
      message: `${status.currentVersion} → ${status.checkedVersion}`,
      detail: '更新前会自动备份当前内核；若新版本启动失败，会自动恢复。是否立即更新？',
      buttons: ['立即更新', '稍后'],
      defaultId: 0,
      cancelId: 1,
    })
    if (choice.response !== 0) return { action: 'cancelled', status }
    const updated = await useRuntime(() => updateManager.install(status.checkedVersion))
    return { action: 'installed', status: updated }
  })
  ipcMain.handle('updates:install', (_event, version) => useRuntime(async () => {
    await updateManager.install(version)
  }))
  ipcMain.handle('updates:rollback', () => useRuntime(async () => {
    await updateManager.rollback()
  }))
  ipcMain.handle('updates:stage-source', async (_event, commit) => {
    await updateManager.stageSource(commit)
    return publish()
  })

  return {
    publish,
    dispose() {
      for (const channel of CHANNELS) ipcMain.removeHandler(channel)
    },
  }
}
