import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ConnectorStore } from './extensions/connectors.mjs'
import { discoverMcpClientSources, readMcpClientSource, readMcpSourceFile } from './extensions/mcp-client-sources.mjs'
import { parseMcpServersJson } from './extensions/mcp-config.mjs'
import { buildMcpConnectorImport, createProviderJsonSource, previewMcpJson } from './extensions/mcp-import.mjs'
import { createSkill, defaultSkillRoots, discoverSkills, importSkill } from './extensions/skills.mjs'
import { installSkillPackage, previewSkillPackage } from './extensions/skill-packages.mjs'
import { ConnectorAuthManager, AUTH_PROVIDERS } from './extensions/connector-auth.mjs'
import { ConnectorAuthMetadataStore } from './extensions/connector-auth-metadata.mjs'
import { ConnectorSessionManager } from './extensions/connector-session-manager.mjs'
import { OAuthFlowManager } from './extensions/oauth-flow.mjs'
import { createDingTalkAuthAdapter } from './extensions/providers/dingtalk-auth.mjs'
import { createFeishuAuthAdapter } from './extensions/providers/feishu-auth.mjs'
import { createGitHubAuthAdapter } from './extensions/providers/github-auth.mjs'
import { createGitLabAuthAdapter } from './extensions/providers/gitlab-auth.mjs'
import { validateTencentMeetingSkillSource } from './extensions/providers/tencent-meeting-skill.mjs'
import { validateWecomSkillSource } from './extensions/providers/wecom-skill.mjs'

const CHANNELS = [
  'extensions:list',
  'extensions:plugin-install',
  'extensions:plugin-remove',
  'extensions:skill-import',
  'extensions:skill-create',
  'extensions:skill-open',
  'extensions:skill-root',
  'extensions:official-skill-preview',
  'extensions:official-skill-install',
  'extensions:connector-list',
  'extensions:connector-save',
  'extensions:connector-remove',
  'extensions:connector-enable',
  'extensions:connector-disable',
  'extensions:connector-check',
  'extensions:connector-auth-status',
  'extensions:connector-authorize',
  'extensions:connector-disconnect',
  'extensions:connector-revoke',
  'extensions:connector-reconnect',
  'extensions:connector-auth-cancel',
  'extensions:connector-auth-verify',
  'extensions:mcp-preview',
  'extensions:mcp-import',
  'extensions:mcp-file-pick',
  'extensions:mcp-source-list',
  'extensions:mcp-source-preview',
  'extensions:mcp-source-pick',
  'extensions:mcp-source-import',
]

const SOURCE_SESSION_TTL_MS = 15 * 60 * 1_000
const MAX_SOURCE_SESSIONS = 16
const JSON_FILE_SESSION_TTL_MS = 15 * 60 * 1_000
const MAX_JSON_FILE_SESSIONS = 8
const OFFICIAL_SKILL_SESSION_TTL_MS = 15 * 60 * 1_000
const MAX_OFFICIAL_SKILL_SESSIONS = 8

const AUTH_INPUT_KEYS = Object.freeze([
  'mode', 'token', 'scopes', 'baseUrl', 'clientId', 'appId', 'appSecret', 'domain',
  'userAccessToken', 'profiles', 'timeoutMs', 'callbackHost', 'allowInsecureLoopback',
])

function providerForConnector(connector) {
  const candidate = connector?.source?.presetId ?? connector?.id
  return AUTH_PROVIDERS.includes(candidate) ? candidate : undefined
}

function safeAuthInput(input) {
  if (input === undefined) return {}
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('connector authorization input is invalid')
  const output = {}
  for (const key of AUTH_INPUT_KEYS) {
    if (!(key in input)) continue
    const value = input[key]
    if (['scopes', 'profiles'].includes(key)) {
      if (!Array.isArray(value) || value.length > 64 || value.some(item => typeof item !== 'string' || item.length > 256)) throw new TypeError(`invalid connector authorization ${key}`)
      output[key] = [...value]
    } else if (typeof value === 'string') {
      if (value.length > 8192) throw new TypeError(`invalid connector authorization ${key}`)
      output[key] = value
    } else if (typeof value === 'boolean' || (key === 'timeoutMs' && Number.isInteger(value))) {
      output[key] = value
    } else {
      throw new TypeError(`invalid connector authorization ${key}`)
    }
  }
  return output
}

