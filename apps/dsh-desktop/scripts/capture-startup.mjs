import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const extensionMode = process.argv.includes('--extensions')
const outputArgument = process.argv.find((argument) => argument.toLowerCase().endsWith('.png'))
const output = resolve(outputArgument || (extensionMode ? 'extensions-preview.png' : 'startup-preview.png'))
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-desktop-capture-'))
let electronApp
try {
  electronApp = await electron.launch({
    executablePath: electronPath,
    args: [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_HOLD_STARTUP: '1',
      DSH_DESKTOP_OPEN_EXTENSIONS: extensionMode ? '1' : '0',
      DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'),
      DSH_HOME: resolve(temporary, 'dsh-home'),
    },
  })
  const firstWindow = await electronApp.firstWindow()
  let page = firstWindow
  if (extensionMode) {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const extensionPage = electronApp.windows().find((candidate) => candidate.url().includes('extensions.html'))
      if (extensionPage) {
        page = extensionPage
        break
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
    }
    if (!page.url().includes('extensions.html')) throw new Error('extension window did not open')
  }
  await page.waitForLoadState('domcontentloaded')
  if (extensionMode) {
    await page.waitForFunction(() => document.body.dataset.busy !== 'true' && document.querySelector('#plugin-count')?.textContent !== '0')
    await page.locator('[data-tab="connectors"]').click()
    await page.getByText('连接器中心', { exact: true }).waitFor()
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: output })
  console.log(`captured startup UI: ${output}`)
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
