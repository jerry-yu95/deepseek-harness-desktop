import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Evidence lives outside disposable profiles and each invocation gets a new directory.
export async function createE2eArtifacts(suite, { root = process.env.DSH_E2E_ARTIFACTS_ROOT || tmpdir() } = {}) {
  if (typeof suite !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(suite)) {
    throw new TypeError('Invalid E2E suite name')
  }
  await mkdir(root, { recursive: true })
  return mkdtemp(join(root, `jiwei-${suite}-`))
}

export async function captureE2eScreenshot(app, path) {
  // A closed/crashed window must not replace the original assertion failure.
  if (app) await app.firstWindow({ timeout: 3000 }).then(page => page.screenshot({ path, timeout: 5000 })).catch(() => {})
}
