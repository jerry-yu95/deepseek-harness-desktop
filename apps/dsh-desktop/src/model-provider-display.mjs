import { createRequire } from 'node:module'
import { open, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import YAML from 'yaml'
import { resolveRuntimePackages } from './profile.mjs'

let catalogPromise
async function catalog() {
  catalogPromise ??= (async () => {
    const root = resolveRuntimePackages().get('@deepseek-ai/dsh-llm-pi-ai')
    if (!root) throw new Error('model-catalog-unavailable')
    const require = createRequire(join(root, 'package.json'))
    // pi-ai exports this entry for ESM only; resolve its declared import target
    // through the owning SDK's dependency paths (also works in packaged pnpm mirrors).
    for (const directory of require.resolve.paths('@earendil-works/pi-ai') ?? []) {
      const packageRoot = join(directory, '@earendil-works/pi-ai')
      let manifest
      try { manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) } catch { continue }
      const target = manifest.exports?.['./providers/all']?.import ?? manifest.exports?.['./providers/*']?.import?.replace('*', 'all')
      if (typeof target !== 'string' || !target.startsWith('./') || target.includes('..')) throw new Error('model-catalog-unavailable')
      const module = await import(pathToFileURL(join(packageRoot, target)).href)
      return module.builtinProviders().map(provider => ({ id: provider.id, baseURL: provider.baseUrl }))
    }
    throw new Error('model-catalog-unavailable')
  })()
  return catalogPromise
}

function routeOf(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'providerId') || typeof input.providerId !== 'string' || !/^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/u.test(input.providerId)) throw new Error('model-display-invalid')
  return input.providerId
}

async function readPrivateYaml(filename, privateFile = false) {
  let handle
  try {
    handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
    const info = await handle.stat()
    if (!info.isFile() || info.size > 2_097_152 || (privateFile && process.platform !== 'win32' && (info.mode & 0o077) !== 0)) throw new Error('model-display-unavailable')
    return YAML.parse(await handle.readFile('utf8'), { maxAliasCount: 0 }) ?? {}
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw new Error('model-display-unavailable')
  } finally { await handle?.close() }
}

/** Public catalog facts only. Never enumerate credentials or expose configuration secrets. */
export async function getModelProviderDefault(input, options = {}) {
  const route = routeOf(input)
  const providers = await (options.catalog ?? catalog)()
  const found = providers.find(provider => provider.id === route)
  const baseURL = route === 'deepseek' ? 'https://api.deepseek.com' : found?.baseURL
  return { baseURL: typeof baseURL === 'string' ? baseURL : null }
}

/** One explicit model route, one locally saved API key. No arbitrary ref/env lookup or OAuth grants. */
export async function revealSavedModelKey(dshHome, input, options = {}) {
  const route = routeOf(input)
  const settings = await readPrivateYaml(join(dshHome, 'settings.yaml'))
  const profiles = settings['llm-pi-ai']?.providers
  const profile = profiles && Object.hasOwn(profiles, route) ? profiles[route] : undefined
  const known = route === 'deepseek' || (await (options.catalog ?? catalog)()).some(provider => provider.id === route)
  if (!profile && !known) return { value: null, reason: 'not-saved' }
  const derived = `${route.toUpperCase().replace(/[^A-Z0-9]+/gu, '_')}_API_KEY`
  const ref = profile?.apiKeyEnv ?? (route === 'deepseek' ? settings['llm-deepseek']?.apiKeyEnv : undefined) ?? derived
  if (typeof ref !== 'string' || !/^[A-Z_][A-Z0-9_]{0,127}$/u.test(ref)) return { value: null, reason: 'not-saved' }
  // An environment override wins in Harness. Do not misleadingly show the shadowed stored value.
  if ((options.environment ?? process.env)[ref]) return { value: null, reason: 'environment' }
  const document = await readPrivateYaml(join(dshHome, '.credentials.yaml'), true)
  if (document.version !== undefined && document.version !== 1) throw new Error('model-display-unavailable')
  const refs = document.version === 1 ? document.refs : document
  const value = refs && Object.hasOwn(refs, ref) ? refs[ref] : undefined
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192) return { value: null, reason: 'not-saved' }
  return { value }
}

export function registerModelDisplayIpc({ ipcMain, getWindow, getTrustedUrl, dshHome, options }) {
  const handlers = { 'models:provider-default': input => getModelProviderDefault(input, options), 'models:reveal-saved-key': input => revealSavedModelKey(dshHome, input, options) }
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, input) => {
      const window = getWindow?.()
      if (!window || window.isDestroyed() || event?.sender !== window.webContents || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) throw new Error('model-display-forbidden')
      const trusted = () => {
        try { return new URL(event.senderFrame.url).origin === new URL(getTrustedUrl?.()).origin } catch { return false }
      }
      if (!trusted()) throw new Error('model-display-forbidden')
      try {
        const result = await handler(input)
        if (getWindow() !== window || window.isDestroyed() || event.senderFrame !== event.sender.mainFrame || !trusted()) throw new Error('model-display-forbidden')
        return result
      } catch { throw new Error('model-display-unavailable') }
    })
  }
  return () => { for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel) }
}