function runConnectorCommand(spec) {
  if (!spec || typeof spec.command !== 'string' || !Array.isArray(spec.args)) throw new TypeError('connector command is invalid')
  const executable = process.platform === 'win32' && !/\.(?:cmd|bat|exe)$/iu.test(spec.command) ? `${spec.command}.cmd` : spec.command
  return new Promise((resolve) => {
    const child = spawn(executable, spec.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...(spec.env ?? {}) },
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
      signal: spec.signal,
    })
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish({ timedOut: true })
    }, Number.isInteger(spec.timeoutMs) ? spec.timeoutMs : 120_000)
    child.once('error', (error) => finish({ error: error.code === 'ABORT_ERR' ? undefined : error }))
    child.once('exit', (exitCode, signal) => finish({ exitCode, signal, cancelled: signal === 'SIGINT' || signal === 'SIGTERM' }))
  })
}

function createDefaultConnectorAuthManager({ connectorSecretStore, dshHome, openExternal }) {
  const oauth = new OAuthFlowManager({ secretStore: connectorSecretStore })
  const context = {
    secretStore: connectorSecretStore,
    oauth,
    openExternal,
    runCommand: (spec) => runConnectorCommand({ ...spec, signal: context.activeAuth?.signal }),
    detectFeishuCli: async () => ({ userAccessToken: false }),
    probe: async () => ({ ok: true }),
    activeAuth: undefined,
  }
  return { manager: new ConnectorAuthManager({
    adapters: [createGitHubAuthAdapter(), createFeishuAuthAdapter(), createGitLabAuthAdapter(), createDingTalkAuthAdapter()],
    context,
  }), context }
}

