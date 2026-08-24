import { describe, expect, it } from 'vitest'

import { ENTRY_SELECTOR, shouldCloseForSidebarTarget } from '../src/client/sidebar-entry.ts'

function target(matches: readonly string[]): EventTarget {
  return {
    closest: (selector: string) => matches.includes(selector) ? {} : null,
  } as unknown as EventTarget
}

describe('extension sidebar navigation lifecycle', () => {
  it('closes for official New Session and history navigation targets', () => {
    expect(shouldCloseForSidebarTarget(target(['[data-pane="sidebar"], [class*="sidebarCol"]']))).toBe(true)
  })

  it('keeps the center open when an injected extension row is clicked', () => {
    expect(shouldCloseForSidebarTarget(target([
      ENTRY_SELECTOR,
      '[data-pane="sidebar"], [class*="sidebarCol"]',
    ]))).toBe(false)
  })

  it('ignores clicks outside the official sidebar and non-element targets', () => {
    expect(shouldCloseForSidebarTarget(target([]))).toBe(false)
    expect(shouldCloseForSidebarTarget(null)).toBe(false)
  })
})
