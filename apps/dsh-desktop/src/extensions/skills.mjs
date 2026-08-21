import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

import { parse } from 'yaml'

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u

export function parseSkillFrontmatter(content) {
  const match = FRONTMATTER.exec(String(content))
  if (match === null) throw new Error('skill is missing YAML frontmatter')
  const data = parse(match[1])
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('skill frontmatter must be an object')
  if (typeof data.name !== 'string' || !SKILL_NAME_PATTERN.test(data.name)) {
    throw new Error('skill name must be kebab-case')
  }
  if (typeof data.description !== 'string' || data.description.trim().length === 0) {
    throw new Error('skill description is required')
  }
  return { name: data.name, description: data.description.trim() }
}

export function defaultSkillRoots({
  projectRoot,
  dshHome,
  agentsHome = process.env.DSH_AGENTS_HOME || join(homedir(), '.agents'),
  customSkillDirs = [],
}) {
  return [
    { rank: 100, source: 'project-dsh', path: join(projectRoot, '.dsh', 'skills') },
    { rank: 200, source: 'project-agents', path: join(projectRoot, '.agents', 'skills') },
    ...customSkillDirs.map((path, index) => ({ rank: 300 + index, source: 'custom', path })),
    { rank: 400, source: 'user-dsh', path: join(dshHome, 'skills') },
    { rank: 500, source: 'user-agents', path: join(agentsHome, 'skills') },
  ]
}

async function readSkillCandidates(root) {
  let entries
  try {
    entries = await readdir(root.path, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const candidates = []
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === '.system') continue
    if (entry.isDirectory()) {
      candidates.push({ path: join(root.path, entry.name, 'SKILL.md'), container: join(root.path, entry.name) })
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      candidates.push({ path: join(root.path, entry.name), container: join(root.path, entry.name) })
    }
  }
  return candidates
}

export async function discoverSkills({ roots }) {
  const skills = []
  const diagnostics = []
  const winners = new Map()
  for (const root of [...roots].toSorted((left, right) => left.rank - right.rank)) {
    for (const candidate of await readSkillCandidates(root)) {
      try {
        const metadata = parseSkillFrontmatter(await readFile(candidate.path, 'utf8'))
        const winner = winners.get(metadata.name)
        const skill = {
          ...metadata,
          path: candidate.path,
          container: candidate.container,
          source: root.source,
          rank: root.rank,
          shadowedBy: winner?.path,
        }
        if (!winner) winners.set(metadata.name, skill)
        skills.push(skill)
      } catch (error) {
        if (error?.code !== 'ENOENT') diagnostics.push({ path: candidate.path, error: error.message })
      }
    }
  }
  return { skills, diagnostics }
}

async function assertSafeBundle(path, budget = { files: 0, bytes: 0 }) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name)
    const metadata = await lstat(entryPath)
    if (metadata.isSymbolicLink()) throw new Error('skill bundles containing symbolic links are not accepted')
    budget.files += 1
    if (budget.files > 2_000) throw new Error('skill bundle contains too many files')
    if (metadata.isDirectory()) await assertSafeBundle(entryPath, budget)
    else {
      budget.bytes += metadata.size
      if (budget.bytes > 50 * 1024 * 1024) throw new Error('skill bundle exceeds 50 MB')
    }
  }
  return budget
}

async function exists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export async function importSkill({ sourceDirectory, targetRoot }) {
  const metadata = parseSkillFrontmatter(await readFile(join(sourceDirectory, 'SKILL.md'), 'utf8'))
  await assertSafeBundle(sourceDirectory)
  await mkdir(targetRoot, { recursive: true })
  const target = join(targetRoot, metadata.name)
  if (await exists(target)) throw new Error(`skill ${metadata.name} already exists`)
  const temporary = join(targetRoot, `.import-${metadata.name}-${process.pid}-${Date.now()}`)
  try {
    await cp(sourceDirectory, temporary, { recursive: true, dereference: false, errorOnExist: true, force: false })
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { recursive: true, force: true })
    throw error
  }
  return { ...metadata, path: join(target, 'SKILL.md'), container: target, sourceName: basename(sourceDirectory) }
}

function cleanMarkdown(value, field, max = 20_000) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${field} is required`)
  const normalized = value.trim()
  if (normalized.length > max) throw new TypeError(`${field} is too long`)
  return normalized
}

export async function createSkill({ name, description, instructions, examples = '', targetRoot }) {
  const metadata = parseSkillFrontmatter(`---\nname: ${name}\ndescription: ${description}\n---\n`)
  const body = cleanMarkdown(instructions, 'skill instructions')
  const exampleText = typeof examples === 'string' ? examples.trim() : ''
  if (exampleText.length > 10_000) throw new TypeError('skill examples are too long')
  await mkdir(targetRoot, { recursive: true })
  const target = join(targetRoot, metadata.name)
  if (await exists(target)) throw new Error(`skill ${metadata.name} already exists`)
  const temporary = join(targetRoot, `.create-${metadata.name}-${process.pid}-${Date.now()}`)
  const content = [
    '---',
    `name: ${metadata.name}`,
    `description: ${JSON.stringify(metadata.description)}`,
    '---',
    '',
    `# ${metadata.name}`,
    '',
    '## Instructions',
    '',
    body,
    ...(exampleText ? ['', '## Examples', '', exampleText] : []),
    '',
  ].join('\n')
  try {
    await mkdir(temporary, { recursive: false })
    await writeFile(join(temporary, 'SKILL.md'), content, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { recursive: true, force: true })
    throw error
  }
  return { ...metadata, path: join(target, 'SKILL.md'), container: target }
}
