import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

import { buildNativeFilePasteScript, prepareClipboardFiles } from '../src/native-file-paste.mjs'
import { projectWeChatArticle } from '../src/knowledge-browser-import.mjs'
import { createFakeMcpServer } from '../test/helpers/fake-mcp-server.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'jiwei-0.1.45-acceptance-'))
const dshHome = join(temporary, 'dsh-home')
const fakeMcp = await createFakeMcpServer('success')
let electronApp
let completed = 0

async function check(name, operation) {
  await operation()
  completed += 1
  console.log(`PASS ${name}`)
}

try {
  await mkdir(dshHome, { recursive: true })
  await writeFile(join(dshHome, 'settings.yaml'), "ui-onboarding:\n  welcomeNoticeVersion: '2026-08-13.1'\n", 'utf8')
  const filePath = join(temporary, 'mcp.json')
  await writeFile(filePath, '{"mcpServers":{"fixture_remote":{"url":"loopback"}}}\n', 'utf8')
  await check('native file reference keeps basename and MIME', async () => {
    const [file] = await prepareClipboardFiles([filePath])
    assert.equal(file.name, 'mcp.json')
    assert.equal(file.type, 'application/json')
    const script = buildNativeFilePasteScript([file])
    assert.match(script, /mcp\.json/u)
    assert.doesNotMatch(script, new RegExp(temporary.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')))
  })

  const articleBody = await readFile(new URL('../../../packages/dsh-knowledge/tests/fixtures/wechat-article.html', import.meta.url), 'utf8')
  const articleContent = articleBody
    .match(/<div id="js_content">([\s\S]*?)<\/div>/u)?.[1]
    ?.replace(/<script[\s\S]*?<\/script>/giu, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  const importedArticle = projectWeChatArticle({
    title: articleBody.match(/<h1 id="activity-name">([^<]+)<\/h1>/u)?.[1],
    author: articleBody.match(/<span id="js_name">([^<]+)<\/span>/u)?.[1],
    text: articleContent,
  }, new URL('https://mp.weixin.qq.com/s/fixture'))
  await check('WeChat fixture becomes bounded URL knowledge', async () => {
    assert.equal(importedArticle.source.kind, 'url')
    assert.equal(importedArticle.title, '从对话到知识')
    assert.match(importedArticle.content, /把经验变成可复用资产/u)
    assert.doesNotMatch(importedArticle.snapshot, /this content must not be imported/u)
  })

  electronApp = await electron.launch({
    executablePath: process.env.DSH_DESKTOP_E2E_EXECUTABLE || electronPath,
    args: process.env.DSH_DESKTOP_E2E_EXECUTABLE ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: join(temporary, 'user-data'),
      DSH_HOME: dshHome,
    },
  })
  const page = await electronApp.firstWindow()
  const rendererErrors = []
  page.on('pageerror', error => rendererErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') rendererErrors.push(message.text()) })
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 60_000 })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 20_000 })

  const continueButton = page.getByRole('button', { name: /^(继续|Continue)$/u })
  if (await continueButton.count() > 0 && await continueButton.last().isVisible()) await continueButton.last().click()
  const configureLater = page.getByRole('button', { name: /稍后配置|Configure later/u })
  if (await configureLater.count() > 0 && await configureLater.last().isVisible()) await configureLater.last().click()

  const knowledgeEntry = page.locator('[data-dsh-extension-entry="knowledge"]')
  await knowledgeEntry.waitFor({ timeout: 20_000 })
  await knowledgeEntry.click()
  await page.getByRole('heading', { name: '我的大脑' }).waitFor({ timeout: 15_000 })

  await check('My Brain creates, edits, and confirms a candidate', async () => {
    await page.getByRole('button', { name: '记录或导入' }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('标题').fill('隔离验收知识')
    await dialog.getByLabel('正文').fill('这是一次仅用于自动验收的可复用知识。')
    await dialog.getByLabel('分类').fill('验收')
    await dialog.getByLabel('标签').fill('隔离,回归')
    await dialog.getByRole('button', { name: '保存为待确认' }).click()
    await page.getByRole('heading', { name: '隔离验收知识', exact: true }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '编辑' }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('正文').fill('这是编辑后的隔离验收知识。')
    await dialog.getByRole('button', { name: '保存修改' }).click()
    await page.getByText('这是编辑后的隔离验收知识。').waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '确认沉淀' }).click()
    await page.getByRole('tab', { name: /已沉淀/u }).click()
    await page.getByRole('heading', { name: '隔离验收知识', exact: true }).waitFor({ timeout: 10_000 })
  })

  const connectorJson = JSON.stringify({ mcpServers: { fixture_remote: { url: fakeMcp.url } } })
  await page.locator('[data-dsh-extension-entry="connectors"]').click()
  await page.getByRole('button', { name: '导入 MCP JSON' }).waitFor({ timeout: 15_000 })
  await check('Connector preview and MCP status use the fake loopback server', async () => {
    await page.getByRole('button', { name: '导入 MCP JSON' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('MCP JSON').fill(connectorJson)
    await dialog.getByRole('button', { name: '预览配置' }).click()
    await dialog.getByText('fixture_remote').waitFor({ timeout: 10_000 })
    const result = await page.evaluate(async (text) => {
      const bridge = window.dshDesktop
      if (bridge?.testMcpJson === undefined) throw new Error('desktop MCP test bridge unavailable')
      return bridge.testMcpJson({ text })
    }, connectorJson)
    assert.equal(result.results.length, 1)
    assert.equal(result.results[0].result.ok, true)
    assert.equal(result.results[0].result.state, 'ready')
    await dialog.getByRole('button', { name: '关闭' }).click()
  })

  assert.deepEqual(rendererErrors, [], `renderer errors: ${rendererErrors.join('; ')}`)
  console.log(`JIWEI isolated acceptance passed: ${completed} scenarios`)
} finally {
  await electronApp?.close()
  await fakeMcp.close()
  await rm(temporary, { recursive: true, force: true })
}
