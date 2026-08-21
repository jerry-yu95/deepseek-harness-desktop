import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const screenshot = process.argv.find(argument => argument.toLowerCase().endsWith('.png'))
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-adaptive-theme-e2e-'))
const dshHome = resolve(temporary, 'dsh-home')
let electronApp

try {
  await mkdir(dshHome, { recursive: true })
  await writeFile(resolve(dshHome, 'settings.yaml'), "ui-onboarding:\n  welcomeNoticeVersion: '2026-08-13.1'\n")
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
  const rendererErrors = []
  page.on('pageerror', error => rendererErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') rendererErrors.push(message.text()) })
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 60_000 })
  await page.waitForSelector('#dsh-desktop-window-chrome')
  if (process.env.DSH_E2E_DEBUG === '1') await page.screenshot({ path: '/private/tmp/dsh-adaptive-theme-before.png' })

  const continueButton = page.getByRole('button', { name: /^(继续|Continue)$/u })
  if (await continueButton.count() > 0 && await continueButton.last().isVisible()) {
    await continueButton.last().click()
  }
  const configureLater = page.getByRole('button', { name: /稍后配置|Configure later/u })
  if (await configureLater.count() > 0 && await configureLater.last().isVisible()) {
    await configureLater.last().click()
  }

  const settings = page.getByText(/^(设置|Settings)$/u).last()
  await settings.waitFor({ timeout: 15_000 })
  // A first-run announcement may temporarily leave a presentation mask over
  // the sidebar. Invoke the already-visible controls directly so this test is
  // about the settings surface rather than onboarding copy revisions.
  await settings.click({ force: true })
  await page.getByText(/^(插件|Plugins)$/u).last().click({ force: true })
  const webUi = page.getByText(/^Web UI 插件$/u)
  await webUi.waitFor({ timeout: 10_000 })
  await webUi.click({ force: true })
  if (process.env.DSH_E2E_DEBUG === '1') {
    await page.waitForTimeout(500)
    await page.screenshot({ path: '/private/tmp/dsh-adaptive-theme-settings.png' })
    console.log(`renderer errors: ${JSON.stringify(rendererErrors)}`)
  }

  const title = page.getByRole('button', { name: /自定义皮肤|Custom Theme/u })
  await title.waitFor({ timeout: 10_000 })
  assert.equal(await title.count(), 1, 'adaptive theme card should render exactly once')
  await title.click()
  assert.equal(await page.getByText(/选择皮肤图片|Choose theme image/u).count(), 1)
  const fileInput = page.locator('input[type="file"][accept*="image/png"]')
  assert.equal(await fileInput.count(), 1)
  await fileInput.setInputFiles(resolve(appDir, '..', '..', 'gallery', 'ai-harness-neon-garden-theme.png'))
  const visibility = page.locator('input[type="range"]')
  await visibility.waitFor({ timeout: 10_000 })
  assert.equal(await visibility.inputValue(), '82')
  await visibility.fill('96')
  assert.equal(await page.locator('body').getAttribute('data-dsh-adaptive-theme'), '')
  const runtimeCss = await page.locator('#dsh-adaptive-theme-runtime').textContent()
  assert.match(runtimeCss ?? '', /rgba\(5,10,20,0\.04\)/u)
  assert.match(runtimeCss ?? '', /blob:/u)
  if (screenshot) {
    await page.getByRole('button', { name: /关闭|Close/u }).last().click({ force: true }).catch(async () => {
      await page.locator('button').filter({ hasText: '×' }).last().click({ force: true })
    })
    await page.waitForTimeout(300)
    await page.screenshot({ path: resolve(screenshot) })
  }
  console.log('verified adaptive-theme upload preview and live wallpaper visibility in the real DSH settings UI')
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
