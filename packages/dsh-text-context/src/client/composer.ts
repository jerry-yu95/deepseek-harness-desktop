/**
 * Locate the official session composer and insert draft text without
 * depending on hashed CSS class names.
 */

import { en, zh } from './locales.ts'

const COMPOSER_COPY = [zh['composer.placeholder'], en['composer.placeholder']]

/**
 * True when the remote mobile surface is showing (`/m`). Desktop chat stays active.
 * @param loc - location-like object.
 */
export function isMobileRemoteSurface(loc: Pick<Location, 'pathname'> = window.location): boolean {
  return loc.pathname === '/m' || loc.pathname.startsWith('/m/')
}

/**
 * True when the extension-center panel has taken over the conversation column.
 * @param doc - document.
 */
export function isExtensionCenterOpen(doc: Document = document): boolean {
  return doc.documentElement.hasAttribute('data-dsh-extension-active')
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false
  const style = getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return true
}

function isBlockedByExtensionCenter(el: Element, doc: Document): boolean {
  if (el.closest('[data-dsh-extension-view]')) return true
  if (!isExtensionCenterOpen(doc)) return false
  if (el.closest('[data-pane="conversation"]')) return true
  if (el.closest('[class*="centerCol"]')) return true
  return false
}

/**
 * True when the captured composer is still the visible session input.
 * @param captured - element recorded at capture time.
 * @param doc - document.
 */
export function composerStillCurrent(captured: HTMLElement, doc: Document = document): boolean {
  if (!captured.isConnected) return false
  if (!isVisible(captured)) return false
  if (isBlockedByExtensionCenter(captured, doc)) return false
  return findComposer(doc) === captured
}

function matchesComposerSemantics(el: Element): boolean {
  const placeholder = (el.getAttribute('placeholder') ?? '').trim()
  const aria = (el.getAttribute('aria-label') ?? '').trim()
  return COMPOSER_COPY.includes(placeholder) || COMPOSER_COPY.includes(aria)
}

function isUsableComposer(el: HTMLElement, doc: Document): boolean {
  if (!isVisible(el)) return false
  if (isBlockedByExtensionCenter(el, doc)) return false
  return true
}

/**
 * Find the current visible session composer.
 * Order: official textarea[data-phase], contenteditable in the conversation
 * column, then placeholder / aria-label semantics.
 * @param doc - document.
 */
export function findComposer(doc: Document = document): HTMLElement | null {
  const phase = doc.querySelectorAll<HTMLTextAreaElement>('textarea[data-phase]')
  for (const el of phase) {
    if (isUsableComposer(el, doc)) return el
  }

  const editables = doc.querySelectorAll<HTMLElement>(
    '[data-pane="conversation"] [contenteditable="true"], [class*="centerCol"] [contenteditable="true"]',
  )
  for (const el of editables) {
    if (isUsableComposer(el, doc)) return el
  }

  const semantic = doc.querySelectorAll<HTMLElement>(
    'textarea[placeholder], textarea[aria-label], [contenteditable="true"][aria-label], [contenteditable="true"][placeholder]',
  )
  for (const el of semantic) {
    if (!matchesComposerSemantics(el)) continue
    if (isUsableComposer(el, doc)) return el
  }

  return null
}

/**
 * Append chunk to a textarea or contenteditable, keep the prior draft,
 * restore focus and caret, and dispatch React-visible input/change events.
 * @param el - composer element.
 * @param chunk - formatted attachment text.
 */
export function insertIntoComposer(el: HTMLElement, chunk: string): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const start = el.value
    const next = start.trim().length === 0 ? chunk : `${start.replace(/\s+$/u, '')}\n\n${chunk}`
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
    if (descriptor?.set !== undefined) descriptor.set.call(el, next)
    else el.value = next
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: chunk }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.focus()
    try {
      el.setSelectionRange(next.length, next.length)
    } catch {
      // Some input types reject selection APIs; focus is still restored.
    }
    return true
  }
  if (el.isContentEditable) {
    const start = el.textContent ?? ''
    const next = start.trim().length === 0 ? chunk : `${start.replace(/\s+$/u, '')}\n\n${chunk}`
    el.textContent = next
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: chunk }))
    el.focus()
    return true
  }
  return false
}
