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
  previewOfficialSkill: (providerId) => ipcRenderer.invoke('extensions:official-skill-preview', providerId),
  installOfficialSkill: (token) => ipcRenderer.invoke('extensions:official-skill-install', token),
  listConnectors: () => ipcRenderer.invoke('extensions:connector-list'),
  saveConnector: (input) => ipcRenderer.invoke('extensions:connector-save', input),
  removeConnector: (id) => ipcRenderer.invoke('extensions:connector-remove', id),
  setConnectorEnabled: (id, enabled) => ipcRenderer.invoke('extensions:connector-enable', id, enabled),
  disableConnector: (id) => ipcRenderer.invoke('extensions:connector-disable', id),
  checkConnector: (id) => ipcRenderer.invoke('extensions:connector-check', id),
  getConnectorAuthorizationStatus: (id) => ipcRenderer.invoke('extensions:connector-auth-status', id),
  authorizeConnector: (id, input) => ipcRenderer.invoke('extensions:connector-authorize', id, input),
  disconnectConnector: (id) => ipcRenderer.invoke('extensions:connector-disconnect', id),
  revokeConnectorAuthorization: (id) => ipcRenderer.invoke('extensions:connector-revoke', id),
  reconnectConnector: (id, input) => ipcRenderer.invoke('extensions:connector-reconnect', id, input),
  cancelConnectorAuthorization: (id) => ipcRenderer.invoke('extensions:connector-auth-cancel', id),
  verifyConnectorAuthorization: (id) => ipcRenderer.invoke('extensions:connector-auth-verify', id),
  previewMcpJson: (text) => ipcRenderer.invoke('extensions:mcp-preview', text),
  testMcpJson: (input) => ipcRenderer.invoke('extensions:mcp-test', input),
  importMcpJson: (input) => ipcRenderer.invoke('extensions:mcp-import', input),
  pickMcpJsonFile: () => ipcRenderer.invoke('extensions:mcp-file-pick'),
  listMcpClientSources: () => ipcRenderer.invoke('extensions:mcp-source-list'),
  previewMcpClientSource: (clientId) => ipcRenderer.invoke('extensions:mcp-source-preview', clientId),
  testMcpClientSource: (input) => ipcRenderer.invoke('extensions:mcp-source-test', input),
  pickMcpClientSource: (clientId) => ipcRenderer.invoke('extensions:mcp-source-pick', clientId),
  importMcpClientSource: (input) => ipcRenderer.invoke('extensions:mcp-source-import', input),
  testModelProvider: (input) => ipcRenderer.invoke('models:provider-test', input),
  getModelImageInput: (input) => ipcRenderer.invoke('models:image-input-status', input),
  setModelImageInput: (input) => ipcRenderer.invoke('models:image-input-set', input),
  importKnowledgeUrl: (url) => ipcRenderer.invoke('knowledge:url-import', url),
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
