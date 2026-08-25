import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  installSkillPackage,
  previewSkillPackage,
  removeSkillPackage,
  rollbackSkillPackage,
  validatePackagePath,
} from '../src/extensions/skill-packages.mjs'

const skill = (name = 'safe-skill', description = 'A safe skill') => `---\nname: ${name}\ndescription: ${description}\n---\n\n# Instructions\n\nRead before writing.\n`

async function makePackage(root, name = 'safe-skill', manifest = undefined) {
  const source = join(root, `${name}-source`)
  await mkdir(join(source, 'scripts'), { recursive: true })
  await mkdir(join(source, 'references'), { recursive: true })
  await writeFile(join(source, 'SKILL.md'), skill(name))
  await writeFile(join(source, 'references', 'guide.md'), 'Use the read-only workflow first.\n')
  if (manifest !== undefined) await writeFile(join(source, 'skill.json'), JSON.stringify(manifest, null, 2))
  return source
}

test('skill package preview accepts a minimal package and records a stable digest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-package-preview-'))
  try {
    const source = await makePackage(root)
    const first = await previewSkillPackage({ sourceDirectory: source, sourceUrl: 'https://github.com/example/safe-skill' })
    const second = await previewSkillPackage({ sourceDirectory: source, sourceUrl: 'https://github.com/example/safe-skill' })
    assert.equal(first.name, 'safe-skill')
    assert.equal(first.runtime, 'none')
    assert.equal(first.verification.tier, 'source-allowlisted')
    assert.match(first.sha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(second, first)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('package validation rejects traversal, absolute paths, symlinks, and unsafe executable placement', async () => {
  assert.throws(() => validatePackagePath('../escape'), /path traversal/)
  assert.throws(() => validatePackagePath('/tmp/escape'), /absolute path/)
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-package-unsafe-'))
  try {
    const source = await makePackage(root, 'symlink-skill')
    await symlink(join(root, 'outside'), join(source, 'references', 'escape'))
    await assert.rejects(previewSkillPackage({ sourceDirectory: source }), /symbolic links/)

    const executable = await makePackage(root, 'executable-skill')
    await writeFile(join(executable, 'run.sh'), '#!/bin/sh\necho unsafe\n')
    await chmod(join(executable, 'run.sh'), 0o755)
    await assert.rejects(previewSkillPackage({ sourceDirectory: executable }), /executable file outside scripts/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('package validation rejects invalid manifests, embedded credentials, source redirects, and checksum mismatches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-package-invalid-'))
  try {
    const invalidManifest = await makePackage(root, 'invalid-runtime', {
      name: 'invalid-runtime', version: '1.0.0', runtime: 'ruby', scripts: [],
    })
    await assert.rejects(previewSkillPackage({ sourceDirectory: invalidManifest }), /unsupported runtime/)

    const credentialPackage = await makePackage(root, 'credential-skill')
    await writeFile(join(credentialPackage, 'references', 'leak.md'), 'token=ghp_123456789012345678901234567890123456\n')
    await assert.rejects(previewSkillPackage({ sourceDirectory: credentialPackage }), /credential-shaped value/)

    const sourcePackage = await makePackage(root, 'source-skill')
    await assert.rejects(previewSkillPackage({
      sourceDirectory: sourcePackage,
      sourceUrl: 'https://github.com/example/source-skill',
      resolvedSourceUrl: 'https://evil.example/source-skill',
    }), /allowlisted/)
    await assert.rejects(previewSkillPackage({ sourceDirectory: sourcePackage, expectedSha256: '0'.repeat(64) }), /checksum mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('installer moves atomically, refuses user-owned overwrite, and supports rollback/removal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-package-install-'))
  try {
    const source = await makePackage(root, 'managed-skill', {
      name: 'managed-skill', version: '1.0.0', runtime: 'none', scripts: [],
    })
    const targetRoot = join(root, 'skills')
    const installed = await installSkillPackage({
      sourceDirectory: source,
      targetRoot,
      sourceUrl: 'https://github.com/example/managed-skill',
    })
    assert.equal(installed.name, 'managed-skill')
    assert.equal(installed.version, '1.0.0')
    const provenance = JSON.parse(await readFile(join(targetRoot, 'managed-skill', '.dsh-skill-install.json'), 'utf8'))
    assert.equal(provenance.sourceUrl, 'https://github.com/example/managed-skill')
    assert.equal('token' in provenance, false)

    const userOwned = await makePackage(root, 'user-owned')
    await mkdir(join(targetRoot, 'user-owned'), { recursive: true })
    await writeFile(join(targetRoot, 'user-owned', 'SKILL.md'), skill('user-owned'))
    await assert.rejects(installSkillPackage({ sourceDirectory: userOwned, targetRoot }), /user-managed/)

    const replacement = await makePackage(root, 'managed-skill-v2', {
      name: 'managed-skill', version: '2.0.0', runtime: 'none', scripts: [],
    })
    await writeFile(join(replacement, 'SKILL.md'), skill('managed-skill', 'Version two'))
    await installSkillPackage({ sourceDirectory: replacement, targetRoot, sourceUrl: 'https://github.com/example/managed-skill' })
    assert.match(await readFile(join(targetRoot, 'managed-skill', 'SKILL.md'), 'utf8'), /Version two/)
    await rollbackSkillPackage({ targetRoot, name: 'managed-skill' })
    assert.match(await readFile(join(targetRoot, 'managed-skill', 'SKILL.md'), 'utf8'), /Read before writing/)
    await removeSkillPackage({ targetRoot, name: 'managed-skill' })
    await assert.rejects(readFile(join(targetRoot, 'managed-skill', 'SKILL.md')), /ENOENT/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
