import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  BUILTIN_BUNDLES,
  DESKTOP_PATCH_CONFIG,
  DESKTOP_SUPPORT_PACKAGES,
  MANAGED_RUNTIME_PACKAGES,
  RETIRED_DESKTOP_SKIN_PACKAGES,
  createDesktopProfileManifest,
  ensureDesktopProfile,
  materializeFilesystemPath,
  packagePathSegments,
  resolveRuntimePackages,
  resolveDshCliPath,
  stripLegacySkinManagedSection,
} from '../src/profile.mjs'

test('packaged paths point at physical asar-unpacked files', () => {
  assert.equal(
    materializeFilesystemPath('C:\\app\\resources\\app.asar\\node_modules\\pkg'),
    'C:\\app\\resources\\app.asar.unpacked\\node_modules\\pkg',
  )
  assert.equal(materializeFilesystemPath('C:\\workspace\\node_modules\\pkg'), 'C:\\workspace\\node_modules\\pkg')
})

test('package path validation accepts NPM names and rejects path input', () => {
  assert.deepEqual(packagePathSegments('@deepseek-ai/dsh-pet'), ['@deepseek-ai', 'dsh-pet'])
  assert.deepEqual(packagePathSegments('plain-package'), ['plain-package'])
  for (const value of ['', '../escape', '@scope', '@scope/pkg/extra', 'file:package']) {
    assert.throws(() => packagePathSegments(value), /package name/)
  }
})

test('profile manifest preserves community bundles after managed bundles', () => {
  const manifest = createDesktopProfileManifest({
    dependencies: { '@community/example': '1.2.3' },
    dsh: { profile: { bundles: ['@community/example', '@deepseek-ai/dsh-base'] } },
  })

  assert.deepEqual(manifest.dsh.profile.bundles, [...BUILTIN_BUNDLES, '@community/example'])
  assert.equal(manifest.dependencies['@community/example'], '1.2.3')
  assert.equal(manifest.name, 'dsh-profile-desktop')
})

test('profile migration removes retired preset skins but preserves community dependencies', () => {
  const retired = RETIRED_DESKTOP_SKIN_PACKAGES[0]
  const manifest = createDesktopProfileManifest({
    dependencies: { [retired]: 'link:/old-skin', '@community/theme': '1.0.0' },
  })
  assert.equal(manifest.dependencies[retired], undefined)
  assert.equal(manifest.dependencies['@community/theme'], '1.0.0')

  const patch = `before: true\n# --- dsh-skin managed (auto-generated; do not edit) ---\n- old: skin\n# --- end dsh-skin managed ---\nafter: true\n`
  assert.equal(stripLegacySkinManagedSection(patch), 'before: true\nafter: true\n')
})

test('profile bootstrap is idempotent and links every managed package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-'))
  const dshHome = join(root, 'home')
  const sourceRoot = join(root, 'packages')
  const packageRoots = new Map()

  for (const packageName of ['@linxin666/dsh-web-ui-all', '@linxin666/dsh-pet']) {
    const packageRoot = join(sourceRoot, ...packagePathSegments(packageName))
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: packageName, version: '1.0.0' }))
    packageRoots.set(packageName, packageRoot)
  }

  const first = await ensureDesktopProfile({ dshHome, packageRoots })
  const second = await ensureDesktopProfile({ dshHome, packageRoots })
  assert.equal(first.profileDir, second.profileDir)
  assert.equal(second.changed, false)

  const manifest = JSON.parse(await readFile(join(first.profileDir, 'package.json'), 'utf8'))
  assert.deepEqual(manifest.dsh.profile.bundles, BUILTIN_BUNDLES)
  assert.equal(await readFile(join(first.profileDir, 'cordis.patch.yml'), 'utf8'), DESKTOP_PATCH_CONFIG)
  for (const [packageName, source] of packageRoots) {
    const linked = join(first.profileDir, 'node_modules', ...packagePathSegments(packageName))
    assert.equal(await realpath(linked), await realpath(source))
  }
})

