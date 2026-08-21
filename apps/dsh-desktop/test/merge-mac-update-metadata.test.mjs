import assert from 'node:assert/strict'
import test from 'node:test'

import YAML from 'yaml'

import { mergeMacUpdateMetadata } from '../scripts/merge-mac-update-metadata.mjs'

const arm64 = `version: 1.2.3
files:
  - url: Desktop-1.2.3-arm64.zip
    sha512: arm-zip
  - url: Desktop-1.2.3-arm64.dmg
    sha512: arm-dmg
path: Desktop-1.2.3-arm64.zip
sha512: arm-zip
releaseDate: '2026-08-21T01:00:00.000Z'
`

const x64 = `version: 1.2.3
files:
  - url: Desktop-1.2.3-x64.zip
    sha512: x64-zip
  - url: Desktop-1.2.3-x64.dmg
    sha512: x64-dmg
path: Desktop-1.2.3-x64.zip
sha512: x64-zip
releaseDate: '2026-08-21T02:00:00.000Z'
`

test('merges macOS architectures while retaining an x64 legacy fallback', () => {
  const merged = YAML.parse(mergeMacUpdateMetadata([arm64, x64]))
  assert.equal(merged.version, '1.2.3')
  assert.equal(merged.files.length, 4)
  assert.equal(merged.path, 'Desktop-1.2.3-x64.zip')
  assert.equal(merged.sha512, 'x64-zip')
  assert.equal(merged.releaseDate, '2026-08-21T02:00:00.000Z')
})

test('rejects metadata from different desktop versions', () => {
  assert.throws(
    () => mergeMacUpdateMetadata([arm64, x64.replace('version: 1.2.3', 'version: 1.2.4')]),
    /versions do not match/u,
  )
})
