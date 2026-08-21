const ACTIONS = new Set(['retry', 'repair', 'open-logs', 'exit'])

export function normalizeDesktopAction(value) {
  if (typeof value !== 'string' || !ACTIONS.has(value)) {
    throw new TypeError(`invalid desktop action: ${JSON.stringify(value)}`)
  }
  return value
}

export function publicRuntimeStatus(status) {
  const state = typeof status?.state === 'string' ? status.state : 'stopped'
  return {
    state,
    error: typeof status?.error === 'string' ? status.error.slice(0, 4_000) : undefined,
    url: state === 'ready' && typeof status?.url === 'string' ? status.url : undefined,
    restartAttempt: Number.isInteger(status?.restartAttempt) ? status.restartAttempt : 0,
  }
}

function assertMainWindowSender(event, getWindow) {
  const window = getWindow()
  if (!window || window.isDestroyed() || event?.sender !== window.webContents) {
    throw new Error('desktop IPC request came from an unexpected renderer')
  }
}

function remoteStatusError({ controller, phase, error, httpStatus }) {
  return {
    mode: controller.remoteMode === 'personal-public' ? 'personal-public' : 'local',
    runtimeState: controller.status?.state ?? 'stopped',
    reachable: false,
    phase,
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(error === undefined ? {} : { error: String(error).slice(0, 500) }),
  }
}

function publicRemoteStatus(controller, snapshot) {
  const tunnel = snapshot?.tunnel
  return {
    mode: controller.remoteMode === 'personal-public' ? 'personal-public' : 'local',
    runtimeState: controller.status?.state ?? 'stopped',
    reachable: true,
    phase: typeof snapshot?.phase === 'string' ? snapshot.phase : 'unknown',
    lanAvailable: snapshot?.lanAvailable === true,
    lanAddresses: Array.isArray(snapshot?.lanAddresses)
      ? snapshot.lanAddresses.filter(value => typeof value === 'string').slice(0, 16)
      : [],
    ...(typeof snapshot?.publicUrl === 'string' ? { publicUrl: snapshot.publicUrl.slice(0, 500) } : {}),
    ...(tunnel && typeof tunnel === 'object'
      ? {
          tunnel: {
            state: typeof tunnel.state === 'string' ? tunnel.state : 'unknown',
            ...(typeof tunnel.url === 'string' ? { url: tunnel.url.slice(0, 500) } : {}),
            ...(typeof tunnel.error === 'string' ? { error: tunnel.error.slice(0, 500) } : {}),
          },
        }
      : {}),
    deviceCount: Number.isInteger(snapshot?.deviceCount) ? snapshot.deviceCount : 0,
    onlineCount: Number.isInteger(snapshot?.onlineCount) ? snapshot.onlineCount : 0,
  }
}

export function registerDesktopIpc({
  ipcMain,
  controller,
  getWindow,
  metadata,
  version,
  platform,
  ensureProfile,
  openLogs,
  exitApp,
  revealPath,
  fetchImpl = fetch,
}) {
  const channels = ['desktop:info', 'desktop:status', 'desktop:action', 'desktop:remote-enable', 'desktop:remote-status', 'desktop:reveal-path']
  for (const channel of channels) ipcMain.removeHandler(channel)
  ipcMain.handle('desktop:info', () => ({
    appId: metadata.appId,
    productName: metadata.productName,
    version,
    platform,
  }))
  ipcMain.handle('desktop:status', () => publicRuntimeStatus(controller.status))
  ipcMain.handle('desktop:remote-enable', async (event, mode) => {
    assertMainWindowSender(event, getWindow)
    if (mode !== 'personal-public') throw new TypeError('remote mode must be personal-public')
    await controller.stop()
    controller.setRemoteMode(mode)
    return controller.start()
  })
  ipcMain.handle('desktop:remote-status', async (event) => {
    assertMainWindowSender(event, getWindow)
    const status = controller.status
    if (status?.state !== 'ready' || typeof status.url !== 'string') {
      return remoteStatusError({ controller, phase: 'runtime-not-ready', error: 'DSH runtime is not ready' })
    }
    try {
      const response = await fetchImpl(new URL('/api/pair/status', status.url), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(1_500),
      })
      if (!response.ok) return remoteStatusError({ controller, phase: 'pair-route-unavailable', httpStatus: response.status })
      return publicRemoteStatus(controller, await response.json())
    } catch (error) {
      return remoteStatusError({ controller, phase: 'pair-route-unreachable', error: error?.message ?? 'pair route unavailable' })
    }
  })
  ipcMain.handle('desktop:reveal-path', (_event, root, relativePath, isDirectory) => revealPath(root, relativePath, isDirectory === true))
  ipcMain.handle('desktop:action', async (_event, rawAction) => {
    const action = normalizeDesktopAction(rawAction)
    if (action === 'retry') return controller.restart()
    if (action === 'repair') {
      await controller.stop()
      await ensureProfile()
      return controller.start()
    }
    if (action === 'open-logs') return openLogs()
    exitApp()
    return undefined
  })
  const publishStatus = (status) => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send('desktop:status', publicRuntimeStatus(status))
  }
  controller.on('status', publishStatus)
  return () => {
    controller.off('status', publishStatus)
    for (const channel of channels) ipcMain.removeHandler(channel)
  }
}
