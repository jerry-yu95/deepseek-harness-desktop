import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { auditRoot } from './public-surface-audit.mjs'

async function auditFixture(files) {
  const root = await mkdtemp(join(tmpdir(), 'jiwei-public-audit-'))
  for (const [relativePath, contents] of Object.entries(files)) {
    const destination = join(root, relativePath)
    await mkdir(join(destination, '..'), { recursive: true })
    await writeFile(destination, contents)
  }
  return auditRoot(root)
}

test('rejects inherited promotional copy in active public docs', async () => {
  const result = await auditFixture({
    'README.md': 'git clone https://github.com/zhu1090093659/dsh-web-ui.git',
  })
  assert.equal(result.ok, false)
  assert.match(result.findings[0].message, /legacy public installation instruction/u)
})

test('allows legally required attribution and technical identifiers', async () => {
  const result = await auditFixture({
    'NOTICE.md': 'components originally copyrighted by zhu1090093659',
    'packages/example/package.json': '{"name":"@linxin666/example"}',
  })
  assert.equal(result.ok, true)
})

test('rejects credentials and personal absolute paths', async () => {
  const result = await auditFixture({
    'README.md': 'token=ghp_123456789012345678901234567890123456\npath=/Users/alice/private',
  })
  assert.equal(result.ok, false)
  assert.ok(result.findings.some(({ rule }) => rule === 'credential'))
  assert.ok(result.findings.some(({ rule }) => rule === 'personal-path'))
})

test('preserves historical plans and technical package metadata', async () => {
  const result = await auditFixture({
    'docs/plans/old.md': 'git clone https://github.com/zhu1090093659/dsh-web-ui.git',
    'packages/example/package.json': '{"repository":"https://github.com/zhu1090093659/dsh-web-ui.git"}',
  })
  assert.equal(result.ok, true)
})