test('profile bootstrap activates saved MCP connectors through the official bridge', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-mcp-profile-'))
  try {
    await mkdir(join(root, 'desktop'), { recursive: true })
    await writeFile(join(root, 'desktop', 'connectors.json'), JSON.stringify([{
      id: 'local-tools', name: 'Local tools', description: '', kind: 'mcp', enabled: true,
      capabilities: [], secretEnvKeys: [], transport: 'stdio', command: 'node', args: ['server.mjs'],
    }]))
    const result = await ensureDesktopProfile({ dshHome: root })
    const patch = await readFile(join(result.profileDir, 'cordis.patch.yml'), 'utf8')
    assert.match(patch, /@deepseek-ai\/dsh-mcp-client/)
    assert.match(patch, /serverName: "local-tools"/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap repairs its own stale links after an app upgrade', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-upgrade-'))
  try {
    const dshHome = join(root, 'home')
    const packageName = '@deepseek-ai/dsh-credentials-local'
    const oldSource = join(root, 'old-app', ...packagePathSegments(packageName))
    const newSource = join(root, 'new-app', ...packagePathSegments(packageName))
    for (const source of [oldSource, newSource]) {
      await mkdir(source, { recursive: true })
      await writeFile(join(source, 'package.json'), JSON.stringify({ name: packageName, version: '1.0.0' }))
    }

    await ensureDesktopProfile({ dshHome, packageRoots: new Map([[packageName, oldSource]]) })
    await rm(join(root, 'old-app'), { recursive: true, force: true })
    const upgraded = await ensureDesktopProfile({ dshHome, packageRoots: new Map([[packageName, newSource]]) })

    const linked = join(upgraded.profileDir, 'node_modules', ...packagePathSegments(packageName))
    assert.equal(await realpath(linked), await realpath(newSource))
    assert.equal(upgraded.changed, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runtime resolver finds every bundled and desktop support package', () => {
  const resolved = resolveRuntimePackages()
  assert.deepEqual([...resolved.keys()], [...resolved.keys()].toSorted())
  for (const packageName of MANAGED_RUNTIME_PACKAGES) {
    assert.equal(resolved.has(packageName), true, `missing ${packageName}`)
  }
  assert.deepEqual(DESKTOP_SUPPORT_PACKAGES, [
    '@deepseek-ai/dsh-client-ui-directory-picker-browse',
    '@deepseek-ai/dsh-host-directory-picker-browse',
  ])
  for (const packageName of [
    '@deepseek-ai/dsh-attachment-local',
    '@deepseek-ai/dsh-credentials-local',
    '@deepseek-ai/dsh-llm-pi-ai',
    '@deepseek-ai/dsh-session-persistence-jsonl',
  ]) {
    assert.equal(resolved.has(packageName), true, `official profile dependency was not discovered: ${packageName}`)
  }
})

test('official DSH CLI composes the isolated desktop profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-compose-'))
  try {
    await ensureDesktopProfile({ dshHome: root })
    const result = spawnSync(
      process.execPath,
      [resolveDshCliPath(), '--profile', 'desktop', '--dump-config'],
      {
        encoding: 'utf8',
        env: { ...process.env, DSH_HOME: root },
        timeout: 20_000,
      },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /ui-task-board/)
    assert.match(result.stdout, /ui-skin-center/)
    assert.match(result.stdout, /harness-orchestrator/)
    assert.match(result.stdout, /directory-picker-desktop-host/)
    assert.match(result.stdout, /dsh-host-directory-picker-browse/)
    assert.match(result.stdout, /directory-picker-desktop-client/)
    assert.match(result.stdout, /dsh-client-ui-directory-picker-browse/)
    assert.doesNotMatch(result.stdout, /dsh-host-directory-picker-native/)
    for (const packageName of RETIRED_DESKTOP_SKIN_PACKAGES) {
      assert.doesNotMatch(result.stdout, new RegExp(packageName.split('/').at(-1)))
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
