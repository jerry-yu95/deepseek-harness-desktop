import { oauthCredentialReferences } from '../connector-secrets.mjs'

export const FEISHU_LARK_MCP_PACKAGE = '@larksuiteoapi/lark-mcp'
export const FEISHU_DOMAINS = Object.freeze({
  feishu: 'https://open.feishu.cn',
  lark: 'https://open.larksuite.com',
})
export const FEISHU_AUTH_SCOPES = Object.freeze(['offline_access'])
export const feishuCredentialReferences = Object.freeze({
  ...oauthCredentialReferences('feishu'),
  appId: 'DSH_CONNECTOR_FEISHU_APP_ID',
  appSecret: 'DSH_CONNECTOR_FEISHU_APP_SECRET',
})

function status({ mode = 'official-cli', state, detailKey, grantedScopes, missingPermissions }) {
  return {
    connectorId: 'feishu', providerId: 'feishu', mode, state,
    ...(grantedScopes?.length ? { grantedScopes: [...new Set(grantedScopes)] } : {}),
    ...(missingPermissions?.length ? { missingPermissions: [...new Set(missingPermissions)] } : {}),
    ...(detailKey ? { detailKey } : {}),
  }
}

export function normalizeFeishuDomain(value = FEISHU_DOMAINS.feishu) {
  if (typeof value !== 'string') throw new TypeError('Feishu domain must be an official HTTPS domain')
  const domain = value.replace(/\/$/u, '')
  if (!Object.values(FEISHU_DOMAINS).includes(domain)) throw new Error('Feishu domain must use an official HTTPS domain: open.feishu.cn or open.larksuite.com')
  return domain
}

function normalizeScopes(value) {
  const scopes = value === undefined ? [...FEISHU_AUTH_SCOPES] : Array.isArray(value) ? value : String(value).split(/[\s,]+/u)
  const normalized = [...new Set(scopes.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))]
  if (normalized.length === 0) throw new TypeError('Feishu scopes must not be empty')
  return normalized
}

