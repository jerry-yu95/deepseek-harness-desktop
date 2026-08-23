const { contextBridge, ipcRenderer } = require('electron')

const api = Object.freeze({
  getInfo: () => ipcRenderer.invoke('desktop:info'),
  getStatus: () => ipcRenderer.invoke('desktop:status'),
  action: (action) => ipcRenderer.invoke('desktop:action', action),
  enableRemote: (mode) => ipcRenderer.invoke('desktop:remote-enable', mode),
  getRemoteStatus: () => ipcRenderer.invoke('desktop:remote-status'),
  readClipboardImage: () => ipcRenderer.invoke('clipboard:read-image'),
  revealPath: (root, relativePath, isDirectory) => ipcRenderer.invoke('desktop:reveal-path', root, relativePath, isDirectory),
  listExtensions: () => ipcRenderer.invoke('extensions:list'),
  installPlugin: (spec) => ipcRenderer.invoke('extensions:plugin-install', spec),
  removePlugin: (name) => ipcRenderer.invoke('extensions:plugin-remove', name),
  importSkill: () => ipcRenderer.invoke('extensions:skill-import'),
  createSkill: (input) => ipcRenderer.invoke('extensions:skill-create', input),
  openSkill: (id) => ipcRenderer.invoke('extensions:skill-open', id),
  openSkillRoot: () => ipcRenderer.invoke('extensions:skill-root'),
  listConnectors: () => ipcRenderer.invoke('extensions:connector-list'),
  saveConnector: (input) => ipcRenderer.invoke('extensions:connector-save', input),
  removeConnector: (id) => ipcRenderer.invoke('extensions:connector-remove', id),
  checkConnector: (id) => ipcRenderer.invoke('extensions:connector-check', id),
  previewMcpJson: (text) => ipcRenderer.invoke('extensions:mcp-preview', text),
  importMcpJson: (input) => ipcRenderer.invoke('extensions:mcp-import', input),
  listMcpClientSources: () => ipcRenderer.invoke('extensions:mcp-source-list'),
  previewMcpClientSource: (clientId) => ipcRenderer.invoke('extensions:mcp-source-preview', clientId),
  pickMcpClientSource: (clientId) => ipcRenderer.invoke('extensions:mcp-source-pick', clientId),
  importMcpClientSource: (input) => ipcRenderer.invoke('extensions:mcp-source-import', input),
  getUpdateStatus: () => ipcRenderer.invoke('updates:status'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  checkAndInstallUpdate: () => ipcRenderer.invoke('updates:check-interactive'),
  installUpdate: (version) => ipcRenderer.invoke('updates:install', version),
  rollbackUpdate: () => ipcRenderer.invoke('updates:rollback'),
  stageSourceUpdate: (commit) => ipcRenderer.invoke('updates:stage-source', commit),
  getAppUpdateStatus: () => ipcRenderer.invoke('app-updates:status'),
  checkAppUpdates: () => ipcRenderer.invoke('app-updates:check-interactive'),
  downloadAppUpdate: () => ipcRenderer.invoke('app-updates:download'),
  installAppUpdate: () => ipcRenderer.invoke('app-updates:install'),
  onStatus(callback) {
    if (typeof callback !== 'function') throw new TypeError('status callback must be a function')
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('desktop:status', listener)
    return () => ipcRenderer.removeListener('desktop:status', listener)
  },
  onUpdateStatus(callback) {
    if (typeof callback !== 'function') throw new TypeError('update callback must be a function')
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('updates:status', listener)
    return () => ipcRenderer.removeListener('updates:status', listener)
  },
  onAppUpdateStatus(callback) {
    if (typeof callback !== 'function') throw new TypeError('app update callback must be a function')
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('app-updates:status', listener)
    return () => ipcRenderer.removeListener('app-updates:status', listener)
  },
})

contextBridge.exposeInMainWorld('dshDesktop', api)