export function registerExtensionIpc({
  ipcMain,
  dialog,
  shell,
  getWindow,
  pluginManager,
  controller,
  ensureProfile,
  projectRoot,
  dshHome,
  agentsHome,
  connectorSecretStore,
  mcpSourceOptions,
  connectorAuthManager,
  connectorAuthContext,
  prepareRendererForConnectorRestart,
}) {
  for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  let skillPaths = new Map()
  const connectorEnvironment = () => ({
    ...process.env,
    ...(connectorSecretStore ? connectorSecretStore.environment() : {}),
  })
  const connectorStore = new ConnectorStore({
    path: join(dshHome, 'desktop', 'connectors.json'),
    environmentProvider: connectorEnvironment,
  })
  const connectorAuthMetadata = new ConnectorAuthMetadataStore({ path: join(dshHome, 'desktop', 'connector-auth-metadata.json') })
  const connectorSessions = new ConnectorSessionManager({ metadataStore: connectorAuthMetadata, secretStore: connectorSecretStore })
  const sourceOptions = { projectRoot, ...mcpSourceOptions }
  const sourceSessions = new Map()
  const jsonFileSessions = new Map()
  const officialSkillSessions = new Map()
  const officialSkillSource = (providerId) => {
    if (providerId === 'tencent-meeting') return validateTencentMeetingSkillSource('https://meeting.tencent.com/support/topic/2233/index.html')
    if (providerId === 'wecom') return validateWecomSkillSource()
    throw new TypeError('unsupported official Skill provider')
  }
  const pruneOfficialSkillSessions = () => {
    const cutoff = Date.now() - OFFICIAL_SKILL_SESSION_TTL_MS
    for (const [token, session] of officialSkillSessions) {
      if (session.createdAt < cutoff) officialSkillSessions.delete(token)
    }
    while (officialSkillSessions.size >= MAX_OFFICIAL_SKILL_SESSIONS) {
      const oldest = officialSkillSessions.keys().next().value
      if (oldest === undefined) break
      officialSkillSessions.delete(oldest)
    }
  }
  const authRuntime = connectorAuthManager
    ? { manager: connectorAuthManager, context: connectorAuthContext ?? {} }
    : createDefaultConnectorAuthManager({ connectorSecretStore, dshHome, openExternal: url => shell.openExternal(url) })
  const pendingAuth = new Map()

  const pruneSourceSessions = () => {
    const cutoff = Date.now() - SOURCE_SESSION_TTL_MS
    for (const [token, session] of sourceSessions) {
      if (session.createdAt < cutoff) sourceSessions.delete(token)
    }
    while (sourceSessions.size >= MAX_SOURCE_SESSIONS) {
      const oldest = sourceSessions.keys().next().value
      if (oldest === undefined) break
      sourceSessions.delete(oldest)
    }
  }

  const stageSource = (source) => {
    pruneSourceSessions()
    const token = randomUUID()
    const preview = previewMcpJson(source.text)
    sourceSessions.set(token, { ...source, createdAt: Date.now() })
    return {
      source: {
        token,
        clientId: source.clientId,
        clientName: source.clientName,
        scope: source.scope,
        serverCount: preview.servers.length,
      },
      preview,
    }
  }

  const sourceSession = (token) => {
    pruneSourceSessions()
    if (typeof token !== 'string') throw new TypeError('MCP source session token is invalid')
    const session = sourceSessions.get(token)
    if (!session) throw new Error('MCP source session is unavailable or expired')
    return session
  }

  const pruneJsonFileSessions = () => {
    const cutoff = Date.now() - JSON_FILE_SESSION_TTL_MS
    for (const [token, session] of jsonFileSessions) {
      if (session.createdAt < cutoff) jsonFileSessions.delete(token)
    }
    while (jsonFileSessions.size >= MAX_JSON_FILE_SESSIONS) {
      const oldest = jsonFileSessions.keys().next().value
      if (oldest === undefined) break
      jsonFileSessions.delete(oldest)
    }
  }

  const stageJsonFile = async (filePath) => {
    const text = await readFile(filePath, 'utf8')
    const preview = previewMcpJson(text)
    pruneJsonFileSessions()
    const token = randomUUID()
    jsonFileSessions.set(token, { text, createdAt: Date.now() })
    return { canceled: false, token, preview }
  }

  const jsonFileSession = (token) => {
    pruneJsonFileSessions()
    if (typeof token !== 'string') throw new TypeError('MCP file session token is invalid')
    const session = jsonFileSessions.get(token)
    if (!session) throw new Error('MCP file session is unavailable or expired')
    return session
  }

  const scan = async () => {
    const roots = defaultSkillRoots({ projectRoot, dshHome, agentsHome })
    const [plugins, catalog] = await Promise.all([
      pluginManager.inventory(),
      discoverSkills({ roots }),
    ])
    skillPaths = new Map()
    const skills = catalog.skills.map((skill, index) => {
      const id = `${skill.rank}:${index}:${skill.name}`
      skillPaths.set(id, skill.container)
      return {
        id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        shadowed: Boolean(skill.shadowedBy),
        ...(skill.managed ? {
          managed: {
            version: skill.managed.version,
            sourceUrl: skill.managed.sourceUrl,
            verificationTier: skill.managed.verificationTier,
          },
        } : {}),
      }
    })
    return {
      plugins,
      skills,
      diagnostics: catalog.diagnostics.map((item) => ({ error: item.error })),
    }
  }

  const mutatePlugin = async (operation) => {
    await controller.stop()
    try {
      const result = await operation()
      await ensureProfile()
      await controller.start()
      return result
    } catch (error) {
      await ensureProfile().catch(() => {})
      void controller.start().catch(() => {})
      throw error
    }
  }

  ipcMain.handle('extensions:list', scan)
  ipcMain.handle('extensions:plugin-install', (_event, spec) => mutatePlugin(() => pluginManager.install(spec)))
  ipcMain.handle('extensions:plugin-remove', (_event, name) => mutatePlugin(() => pluginManager.remove(name)))
  ipcMain.handle('extensions:skill-import', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: '选择技能目录 / Select skill folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length !== 1) return { canceled: true }
    const targetRoot = join(dshHome, 'skills')
    const imported = await importSkill({ sourceDirectory: result.filePaths[0], targetRoot })
    return { canceled: false, skill: { name: imported.name, description: imported.description } }
  })
  ipcMain.handle('extensions:skill-create', async (_event, input) => {
    const created = await createSkill({ ...input, targetRoot: join(dshHome, 'skills') })
    return { name: created.name, description: created.description }
  })
  ipcMain.handle('extensions:skill-open', async (_event, id) => {
    if (typeof id !== 'string' || !skillPaths.has(id)) throw new TypeError('invalid skill identifier')
    return shell.openPath(skillPaths.get(id))
  })
  ipcMain.handle('extensions:skill-root', async () => {
    const root = join(dshHome, 'skills')
    await mkdir(root, { recursive: true })
    return shell.openPath(root)
  })
  ipcMain.handle('extensions:official-skill-preview', async (_event, providerId) => {
    const sourceUrl = officialSkillSource(providerId)
    const result = await dialog.showOpenDialog(getWindow(), {
      title: '选择官方 Skill 包目录 / Select official Skill package directory',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length !== 1) return { canceled: true }
    const preview = await previewSkillPackage({
      providerId,
      sourceDirectory: result.filePaths[0],
      sourceUrl,
    })
    pruneOfficialSkillSessions()
    const token = randomUUID()
    officialSkillSessions.set(token, { providerId, sourceDirectory: result.filePaths[0], sourceUrl, preview, createdAt: Date.now() })
    return { canceled: false, token, preview }
  })
  ipcMain.handle('extensions:official-skill-install', async (_event, token) => {
    pruneOfficialSkillSessions()
    if (typeof token !== 'string') throw new TypeError('official Skill session token is invalid')
    const session = officialSkillSessions.get(token)
    if (!session) throw new Error('official Skill preview is unavailable or expired')
    officialSkillSessions.delete(token)
    const installed = await installSkillPackage({
      providerId: session.providerId,
      sourceDirectory: session.sourceDirectory,
      targetRoot: join(dshHome, 'skills'),
      sourceUrl: session.sourceUrl,
      expectedSha256: session.preview.sha256,
    })
    return { name: installed.name, version: installed.version, description: installed.description }
  })
  const mutateConnector = async (operation, recovery = {}) => {
    if (typeof prepareRendererForConnectorRestart === 'function') {
      prepareRendererForConnectorRestart({
        tab: 'connectors',
        checkIds: Array.isArray(recovery.checkIds) ? recovery.checkIds : [],
      })
    }
    await controller.stop()
    try {
      const result = await operation()
      await ensureProfile()
      await controller.start()
      return result
    } catch (error) {
      await ensureProfile().catch(() => {})
      void controller.start().catch(() => {})
      throw error
    }
  }
  const importMcpDocument = async (input, text, source) => {
    if (!connectorSecretStore) throw new Error('secure-storage-unavailable')
    await connectorSecretStore.load()
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('MCP import input is invalid')
    }
    const fileSession = input.fileToken === undefined ? undefined : jsonFileSession(input.fileToken)
    if (fileSession !== undefined && text !== undefined) throw new TypeError('MCP import cannot include both text and fileToken')
    const documentText = fileSession?.text ?? text
    if (typeof documentText !== 'string') throw new TypeError('MCP import input is invalid')
    const parsed = parseMcpServersJson(documentText)
    const selectedNames = Array.isArray(input.selectedNames)
      ? new Set(input.selectedNames)
      : new Set(parsed.servers.map((server) => server.sourceName))
    if (parsed.servers.some((server) => selectedNames.has(server.sourceName) && server.transport === 'stdio') && input.allowLocalCommand !== true) {
      throw new Error('local-command-trust-required')
    }
    const existing = await connectorStore.list()
    const connectorSource = source?.kind === 'provider-json'
      ? createProviderJsonSource({ providerId: source.providerId, parsed })
      : source
    const built = buildMcpConnectorImport({
      parsed,
      existing,
      selectedNames: input.selectedNames,
      conflict: input.conflict ?? 'reject',
      secrets: input.secrets,
      source: connectorSource,
    })
    const newReferences = [...built.credentials.keys()]
    const previouslyPresent = new Set(newReferences.filter((reference) => connectorSecretStore.has(reference)))
    return mutateConnector(async () => {
      await connectorSecretStore.setMany(built.credentials)
      try {
        const imported = []
        for (const item of built.connectors) imported.push(await connectorStore.save(item.connector))
        const remaining = await connectorStore.list()
        const referenced = new Set(remaining.flatMap((connector) => [
          ...(connector.secretBindings ?? []).map((binding) => binding.credentialRef),
          ...connector.secretEnvKeys.filter((key) => /^DSH_CONNECTOR_[A-Z0-9_]+$/u.test(key)),
        ]))
        const stale = existing.flatMap((connector) => [
          ...(connector.secretBindings ?? []).map((binding) => binding.credentialRef),
          ...connector.secretEnvKeys.filter((key) => /^DSH_CONNECTOR_[A-Z0-9_]+$/u.test(key)),
        ]).filter((reference) => !referenced.has(reference))
        if (stale.length) await connectorSecretStore.removeMany([...new Set(stale)])
        return { imported }
      } catch (error) {
        const orphaned = newReferences.filter((reference) => !previouslyPresent.has(reference))
        if (orphaned.length) await connectorSecretStore.removeMany(orphaned).catch(() => {})
        throw error
      }
    }, { checkIds: built.connectors.map(item => item.connector.id) })
  }
  ipcMain.handle('extensions:connector-list', async () => {
    const connectors = await connectorStore.list()
    await connectorAuthMetadata.migrate(connectors)
    return connectors
  })
  ipcMain.handle('extensions:connector-save', async (_event, input) => {
    const saved = await mutateConnector(() => connectorStore.save(input), { checkIds: [input?.id] })
    await connectorAuthMetadata.migrate([saved])
    return saved
  })
  ipcMain.handle('extensions:connector-enable', async (_event, id, enabled) => {
    const updated = await mutateConnector(() => connectorStore.setEnabled(id, enabled), { checkIds: [id] })
    const existing = await connectorAuthMetadata.get(id)
    if (enabled) {
      // Re-enabling only makes the connector available again; it must not
      // manufacture a healthy authorization state. The next explicit auth
      // or reconnect action is responsible for reaching `ready`.
      await connectorAuthMetadata.set({ ...(existing ?? { connectorId: id, providerId: updated.source?.presetId ?? id, mode: id === 'dingtalk' ? 'app-credentials' : id === 'feishu' ? 'official-cli' : 'oauth' }), state: existing?.state === 'disabled' ? 'not-configured' : (existing?.state ?? 'not-configured') })
    } else {
      await connectorAuthMetadata.set({ ...(existing ?? { connectorId: id, providerId: updated.source?.presetId ?? id, mode: id === 'dingtalk' ? 'app-credentials' : id === 'feishu' ? 'official-cli' : 'oauth' }), state: 'disabled' })
    }
    return updated
  })
  ipcMain.handle('extensions:connector-disable', async (_event, id) => {
    const updated = await mutateConnector(() => connectorStore.setEnabled(id, false), { checkIds: [id] })
    const existing = await connectorAuthMetadata.get(id)
    await connectorAuthMetadata.set({ ...(existing ?? { connectorId: id, providerId: updated.source?.presetId ?? id, mode: id === 'dingtalk' ? 'app-credentials' : id === 'feishu' ? 'official-cli' : 'oauth' }), state: 'disabled' })
    return updated
  })
  ipcMain.handle('extensions:connector-remove', async (_event, id) => {
    const existing = (await connectorStore.list()).find((connector) => connector.id === id)
    const references = existing === undefined ? [] : [
      ...(existing.secretBindings ?? []).map((binding) => binding.credentialRef),
      ...existing.secretEnvKeys.filter((key) => /^DSH_CONNECTOR_[A-Z0-9_]+$/u.test(key)),
    ]
    return mutateConnector(async () => {
      const providerId = providerForConnector(existing)
      if (providerId) {
        const pending = pendingAuth.get(id)
        if (pending) pending.controller.abort()
        await authRuntime.manager.disconnect(providerId, existing).catch(() => {})
      }
      const result = await connectorStore.remove(id)
      if (connectorSecretStore && references.length) await connectorSecretStore.removeMany([...new Set(references)])
      await connectorAuthMetadata.remove(id)
      return result
    }, { checkIds: [] })
  })
  ipcMain.handle('extensions:connector-check', (_event, id) => connectorStore.check(id))
  const authConnector = async (id) => {
    if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) throw new TypeError('invalid connector id')
    const connector = (await connectorStore.list()).find(item => item.id === id)
    if (!connector) throw new Error('connector-not-found')
    const providerId = providerForConnector(connector)
    if (!providerId) throw new Error('connector-authorization-unsupported')
    return { connector, providerId }
  }
  const plainAuthStatus = (providerId, state, detailKey) => ({
    connectorId: providerId, providerId, mode: providerId === 'dingtalk' ? 'app-credentials' : providerId === 'feishu' ? 'official-cli' : 'oauth', state,
    ...(detailKey ? { detailKey } : {}),
  })
  const persistAuthStatus = async (status) => {
    const safe = status && typeof status === 'object' ? status : undefined
    if (!safe?.connectorId || !safe?.providerId || !safe?.mode || !safe?.state) return safe
    await connectorAuthMetadata.set(safe).catch(() => {})
    return safe
  }
  const statusWithMetadata = async (id, providerId, connector) => {
    const status = await authRuntime.manager.status(providerId, connector)
    const metadata = await connectorAuthMetadata.get(id)
    if (!metadata) return persistAuthStatus({ ...status, connectorId: id })
    // Metadata may intentionally be revoked/expired even when a provider's
    // local token probe still sees ciphertext. Keep the recovery state visible.
    const merged = { ...status, connectorId: id, ...metadata, providerId, mode: status.mode ?? metadata.mode }
    return persistAuthStatus(merged)
  }
  ipcMain.handle('extensions:connector-auth-status', async (_event, id) => {
    const { connector, providerId } = await authConnector(id)
    return statusWithMetadata(id, providerId, connector)
  })
  ipcMain.handle('extensions:connector-authorize', async (_event, id, input) => {
    const { connector, providerId } = await authConnector(id)
    if (pendingAuth.has(id)) return plainAuthStatus(providerId, 'authorizing')
    const controller = new AbortController()
    const task = (async () => {
      if (authRuntime.context && typeof authRuntime.context === 'object') authRuntime.context.activeAuth = { connectorId: id, signal: controller.signal }
      try {
        const status = await authRuntime.manager.authorize(providerId, { ...safeAuthInput(input), connectorId: id })
        return persistAuthStatus({ ...status, connectorId: id })
      } finally {
        if (authRuntime.context?.activeAuth?.connectorId === id) authRuntime.context.activeAuth = undefined
      }
    })()
    pendingAuth.set(id, { controller, task })
    try {
      return await task
    } finally {
      if (pendingAuth.get(id)?.task === task) pendingAuth.delete(id)
    }
  })
  ipcMain.handle('extensions:connector-disconnect', async (_event, id) => {
    const { connector, providerId } = await authConnector(id)
    const pending = pendingAuth.get(id)
    if (pending) pending.controller.abort()
    const result = await authRuntime.manager.disconnect(providerId, connector)
    await connectorAuthMetadata.set({ ...result, connectorId: id, state: 'not-configured', lastFailureCategory: undefined }).catch(() => {})
    return result
  })
  ipcMain.handle('extensions:connector-revoke', async (_event, id) => {
    const { connector, providerId } = await authConnector(id)
    const pending = pendingAuth.get(id)
    if (pending) pending.controller.abort()
    const result = await authRuntime.manager.disconnect(providerId, connector)
    await connectorAuthMetadata.set({ ...result, connectorId: id, state: 'revoked', lastFailureCategory: 'revoked' }).catch(() => {})
    return { ...result, connectorId: id, state: 'revoked', detailKey: 'connector.authorization-revoked' }
  })
  ipcMain.handle('extensions:connector-reconnect', async (_event, id, input) => {
    const { connector, providerId } = await authConnector(id)
    if (pendingAuth.has(id)) return plainAuthStatus(providerId, 'authorizing')
    const controller = new AbortController()
    const task = (async () => {
      if (authRuntime.context && typeof authRuntime.context === 'object') authRuntime.context.activeAuth = { connectorId: id, signal: controller.signal }
      try {
        const status = await authRuntime.manager.authorize(providerId, { ...safeAuthInput(input), connectorId: id })
        const safe = await persistAuthStatus({ ...status, connectorId: id })
        if (safe?.state === 'ready') await mutateConnector(async () => connector, { checkIds: [id] })
        return safe
      } finally {
        if (authRuntime.context?.activeAuth?.connectorId === id) authRuntime.context.activeAuth = undefined
      }
    })()
    pendingAuth.set(id, { controller, task })
    try { return await task } finally { if (pendingAuth.get(id)?.task === task) pendingAuth.delete(id) }
  })
  ipcMain.handle('extensions:connector-auth-verify', async (_event, id) => {
    const { connector, providerId } = await authConnector(id)
    return persistAuthStatus({ ...(await authRuntime.manager.verify(providerId, connector)), connectorId: id })
  })
  ipcMain.handle('extensions:connector-auth-cancel', async (_event, id) => {
    const { providerId } = await authConnector(id)
    const pending = pendingAuth.get(id)
    if (!pending) return statusWithMetadata(id, providerId, { id })
    pending.controller.abort()
    return plainAuthStatus(providerId, 'error', 'authorization-cancelled')
  })
  ipcMain.handle('extensions:mcp-preview', (_event, text) => previewMcpJson(text))
  ipcMain.handle('extensions:mcp-import', async (_event, input) => {
    const result = await importMcpDocument(input, input?.text, input?.source ?? { kind: 'json' })
    if (typeof input?.fileToken === 'string') jsonFileSessions.delete(input.fileToken)
    return result
  })
  ipcMain.handle('extensions:mcp-file-pick', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: '选择 MCP 配置 / Select MCP configuration',
      filters: [{ name: 'MCP JSON', extensions: ['json', 'jsonc'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length !== 1) return { canceled: true }
    return stageJsonFile(result.filePaths[0])
  })
  ipcMain.handle('extensions:mcp-source-list', () => discoverMcpClientSources(sourceOptions))
  ipcMain.handle('extensions:mcp-source-preview', async (_event, clientId) => {
    const source = await readMcpClientSource(clientId, sourceOptions)
    return stageSource(source)
  })
  ipcMain.handle('extensions:mcp-source-pick', async (_event, clientId) => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: '选择 MCP 配置 / Select MCP configuration',
      filters: [{ name: 'MCP JSON', extensions: ['json', 'jsonc'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length !== 1) return { canceled: true }
    const source = await readMcpSourceFile({ clientId, filePath: result.filePaths[0], ...(sourceOptions?.reader ? { reader: sourceOptions.reader } : {}) })
    return { canceled: false, ...stageSource(source) }
  })
  ipcMain.handle('extensions:mcp-source-import', async (_event, input) => {
    const session = sourceSession(input?.token)
    const result = await importMcpDocument(input, session.text, {
      kind: 'external-client',
      clientId: session.clientId,
      scope: session.scope,
    })
    sourceSessions.delete(input.token)
    return result
  })

  return () => {
    connectorSessions.shutdown()
    sourceSessions.clear()
    jsonFileSessions.clear()
    officialSkillSessions.clear()
    for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  }
}
