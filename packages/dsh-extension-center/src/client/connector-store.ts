import { CONNECTOR_PRESETS, type ConnectorPreset } from './catalog.ts'

export type ConnectorTier = 'verified' | 'community' | 'experimental'
export type ConnectorPlatform = 'darwin-arm64' | 'darwin-x64' | 'win32-x64'
export type ConnectorAuthMode = 'oauth' | 'pat' | 'official-cli' | 'app-credentials'

export interface ConnectorStoreEntry extends ConnectorPreset {
  tier: ConnectorTier
  sourceUrl: string
  license?: string
  lastVerifiedAt?: string
  verifiedVersion?: string
  platforms: readonly ConnectorPlatform[]
  authModes: readonly ConnectorAuthMode[]
  permissionSummary: readonly string[]
  knownLimitations: readonly string[]
  requiresLocalExecution?: boolean
  /** Evidence flag is kept separate from the visual tier to prevent UI claims. */
  liveVerified?: boolean
}

const PLATFORMS: readonly ConnectorPlatform[] = ['darwin-arm64', 'darwin-x64', 'win32-x64']
const AUTH_MODES = new Set<ConnectorAuthMode>(['oauth', 'pat', 'official-cli', 'app-credentials'])
const TIERS = new Set<ConnectorTier>(['verified', 'community', 'experimental'])
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

function isHttps(value: string): boolean {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

function stringList(value: unknown, field: string, required = true): string[] {
  if (!Array.isArray(value) || (required && value.length === 0)) throw new TypeError(`${field} must be a non-empty array`)
  if (value.some((item) => typeof item !== 'string' || item.trim().length === 0 || item.length > 256)) throw new TypeError(`${field} must contain short strings`)
  return [...new Set(value.map((item) => item.trim()))]
}

export function validateConnectorStoreEntry(input: ConnectorStoreEntry): ConnectorStoreEntry {
  if (input === null || typeof input !== 'object') throw new TypeError('connector store entry must be an object')
  if (typeof input.id !== 'string' || !ID_PATTERN.test(input.id)) throw new TypeError('connector store entry id is invalid')
  if (!TIERS.has(input.tier)) throw new TypeError(`connector store tier is invalid: ${input.id}`)
  if (typeof input.sourceUrl !== 'string' || !isHttps(input.sourceUrl)) throw new TypeError(`connector source URL must use HTTPS: ${input.id}`)
  if (typeof input.docsUrl !== 'string' || !isHttps(input.docsUrl)) throw new TypeError(`connector docs URL must use HTTPS: ${input.id}`)
  const platforms = stringList(input.platforms, 'platforms').filter((item): item is ConnectorPlatform => PLATFORMS.includes(item as ConnectorPlatform))
  if (platforms.length !== input.platforms.length) throw new TypeError(`connector platforms are invalid: ${input.id}`)
  const authModes = stringList(input.authModes, 'authModes', false).filter((item): item is ConnectorAuthMode => AUTH_MODES.has(item as ConnectorAuthMode))
  if (authModes.length !== input.authModes.length) throw new TypeError(`connector auth modes are invalid: ${input.id}`)
  const permissionSummary = stringList(input.permissionSummary, 'permissionSummary')
  const knownLimitations = stringList(input.knownLimitations, 'knownLimitations')
  const liveVerified = input.liveVerified === true
  if (input.tier === 'verified' && (!liveVerified || typeof input.lastVerifiedAt !== 'string' || typeof input.verifiedVersion !== 'string')) {
    throw new TypeError(`verified connector requires dated live evidence and version: ${input.id}`)
  }
  if (input.tier === 'community' && (typeof input.sourceUrl !== 'string' || typeof input.license !== 'string' || input.license.trim().length === 0)) {
    throw new TypeError(`community connector requires public source and license: ${input.id}`)
  }
  if (input.tier === 'experimental' && liveVerified) throw new TypeError(`experimental connector cannot claim live verification: ${input.id}`)
  if (input.lastVerifiedAt !== undefined && Number.isNaN(Date.parse(input.lastVerifiedAt))) throw new TypeError(`invalid verification date: ${input.id}`)
  if (input.verifiedVersion !== undefined && (typeof input.verifiedVersion !== 'string' || input.verifiedVersion.length > 128)) throw new TypeError(`invalid verified version: ${input.id}`)
  return {
    ...input,
    platforms: [...platforms],
    authModes: [...authModes],
    permissionSummary,
    knownLimitations,
  }
}

export function validateConnectorStore(entries: readonly ConnectorStoreEntry[]): ConnectorStoreEntry[] {
  if (!Array.isArray(entries)) throw new TypeError('connector store must be an array')
  const ids = new Set<string>()
  return entries.map((entry) => {
    const validated = validateConnectorStoreEntry(entry)
    if (ids.has(validated.id)) throw new TypeError(`duplicate connector store id: ${validated.id}`)
    ids.add(validated.id)
    return validated
  })
}

const COMMON_LIMITATIONS = ['本地实现尚未完成真实账号验收；安装前请核对官方权限与数据范围。']

/**
 * Built-in reviewed manifest. The current release intentionally labels all
 * entries experimental until disposable live credentials have been recorded;
 * this is safer than presenting a deterministic parser test as live proof.
 */
export const CONNECTOR_STORE_ENTRIES: readonly ConnectorStoreEntry[] = validateConnectorStore(CONNECTOR_PRESETS.map((preset) => ({
  ...preset,
  tier: 'experimental',
  sourceUrl: preset.docsUrl,
  platforms: PLATFORMS,
  authModes: preset.authModes ?? [],
  permissionSummary: preset.capabilities,
  knownLimitations: [...COMMON_LIMITATIONS, ...(preset.integration === 'provider-json' ? ['需要从服务方复制官方 JSON；应用不猜测端点。'] : [])],
  ...(preset.integration === 'mcp-template' && preset.id === 'feishu' ? { requiresLocalExecution: true } : {}),
  liveVerified: false,
})))

export interface ConnectorStoreFilter {
  keyword?: string
  tier?: ConnectorTier | 'all'
  provider?: string
  capability?: string
  authMode?: ConnectorAuthMode | 'all'
  platform?: ConnectorPlatform | 'all'
  installed?: boolean
}

export function filterConnectorStore(entries: readonly ConnectorStoreEntry[], filter: ConnectorStoreFilter = {}, installedIds: ReadonlySet<string> = new Set()): ConnectorStoreEntry[] {
  const keyword = filter.keyword?.trim().toLocaleLowerCase() ?? ''
  return entries.filter((entry) => {
    if (filter.tier && filter.tier !== 'all' && entry.tier !== filter.tier) return false
    if (filter.provider && entry.provider !== filter.provider) return false
    if (filter.capability && !entry.capabilities.includes(filter.capability)) return false
    if (filter.authMode && filter.authMode !== 'all' && !entry.authModes.includes(filter.authMode)) return false
    if (filter.platform && filter.platform !== 'all' && !entry.platforms.includes(filter.platform)) return false
    if (filter.installed !== undefined && installedIds.has(entry.id) !== filter.installed) return false
    if (keyword && ![entry.id, entry.name, entry.provider, entry.description, ...entry.capabilities].join(' ').toLocaleLowerCase().includes(keyword)) return false
    return true
  })
}
