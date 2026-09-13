import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(resolve(process.cwd(), 'src/client/panel/panel.module.css'), 'utf8')

describe('knowledge reader layout contract', () => {
  it('bounds the reader shell and keeps chrome outside the sole scrolling region', () => {
    expect(stylesheet).toMatch(/\.articleDialog\s*\{[^}]*box-sizing:\s*border-box/u)
    expect(stylesheet).toMatch(/\.articleDialog\s*\{[^}]*height:\s*min\(820px,\s*calc\(100dvh\s*-\s*52px\)\)/u)
    expect(stylesheet).toMatch(/\.articleHeader[^{]*\{[^}]*min-height:\s*56px/u)
    expect(stylesheet).toMatch(/\.articleTabs[^{]*\{[^}]*min-height:\s*48px/u)
    expect(stylesheet).toMatch(/\.articleFooter[^{]*\{[^}]*min-height:\s*64px/u)
    expect(stylesheet).toMatch(/\.articleScroll\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/u)
  })

  it('gives the tag frame the same single-line height without constraining chips', () => {
    expect(stylesheet).toMatch(/\.knowledgeTagInput\s*\{[^}]*box-sizing:\s*border-box[^}]*min-height:\s*40px/u)
    expect(stylesheet).toMatch(/\.knowledgeTagInput\s*\{[^}]*height:\s*auto/u)
    // Actual 40px title/tag equality is measured in the Electron regression.
    expect(stylesheet).toMatch(/\.knowledgeTagInput input[^\{]*\{[^}]*min-height:\s*28px/u)
  })
})
