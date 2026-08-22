import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

import { BoundedLogStore } from './log-store.mjs'
import { AppUpdateManager, loadElectronUpdater } from './app-update-manager.mjs'
import { registerAppUpdateIpc } from './app-update-ipc.mjs'
import { serializeClipboardImage } from './clipboard-image.mjs'
import { buildNativeImagePasteScript } from './native-image-paste.mjs'
import { registerExtensionIpc } from './extension-ipc.mjs'
import { ConnectorSecretStore } from './extensions/connector-secrets.mjs'
import { PluginManager } from './extensions/plugins.mjs'
import { registerDesktopIpc } from './ipc.mjs'
import { installApplicationMenu } from './menu.mjs'
import { installNavigationPolicy } from './navigation-policy.mjs'
import { ensureDesktopProfile, resolveDshCliPath, resolveRuntimePackages } from './profile.mjs'
import { DshRuntimeController } from './runtime-controller.mjs'
import { DshUpdateManager, packagedRuntime } from './update-manager.mjs'
import { registerUpdateIpc } from './update-ipc.mjs'
import { resolvePnpmCliPath } from './extensions/plugins.mjs'
import { isClipboardPermissionAllowed } from './clipboard-permissions.mjs'
import { installWindowChrome, windowChromeBrowserOptions } from './window-chrome.mjs'
import { attachWindowStatePersistence, loadWindowState } from './window-state.mjs'

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))
const PRELOAD_PATH = join(SOURCE_DIR, 'preload.cjs')
const STARTUP_PATH = join(SOURCE_DIR, 'ui', 'startup.html')
const EXTENSIONS_PATH = join(SOURCE_DIR, 'ui', 'extensions.html')

function runtimeHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function runtimeWorkspace(app) {
  if (!app.isPackaged) return join(SOURCE_DIR, '..', '..', '..')
  return homedir()
}

