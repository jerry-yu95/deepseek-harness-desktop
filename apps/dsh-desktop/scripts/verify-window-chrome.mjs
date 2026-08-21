import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const screenshotArgument = process.argv.find((argument) => argument.toLowerCase().endsWith('.png'))
const screenshot = screenshotArgument ? resolve(screenshotArgument) : undefined
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-window-chrome-e2e-'))
let electronApp

try {
  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'),
      DSH_HOME: resolve(temporary, 'dsh-home'),
    },
  })
  const page = await electronApp.firstWindow()
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 60_000 })
  await page.waitForSelector('#dsh-desktop-window-chrome')
  const state = await page.evaluate(() => ({
    chromeCount: document.querySelectorAll('#dsh-desktop-window-chrome').length,
    context: document.querySelector('.dsh-window-chrome-context')?.textContent,
    paddingTop: getComputedStyle(document.body).paddingTop,
    url: location.origin,
  }))
  assert.equal(state.context, 'Web Surface')
  assert.equal(state.paddingTop, '46px')
  assert.equal(state.chromeCount, 1)
  const nativeWindowState = await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return {
      closable: window.isClosable(),
      maximizable: window.isMaximizable(),
      menuBarVisible: window.isMenuBarVisible(),
      minimizable: window.isMinimizable(),
    }
  })
  assert.deepEqual(nativeWindowState, {
    closable: true,
    maximizable: true,
    menuBarVisible: false,
    minimizable: true,
  })
  if (screenshot) await page.screenshot({ path: screenshot })
  console.log(`verified runtime window chrome at ${state.url}`)
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
