import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { defaultSkillRoots, discoverSkills, importSkill } from './extensions/skills.mjs'

const CHANNELS = [
  'extensions:list',
  'extensions:plugin-install',
  'extensions:plugin-remove',
  'extensions:skill-import',
  'extensions:skill-open',
  'extensions:skill-root',
]

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
}) {
  for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  let skillPaths = new Map()

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
  ipcMain.handle('extensions:skill-open', async (_event, id) => {
    if (typeof id !== 'string' || !skillPaths.has(id)) throw new TypeError('invalid skill identifier')
    return shell.openPath(skillPaths.get(id))
  })
  ipcMain.handle('extensions:skill-root', async () => {
    const root = join(dshHome, 'skills')
    await mkdir(root, { recursive: true })
    return shell.openPath(root)
  })

  return () => {
    for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  }
}
