const CLIPBOARD_PERMISSIONS = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
  'deprecated-sync-clipboard-read',
])

function originOf(value) {
  if (typeof value !== 'string' || value.length === 0) return undefined
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    return url.origin
  } catch {
    return undefined
  }
}

/**
 * Keep Electron clipboard access scoped to the active, trusted DSH renderer.
 * All other permission types and all other windows remain denied.
 */
export function isClipboardPermissionAllowed({
  webContents,
  mainWebContents,
  permission,
  requestingOrigin,
  requestingUrl,
  isMainFrame = true,
  runtimeOrigin,
}) {
  if (webContents !== mainWebContents) return false
  if (isMainFrame === false || !CLIPBOARD_PERMISSIONS.has(permission)) return false
  const requestedOrigin = originOf(requestingOrigin) ?? originOf(requestingUrl) ?? originOf(webContents?.getURL?.())
  return requestedOrigin !== undefined && requestedOrigin === originOf(runtimeOrigin)
}
