import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { captureE2eScreenshot, createE2eArtifacts } from './e2e-artifacts.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'jiwei-knowledge-reading-'))
const artifacts = await createE2eArtifacts('knowledge-reading')
const dshHome = join(temporary, 'dsh-home')
let electronApp
let completed = 0
let passed = false
const ARTICLE_TITLE = '隔离长文阅读验收'

async function check(name, operation) {
  try {
    await operation()
  } catch (error) {
    await captureE2eScreenshot(electronApp, join(artifacts, 'failure.png'))
    throw error
  }
  completed += 1
  console.log(`PASS ${name}`)
}

async function closeKnowledgeDialog(page, dialog) {
  await dialog.getByRole('button', { name: '关闭' }).click()
  await dialog.waitFor({ state: 'detached', timeout: 10_000 })
}

async function setZoom(electronApp, factor) {
  await electronApp.evaluate(({ BrowserWindow }, value) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.webContents.setZoomFactor(value)
  }, factor)
}

async function setContentSize(electronApp, page, width, height) {
  const actual = await electronApp.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.setContentSize(size.width, size.height)
    return window.getContentSize()
  }, { width, height })
  // macOS clamps tall native windows to the display work area. Use Chromium's
  // viewport override for the exact renderer matrix, retaining real Electron UI.
  if (actual[0] !== width || actual[1] !== height) console.log(`Native window clamped to ${actual.join('x')}; renderer viewport ${width}x${height}`)
  await page.setViewportSize({ width, height })
  await page.waitForFunction(({ width: expectedWidth, height: expectedHeight }) => innerWidth === expectedWidth && innerHeight === expectedHeight, { width, height }, { timeout: 10_000 })
}

