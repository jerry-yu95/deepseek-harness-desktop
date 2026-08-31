import { afterEach, describe, expect, it } from 'vitest'

import { findComposer, insertIntoComposer, isMobileRemoteSurface } from '../src/client/composer.ts'
import { mountComposer } from './helpers.ts'

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-dsh-extension-active')
})

describe('findComposer', () => {
  it('prefers a visible official textarea[data-phase]', () => {
    const ta = mountComposer({ value: 'draft' })
    expect(findComposer()).toBe(ta)
  })

  it('skips the hidden conversation composer while the extension center is open', () => {
    mountComposer({ extensionOpen: true })
    expect(findComposer()).toBeNull()
  })

  it('returns null when nothing is mounted', () => {
    document.body.replaceChildren()
    expect(findComposer()).toBeNull()
  })

  it('detects the remote mobile path', () => {
    expect(isMobileRemoteSurface({ pathname: '/m' })).toBe(true)
    expect(isMobileRemoteSurface({ pathname: '/m/chat' })).toBe(true)
    expect(isMobileRemoteSurface({ pathname: '/' })).toBe(false)
  })
})

describe('insertIntoComposer', () => {
  it('keeps the original draft, restores focus, and dispatches input', () => {
    const ta = mountComposer({ value: 'hello' }) as HTMLTextAreaElement
    const events: string[] = []
    ta.addEventListener('input', () => events.push('input'))
    ta.addEventListener('change', () => events.push('change'))
    expect(insertIntoComposer(ta, 'block')).toBe(true)
    expect(ta.value).toBe('hello\n\nblock')
    expect(events).toEqual(['input', 'change'])
    expect(document.activeElement).toBe(ta)
    expect(ta.selectionStart).toBe(ta.value.length)
  })
})
