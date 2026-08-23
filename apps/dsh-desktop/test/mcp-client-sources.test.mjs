import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  discoverMcpClientSources,
  readMcpClientSource,
  readMcpSourceFile,
} from '../src/extensions/mcp-client-sources.mjs'

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
}

test('client source discovery reports only safe availability metadata', async () => {
  const homeDir = await mkdtemp(join(tmpdir(), 'dsh-mcp-clients-'))
  try {
    await writeJson(join(homeDir, '.workbuddy', 'mcp.json'), {
      mcpServers: { work: { command: 'node', args: ['work.mjs'], env: { API_KEY: 'work-secret' } } },
    })
    await writeJson(join(homeDir, '.codebuddy', 'mcp.json'), {
      mcpServers: { fallback: { command: 'node', args: ['fallback.mjs'] } },
    })
    await writeJson(join(homeDir, '.codebuddy', '.mcp.json'), `{
      // The recommended CodeBuddy file wins over legacy paths.
      "mcpServers": { "primary": { "command": "node", "args": ["primary.mjs"], }, },
    }`)
    await writeJson(join(homeDir, '.qoder', 'settings.json'), { mcpServers: {} })

    const sources = await discoverMcpClientSources({ homeDir })
    assert.deepEqual(sources.map(({ clientId, status, serverCount }) => ({ clientId, status, serverCount })), [
      { clientId: 'workbuddy', status: 'available', serverCount: 1 },
      { clientId: 'codebuddy', status: 'available', serverCount: 1 },
      { clientId: 'trae', status: 'manual', serverCount: 0 },
      { clientId: 'qoder', status: 'empty', serverCount: 0 },
    ])
    assert.doesNotMatch(JSON.stringify(sources), /work-secret|Jerrymu|mcp\.json/u)

    const codebuddy = await readMcpClientSource('codebuddy', { homeDir })
    assert.match(codebuddy.text, /primary\.mjs/u)
    assert.doesNotMatch(codebuddy.text, /fallback\.mjs/u)
  } finally {
    await rm(homeDir, { recursive: true, force: true })
  }
})

test('client source discovery distinguishes missing, manual and invalid sources', async () => {
  const homeDir = await mkdtemp(join(tmpdir(), 'dsh-mcp-clients-'))
  try {
    await writeJson(join(homeDir, '.qoder', 'settings.json'), '{ invalid json')
    const sources = await discoverMcpClientSources({ homeDir })
    assert.equal(sources.find((item) => item.clientId === 'workbuddy').status, 'not-found')
    assert.equal(sources.find((item) => item.clientId === 'trae').status, 'manual')
    assert.equal(sources.find((item) => item.clientId === 'qoder').status, 'invalid')
    await assert.rejects(readMcpClientSource('trae', { homeDir }), /manual source selection/u)
    await assert.rejects(readMcpClientSource('unknown', { homeDir }), /unsupported MCP client/u)
  } finally {
    await rm(homeDir, { recursive: true, force: true })
  }
})

test('native file sources reuse JSONC parsing and expose no local path metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-picked-mcp-'))
  try {
    const path = join(root, 'project.mcp.jsonc')
    await writeJson(path, `{
      "mcpServers": {
        "project": { "type": "http", "url": "https://example.com/mcp", },
      },
    }`)
    const source = await readMcpSourceFile({ clientId: 'trae', filePath: path })
    assert.equal(source.clientId, 'trae')
    assert.equal(source.scope, 'selected-file')
    assert.equal(source.serverCount, 1)
    assert.equal('path' in source, false)
    assert.match(source.text, /project/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
