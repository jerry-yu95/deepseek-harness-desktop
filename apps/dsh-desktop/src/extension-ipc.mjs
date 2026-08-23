import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { ConnectorStore } from './extensions/connectors.mjs'
import { discoverMcpClientSources, readMcpClientSource, readMcpSourceFile } from './extensions/mcp-client-sources.mjs'
import { parseMcpServersJson } from './extensions/mcp-config.mjs'
import { buildMcpConnectorImport, previewMcpJson } from './extensions/mcp-import.mjs'
import { createSkill, defaultSkillRoots, discoverSkills, importSkill } from './extensions/skills.mjs'

const CHANNELS = [
  'extensions:list',
  'extensions:plugin-install',
  'extensions:plugin-remove',
  'extensions:skill-import',
  'extensions:skill-create',
  'extensions:skill-open',
  'extensions:skill-root',
  'extensions:connector-list',
  'extensions:connector-save',
  'extensions:connector-remove',
  'extensions:connector-check',
  'extensions:mcp-preview',
  'extensions:mcp-import',
  'extensions:mcp-source-list',
  'extensions:mcp-source-preview',
  'extensions:mcp-source-pick',
  'extensions:mcp-source-import',
]

const SOURCE_SESSION_TTL_MS = 15 * 60 * 1_000
const MAX_SOURCE_SESSIONS = 16

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
  const sourceOptions = { projectRoot, ...mcpSourceOptions }
  const sourceSessions = new Map()

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
  const mutateConnector = async (operation) => {
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
    if (!input || typeof input !== 'object' || Array.isArray(input) || typeof text !== 'string') {
      throw new TypeError('MCP import input is invalid')
    }
    const parsed = parseMcpServersJson(text)
    const existing = await connectorStore.list()
    const built = buildMcpConnectorImport({
      parsed,
      existing,
      selectedNames: input.selectedNames,
      conflict: input.conflict ?? 'reject',
      secrets: input.secrets,
      source,
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
    })
  }
  ipcMain.handle('extensions:connector-list', () => connectorStore.list())
  ipcMain.handle('extensions:connector-save', (_event, input) => mutateConnector(() => connectorStore.save(input)))
  ipcMain.handle('extensions:connector-remove', async (_event, id) => {
    const existing = (await connectorStore.list()).find((connector) => connector.id === id)
    const references = existing === undefined ? [] : [
      ...(existing.secretBindings ?? []).map((binding) => binding.credentialRef),
      ...existing.secretEnvKeys.filter((key) => /^DSH_CONNECTOR_[A-Z0-9_]+$/u.test(key)),
    ]
    return mutateConnector(async () => {
      const result = await connectorStore.remove(id)
      if (connectorSecretStore && references.length) await connectorSecretStore.removeMany([...new Set(references)])
      return result
    })
  })
  ipcMain.handle('extensions:connector-check', (_event, id) => connectorStore.check(id))
  ipcMain.handle('extensions:mcp-preview', (_event, text) => previewMcpJson(text))
  ipcMain.handle('extensions:mcp-import', (_event, input) => importMcpDocument(input, input?.text, input?.source ?? { kind: 'json' }))
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
    sourceSessions.clear()
    for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  }
}
