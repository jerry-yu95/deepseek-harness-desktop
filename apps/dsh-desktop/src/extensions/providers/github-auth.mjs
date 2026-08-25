import { createPkceVerifier } from '../oauth-flow.mjs'
import { oauthCredentialReferences } from '../connector-secrets.mjs'

export const GITHUB_MCP_ENDPOINT = 'https://api.githubcopilot.com/mcp/'
export const GITHUB_AUTH_SCOPES = Object.freeze(['repo', 'read:user', 'user:email'])
export const githubCredentialReferences = Object.freeze({
  ...oauthCredentialReferences('github'),
  pat: 'DSH_CONNECTOR_GITHUB_PAT',
})

function status({ mode, state, detailKey, grantedScopes, missingPermissions, expiresAt }) {
  return {
    connectorId: 'github', providerId: 'github', mode, state,
    ...(expiresAt ? { expiresAt } : {}),
    ...(grantedScopes?.length ? { grantedScopes: [...new Set(grantedScopes)] } : {}),
    ...(missingPermissions?.length ? { missingPermissions: [...new Set(missingPermissions)] } : {}),
    ...(detailKey ? { detailKey } : {}),
  }
}

function scopes(value) {
  if (value === undefined) return ['repo']
  if (!Array.isArray(value)) return null
  return [...new Set(value.filter((item) => typeof item === 'string' && item.length > 0))]
}

function approvedScopes(value) {
  const requested = scopes(value)
  if (!requested || requested.some((scope) => !GITHUB_AUTH_SCOPES.includes(scope))) return null
  return requested
}

function oauthUnavailable(error) {
  return !error?.code || /oauth|discovery|metadata|endpoint|client/u.test(`${error.code} ${error.message ?? ''}`)
}

async function openOAuth(context, input) {
  if (!context.oauth || typeof context.oauth.discoverAuthorizationServer !== 'function') throw new Error('oauth-unavailable')
  const requestedScopes = approvedScopes(input.scopes)
  if (!requestedScopes) return status({ mode: 'oauth', state: 'missing-permission', detailKey: 'github.scope-not-approved', missingPermissions: ['scope'] })
  const resourceEndpoint = input.resourceEndpoint ?? GITHUB_MCP_ENDPOINT
  const metadata = await context.oauth.discoverAuthorizationServer(resourceEndpoint, { allowInsecureLoopback: input.allowInsecureLoopback === true })
  if (typeof input.clientId !== 'string' || input.clientId.length === 0) return status({ mode: 'oauth', state: 'missing-permission', detailKey: 'github.oauth-client-required', missingPermissions: ['oauth-client'] })
  if (typeof context.oauth.createAuthorizationRequest !== 'function' || typeof context.oauth.openCallback !== 'function' || typeof context.oauth.exchangeAuthorizationCode !== 'function') throw new Error('oauth-orchestration-unavailable')
  const state = createPkceVerifier()
  const callback = await context.oauth.openCallback({ expectedState: state, host: input.callbackHost ?? '127.0.0.1', timeoutMs: input.timeoutMs, signal: context.activeAuth?.signal })
  const request = context.oauth.createAuthorizationRequest({
    authorizationEndpoint: metadata.authorization_endpoint,
    clientId: input.clientId,
    redirectUri: callback.redirectUri,
    scope: requestedScopes,
    state,
  })
  try {
    if (typeof context.openExternal !== 'function') throw new Error('oauth-browser-unavailable')
    await context.openExternal(request.url)
    const callbackResult = await callback.wait
    return await context.oauth.exchangeAuthorizationCode({
      providerId: 'github',
      tokenEndpoint: metadata.token_endpoint,
      issuer: metadata.issuer,
      clientId: input.clientId,
      redirectUri: callback.redirectUri,
      code: callbackResult.code,
      codeVerifier: request.codeVerifier,
      scopes: requestedScopes,
      allowInsecureLoopback: input.allowInsecureLoopback === true,
    })
  } catch (error) {
    callback.cancel?.('browser-closed')
    if (oauthUnavailable(error)) return status({ mode: 'pat', state: 'missing-permission', detailKey: 'github.oauth-unavailable-pat-fallback', missingPermissions: ['oauth'] })
    return status({ mode: 'oauth', state: 'error', detailKey: `github.${error?.code ?? 'oauth-failed'}` })
  }
}

