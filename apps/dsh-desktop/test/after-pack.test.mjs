import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import afterPack from '../scripts/after-pack.cjs'

const { classifyPrunableFile, prunePackagedRuntime } = afterPack

test('release pruner classifies only non-runtime package files', () => {
  assert.equal(classifyPrunableFile('openai/src/client.ts'), 'published-source')
  assert.equal(classifyPrunableFile('@mistralai/mistralai/packages/example.ts'), 'published-source')
  assert.equal(classifyPrunableFile('zod/v4/index.d.cts'), 'type-declaration')
  assert.equal(classifyPrunableFile('sdk/examples/client/demo.js'), 'development-material')
  assert.equal(classifyPrunableFile('node-pty/prebuilds/win32-arm64/pty.node'), 'foreign-native-binary')
  assert.equal(classifyPrunableFile('node-pty/prebuilds/win32-x64/pty.node'), undefined)
  assert.equal(classifyPrunableFile('pnpm/artifacts/exe/dist/pnpm.mjs'), 'duplicate-runtime-artifact')
  assert.equal(
    classifyPrunableFile('pnpm/dist/vendor/fastlist-0.3.0-x86.exe'),
    'foreign-native-binary',
  )
  assert.equal(classifyPrunableFile('pnpm/dist/pnpm.mjs'), undefined)
  assert.equal(classifyPrunableFile('@deepseek-ai/dsh/lib/index.js'), undefined)
  assert.equal(classifyPrunableFile('pnpm/bin/pnpm.mjs'), undefined)
})

test('release pruner removes classified files and preserves runtime entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-prune-'))
  try {
    const fixtures = new Map([
      ['openai/src/client.ts', 'source'],
      ['openai/index.js', 'runtime'],
      ['zod/index.d.cts', 'types'],
      ['node-pty/prebuilds/win32-arm64/pty.node', 'arm64'],
      ['node-pty/prebuilds/win32-x64/pty.node', 'x64'],
    ])
    for (const [path, content] of fixtures) {
      const absolute = join(root, ...path.split('/'))
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, content)
    }

    const report = await prunePackagedRuntime(root)
    assert.equal(report.removedFiles, 3)
    assert.equal(await readFile(join(root, 'openai', 'index.js'), 'utf8'), 'runtime')
    assert.equal(
      await readFile(join(root, 'node-pty', 'prebuilds', 'win32-x64', 'pty.node'), 'utf8'),
      'x64',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
