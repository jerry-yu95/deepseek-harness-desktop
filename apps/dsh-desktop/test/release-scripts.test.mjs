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

test('macOS release keeps unsigned and certificate-backed builds mutually exclusive', async () => {
  const workflow = await readFile(new URL('../../../.github/workflows/desktop-release.yml', import.meta.url), 'utf8')
  assert.match(workflow, /HAS_MAC_CERT: \$\{\{ secrets\.MAC_CSC_LINK != '' \}\}/)
  assert.match(workflow, /name: Build unsigned macOS package[\s\S]*env\.HAS_MAC_CERT != 'true'/)
  assert.match(workflow, /name: Build signed macOS package[\s\S]*env\.HAS_MAC_CERT == 'true'/)
  assert.doesNotMatch(workflow, /if: \$\{\{ secrets\./)

  const unsignedStep = workflow.match(/- name: Build unsigned macOS package[\s\S]*?(?=\n\s+- name: Build signed macOS package)/)?.[0]
  assert.ok(unsignedStep)
  assert.doesNotMatch(unsignedStep, /(?:^|\n)\s+(?:CSC_LINK|CSC_KEY_PASSWORD|APPLE_ID):/)
})

test('package verification paths are portable across PowerShell and POSIX shells', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const verificationScripts = Object.entries(manifest.scripts)
    .filter(([name]) => name.startsWith('pack:verify'))

  assert.equal(verificationScripts.length, 3)
  for (const [name, command] of verificationScripts) {
    assert.match(command, /verify-package\.mjs \"dist\//, `${name} must quote its path with portable double quotes`)
    assert.doesNotMatch(command, /verify-package\.mjs '/, `${name} must not pass literal apostrophes on Windows`)
  }
})
