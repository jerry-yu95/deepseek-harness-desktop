import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-directory-picker-e2e-'))
const dshHome = resolve(temporary, 'dsh-home')
let electronApp

try {
  await mkdir(dshHome, { recursive: true })
  await writeFile(
    resolve(dshHome, 'settings.yaml'),
    "ui-onboarding:\n  welcomeNoticeVersion: '2026-08-13.1'\n",
  )
  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'),
      DSH_HOME: dshHome,
    },
  })
  const page = await electronApp.firstWindow()
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 60_000 })
  await page.waitForSelector('#dsh-desktop-window-chrome')

  const addWorkspace = page.getByRole('button', { name: /add workspace|添加工作区/u })
  assert.equal(await addWorkspace.count(), 1, 'add workspace button not found')
  await addWorkspace.dispatchEvent('click')

  const dialog = page.getByRole('dialog').filter({ hasText: /folder|directory|文件夹|目录/u })
  await dialog.waitFor({ timeout: 10_000 })
  const dialogText = await dialog.textContent()
  assert.match(dialogText ?? '', /folder|directory|文件夹|目录/u)
  assert.doesNotMatch(dialogText ?? '', /win32 folder dialog worker|directory picker failed/u)
  assert.equal(
    await dialog.getByRole('button', { name: /new folder|新建文件夹/u }).count(),
    1,
    'browse picker should expose folder creation',
  )
  await dialog.getByRole('button', { name: /edit path|编辑路径/u }).click()
  assert.equal(await dialog.locator('input').count(), 1, 'browse picker should expose a path editor')
  console.log('verified official in-app directory browser without the native Win32 worker')
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