function assertCredential(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${field} is required`)
  return value
}

/** Build the official Lark CLI invocation. It is intentionally an argv array. */
export function buildFeishuLoginCommand({ appId, appSecret, domain = FEISHU_DOMAINS.feishu, scopes, userAccessToken = false }) {
  const normalizedDomain = normalizeFeishuDomain(domain)
  const normalizedScopes = normalizeScopes(scopes)
  const args = ['-y', FEISHU_LARK_MCP_PACKAGE, 'login', '-a', assertCredential(appId, 'Feishu App ID'), '-s', assertCredential(appSecret, 'Feishu App Secret'), '-d', normalizedDomain, '--scope', normalizedScopes.join(',')]
  if (userAccessToken) args.push('--oauth', '--token-mode', 'user_access_token')
  return Object.freeze({ command: 'npx', args, timeoutMs: 120_000 })
}

export function buildFeishuLogoutCommand({ appId }) {
  return Object.freeze({ command: 'npx', args: ['-y', FEISHU_LARK_MCP_PACKAGE, 'logout', '-a', assertCredential(appId, 'Feishu App ID')], timeoutMs: 30_000 })
}

async function secretValues(context, references) {
  if (!context.secretStore || typeof context.secretStore.resolveMany !== 'function') return {}
  try {
    return await context.secretStore.resolveMany(references)
  } catch {
    return {}
  }
}

function hasSecrets(context) {
  if (!context.secretStore || typeof context.secretStore.has !== 'function') return false
  try {
    return context.secretStore.has(feishuCredentialReferences.appId) && context.secretStore.has(feishuCredentialReferences.appSecret)
  } catch {
    return false
  }
}

async function cliSupportsUserAccess(context) {
  if (context.feishuCliCapabilities?.userAccessToken === true) return true
  if (typeof context.detectFeishuCli === 'function') {
    try {
      const capabilities = await context.detectFeishuCli()
      return capabilities?.userAccessToken === true
    } catch {
      return false
    }
  }
  return false
}

async function runCommand(context, spec) {
  if (typeof context.runCommand !== 'function') return { unavailable: true }
  try {
    return await context.runCommand(spec)
  } catch (error) {
    return { error }
  }
}

function commandResult(result, prefix) {
  if (result.unavailable) return status({ state: 'error', detailKey: `${prefix}.cli-runner-unavailable` })
  if (result.cancelled === true || result.signal === 'SIGINT') return status({ state: 'error', detailKey: `${prefix}.login-cancelled` })
  if (result.timedOut === true) return status({ state: 'error', detailKey: `${prefix}.login-timeout` })
  if (result.error) return status({ state: 'error', detailKey: `${prefix}.cli-failed` })
  if (typeof result.exitCode === 'number' && result.exitCode !== 0) return status({ state: 'error', detailKey: `${prefix}.cli-failed` })
  return undefined
}

export function createFeishuAuthAdapter() {
  return {
    id: 'feishu',
    modes: ['official-cli', 'app-credentials'],
    async authorize(context, input = {}) {
      const mode = input.mode ?? 'official-cli'
      if (!['official-cli', 'app-credentials'].includes(mode)) return status({ mode, state: 'error', detailKey: 'feishu.auth-mode-unsupported' })
      if (!context.secretStore || typeof context.secretStore.setMany !== 'function') return status({ mode, state: 'error', detailKey: 'feishu.secure-storage-unavailable' })
      const appId = input.appId
      const appSecret = input.appSecret
      try {
        const domain = normalizeFeishuDomain(input.domain)
        const scopes = normalizeScopes(input.scopes)
        const userAccessToken = input.userAccessToken === true
        if (userAccessToken && !(await cliSupportsUserAccess(context))) return status({ mode, state: 'missing-permission', detailKey: 'feishu.user-access-cli-unsupported', missingPermissions: ['user_access_token'] })
        assertCredential(appId, 'Feishu App ID')
        assertCredential(appSecret, 'Feishu App Secret')
        await context.secretStore.setMany({ [feishuCredentialReferences.appId]: appId, [feishuCredentialReferences.appSecret]: appSecret })
        if (mode === 'app-credentials') return status({ mode, state: 'ready', grantedScopes: scopes })
        const result = await runCommand(context, buildFeishuLoginCommand({ appId, appSecret, domain, scopes, userAccessToken }))
        const failure = commandResult(result, 'feishu')
        return failure ?? status({ mode, state: 'ready', grantedScopes: scopes })
      } catch (error) {
        return status({ mode, state: 'error', detailKey: `feishu.${error?.code ?? 'invalid-credentials'}` })
      }
    },
    async status(context, connector = {}) {
      const mode = connector.mode ?? 'official-cli'
      return hasSecrets(context) ? status({ mode, state: 'ready' }) : status({ mode, state: 'not-configured' })
    },
    async disconnect(context, connector = {}) {
      const values = await secretValues(context, [feishuCredentialReferences.appId])
      if (values[feishuCredentialReferences.appId] && connector.mode !== 'app-credentials') {
        const result = await runCommand(context, buildFeishuLogoutCommand({ appId: values[feishuCredentialReferences.appId] }))
        const failure = commandResult(result, 'feishu')
        if (failure) return failure
      }
      if (context.secretStore && typeof context.secretStore.removeMany === 'function') {
        await context.secretStore.removeMany(Object.values(feishuCredentialReferences))
      }
      return status({ mode: connector.mode ?? 'official-cli', state: 'not-configured' })
    },
    async verify(context, connector = {}) {
      const mode = connector.mode ?? 'official-cli'
      if (!hasSecrets(context)) return status({ mode, state: 'reauthorization-required', detailKey: 'feishu.authorization-required' })
      if (typeof context.probe === 'function') {
        try {
          const result = await context.probe({ providerId: 'feishu', readOnly: true })
          if (result?.status === 401 || result?.statusCode === 401) return status({ mode, state: 'reauthorization-required', detailKey: 'feishu.authorization-expired' })
          if (result?.status === 403 || result?.statusCode === 403) return status({ mode, state: 'missing-permission', detailKey: 'feishu.permission-denied' })
          if (result?.ok === false) return status({ mode, state: 'error', detailKey: 'feishu.probe-failed' })
        } catch {
          return status({ mode, state: 'error', detailKey: 'feishu.network-error' })
        }
      }
      return status({ mode, state: 'ready' })
    },
  }
}
