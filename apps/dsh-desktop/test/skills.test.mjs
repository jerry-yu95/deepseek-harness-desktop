import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  defaultSkillRoots,
  createSkill,
  discoverSkills,
  importSkill,
  parseSkillFrontmatter,
} from '../src/extensions/skills.mjs'

const validSkill = (name, description = 'A useful skill') => `---\nname: ${name}\ndescription: ${description}\n---\n\n# Instructions\n`

test('skill frontmatter requires kebab-case name and a description', () => {
  assert.deepEqual(parseSkillFrontmatter(validSkill('good-skill')), {
    name: 'good-skill',
    description: 'A useful skill',
  })
  assert.throws(() => parseSkillFrontmatter(validSkill('BadSkill')), /kebab-case/)
  assert.throws(() => parseSkillFrontmatter('no frontmatter'), /frontmatter/)
})

test('skill studio creates a valid discoverable bundle without overwrite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-skill-create-'))
  try {
    const created = await createSkill({
      name: 'tapd-workflow',
      description: 'Use when querying TAPD work items',
      instructions: 'Check project scope before changing an item.',
      examples: '- 查询当前迭代缺陷',
      targetRoot: root,
    })
    assert.equal(created.name, 'tapd-workflow')
    const content = await readFile(join(root, 'tapd-workflow', 'SKILL.md'), 'utf8')
    assert.deepEqual(parseSkillFrontmatter(content), {
      name: 'tapd-workflow',
      description: 'Use when querying TAPD work items',
    })
    assert.match(content, /## Instructions/)
    assert.match(content, /## Examples/)
    await assert.rejects(createSkill({
      name: 'tapd-workflow', description: 'duplicate', instructions: 'No.', targetRoot: root,
    }), /already exists/)
    await assert.rejects(createSkill({
      name: '../escape', description: 'bad', instructions: 'No.', targetRoot: root,
    }), /kebab-case/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('skill discovery follows official root precedence and reports shadows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-skills-'))
  try {
    const projectRoot = join(root, 'project')
    const dshHome = join(root, 'dsh-home')
    const agentsHome = join(root, 'agents-home')
    const projectSkill = join(projectRoot, '.dsh', 'skills', 'shared')
    const userSkill = join(dshHome, 'skills', 'shared')
    await mkdir(projectSkill, { recursive: true })
    await mkdir(userSkill, { recursive: true })
    await writeFile(join(projectSkill, 'SKILL.md'), validSkill('shared', 'Project copy'))
    await writeFile(join(userSkill, 'SKILL.md'), validSkill('shared', 'User copy'))

    const result = await discoverSkills({ roots: defaultSkillRoots({ projectRoot, dshHome, agentsHome }) })
    const entries = result.skills.filter((skill) => skill.name === 'shared')
    assert.equal(entries.length, 2)
    assert.equal(entries[0].description, 'Project copy')
    assert.equal(entries[1].shadowedBy, entries[0].path)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('skill discovery exposes only safe app-managed provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-managed-skill-'))
  try {
    const skillRoot = join(root, 'skills', 'managed-skill')
    await mkdir(skillRoot, { recursive: true })
    await writeFile(join(skillRoot, 'SKILL.md'), validSkill('managed-skill'))
    await writeFile(join(skillRoot, '.dsh-skill-install.json'), JSON.stringify({
      manager: 'dsh-official-skill-installer',
      name: 'managed-skill',
      version: '1.0.0',
      sourceUrl: 'https://github.com/example/managed-skill',
      sha256: 'a'.repeat(64),
      installedAt: '2026-08-25T00:00:00.000Z',
      verificationTier: 'source-allowlisted',
      token: 'must-not-reach-renderer',
    }))
    const result = await discoverSkills({ roots: [{ rank: 100, source: 'test', path: join(root, 'skills') }] })
    assert.deepEqual(result.skills[0].managed, {
      managed: true,
      version: '1.0.0',
      sourceUrl: 'https://github.com/example/managed-skill',
      sha256: 'a'.repeat(64),
      installedAt: '2026-08-25T00:00:00.000Z',
      verificationTier: 'source-allowlisted',
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('skill import copies a valid bundle without overwriting and rejects symbolic links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-skill-import-'))
  try {
    const source = join(root, 'source')
    const target = join(root, 'target')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'SKILL.md'), validSkill('imported-skill'))
    await writeFile(join(source, 'reference.md'), 'reference')
    const imported = await importSkill({ sourceDirectory: source, targetRoot: target })
    assert.equal(imported.name, 'imported-skill')
    assert.equal(await readFile(join(target, 'imported-skill', 'reference.md'), 'utf8'), 'reference')
    await assert.rejects(importSkill({ sourceDirectory: source, targetRoot: target }), /already exists/)

    const unsafe = join(root, 'unsafe')
    await mkdir(unsafe)
    await writeFile(join(unsafe, 'SKILL.md'), validSkill('unsafe-skill'))
    const outside = join(root, 'outside')
    await mkdir(outside)
    await symlink(outside, join(unsafe, 'escape'), 'junction')
    await assert.rejects(importSkill({ sourceDirectory: unsafe, targetRoot: target }), /symbolic links/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
