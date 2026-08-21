import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { BoundedLogStore, sanitizeLogLine } from '../src/log-store.mjs'

test('log sanitization removes common credential shapes', () => {
  assert.equal(
    sanitizeLogLine('Authorization: Bearer secret-token NPM_TOKEN=abc123'),
    'Authorization: Bearer [redacted] NPM_TOKEN=[redacted]',
  )
})

test('bounded log store rotates files and returns a recent tail', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-desktop-log-'))
  try {
    const store = new BoundedLogStore({ directory, maxBytes: 48, maxFiles: 3 })
    for (let index = 0; index < 12; index += 1) {
      await store.append(`line-${String(index).padStart(2, '0')}-abcdefgh`)
    }
    const files = (await readdir(directory)).toSorted()
    assert.deepEqual(files, ['runtime.log', 'runtime.log.1', 'runtime.log.2'])
    for (const file of files) assert.ok((await stat(join(directory, file))).size <= 48)
    assert.match(await store.tail(3), /line-11/)
    assert.doesNotMatch(await readFile(join(directory, 'runtime.log'), 'utf8'), /secret-token/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
