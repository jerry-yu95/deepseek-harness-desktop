import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BoundedLogStore } from '../src/log-store.mjs'
import { ensureDesktopProfile, resolveDshCliPath } from '../src/profile.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'

const root = await mkdtemp(join(tmpdir(), 'dsh-personal-remote-'))
const logs = new BoundedLogStore({ directory: join(root, 'logs') })
let controller

async function waitForPublicBase(localBase) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(new URL('/api/pair/status', localBase), { signal: AbortSignal.timeout(4_000) })
    if (response.ok) {
      const snapshot = await response.json()
      if (snapshot.publicUrl && snapshot.tunnel?.state === 'running') return snapshot.publicUrl
      if (snapshot.tunnel?.state === 'failed') throw new Error(snapshot.tunnel.error ?? 'tunnel failed')
    }
    await new Promise(resolve => setTimeout(resolve, 750))
  }
  throw new Error('timed out waiting for a verified public base')
}

try {
  await ensureDesktopProfile({ dshHome: root })
  controller = new DshRuntimeController({
    cliPath: resolveDshCliPath(),
    // Never expose the repository under test: the live tunnel points at an
    // isolated empty temporary workspace containing no user project data.
    cwd: root,
    dshHome: root,
    remoteMode: 'personal-public',
    logStore: logs,
    startupTimeoutMs: 45_000,
  })
  const localBase = await controller.start()
  const publicBase = await waitForPublicBase(localBase)

  const issueResponse = await fetch(new URL('/api/pair/issue', localBase), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(8_000),
  })
  assert.equal(issueResponse.ok, true)
  const issue = await issueResponse.json()
  assert.equal(issue.publicBaseUrl, publicBase)
  assert.equal(issue.url.startsWith(publicBase), true)

  const page = await fetch(issue.url, { signal: AbortSignal.timeout(8_000) })
  assert.equal(page.ok, true)
  assert.match(await page.text(), /__DSH_BOOT__/u)

  const accept = await fetch(new URL('/api/pair/accept', publicBase), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: issue.token }),
    redirect: 'manual',
    signal: AbortSignal.timeout(8_000),
  })
  assert.equal(accept.ok, true)
  const cookie = accept.headers.get('set-cookie') ?? ''
  assert.match(cookie, /dsh_pair=/u)
  const mobile = await fetch(new URL('/m', publicBase), {
    headers: { cookie: cookie.split(';', 1)[0] },
    signal: AbortSignal.timeout(8_000),
  })
  assert.equal(mobile.ok, true)
  assert.match(await mobile.text(), /\/m\/mobile\.js/u)
  console.log(`personal remote verified end-to-end: ${publicBase}`)
} catch (error) {
  error.message = `${error.message}\nRecent runtime log:\n${await logs.tail(120)}`
  throw error
} finally {
  await controller?.stop()
  await rm(root, { recursive: true, force: true })
}
