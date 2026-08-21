import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { compareVersions, DshUpdateManager } from '../src/update-manager.mjs'

test('compareVersions follows release and prerelease ordering', () => {
  assert.equal(compareVersions('0.1.0-rc.6', '0.1.0-rc.7'), -1)
  assert.equal(compareVersions('0.1.0-rc.7', '0.1.0'), -1)
  assert.equal(compareVersions('0.2.0', '0.1.9'), 1)
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
})

test('check records an available official version without mutating the profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-test-'))
  const profileDir = join(root, 'profile')
  await mkdir(profileDir)
  await writeFile(join(profileDir, 'package.json'), '{"custom":true}\n')
  const responses = new Map([
    ['registry', { version: '0.1.0', description: 'Official runtime release' }],
    ['source-package', { version: '0.1.0-rc.7' }],
    ['source-commits', [{ sha: 'abcdef1234567890', html_url: 'https://github.com/deepseek-ai/deepseek-harness/commit/abcdef1', commit: { message: 'Improve runtime update flow\n\nDetails', author: { date: '2026-08-20T01:02:03Z' } } }]],
  ])
  const manager = new DshUpdateManager({
    userData: root,
    profileDir,
    pnpmCli: '/unused',
    packaged: { version: '0.1.0-rc.6', cliPath: '/packaged/dsh', root: '/packaged', source: 'packaged' },
    registryUrl: 'registry',
    sourcePackageUrl: 'source-package',
    sourceCommitsUrl: 'source-commits',
    fetchImpl: async (url) => ({ ok: true, json: async () => responses.get(url) }),
  })
  const status = await manager.check()
  assert.equal(status.updateAvailable, true)
  assert.equal(status.checkedVersion, '0.1.0')
  assert.equal(status.sourceVersion, '0.1.0-rc.7')
  assert.equal(status.sourceVersionAhead, true)
  assert.equal(status.sourceCommit, 'abcdef1234567890')
  assert.equal(status.latestDescription, 'Official runtime release')
  assert.equal(status.sourceCommitMessage, 'Improve runtime update flow')
  assert.equal(status.sourceCommitDate, '2026-08-20T01:02:03Z')
  assert.equal(await readFile(join(profileDir, 'package.json'), 'utf8'), '{"custom":true}\n')
})

test('check reads npm dist-tags and release metadata from the full registry document', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-metadata-test-'))
  const manager = new DshUpdateManager({
    userData: root,
    profileDir: join(root, 'profile'),
    pnpmCli: '/unused',
    packaged: { version: '0.1.0-rc.6', cliPath: '/packaged/dsh', root: '/packaged', source: 'packaged' },
    registryUrl: 'registry/latest',
    registryMetadataUrl: 'registry/metadata',
    sourcePackageUrl: 'source-package',
    sourceCommitsUrl: 'source-commits',
    fetchImpl: async (url) => {
      if (url === 'registry/metadata') {
        return {
          ok: true,
          json: async () => ({
            'dist-tags': { latest: '0.1.0-rc.8' },
            time: { '0.1.0-rc.8': '2026-08-20T03:04:05Z' },
            versions: { '0.1.0-rc.8': { description: 'Official metadata' } },
          }),
        }
      }
      return { ok: true, json: async () => ({ version: '0.1.0-rc.7' }) }
    },
  })
  const status = await manager.check()
  assert.equal(status.checkedVersion, '0.1.0-rc.8')
  assert.equal(status.latestPublishedAt, '2026-08-20T03:04:05Z')
  assert.equal(status.latestDescription, 'Official metadata')
})

test('a GitHub source check failure does not block a successful npm check', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-source-test-'))
  const manager = new DshUpdateManager({
    userData: root,
    profileDir: join(root, 'profile'),
    pnpmCli: '/unused',
    packaged: { version: '0.1.0-rc.6', cliPath: '/packaged/dsh', root: '/packaged', source: 'packaged' },
    registryUrl: 'registry',
    sourcePackageUrl: 'source-package',
    sourceCommitsUrl: 'source-commits',
    fetchImpl: async (url) => {
      if (url === 'registry') return { ok: true, json: async () => ({ version: '0.1.0' }) }
      throw new Error('GitHub unavailable')
    },
  })
  const status = await manager.check()
  assert.equal(status.checkedVersion, '0.1.0')
  assert.match(status.sourceCheckError, /GitHub unavailable/)
})

