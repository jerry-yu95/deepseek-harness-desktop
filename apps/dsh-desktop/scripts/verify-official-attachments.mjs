import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { MODEL } from '../test/helpers/composer-model-fixture.mjs'
import { buildNativeFilePasteScript } from '../src/native-file-paste.mjs'
import { createE2eArtifacts, captureE2eScreenshot } from './e2e-artifacts.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'jiwei-official-attachments-'))
const artifacts = await createE2eArtifacts('official-attachments')
const dshHome = join(temporary, 'dsh-home'), workspace = join(temporary, 'synthetic-workspace')
let app, passed = false
try {
  await mkdir(dshHome, { recursive: true })
  await mkdir(workspace, { recursive: true })
  await writeFile(join(workspace, 'workspace-preview.txt'), 'JIWEI_WORKSPACE_FILE_PREVIEW\nSynthetic workspace content.')
  await writeFile(join(dshHome, 'settings.yaml'), "locale:\n  preference: zh\nui-onboarding:\n  welcomeNoticeVersion: '2026-08-13.1'\nagent-default-model:\n  provider: composer-fixture\n  model: " + JSON.stringify(MODEL) + '\n')
  await writeFile(join(dshHome, 'cordis.patch.yml'), '- insert:\n    - id: composer-model-fixture\n      name: ' + JSON.stringify(resolve(appDir, 'test/helpers/composer-model-fixture.mjs')) + '\n')
  app = await electron.launch({
    executablePath: process.env.DSH_DESKTOP_E2E_EXECUTABLE || electronPath,
    args: process.env.DSH_DESKTOP_E2E_EXECUTABLE ? [] : [resolve(appDir, 'src/main.mjs')], cwd: appDir,
    env: { ...process.env, DSH_HOME: dshHome, DSH_DESKTOP_USER_DATA: join(temporary, 'user-data'), DSH_COMPOSER_E2E: '1' } })
  const page = await app.firstWindow()
  await page.addLocatorHandler(page.getByRole('button', { name: /稍后配置|Configure later/u }), button => button.click())
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 60000 })
  await page.waitForSelector('#dsh-desktop-window-chrome')
  await page.locator('button').filter({ hasText: /新会话/u }).first().click()
  await page.locator('[data-composer-card]').last().click()
  const picker = page.getByRole('dialog').last()
  await picker.getByRole('button', { name: /编辑路径/u }).click()
  await picker.locator('input').fill(workspace)
  await picker.locator('input').press('Enter')
  await picker.getByRole('button', { name: /^打开$/u }).click()
  await picker.waitFor({ state: 'detached' })
  const card = page.locator('[data-composer-card]').last()
  const editor = card.locator('[data-composer-input][contenteditable="true"]')
  await editor.waitFor({ timeout: 20000 })
  await editor.fill('Synthetic attachment request ')
  await page.evaluate(buildNativeFilePasteScript([{ name: 'native-fixture.json', type: 'application/json', bytes: Buffer.from('{"fixture":true}') }]))
  await card.locator('[data-composer-chip="local-file-attachment"]').getByText('native-fixture.json', { exact: true }).waitFor({ timeout: 15000 })
  console.log('PASS native file paste inserts a reference in the official rich text editor')
  await card.locator('input[type="file"]').setInputFiles({ name: 'official-fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('JIWEI_OFFICIAL_ATTACHMENT_PREVIEW\nSynthetic file content.') })
  await card.getByText('official-fixture.txt', { exact: true }).waitFor({ timeout: 15000 })
  await page.screenshot({ path: join(artifacts, 'draft.png') })
  await card.getByRole('button', { name: /发送消息/u }).click()
  await page.getByText('JIWEI_COMPOSER_FIXTURE', { exact: false }).first().waitFor({ timeout: 20000 })
  await page.locator('[data-message-attachments]').getByText('official-fixture.txt', { exact: true }).waitFor({ timeout: 20000 })
  console.log('PASS official file upload survives submission as a durable attachment card')
  // rc.2 file attachment cards are metadata-only spans. The official side
  // preview opens workspace files; do not invent a click action on attachments.
  await page.getByText('workspace-preview.txt', { exact: true }).first().click()
  await page.getByText('JIWEI_WORKSPACE_FILE_PREVIEW', { exact: false }).first().waitFor({ timeout: 20000 })
  console.log('PASS official workspace side preview retains synthetic content')
  await page.screenshot({ path: join(artifacts, 'preview.png') })
  assert.deepEqual(errors, [])
  passed = true
} finally {
  await captureE2eScreenshot(app, join(artifacts, passed ? 'final.png' : 'failure.png'))
  await writeFile(join(artifacts, 'result.json'), JSON.stringify({ status: passed ? 'passed' : 'failed' }))
  console.log('Fixture artifacts: ' + artifacts)
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