async function tokenFor(context, mode) {
  if (!context.secretStore || typeof context.secretStore.resolveMany !== 'function') return undefined
  const reference = mode === 'pat' ? githubCredentialReferences.pat : githubCredentialReferences.accessToken
  try {
    const values = await context.secretStore.resolveMany([reference])
    return values[reference]
  } catch {
    return undefined
  }
}

function statusForStoredToken(context, mode) {
  if (!context.secretStore || typeof context.secretStore.has !== 'function') return status({ mode, state: 'not-configured' })
  const reference = mode === 'pat' ? githubCredentialReferences.pat : githubCredentialReferences.accessToken
  try {
    return context.secretStore.has(reference) ? status({ mode, state: 'ready' }) : status({ mode, state: 'not-configured' })
  } catch {
    return status({ mode, state: 'not-configured' })
  }
}

export function createGitHubAuthAdapter() {
  return {
    id: 'github',
    modes: ['oauth', 'pat'],
    async authorize(context, input = {}) {
      const mode = input.mode ?? 'oauth'
      if (mode === 'pat') {
        const requestedScopes = approvedScopes(input.scopes)
        if (!requestedScopes) return status({ mode: 'pat', state: 'missing-permission', detailKey: 'github.scope-not-approved', missingPermissions: ['scope'] })
        if (!context.secretStore || typeof context.secretStore.setMany !== 'function') return status({ mode: 'pat', state: 'error', detailKey: 'github.secure-storage-unavailable' })
        if (typeof input.token !== 'string' || input.token.length === 0) return status({ mode: 'pat', state: 'not-configured', detailKey: 'github.pat-required' })
        await context.secretStore.setMany({ [githubCredentialReferences.pat]: input.token })
        return status({ mode: 'pat', state: 'ready', grantedScopes: requestedScopes })
      }
      if (mode !== 'oauth') return status({ mode, state: 'error', detailKey: 'github.auth-mode-unsupported' })
      try {
        return await openOAuth(context, input)
      } catch (error) {
        if (oauthUnavailable(error)) return status({ mode: 'pat', state: 'missing-permission', detailKey: 'github.oauth-unavailable-pat-fallback', missingPermissions: ['oauth'] })
        return status({ mode: 'oauth', state: 'error', detailKey: `github.${error?.code ?? 'oauth-failed'}` })
      }
    },
    async status(context, connector = {}) {
      return statusForStoredToken(context, connector.mode ?? 'oauth')
    },
    async disconnect(context) {
      if (context.secretStore && typeof context.secretStore.removeMany === 'function') {
        await context.secretStore.removeMany([githubCredentialReferences.pat, githubCredentialReferences.accessToken, githubCredentialReferences.refreshToken])
      }
      return status({ mode: 'oauth', state: 'not-configured' })
    },
    async verify(context, connector = {}) {
      const mode = connector.mode ?? 'oauth'
      const token = await tokenFor(context, mode)
      if (!token) return status({ mode, state: 'reauthorization-required', detailKey: 'github.authorization-required' })
      const fetchImpl = context.fetchImpl ?? globalThis.fetch
      try {
        const response = await fetchImpl(connector.endpoint ?? GITHUB_MCP_ENDPOINT, {
          method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
        })
        if (response.status === 401) return status({ mode, state: 'reauthorization-required', detailKey: 'github.authorization-expired' })
        if (response.status === 403) return status({ mode, state: 'missing-permission', detailKey: 'github.permission-denied' })
        if (!response.ok && response.status >= 500) return status({ mode, state: 'error', detailKey: 'github.server-error' })
        return status({ mode, state: 'ready' })
      } catch {
        return status({ mode, state: 'error', detailKey: 'github.network-error' })
      }
    },
  }
}
