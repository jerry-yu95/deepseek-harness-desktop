import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { BoundedLogStore } from '../src/log-store.mjs'
import { ensureDesktopProfile, resolveDshCliPath } from '../src/profile.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'

test('official DSH host serves the complete desktop profile', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-runtime-'))
  const logs = new BoundedLogStore({ directory: join(root, 'logs') })
  let controller
  try {
    await ensureDesktopProfile({ dshHome: root })
    controller = new DshRuntimeController({
      cliPath: resolveDshCliPath(),
      cwd: process.cwd(),
      dshHome: root,
      logStore: logs,
      startupTimeoutMs: 45_000,
    })
    const url = await controller.start()
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    assert.equal(response.ok, true)
    assert.match(await response.text(), /__DSH_BOOT__/)

    const themeState = await fetch(new URL('/api/adaptive-theme/state', url))
    assert.equal(themeState.status, 200)
    assert.deepEqual(await themeState.json(), { ok: true, enabled: false })

    const applyTheme = await fetch(new URL('/api/adaptive-theme/apply', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mime: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+OtvxAAAAAElFTkSuQmCC',
        palette: {
          mode: 'dark', accent: '#74a7ff', accentHover: '#8bb6ff', surface: '#0a101c',
          surfaceStrong: '#1e2738', text: '#f5f8ff', muted: '#aeb8ca', border: '#566077',
          scrim: 'rgba(5, 10, 20, 0.52)',
        },
      }),
    })
    assert.equal(applyTheme.status, 200)
    const applied = await applyTheme.json()
    assert.equal(applied.enabled, true)
    const image = await fetch(new URL(applied.imageUrl, url))
    assert.equal(image.headers.get('content-type'), 'image/png')
    assert.ok((await image.arrayBuffer()).byteLength > 0)
    const restoreTheme = await fetch(new URL('/api/adaptive-theme/restore', url), { method: 'POST' })
    assert.equal(restoreTheme.status, 200)
    assert.deepEqual(await restoreTheme.json(), { ok: true, enabled: false })
  } catch (error) {
    error.message = `${error.message}\nRecent runtime log:\n${await logs.tail(80)}`
    throw error
  } finally {
    await controller?.stop()
    await rm(root, { recursive: true, force: true })
  }
})
