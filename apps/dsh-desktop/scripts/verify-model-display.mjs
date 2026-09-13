import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { captureE2eScreenshot, createE2eArtifacts } from './e2e-artifacts.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'jiwei-model-display-'))
const artifacts = await createE2eArtifacts('model-display')
const dshHome = join(temporary, 'dsh-home')
let app, passed = false
try {
  await mkdir(dshHome, { recursive: true })
  await writeFile(join(dshHome, 'settings.yaml'), "locale:\n  preference: zh\nui-onboarding:\n  welcomeNoticeVersion: '2026-08-13.1'\nllm-pi-ai:\n  providers:\n    xiaomi-token-plan-ams:\n      apiKeyEnv: XIAOMI_TOKEN_PLAN_AMS_API_KEY\n", { mode: 0o600 })
  await writeFile(join(dshHome, '.credentials.yaml'), 'version: 1\nrefs:\n  XIAOMI_TOKEN_PLAN_AMS_API_KEY: synthetic-saved-fixture\n', { mode: 0o600 })
  app = await electron.launch({ executablePath: electronPath, args: [resolve(appDir, 'src/main.mjs')], cwd: appDir, env: { ...process.env, DSH_DESKTOP_USER_DATA: join(temporary, 'user-data'), DSH_HOME: dshHome } })
  const page = await app.firstWindow()
  await page.addLocatorHandler(page.getByRole('button', { name: /稍后配置|Configure later/u }), async button => { await button.click() })
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 60_000 })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 20_000 })
  const next = page.getByRole('button', { name: /^(继续|Continue)$/u })
  if (await next.count() && await next.last().isVisible()) await next.last().click()
  await page.getByText(/^(设置|Settings)$/u).last().click()
  await page.getByRole('button', { name: /^(模型|Models)$/u }).click()
  await page.getByRole('button', { name: '编辑 xiaomi-token-plan-ams', exact: true }).click()
  // Password inputs do not have an implicit textbox role.
  const password = page.locator('input[aria-label="API 密钥"]')
  await password.waitFor({ timeout: 15_000 })
  await page.getByText(/留空使用默认地址：https:\/\//u).waitFor()
  assert.equal(await password.inputValue(), '')
  await page.getByRole('button', { name: '显示 API 密钥', exact: true }).click()
  const saved = page.getByLabel('临时显示的已保存密钥')
  await saved.waitFor()
  assert.equal(await saved.inputValue(), 'synthetic-saved-fixture')
  assert.equal(await password.inputValue(), '', 'saved key must never populate the editable draft')
  await page.getByRole('button', { name: '隐藏 API 密钥', exact: true }).click()
  await saved.waitFor({ state: 'hidden' })
  assert.equal(await saved.inputValue(), '')
  await password.fill('synthetic-draft-fixture')
  await page.getByRole('button', { name: '显示 API 密钥', exact: true }).click()
  assert.equal(await password.getAttribute('type'), 'text')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  assert.equal(await password.getAttribute('type'), 'password')
  await password.fill('')
  await page.screenshot({ path: join(artifacts, 'model-default-and-eye.png') })
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '添加提供方', exact: true }).click()
  await page.getByRole('combobox', { name: '提供方', exact: true }).selectOption('openai')
  await page.getByText('留空使用默认地址：https://api.openai.com/v1', { exact: true }).waitFor()
  await password.fill('synthetic-new-fixture')
  await page.getByRole('button', { name: '显示 API 密钥', exact: true }).click()
  assert.equal(await password.getAttribute('type'), 'text')
  const aligned = await page.getByRole('button', { name: '隐藏 API 密钥', exact: true }).evaluate(button => {
    const input = document.querySelector('input[aria-label="API 密钥"]')
    const b = button.getBoundingClientRect(), i = input.getBoundingClientRect()
    return b.left >= i.left && b.right <= i.right && Math.abs((b.top + b.height / 2) - (i.top + i.height / 2)) < 2
  })
  assert.equal(aligned, true, 'eye is aligned within the key field')
  await page.getByRole('button', { name: '隐藏 API 密钥', exact: true }).click()
  await password.fill('')
  await page.screenshot({ path: join(artifacts, 'preset-default-and-eye.png') })
  // Only synthetic values were used; no inference request is made.
  passed = true
  console.log('PASS real provider editor: inherited endpoint, saved key, draft key, concealment')
} finally {
  await captureE2eScreenshot(app, join(artifacts, passed ? 'final.png' : 'failure.png'))
  await writeFile(join(artifacts, 'result.json'), JSON.stringify({ suite: 'model-display', status: passed ? 'passed' : 'failed' }, null, 2))
  console.log('Fixture artifacts: ' + artifacts)
  try { await app?.close() } finally { await rm(temporary, { recursive: true, force: true }) }
}
