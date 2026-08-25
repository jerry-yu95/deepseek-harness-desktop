import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { verifyEvidenceDirectory } from './verify-connector-auth-evidence.mjs'

const evidence = (provider, extra = {}) => ({
  provider,
  platform: 'darwin-arm64',
  authMode: provider === 'github' ? 'oauth' : 'app-credentials',
  operations: ['list_tools', 'read_disposable_resource'],
  result: 'pass',
  disconnectResult: 'pass',
  testedAt: '2026-08-25T08:00:00.000Z',
  ...extra,
})

async function makeEvidence(values) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsh-auth-evidence-'))
  await mkdir(directory, { recursive: true })
  await Promise.all(values.map((value, index) => writeFile(
    path.join(directory, `${value.provider}-${index}.json`),
    JSON.stringify(value),
  )))
  return directory
}

test('accepts redacted provider evidence and can require all four providers', async () => {
  const directory = await makeEvidence([
    evidence('github'),
    evidence('feishu'),
    evidence('gitlab'),
    evidence('dingtalk'),
  ])
  await assert.doesNotReject(() => verifyEvidenceDirectory(directory, { requireAll: true }))
})

test('rejects credential-shaped fields and query-string URLs', async () => {
  const directory = await makeEvidence([evidence('github', {
    operations: ['token=secret'],
  })])
  await assert.rejects(() => verifyEvidenceDirectory(directory), /credential-shaped text/)

  const queryDirectory = await makeEvidence([evidence('github', {
    testedAt: 'https://example.test/callback?code=secret',
  })])
  await assert.rejects(() => verifyEvidenceDirectory(queryDirectory), /URL query string/)
})

test('rejects unknown fields, duplicate providers, and incomplete required coverage', async () => {
  const unknownDirectory = await makeEvidence([evidence('github', { accountId: 'user@example.com' })])
  await assert.rejects(() => verifyEvidenceDirectory(unknownDirectory), /unsupported field/)

  const duplicateDirectory = await makeEvidence([
    evidence('github'),
    { ...evidence('github'), provider: 'github' },
  ])
  await assert.rejects(() => verifyEvidenceDirectory(duplicateDirectory), /duplicate evidence/)

  const incompleteDirectory = await makeEvidence([evidence('github')])
  await assert.rejects(() => verifyEvidenceDirectory(incompleteDirectory, { requireAll: true }), /missing evidence/)
})