try {
  await mkdir(dshHome, { recursive: true })
  await writeFile(join(dshHome, 'settings.yaml'), "locale:\n  preference: zh\nui-onboarding:\n  welcomeNoticeVersion: '2026-08-13.1'\n", 'utf8')
  electronApp = await electron.launch({
    executablePath: process.env.DSH_DESKTOP_E2E_EXECUTABLE || electronPath,
    args: process.env.DSH_DESKTOP_E2E_EXECUTABLE ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: join(temporary, 'user-data'),
      DSH_HOME: dshHome,
      DSH_KNOWLEDGE_E2E: '1',
    },
  })
  const page = await electronApp.firstWindow()
  await page.addLocatorHandler(page.getByRole('button', { name: /稍后配置|Configure later/u }), async button => { await button.click() })
  const rendererErrors = []
  page.on('pageerror', error => rendererErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') rendererErrors.push(message.text()) })
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 60_000 })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 20_000 })

  const continueButton = page.getByRole('button', { name: /^(继续|Continue)$/u })
  if (await continueButton.count() > 0 && await continueButton.last().isVisible()) await continueButton.last().click()
  await page.locator('[data-dsh-extension-entry="knowledge"]').click()
  await page.getByRole('heading', { name: '我的大脑', level: 2 }).waitFor({ timeout: 15_000 })

  await check('capture fits a laptop viewport and consent control remains inline', async () => {
    await setContentSize(electronApp, page, 1280, 800)
    await page.getByRole('button', { name: '记录或导入' }).click()
    const dialog = page.getByRole('dialog').last()
    await dialog.getByRole('button', { name: '导入链接' }).click()
    const bounds = await dialog.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const checkbox = element.querySelector('input[type="checkbox"]').getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, checkboxWidth: checkbox.width }
    })
    assert.ok(bounds.top >= 0 && bounds.bottom <= 800, 'capture must fit the viewport')
    assert.ok(bounds.width <= 700 && bounds.height < 650, 'URL form must remain compact')
    assert.ok(bounds.checkboxWidth <= 20, 'checkbox must not stretch to form width')
    const fieldsFit = await dialog.evaluate(element => {
      const body = element.querySelector('form > [class*="articleScroll"]')
      const bounds = body.getBoundingClientRect()
      return [...body.querySelectorAll('input:not([type="hidden"]),select')].every(field => {
        const r = field.getBoundingClientRect()
        return r.height > 0 && r.top >= bounds.top && r.bottom <= bounds.bottom
      })
    })
    assert.ok(fieldsFit, 'URL, tags, model and consent must be visible without a collapsed form body')
    await page.screenshot({ path: join(artifacts, 'knowledge-capture.png') })
    await dialog.getByRole('button', { name: '关闭' }).click()
  })

  await check('real import UI exposes fetching, structuring, summarizing and preview', async () => {
    await page.getByRole('button', { name: '记录或导入' }).click()
    const dialog = page.getByRole('dialog').last()
    await dialog.getByRole('button', { name: '导入链接' }).click()
    await dialog.getByLabel('公开 HTTPS 链接').fill('https://mp.weixin.qq.com/s/fixture')
    await dialog.getByLabel('标签').fill('原始')
    await dialog.getByLabel('摘要模型').selectOption('route_fixture')
    await dialog.getByRole('checkbox').check()
    // Observe actual rendered stages before clicking: the synthetic fetch lasts
    // only 80ms, so a locator started after the click can miss a completed stage.
    await dialog.evaluate(element => {
      element.observedStages = []
      const observer = new MutationObserver(() => {
        const stage = element.querySelector('[data-stage]')
        if (stage && stage.getBoundingClientRect().height > 0 && !element.observedStages.includes(stage.dataset.stage)) element.observedStages.push(stage.dataset.stage)
      })
      observer.observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-stage'] })
      element.stopObservingStages = () => observer.disconnect()
    })
    await dialog.getByRole('button', { name: '开始解析' }).click()
    await dialog.getByText('这是一段由隔离测试模型生成的文章摘要。', { exact: true }).waitFor({ timeout: 10_000 })
    const stages = await dialog.evaluate(element => { element.stopObservingStages(); return element.observedStages })
    assert.deepEqual(stages, ['fetching', 'structuring', 'summarizing'])
    assert.equal(await dialog.getByRole('tab', { name: 'AI 摘要' }).getAttribute('aria-selected'), 'true')
    await dialog.getByRole('heading', { name: '关键要点', exact: true }).waitFor()
    assert.equal(await dialog.locator('[class*="articleSummaryPreview"] li').count(), 4)
    await page.screenshot({ path: join(artifacts, 'knowledge-summary.png') })
    await dialog.getByRole('button', { name: '编辑摘要' }).click()
    const editor = dialog.getByRole('textbox', { name: 'AI 摘要' })
    const editorBounds = await editor.evaluate(node => {
      const rect = node.closest('[role="group"]').getBoundingClientRect()
      const panel = node.closest('[role="tabpanel"]').getBoundingClientRect()
      return { width: rect.width, height: rect.height, panelWidth: panel.width }
    })
    await page.screenshot({ path: join(artifacts, 'knowledge-summary-editor.png') })
    assert.ok(editorBounds.width >= editorBounds.panelWidth * .75 && editorBounds.height >= 240, 'summary editor must occupy a usable reading column: ' + JSON.stringify(editorBounds))
    await dialog.getByRole('button', { name: '取消编辑' }).click()
    await dialog.getByRole('tab', { name: '原文' }).click()
    const video = dialog.getByRole('figure', { name: '文章内嵌视频' })
    await video.scrollIntoViewIfNeeded()
    assert.equal(await video.getByRole('link', { name: '前往原文观看' }).count(), 1)
    assert.equal(await dialog.locator('video,iframe').count(), 0)
    await page.screenshot({ path: join(artifacts, 'knowledge-video-placeholder.png') })
    await dialog.getByRole('img', { name: '合成文章配图', exact: true }).scrollIntoViewIfNeeded()
    await page.waitForFunction(() => { const image = document.querySelector('img[alt="合成文章配图"]'); return image?.complete && image.naturalWidth === 480 })
    await dialog.getByRole('img', { name: '图片暂时无法读取: 合成失败配图' }).waitFor()
    await page.screenshot({ path: join(artifacts, 'knowledge-images.png') })
    await dialog.getByRole('img', { name: '图片暂时无法读取: 合成失败配图' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(artifacts, 'knowledge-image-unavailable.png') })
    const reader = dialog.locator('[role="tabpanel"]')
    await setContentSize(electronApp, page, 1280, 800)
    const before = await reader.evaluate(element => element.scrollTop)
    await reader.hover()
    await page.mouse.wheel(0, 1800)
    await page.waitForFunction(before => document.querySelector('[role="tabpanel"]')?.scrollTop > before, before, { timeout: 10_000 })
    const after = await reader.evaluate(element => element.scrollTop)
    assert.ok(after > before, 'article reader must scroll independently')
    await dialog.getByText('JIWEI_KNOWLEDGE_READING_SENTINEL', { exact: true }).waitFor({ timeout: 10_000 })
    const footer = await dialog.locator('footer').evaluate(element => {
      const rect = element.getBoundingClientRect()
      return { y: rect.y, bottom: rect.bottom, height: rect.height }
    })
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    assert.ok(footer.y >= 0 && footer.bottom <= viewport.height + 2, `reader footer must remain in viewport: ${JSON.stringify({ footer, viewport })}`)
    await page.screenshot({ path: join(artifacts, 'knowledge-reader-1280x800.png') })
    await dialog.getByRole('tab', { name: 'AI 摘要' }).click()
    assert.equal(await reader.evaluate(element => element.scrollTop), 0, 'switching tabs restores the title and summary start')
    await dialog.getByRole('button', { name: '确认沉淀' }).click()
    await dialog.waitFor({ state: 'detached', timeout: 10_000 })
    assert.equal(await page.getByRole('tab', { name: /已沉淀/u }).getAttribute('aria-selected'), 'true')
    assert.equal(await page.locator('article').filter({ hasText: ARTICLE_TITLE }).locator('[class*="knowledgeTags"]').textContent(), '原始')

    const actionsFit = await page.locator('[class*="knowledgeActions"]').evaluateAll(rows => rows.every(row => {
      const card = row.parentElement.getBoundingClientRect()
      return [...row.querySelectorAll('button')].every(button => {
        const rect = button.getBoundingClientRect()
        return rect.left >= card.left && rect.right <= card.right + 1
      })
    }))
    assert.ok(actionsFit, 'every card action must remain inside its card')
    const card = page.getByRole('heading', { name: ARTICLE_TITLE, exact: true }).last().locator('..')
    const aligned = await card.locator('[class*="knowledgeCardFooter"]').evaluate(footer => {
      const tag = footer.querySelector('[class*="knowledgeTags"] span').getBoundingClientRect()
      const select = footer.querySelector('select').getBoundingClientRect()
      const button = footer.querySelector('button').getBoundingClientRect()
      return Math.max(tag.top + tag.height / 2, select.top + select.height / 2, button.top + button.height / 2) - Math.min(tag.top + tag.height / 2, select.top + select.height / 2, button.top + button.height / 2)
    })
    assert.ok(aligned <= 2, `card tags, movement and actions share the same center line: ${aligned}`)
    assert.doesNotMatch(await card.locator('[class*="articleExcerpt"]').textContent(), /##|\n- /u)
    await page.screenshot({ path: join(artifacts, 'knowledge-cards.png') })
    await setContentSize(electronApp, page, 800, 700)
    const tabsFit = await page.locator('[class*="knowledgeTabs"] button').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().height <= 40))
    assert.ok(tabsFit, 'narrow status tabs retain horizontal labels')
    await page.screenshot({ path: join(artifacts, 'knowledge-workspace-narrow.png') })
    await card.locator('footer').scrollIntoViewIfNeeded()
    const cardFits = await card.evaluate(node => {
      const card = node.getBoundingClientRect()
      return [...node.querySelectorAll('button,select')].every(control => {
        const r = control.getBoundingClientRect()
        return r.left >= card.left && r.right <= card.right + 1 && r.bottom <= card.bottom
      })
    })
    assert.ok(cardFits, 'narrow card wraps its footer without overflowing')
    await page.screenshot({ path: join(artifacts, 'knowledge-cards-narrow.png') })
    await setContentSize(electronApp, page, 1280, 800)
  })

  await check('confirmed items support a keyboard-created tag and menu movement', async () => {
    await page.getByRole('button', { name: '记录或导入' }).click()
    const dialog = page.getByRole('dialog').last()
    await dialog.getByLabel('标题').fill('菜单移动测试')
    await dialog.getByRole('textbox', { name: '正文' }).fill('这是一条仅用于隔离验收的标签菜单测试内容。')
    await dialog.getByRole('combobox', { name: '标签', exact: true }).fill('目标')
    await dialog.getByRole('combobox', { name: '标签', exact: true }).press('Enter')
    await dialog.getByRole('button', { name: '保存为待确认' }).click()
    await dialog.getByRole('heading', { name: '菜单移动测试', exact: true }).waitFor({ timeout: 10_000 })
    const confirm = dialog.getByRole('button', { name: '确认沉淀' })
    await confirm.focus()
    await page.keyboard.press('Enter')
    await dialog.waitFor({ state: 'detached', timeout: 10_000 })

    await page.getByRole('tab', { name: /已沉淀/u }).click()
    const tagNav = page.locator('nav[aria-label="历史标签"]')
    const importedCard = page.getByRole('heading', { name: ARTICLE_TITLE, exact: true }).last().locator('..')
    await importedCard.getByRole('combobox', { name: '移动到标签' }).selectOption('目标')
    await importedCard.locator('[class*="knowledgeTags"] span').filter({ hasText: '目标' }).waitFor({ timeout: 10_000 })
    await tagNav.getByRole('button').filter({ hasText: '目标' }).waitFor({ timeout: 10_000 })
  })

  await check('confirmed article can be dragged to the virtual Other group and survives refresh', async () => {
    const tagNav = page.locator('nav[aria-label="历史标签"]')
    await tagNav.getByRole('button').filter({ hasText: '目标' }).click()
    const importedCard = page.getByRole('heading', { name: ARTICLE_TITLE, exact: true }).last().locator('..')
    const other = tagNav.getByRole('button').filter({ hasText: '其他' })
    page.once('dialog', async browserDialog => {
      assert.equal(browserDialog.type(), 'confirm')
      await browserDialog.accept()
    })
    // Start on card chrome; the center may be an independently draggable source link.
    await importedCard.dragTo(other, { sourcePosition: { x: 20, y: 20 } })
    await importedCard.waitFor({ state: 'detached', timeout: 10_000 })
    await other.click()
    await page.getByRole('heading', { name: ARTICLE_TITLE, exact: true }).waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: '刷新' }).first().click()
    await page.getByRole('heading', { name: ARTICLE_TITLE, exact: true }).waitFor({ timeout: 10_000 })
  })

  await check('reader layout remains usable at narrow and zoomed viewports', async () => {
    const card = page.getByRole('heading', { name: ARTICLE_TITLE, exact: true }).last().locator('..')
    for (const [button, tab] of [['编辑', '我的笔记'], ['AI 整理', 'AI 摘要']]) {
      await card.getByRole('button', { name: button, exact: true }).click()
      const quickDialog = page.getByRole('dialog').last()
      await quickDialog.getByRole('tab', { name: tab }).waitFor()
      assert.equal(await quickDialog.getByRole('tab', { name: tab }).getAttribute('aria-selected'), 'true')
      await closeKnowledgeDialog(page, quickDialog)
    }
    await card.getByRole('button', { name: '阅读详情' }).click()
    const dialog = page.getByRole('dialog').last()
    for (const [width, height, zoom, name] of [[1024, 768, 1, '1024x768'], [1280, 800, 1, '1280x800'], [1440, 900, 1, '1440x900'], [1280, 800, 1.25, '1280x800-125pct']]) {
      await setZoom(electronApp, 1)
      await setContentSize(electronApp, page, width, height)
      await setZoom(electronApp, zoom)
      const footer = await dialog.locator('footer').boundingBox()
      const header = await dialog.locator('header').first().boundingBox()
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      assert.equal(viewport.width, Math.round(width / zoom), `actual CSS viewport at ${name}`)
      assert.ok(footer && header && footer.y >= 0 && footer.y + footer.height <= viewport.height + 2, `footer fits ${name}`)
      assert.ok(header.y >= 0 && header.y < viewport.height, `header fits ${name}`)
      await page.screenshot({ path: join(artifacts, `knowledge-reader-${name}.png`) })
      await dialog.getByRole('tab', { name: 'AI 摘要' }).click()
      await dialog.getByRole('button', { name: '编辑摘要' }).click()
      const editorBounds = await dialog.getByRole('textbox', { name: 'AI 摘要' }).boundingBox()
      assert.ok(editorBounds && editorBounds.width >= Math.min(600, viewport.width * .65) && editorBounds.x >= 0 && editorBounds.x + editorBounds.width <= viewport.width, `editor fits ${name}`)
      await page.screenshot({ path: join(artifacts, `knowledge-editor-${name}.png`) })
      await dialog.getByRole('button', { name: '取消编辑' }).click()
      await dialog.getByRole('tab', { name: '原文' }).click()
    }
    await setZoom(electronApp, 1)
    await setContentSize(electronApp, page, 1280, 800)
    await closeKnowledgeDialog(page, dialog)
  })

  await check('summary failure is safe, switch-model retry succeeds and edits persist', async () => {
    const card = page.getByRole('heading', { name: ARTICLE_TITLE, exact: true }).last().locator('..')
    const trigger = card.getByRole('button', { name: '阅读详情' })
    await trigger.click()
    const dialog = page.getByRole('dialog').last()
    await dialog.getByRole('tab', { name: '我的笔记' }).click()
    assert.equal(await dialog.getByRole('textbox', { name: '我的笔记' }).inputValue(), '', 'new article has empty notes')
    const titleHeight = await dialog.getByLabel('标题', { exact: true }).evaluate(node => node.getBoundingClientRect().height)
    const tagHeight = await dialog.getByRole('combobox', { name: '标签', exact: true }).evaluate(node => node.parentElement.getBoundingClientRect().height)
    assert.equal(titleHeight, 40)
    assert.equal(tagHeight, 40)
    await dialog.getByRole('textbox', { name: '我的笔记' }).fill('隔离验收笔记，不能被摘要覆盖。')
    await dialog.getByRole('combobox', { name: '标签', exact: true }).fill('未按回车')
    await dialog.getByLabel('摘要模型').selectOption('route_fixture_error')
    await dialog.getByRole('button', { name: '生成 AI 摘要' }).click()
    await dialog.getByText('本次摘要输出达到上限，未保存不完整结果。请重试或更换模型；原文和已有摘要仍保留。').waitFor()
    await page.screenshot({ path: join(artifacts, 'knowledge-summary-error.png') })
    await dialog.getByLabel('摘要模型').selectOption('route_fixture')
    await dialog.getByRole('button', { name: '生成 AI 摘要' }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('[role="tab"]')].some(node => node.textContent === 'AI 摘要' && node.getAttribute('aria-selected') === 'true'))
    await dialog.getByRole('tab', { name: '我的笔记' }).click()
    assert.equal(await dialog.getByRole('textbox', { name: '我的笔记' }).inputValue(), '隔离验收笔记，不能被摘要覆盖。')
    await dialog.getByRole('button', { name: '关闭' }).click()
    await page.screenshot({ path: join(artifacts, 'knowledge-save-close.png') })
    await dialog.getByRole('button', { name: '保存并关闭' }).click()
    await dialog.waitFor({ state: 'detached' })
    // Saving a tag moves this article out of Other; restore the all-tags filter.
    await page.locator('nav[aria-label="历史标签"]').getByRole('button').filter({ hasText: '全部' }).click()
    await trigger.click()
    await dialog.getByRole('tab', { name: '我的笔记' }).click()
    assert.equal(await dialog.getByRole('textbox', { name: '我的笔记' }).inputValue(), '隔离验收笔记，不能被摘要覆盖。')
    await dialog.locator('[data-tag-chip]').filter({ hasText: '未按回车' }).waitFor()
    assert.equal(await dialog.getByRole('combobox', { name: '标签', exact: true }).evaluate(node => node.parentElement.getBoundingClientRect().height), 40)
    await dialog.getByRole('tab', { name: 'AI 摘要' }).click()
    await dialog.getByRole('button', { name: '编辑摘要' }).click()
    await dialog.getByRole('textbox', { name: 'AI 摘要' }).fill('人工编辑后的合成摘要。')
    await dialog.getByRole('button', { name: '关闭' }).click()
    await dialog.getByRole('button', { name: '保存并关闭' }).click()
    await dialog.waitFor({ state: 'detached' })
    await trigger.click()
    await dialog.getByRole('tab', { name: 'AI 摘要' }).click()
    await dialog.getByText('人工编辑后的合成摘要。', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: '关闭' }).focus()
    await page.keyboard.press('Shift+Tab')
    assert.ok(await dialog.evaluate(node => node.contains(document.activeElement)), 'backward focus stays inside dialog')
    await page.keyboard.press('Tab')
    assert.equal(await dialog.getByRole('button', { name: '关闭' }).evaluate(node => node === document.activeElement), true)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true, 'focus returns to reader trigger')
  })

  await check('cached images reopen with public network blocked', async () => {
    const remoteRequests = []
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.hostname === '127.0.0.1' || !/^https?:$/.test(url.protocol)) return route.continue()
      remoteRequests.push(url.hostname)
      return route.abort()
    })
    const card = page.getByRole('heading', { name: ARTICLE_TITLE, exact: true }).last().locator('..')
    await card.getByRole('button', { name: '阅读详情' }).click()
    const dialog = page.getByRole('dialog').last()
    await dialog.getByRole('img', { name: '合成文章配图', exact: true }).waitFor()
    await page.waitForFunction(() => { const image = document.querySelector('img[alt="合成文章配图"]'); return image?.complete && image.naturalWidth === 480 && image.src.startsWith('data:image/png;base64,') })
    await page.screenshot({ path: join(artifacts, 'knowledge-cached-offline.png') })
    assert.deepEqual(remoteRequests, [], 'reopened images do not request the source site')
    await closeKnowledgeDialog(page, dialog)
  })

  await check('confirmed article deletes to trash and restores its original and cached image', async () => {
    const card = page.locator('article').filter({ hasText: ARTICLE_TITLE })
    page.once('dialog', dialog => dialog.dismiss())
    await card.getByRole('button', { name: '删除', exact: true }).click()
    assert.equal(await card.count(), 1)
    page.once('dialog', dialog => dialog.accept())
    await card.getByRole('button', { name: '删除', exact: true }).click()
    await card.waitFor({ state: 'detached' })
    await page.getByRole('tab', { name: /回收站/u }).click()
    await card.waitFor()
    assert.equal(await card.getByRole('button', { name: '阅读详情' }).count(), 0)
    await page.screenshot({ path: join(artifacts, 'knowledge-trash.png') })
    await card.getByRole('button', { name: '恢复', exact: true }).click()
    await card.waitFor({ state: 'detached' })
    await page.getByRole('tab', { name: /已沉淀/u }).click()
    await card.getByRole('button', { name: '阅读详情' }).click()
    const dialog = page.getByRole('dialog').last()
    await dialog.getByText('JIWEI_KNOWLEDGE_READING_SENTINEL', { exact: true }).waitFor()
    await page.waitForFunction(() => { const image = document.querySelector('img[alt="合成文章配图"]'); return image?.complete && image.naturalWidth === 480 })
    await closeKnowledgeDialog(page, dialog)
  })

  await check('pending knowledge can be deleted and restored without confirmation into the library', async () => {
    await page.getByRole('button', { name: '记录或导入' }).click()
    const dialog = page.getByRole('dialog').last()
    await dialog.getByLabel('标题').fill('合成待确认删除验收')
    await dialog.getByRole('textbox', { name: '正文' }).fill('仅用于待确认删除恢复的隔离数据。')
    await dialog.getByRole('button', { name: '保存为待确认' }).click()
    await dialog.getByRole('heading', { name: '合成待确认删除验收', exact: true }).waitFor()
    await closeKnowledgeDialog(page, dialog)
    await page.getByRole('tab', { name: /待确认/u }).click()
    const card = page.locator('article').filter({ hasText: '合成待确认删除验收' })
    page.once('dialog', prompt => prompt.accept())
    await card.getByRole('button', { name: '删除', exact: true }).click()
    await card.waitFor({ state: 'detached' })
    await page.getByRole('tab', { name: /回收站/u }).click()
    await card.getByRole('button', { name: '恢复', exact: true }).click()
    await card.waitFor({ state: 'detached' })
    await page.getByRole('tab', { name: /待确认/u }).click()
    await card.waitFor()
    assert.equal(await card.getByRole('button', { name: '确认沉淀', exact: true }).count(), 1)
  })

  assert.deepEqual(rendererErrors, [], `renderer errors: ${rendererErrors.join('; ')}`)
  passed = true
  console.log(`JIWEI knowledge isolated acceptance passed: ${completed} scenarios`)
} finally {
  try {
    await captureE2eScreenshot(electronApp, join(artifacts, passed ? 'final.png' : 'failure.png'))
    await writeFile(join(artifacts, 'result.json'), JSON.stringify({ suite: 'knowledge-reading', status: passed ? 'passed' : 'failed', completed, expected: 9, locale: 'zh' }, null, 2))
    console.log(`Fixture artifacts: ${artifacts}`)
  } finally {
    try { await electronApp?.close() } finally { await rm(temporary, { recursive: true, force: true }) }
  }
}
