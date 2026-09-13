import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { captureE2eScreenshot, createE2eArtifacts } from '../scripts/e2e-artifacts.mjs'

test('artifact root is created and repeat runs preserve previous evidence', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'jiwei-artifact-test-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const root = join(temporary, 'evidence')
  const first = await createE2eArtifacts('knowledge', { root })
  await writeFile(join(first, 'result.json'), '{"status":"passed"}')
  const second = await createE2eArtifacts('knowledge', { root })
  assert.equal(dirname(first), root)
  assert.equal(dirname(second), root)
  assert.notEqual(first, second)
  assert.equal(await readFile(join(first, 'result.json'), 'utf8'), '{"status":"passed"}')
})

test('invalid suite names cannot escape the artifact root', async () => {
  for (const suite of ['../profile', '/absolute', 'a/b', 'a\\b', '', undefined]) {
    await assert.rejects(createE2eArtifacts(suite), /Invalid E2E suite name/u)
  }
})

test('diagnostic screenshots tolerate missing and crashed windows', async () => {
  await captureE2eScreenshot(undefined, 'unused.png')
  await captureE2eScreenshot({ firstWindow: async () => { throw new Error('closed') } }, 'unused.png')
  await captureE2eScreenshot({ firstWindow: async () => ({ screenshot: async () => { throw new Error('crashed') } }) }, 'unused.png')
})