test('stageSource downloads an immutable commit into an isolated snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-source-stage-test-'))
  const profileDir = join(root, 'profile')
  const seen = []
  const manager = new DshUpdateManager({
    userData: root,
    profileDir,
    pnpmCli: '/unused',
    packaged: { version: '0.1.0-rc.6', cliPath: '/packaged/dsh', root: '/packaged', source: 'packaged' },
    sourceArchiveUrl: 'source-archive/',
    fetchImpl: async (url) => {
      seen.push(String(url))
      return { ok: true, headers: { get: () => undefined }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
    },
    runner: async (_executable, args, options) => {
      assert.equal(_executable, process.platform === 'win32' ? 'tar.exe' : 'tar')
      assert.equal(args[0], '-xzf')
      await mkdir(options.cwd, { recursive: true })
      await writeFile(join(options.cwd, 'package.json'), '{"name":"deepseek-harness","version":"0.1.0-rc.7"}\n')
    },
  })
  const status = await manager.stageSource('abcdef1234567890')
  assert.deepEqual(seen, ['source-archive/abcdef1234567890'])
  assert.deepEqual(status.sourceSnapshot, {
    commit: 'abcdef1234567890',
    version: '0.1.0-rc.7',
    stagedAt: status.sourceSnapshot.stagedAt,
  })
  assert.match(status.sourceSnapshot.stagedAt, /^\d{4}-\d{2}-\d{2}T/u)
  assert.equal(await readFile(join(root, 'official-runtime', 'source-snapshots', 'abcdef1234567890', 'package.json'), 'utf8'), '{"name":"deepseek-harness","version":"0.1.0-rc.7"}\n')
})

test('stageSource rejects non-commit input before any network request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-source-invalid-test-'))
  const manager = new DshUpdateManager({
    userData: root,
    profileDir: join(root, 'profile'),
    pnpmCli: '/unused',
    packaged: { version: '0.1.0-rc.6', cliPath: '/packaged/dsh', root: '/packaged', source: 'packaged' },
    fetchImpl: async () => { throw new Error('network must not be called') },
  })
  await assert.rejects(() => manager.stageSource('https://evil.example/archive'), /hexadecimal Git commit/)
})

test('install grants lifecycle scripts only to the fixed official native allowlist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-update-install-test-'))
  const profileDir = join(root, 'profile')
  await mkdir(profileDir)
  const manager = new DshUpdateManager({
    userData: root,
    profileDir,
    pnpmCli: '/pnpm.mjs',
    executable: '/node',
    packaged: { version: '0.1.0-rc.6', cliPath: '/packaged/dsh', root: '/packaged', source: 'packaged' },
    runner: async (_executable, args, options) => {
      if (args.includes('install')) {
        const manifestRoot = join(options.cwd, 'node_modules', '@deepseek-ai', 'dsh')
        await mkdir(join(manifestRoot, 'lib'), { recursive: true })
        await writeFile(join(manifestRoot, 'package.json'), '{"version":"0.1.0-rc.7"}\n')
        await writeFile(join(manifestRoot, 'lib', 'bin.js'), '')
      }
    },
  })

  await manager.install('0.1.0-rc.7')
  const workspace = await readFile(join(root, 'official-runtime', 'versions', '0.1.0-rc.7', 'pnpm-workspace.yaml'), 'utf8')
  assert.match(workspace, /allowBuilds:/u)
  assert.match(workspace, /  "@deepseek-ai\/dsh-subprocess-local": true/u)
  assert.match(workspace, /  "node-pty": true/u)
  assert.doesNotMatch(workspace, /\*/u)
})
