import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { writeReleaseChecksums } from '../scripts/write-release-checksums.mjs'

test('release checksums cover installers and update ZIPs in stable filename order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-release-checksums-'))
  try {
    await writeFile(join(root, 'Desktop-x64.exe'), 'windows')
    await writeFile(join(root, 'Desktop-arm64.dmg'), 'mac-arm')
    await writeFile(join(root, 'Desktop-x64.zip'), 'mac-intel')
    await writeFile(join(root, 'latest.yml'), 'metadata')
    const result = await writeReleaseChecksums(root)
    assert.equal(result.count, 3)
    const lines = (await readFile(result.outputPath, 'ascii')).trim().split('\n')
    assert.deepEqual(lines.map(line => line.split('  ')[1]), [
      'Desktop-arm64.dmg',
      'Desktop-x64.exe',
      'Desktop-x64.zip',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