export async function startElectronApp(metadata) {
  const electron = await import('electron')
  const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, safeStorage, screen, shell } = electron
  if (process.env.DSH_DESKTOP_USER_DATA) app.setPath('userData', process.env.DSH_DESKTOP_USER_DATA)
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  app.setAppUserModelId(metadata.appId)
  await app.whenReady()

  const userData = app.getPath('userData')
  const logsDirectory = join(userData, 'logs')
  await mkdir(logsDirectory, { recursive: true })
  const logStore = new BoundedLogStore({ directory: logsDirectory })
  const dshHome = runtimeHome()
  const connectorSecretStore = new ConnectorSecretStore({
    path: join(dshHome, 'desktop', 'connector-secrets.json'),
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
  })
  await connectorSecretStore.load()
  const ensureProfile = (officialRuntimeAnchor) => ensureDesktopProfile({
    dshHome,
    packageRoots: resolveRuntimePackages(
      undefined,
      officialRuntimeAnchor ? [officialRuntimeAnchor, import.meta.url] : import.meta.url,
    ),
  })
  const profile = await ensureProfile()
  const projectRoot = runtimeWorkspace(app)
  const updateManager = new DshUpdateManager({
    userData,
    profileDir: profile.profileDir,
    pnpmCli: resolvePnpmCliPath(),
    packaged: packagedRuntime(),
  })
  const appUpdateManager = new AppUpdateManager({
    updater: await loadElectronUpdater(),
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
  })
  const activeRuntime = await updateManager.activeRuntime()
  if (activeRuntime.source === 'downloaded') await ensureProfile(activeRuntime.cliPath)

  const controller = new DshRuntimeController({
    cliPath: activeRuntime.cliPath ?? resolveDshCliPath(),
    cwd: projectRoot,
    dshHome,
    executable: process.execPath,
    logStore,
    environmentProvider: () => connectorSecretStore.environment(),
    autoRestart: true,
    startupTimeoutMs: 60_000,
  })

  const statePath = join(userData, 'window-state.json')
  const state = await loadWindowState(statePath, screen.getAllDisplays())
  let mainWindow = new BrowserWindow({
    ...state,
    minWidth: 720,
    minHeight: 540,
    show: false,
    title: metadata.productName,
    backgroundColor: '#02080d',
    ...windowChromeBrowserOptions(),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })
  const removeMainWindowChrome = installWindowChrome({
    browserWindow: mainWindow,
    title: 'DeepSeek Harness',
    getContext: (url) => url.startsWith('http:') ? 'Web Surface' : 'Startup',
    onError: (error) => void logStore.append(`[window-chrome] ${error.message}`),
  })
  if (state.maximized) mainWindow.maximize()
  const saveWindowState = attachWindowStatePersistence(mainWindow, statePath)
  let activeOrigin
  let extensionWindow

  installNavigationPolicy({
    webContents: mainWindow.webContents,
    getRuntimeOrigin: () => activeOrigin,
    openExternal: (url) => shell.openExternal(url),
  })
  const runtimeSession = mainWindow.webContents.session
  runtimeSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => isClipboardPermissionAllowed({
    webContents,
    mainWebContents: mainWindow.webContents,
    permission,
    requestingOrigin,
    requestingUrl: details?.requestingUrl,
    isMainFrame: details?.isMainFrame,
    runtimeOrigin: activeOrigin,
  }))
  runtimeSession.setPermissionRequestHandler((webContents, permission, callback, details) => callback(isClipboardPermissionAllowed({
    webContents,
    mainWebContents: mainWindow.webContents,
    permission,
    requestingOrigin: undefined,
    requestingUrl: details?.requestingUrl,
    isMainFrame: details?.isMainFrame,
    runtimeOrigin: activeOrigin,
  })))
  ipcMain.removeHandler('clipboard:insert-text')
  ipcMain.handle('clipboard:insert-text', async (event) => {
    if (event.sender !== mainWindow.webContents) throw new Error('clipboard access is limited to the main DSH window')
    const text = clipboard.readText()
    if (text === '') return false
    await mainWindow.webContents.insertText(text)
    return true
  })
  ipcMain.removeHandler('clipboard:read-image')
  ipcMain.handle('clipboard:read-image', (event) => {
    if (event.sender !== mainWindow.webContents) throw new Error('clipboard access is limited to the main DSH window')
    return serializeClipboardImage(clipboard.readImage(), clipboard.readText())
  })
  const onBeforeInputEvent = (event, input) => {
    if (input?.type !== 'keyDown' || input?.key?.toLowerCase() !== 'v' || input.meta !== true) return
    const image = clipboard.readImage()
    if (!image.isEmpty()) {
      const script = buildNativeImagePasteScript(image.toPNG())
      if (!script) return
      event.preventDefault()
      void mainWindow.webContents.executeJavaScript(script, true).catch(error => {
        void logStore.append(`[clipboard-image] ${error.message}`)
      })
      return
    }
    const text = clipboard.readText()
    if (text === '') return
    // Some macOS/Electron combinations deliver Cmd+V without a usable
    // renderer ClipboardEvent. Insert plain text at the native webContents
    // layer so controlled React inputs still receive their normal input event.
    event.preventDefault()
    void mainWindow.webContents.insertText(text).catch(() => {})
  }
  mainWindow.webContents.on('before-input-event', onBeforeInputEvent)
  mainWindow.webContents.session.on('will-download', async (_event, item) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: join(app.getPath('downloads'), item.getFilename()),
    })
    if (result.canceled || !result.filePath) item.cancel()
    else item.setSavePath(result.filePath)
  })

  const unregisterIpc = registerDesktopIpc({
    ipcMain,
    controller,
    getWindow: () => mainWindow,
    metadata,
    version: app.getVersion(),
    platform: process.platform,
    ensureProfile,
    openLogs: () => shell.openPath(logsDirectory),
    exitApp: () => app.quit(),
    revealPath: async (root, relativePath, isDirectory) => {
      if (typeof root !== 'string' || !isAbsolute(root) || typeof relativePath !== 'string') {
        throw new TypeError('a workspace root and relative path are required')
      }
      const target = resolve(root, relativePath)
      const rel = relative(root, target)
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('path is outside the workspace')
      if (relativePath === '' || isDirectory) return shell.openPath(target)
      shell.showItemInFolder(target)
      return ''
    },
  })

  const createExtensionWindow = async (tab) => {
    if (extensionWindow && !extensionWindow.isDestroyed()) {
      extensionWindow.show()
      extensionWindow.focus()
      if (tab === 'updates') await extensionWindow.webContents.executeJavaScript("document.querySelector('[data-tab=updates]')?.click()")
      return extensionWindow
    }
    extensionWindow = new BrowserWindow({
      width: 1120,
      height: 780,
      minWidth: 760,
      minHeight: 620,
      show: false,
      parent: mainWindow,
      title: 'Extension Dock',
      backgroundColor: '#071117',
      ...windowChromeBrowserOptions(),
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    })
    const removeExtensionWindowChrome = installWindowChrome({
      browserWindow: extensionWindow,
      title: 'DeepSeek Harness',
      getContext: () => 'Extension Dock',
      onError: (error) => void logStore.append(`[window-chrome] ${error.message}`),
    })
    installNavigationPolicy({
      webContents: extensionWindow.webContents,
      getRuntimeOrigin: () => undefined,
      openExternal: (url) => shell.openExternal(url),
    })
    extensionWindow.once('ready-to-show', () => extensionWindow?.show())
    extensionWindow.on('closed', () => {
      removeExtensionWindowChrome()
      extensionWindow = undefined
    })
    await extensionWindow.loadFile(EXTENSIONS_PATH, tab ? { hash: tab } : undefined)
    return extensionWindow
  }

  const pluginManager = new PluginManager({ profileDir: profile.profileDir })
  const unregisterExtensionIpc = registerExtensionIpc({
    ipcMain,
    dialog,
    shell,
    getWindow: () => extensionWindow ?? mainWindow,
    pluginManager,
    controller,
    ensureProfile,
    projectRoot,
    dshHome,
    agentsHome: process.env.DSH_AGENTS_HOME,
    connectorSecretStore,
  })
  const updateIpc = registerUpdateIpc({
    ipcMain,
    dialog,
    updateManager,
    controller,
    ensureProfile,
    getWindow: () => extensionWindow ?? mainWindow,
    getWindows: () => [mainWindow, extensionWindow],
  })
  const appUpdateIpc = registerAppUpdateIpc({
    ipcMain,
    dialog,
    manager: appUpdateManager,
    getWindow: () => extensionWindow ?? mainWindow,
    getWindows: () => [mainWindow, extensionWindow],
    openReleasePage: url => shell.openExternal(url),
  })
  const openLogs = () => shell.openPath(logsDirectory)
  installApplicationMenu({
    Menu,
    app,
    shell,
    controller,
    openExtensions: (tab) => void createExtensionWindow(tab),
    checkAppUpdates: () => void appUpdateIpc.checkInteractively().catch(error => {
      void logStore.append(`[app-update] ${error.message}`)
    }),
    openLogs,
  })

  const loadStartup = async () => {
    activeOrigin = undefined
    if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadFile(STARTUP_PATH)
  }
  controller.on('status', (status) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (status.state === 'ready' && status.url) {
      activeOrigin = new URL(status.url).origin
      const target = new URL(status.url)
      if (controller.remoteMode === 'personal-public') target.searchParams.set('dsh-remote-auto-open', 'personal-public')
      void mainWindow.loadURL(target.toString()).then(() => {
        if (process.env.DSH_DESKTOP_SMOKE_EXIT === '1') {
          console.log(`desktop smoke ready: ${activeOrigin}`)
          app.quit()
        }
      }).catch((error) => {
        void logStore.append(`[renderer] ${error.message}`)
        void loadStartup().catch(() => {})
      })
    } else if (['crashed', 'stopping', 'restarting'].includes(status.state) && !mainWindow.webContents.getURL().startsWith('file:')) {
      void loadStartup().catch(() => {})
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = undefined })
  await loadStartup()
  if (process.env.DSH_DESKTOP_OPEN_EXTENSIONS === '1') await createExtensionWindow()
  const checkAfterFirstReady = (status) => {
    if (status.state !== 'ready') return
    controller.off('status', checkAfterFirstReady)
    void updateManager.check().then(() => updateIpc.publish()).catch(() => {})
    setTimeout(() => {
      void appUpdateIpc.checkQuietly().catch(error => {
        void logStore.append(`[app-update] ${error.message}`)
      })
    }, 3_000)
  }
  controller.on('status', checkAfterFirstReady)
  if (process.env.DSH_DESKTOP_HOLD_STARTUP !== '1') void controller.start().catch(() => {})

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  let quitInProgress = false
  let runtimeStopped = false
  app.on('before-quit', (event) => {
    if (runtimeStopped) return
    event.preventDefault()
    if (quitInProgress) return
    quitInProgress = true
    void Promise.resolve(saveWindowState())
      .catch(() => {})
      .then(() => controller.stop())
      .finally(() => {
        runtimeStopped = true
        removeMainWindowChrome()
        unregisterIpc()
        unregisterExtensionIpc()
        updateIpc.dispose()
        appUpdateIpc.dispose()
        ipcMain.removeHandler('clipboard:insert-text')
        ipcMain.removeHandler('clipboard:read-image')
        mainWindow?.webContents?.removeListener('before-input-event', onBeforeInputEvent)
        app.quit()
      })
  })
  app.on('window-all-closed', () => app.quit())
}
