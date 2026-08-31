/**
 * Lightweight toast using official theme tokens. No extra UI framework.
 */

const TOAST_ATTR = 'data-dsh-text-context-toast'
const TOAST_MS = 3600

const TOAST_STYLE = [
  'position:fixed',
  'z-index:2147483646',
  'left:50%',
  'bottom:24px',
  'transform:translateX(-50%)',
  'max-width:min(480px, calc(100vw - 32px))',
  'padding:8px 14px',
  'border-radius:8px',
  'border:1px solid var(--dsw-alias-border-l1, #3a3a3a)',
  'background:var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base, #1f1f1f))',
  'color:var(--dsw-alias-label-primary, #f5f5f5)',
  'font-size:13px',
  'line-height:1.4',
  'box-shadow:0 8px 24px color-mix(in srgb, #000 28%, transparent)',
  'pointer-events:none',
].join(';')

const pending = new Set<ReturnType<typeof setTimeout>>()

/**
 * Show a short status message. Stacks upward when several fire together.
 * @param message - already-translated copy.
 * @param doc - document to mount into.
 */
export function showToast(message: string, doc: Document = document): void {
  const existing = [...doc.querySelectorAll<HTMLElement>(`[${TOAST_ATTR}]`)]
  if (existing.some(el => el.textContent === message)) return
  const el = doc.createElement('div')
  el.setAttribute('role', 'status')
  el.setAttribute(TOAST_ATTR, '')
  el.textContent = message
  el.style.cssText = TOAST_STYLE
  if (existing.length > 0) {
    el.style.bottom = `${24 + existing.length * 48}px`
  }
  doc.body.append(el)
  const timer = setTimeout(() => {
    pending.delete(timer)
    el.remove()
  }, TOAST_MS)
  pending.add(timer)
}

/** Remove every toast this plugin created (used on uninstall). */
export function clearToasts(doc: Document = document): void {
  for (const timer of pending) clearTimeout(timer)
  pending.clear()
  for (const el of doc.querySelectorAll(`[${TOAST_ATTR}]`)) el.remove()
}
