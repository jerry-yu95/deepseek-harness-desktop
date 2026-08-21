import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { BUILTIN_BUNDLES } from '../src/profile.mjs'
import { PluginManager, createPluginInventory, validatePluginSpec } from '../src/extensions/plugins.mjs'

test('plugin spec validation accepts registry packages and rejects command or URL input', () => {
  assert.deepEqual(validatePluginSpec('@community/example@1.2.3'), {
    name: '@community/example',
    spec: '@community/example@1.2.3',
  })
  assert.deepEqual(validatePluginSpec('example@latest'), { name: 'example', spec: 'example@latest' })
  for (const value of ['--global', 'https://example.com/plugin.tgz', 'example;calc', '../plugin', '']) {
    assert.throws(() => validatePluginSpec(value), /plugin package spec/)
  }
})

test('plugin inventory distinguishes protected built-ins from community bundles', () => {
  const inventory = createPluginInventory({
    dependencies: {
      '@linxin666/dsh-web-ui-all': 'link:C:/runtime',
      '@community/example': '1.2.3',
    },
    dsh: { profile: { bundles: [...BUILTIN_BUNDLES, '@community/example'] } },
  })
  assert.equal(inventory.find((item) => item.name === '@linxin666/dsh-web-ui-all').builtIn, true)
  assert.equal(inventory.find((item) => item.name === '@community/example').enabled, true)
})

test('plugin manager serializes installs and protects built-ins', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugins-'))
  let active = 0
  let maxActive = 0
  try {
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    const runner = async ({ args }) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      const { name } = validatePluginSpec(args[1])
      const packageRoot = join(profileDir, 'node_modules', ...name.split('/'))
      await mkdir(packageRoot, { recursive: true })
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
        name,
        version: '1.0.0',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
      manifest.dependencies[name] = '1.0.0'
      await writeFile(join(profileDir, 'package.json'), JSON.stringify(manifest))
      active -= 1
    }
    const manager = new PluginManager({ profileDir, runner, pnpmCli: 'pnpm.mjs' })
    await assert.rejects(manager.remove('@linxin666/dsh-web-ui-all'), /built-in/)
    await Promise.all([
      manager.install('@community/first@1.0.0'),
      manager.install('@community/second@1.0.0'),
    ])
    assert.equal(maxActive, 1)
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.ok(manifest.dsh.profile.bundles.includes('@community/first'))
    assert.ok(manifest.dsh.profile.bundles.includes('@community/second'))
  } finally {
    await rm(profileDir, { recursive: true, force: true })
  }
})
