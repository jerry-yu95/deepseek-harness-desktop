import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import test from 'node:test'
import { resolveRuntimePackages } from '../src/profile.mjs'

const roots = resolveRuntimePackages()
async function sdk(name) {
  const require = createRequire(join(roots.get(name), 'package.json'))
  return import(pathToFileURL(require.resolve(name)).href)
}

for (const version of [0, 1, 2]) for (const compression of ['none', 'zstd']) {
test(`v${version} ${compression}: non-publishing read, retained predecessor, V3 restart and downgrade refusal`, { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jiwei-session-v3-'))
  try {
    const directory = join(root, '_no-cwd', 'synthetic-upgrade')
    await mkdir(directory, { recursive: true })
    const rows = [
      { type: 'session', version, id: 'synthetic-upgrade', createdAt: 1000, ...(version === 2 ? { isSeeded: false } : {}), delegationDepth: 0 },
      { type: 'turn/start', seq: 0, time: 1000, data: { turn: 1 } },
      { type: 'step/start', seq: 1, time: 1001, data: { turn: 1, step: 1 } },
      { type: 'request/header', seq: 2, time: 1002, data: { header: { config: { provider: 'fixture', model: 'fixture' }, system: 'Synthetic instructions' }, reason: 'initial' } },
      { type: 'user/message', seq: 3, time: 1100, surfaceOp: 'append', data: { id: 'fixture-user', role: 'user', content: [{ type: 'text', text: 'Synthetic retained fact' }], source: { kind: 'user' } } },
    ]
    const encode = text => compression === 'none' ? Buffer.from(text) : zstdCompressSync(Buffer.from(text), { params: { [constants.ZSTD_c_checksumFlag]: 1 } })
    const decode = bytes => (compression === 'none' ? bytes : zstdDecompressSync(bytes)).toString('utf8')
    const suffix = compression === 'none' ? '.jsonl' : '.jsonl.zstd'
    const priorName = (version === 0 ? 'session' : `session.v${version}`) + suffix
    // The official compressed layout owns a header-only first frame.
    const original = Buffer.concat(rows.map(row => encode(JSON.stringify(row) + '\n')))
    const priorPath = join(directory, priorName)
    await writeFile(priorPath, original)
    const { Context } = await sdk('@deepseek-ai/cordis')
    const { default: Backend } = await sdk('@deepseek-ai/dsh-session-persistence-jsonl')
    const openBackend = async () => {
      const ctx = new Context()
      await ctx.plugin(Backend, { root, compression })
      return ctx.sessionPersistence
    }
    const backend = await openBackend()
    const reader = await backend.open('synthetic-upgrade', 'read')
    assert.equal(reader.header.version, 3)
    const before = await reader.read()
    assert.ok(before.events.some(event => event.type === 'system/message'))
    assert.ok(JSON.stringify(before.events).includes('Synthetic retained fact'))
    assert.ok(!before.events.some(event => event.type === 'request/header' && 'system' in event.data.header))
    await reader.close()
    assert.deepEqual(await readdir(directory), [priorName])
    const writer = await backend.open('synthetic-upgrade', 'write')
    await writer.flush()
    await writer.close()
    assert.deepEqual(await readFile(priorPath), original)
    assert.ok((await readdir(directory)).includes('session.v3' + suffix))
    const { releasedV2SessionFormatCodec } = await sdk('@deepseek-ai/dsh-session-format-v1-to-v2')
    const currentHeader = JSON.parse(decode(await readFile(join(directory, 'session.v3' + suffix))).split('\n')[0])
    assert.throws(() => releasedV2SessionFormatCodec.decodeHeader(currentHeader), /v2|header|version/i)
    const restarted = await openBackend()
    const resumed = await restarted.open('synthetic-upgrade', 'read')
    assert.deepEqual((await resumed.read()).events, before.events)
    await resumed.close()
    // Future generations fail closed; a retained predecessor is not a fallback.
    await writeFile(join(directory, 'session.v999' + suffix), encode(JSON.stringify({ ...rows[0], version: 999 }) + '\n'))
    await assert.rejects((await openBackend()).open('synthetic-upgrade', 'read'), /version|format|support|future/i)
    assert.deepEqual(await readFile(priorPath), original)
  } finally { await rm(root, { recursive: true, force: true }) }
})
}
