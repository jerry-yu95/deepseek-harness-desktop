import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { MODEL } from '../test/helpers/composer-model-fixture.mjs'
import { captureE2eScreenshot, createE2eArtifacts } from './e2e-artifacts.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'jiwei-composer-layout-'))
const dshHome = join(temporary, 'dsh-home')
const workspace = join(temporary, 'synthetic-workspace')
const measurements = []
const locale = process.env.DSH_COMPOSER_LOCALE === 'en' ? 'en' : 'zh'
const artifacts = await createE2eArtifacts('composer-' + locale)
let electronApp
let passed = false

async function measure(page, state) {
  const card = page.locator('[data-composer-card]').last()
  const result = await card.evaluate(element => {
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, center: r.y + r.height / 2 } }
    const row = element.querySelector('[class$="_row"]')
    const tools = row?.querySelector('[class$="_tools"]')
    const trailing = row?.querySelector('[class$="_trailing"]')
    if (!tools || !trailing) throw new Error('Official composer row unavailable')
    return { card: rect(element), tools: rect(tools), trailing: rect(trailing), delta: Math.abs(rect(tools).center - rect(trailing).center), rowWidth: rect(row).width,
      controls: [...row.querySelectorAll('button,select')].filter(node => node.getBoundingClientRect().width > 0).map(node => ({ ...rect(node), label: node.getAttribute('aria-label'), className: node.className })),
      styles: { wrap: getComputedStyle(row).flexWrap, toolsWidth: getComputedStyle(tools).width, trailingWidth: getComputedStyle(trailing).width } }
  })
  measurements.push({ state, ...result })
  await page.screenshot({ path: join(artifacts, state + '.png') })
  if (process.env.DSH_COMPOSER_PROBE === '1') return
  for (const control of result.controls) assert.ok(control.x >= result.card.x - 1 && control.x + control.width <= result.card.x + result.card.width + 1, 'Control overflows in ' + state)
  if (result.rowWidth >= 560) assert.ok(result.delta <= 2, 'Composer vertical delta ' + result.delta.toFixed(2) + 'px in ' + state)
  else assert.ok(result.trailing.y >= result.tools.y + result.tools.height, 'Narrow composer must use two deliberate rows in ' + state)
}

try {
  await mkdir(dshHome, { recursive: true })
  await mkdir(workspace, { recursive: true })
  await writeFile(join(dshHome, 'settings.yaml'), "locale:\n  preference: " + locale + "\nui-onboarding:\n  welcomeNoticeVersion: '2026-08-13.1'\nagent-default-model:\n  provider: composer-fixture\n  model: " + JSON.stringify(MODEL) + "\n")
  await writeFile(join(dshHome, 'cordis.patch.yml'), '- insert:\n    - id: composer-model-fixture\n      name: ' + JSON.stringify(resolve(appDir, 'test/helpers/composer-model-fixture.mjs')) + '\n')
  electronApp = await electron.launch({ executablePath: electronPath, args: [resolve(appDir, 'src/main.mjs')], cwd: appDir,
    env: { ...process.env, DSH_DESKTOP_USER_DATA: join(temporary, 'user-data'), DSH_HOME: dshHome, DSH_COMPOSER_E2E: '1' } })
  const page = await electronApp.firstWindow()
  await page.addLocatorHandler(page.getByRole('button', { name: /稍后配置|Configure later/u }), button => button.click())
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 60_000 })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 20_000 })
  await page.waitForFunction(locale => document.documentElement.lang.startsWith(locale), locale)
  await page.locator('button').filter({ hasText: /新会话|New session/iu }).first().click()
  await page.locator('[data-composer-card]').last().click()
  const picker = page.getByRole('dialog').last()
  await picker.getByRole('button', { name: /编辑路径|Edit path/iu }).click()
  await picker.locator('input').fill(workspace)
  await picker.locator('input').press('Enter')
  await picker.getByRole('button', { name: /^打开$|^Open$/u }).click()
  await picker.waitFor({ state: 'detached' })
  const card = page.locator('[data-composer-card]').last()
  await card.getByText(MODEL, { exact: true }).waitFor({ timeout: 20_000 })
  for (const [width, height, label] of [[1280, 800, 'wide'], [1024, 768, 'laptop'], [800, 700, 'narrow']]) {
    await electronApp.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height })
    await page.waitForFunction(width => innerWidth === width, width)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await measure(page, label + '-empty')
    const previousOutputs = await page.getByText(/JIWEI_COMPOSER_FIXTURE/u).count()
    await card.locator('[data-composer-input]').fill('合成布局测试 Synthetic layout test')
    await card.getByRole('button', { name: /发送消息|Send message/iu }).click()
    await measure(page, label + '-submitted')
    await page.waitForFunction(count => document.body.innerText.split('JIWEI_COMPOSER_FIXTURE').length - 1 > count, previousOutputs, { timeout: 20_000 })
    const stop = card.getByRole('button', { name: /停止|Stop/u }).first()
    await stop.waitFor({ timeout: 10_000 })
    await measure(page, label + '-streaming')
    await card.locator('[data-composer-input]').fill('流式中继续输入 Draft while streaming')
    await measure(page, label + '-streaming-draft')
    // New InputBar switches the primary action to queue-send while a draft
    // exists. Clear it to expose the stop action before testing cancellation.
    await card.locator('[data-composer-input]').fill('')
    await stop.click()
    await stop.waitFor({ state: 'detached', timeout: 10_000 })
    await card.locator('[data-composer-input]').fill('')
    await measure(page, label + '-stopped')
  }
  passed = true
  console.log((process.env.DSH_COMPOSER_PROBE === '1' ? 'Composer measurements collected: ' : 'Composer acceptance passed: ') + measurements.length + ' states (' + locale + ')')
} finally {
  try {
    await captureE2eScreenshot(electronApp, join(artifacts, passed ? 'final.png' : 'failure.png'))
    await writeFile(join(artifacts, 'geometry.json'), JSON.stringify(measurements, null, 2))
    await writeFile(join(artifacts, 'result.json'), JSON.stringify({ suite: 'composer', status: !passed ? 'failed' : process.env.DSH_COMPOSER_PROBE === '1' ? 'probe' : 'passed', measured: measurements.length, expected: 15, locale }, null, 2))
    console.log('Composer artifacts: ' + artifacts)
  } finally {
    try { await electronApp?.close() } finally { await rm(temporary, { recursive: true, force: true }) }
  }
}
