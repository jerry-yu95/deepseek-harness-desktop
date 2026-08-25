import { createPkceVerifier, validateDynamicClientRegistrationResponse, validateOAuthEndpoint } from '../oauth-flow.mjs'
import { oauthCredentialReferences } from '../connector-secrets.mjs'

export const gitlabCredentialReferences = Object.freeze(oauthCredentialReferences('gitlab'))
export const gitLabCredentialReferences = gitlabCredentialReferences

function status({ mode = 'oauth', state, detailKey, grantedScopes, missingPermissions }) {
  return {
    connectorId: 'gitlab', providerId: 'gitlab', mode, state,
    ...(grantedScopes?.length ? { grantedScopes: [...new Set(grantedScopes)] } : {}),
    ...(missingPermissions?.length ? { missingPermissions: [...new Set(missingPermissions)] } : {}),
    ...(detailKey ? { detailKey } : {}),
  }
}

export function normalizeGitLabUrl(value = 'https://gitlab.com') {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('GitLab URL must use http or https')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('GitLab URL must use http or https')
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('self-managed GitLab URLs must use https')
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/u, '')
}

export function gitLabMcpEndpoint(baseUrl = 'https://gitlab.com') {
  return `${normalizeGitLabUrl(baseUrl)}/api/v4/mcp`
}

async function json(response) {
  try {
    const value = await response.json()
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

export async function registerGitLabClient({ registrationEndpoint, redirectUri, fetchImpl = globalThis.fetch }) {
  validateOAuthEndpoint(registrationEndpoint)
  if (typeof redirectUri !== 'string' || !redirectUri.startsWith('http://127.0.0.1')) throw new TypeError('GitLab OAuth redirect must use loopback')
  let response
  try {
    response = await fetchImpl(registrationEndpoint, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'DeepSeek Harness Desktop',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code'],
        response_types: ['code'],
      }),
    })
  } catch {
    throw Object.assign(new Error('gitlab-dcr-network-error'), { code: 'gitlab-dcr-network-error', retryable: true })
  }
  if (response.status === 429) throw Object.assign(new Error('gitlab-dcr-rate-limited'), { code: 'gitlab-dcr-rate-limited', retryable: true })
  if (!response.ok) throw Object.assign(new Error('gitlab-dcr-failed'), { code: 'gitlab-dcr-failed', retryable: response.status >= 500 })
  return validateDynamicClientRegistrationResponse(await json(response))
}

async function tokenFor(context) {
  if (!context.secretStore || typeof context.secretStore.resolveMany !== 'function') return undefined
  try {
    const values = await context.secretStore.resolveMany([gitlabCredentialReferences.accessToken])
    return values[gitlabCredentialReferences.accessToken]
  } catch {
    return undefined
  }
}

async function openOAuth(context, input) {
  if (!context.oauth || typeof context.oauth.discoverAuthorizationServer !== 'function') throw new Error('oauth-unavailable')
  const baseUrl = normalizeGitLabUrl(input.baseUrl)
  const mcpEndpoint = gitLabMcpEndpoint(baseUrl)
  const metadata = await context.oauth.discoverAuthorizationServer(mcpEndpoint, { allowInsecureLoopback: input.allowInsecureLoopback === true })
  if (typeof context.oauth.createAuthorizationRequest !== 'function' || typeof context.oauth.openCallback !== 'function' || typeof context.oauth.exchangeAuthorizationCode !== 'function') throw new Error('oauth-orchestration-unavailable')
  const state = createPkceVerifier()
  const callback = await context.oauth.openCallback({ expectedState: state, host: input.callbackHost ?? '127.0.0.1', timeoutMs: input.timeoutMs })
  let clientId = input.clientId
  if (!clientId && metadata.registration_endpoint) {
    const registered = await registerGitLabClient({ registrationEndpoint: metadata.registration_endpoint, redirectUri: callback.redirectUri, fetchImpl: context.fetchImpl ?? globalThis.fetch })
    clientId = registered.clientId
  }
  if (!clientId) {
    callback.cancel?.('missing-client-id')
    return status({ state: 'missing-permission', detailKey: 'gitlab.oauth-client-required', missingPermissions: ['oauth-client'] })
  }
  const scopes = Array.isArray(input.scopes) ? [...new Set(input.scopes.filter((item) => typeof item === 'string' && item.length > 0))] : ['api']
  const request = context.oauth.createAuthorizationRequest({
    authorizationEndpoint: metadata.authorization_endpoint,
    clientId,
    redirectUri: callback.redirectUri,
    scope: scopes,
    state,
  })
  try {
    if (typeof context.openExternal !== 'function') throw new Error('oauth-browser-unavailable')
    await context.openExternal(request.url)
    const callbackResult = await callback.wait
    return await context.oauth.exchangeAuthorizationCode({
      providerId: 'gitlab', tokenEndpoint: metadata.token_endpoint, issuer: metadata.issuer,
      clientId, redirectUri: callback.redirectUri, code: callbackResult.code, codeVerifier: request.codeVerifier,
      scopes, allowInsecureLoopback: input.allowInsecureLoopback === true,
    })
  } catch (error) {
    callback.cancel?.('browser-closed')
    return status({ state: error?.code === 'reauthorization-required' ? 'reauthorization-required' : 'error', detailKey: `gitlab.${error?.code ?? 'oauth-failed'}` })
  }
}

export function createGitLabAuthAdapter() {
  return {
    id: 'gitlab',
    modes: ['oauth', 'pat'],
    async authorize(context, input = {}) {
      if (input.mode === 'pat') return status({ mode: 'pat', state: 'error', detailKey: 'gitlab.pat-use-official-mcp-oauth' })
      try {
        return await openOAuth(context, input)
      } catch (error) {
        if (error?.code === 'gitlab-dcr-rate-limited') return status({ state: 'error', detailKey: 'gitlab.dcr-rate-limited' })
        if (error?.code === 'gitlab-dcr-failed') return status({ state: 'error', detailKey: 'gitlab.dcr-failed' })
        return status({ state: 'error', detailKey: `gitlab.${error?.code ?? 'oauth-failed'}` })
      }
    },
    async status(context) {
      if (!context.secretStore || typeof context.secretStore.has !== 'function') return status({ state: 'not-configured' })
      try {
        return context.secretStore.has(gitlabCredentialReferences.accessToken) ? status({ state: 'ready' }) : status({ state: 'not-configured' })
      } catch {
        return status({ state: 'not-configured' })
      }
    },
    async disconnect(context) {
      if (context.secretStore && typeof context.secretStore.removeMany === 'function') await context.secretStore.removeMany([gitlabCredentialReferences.accessToken, gitlabCredentialReferences.refreshToken])
      return status({ state: 'not-configured' })
    },
    async verify(context, connector = {}) {
      const token = await tokenFor(context)
      if (!token) return status({ state: 'reauthorization-required', detailKey: 'gitlab.authorization-required' })
      const endpoint = gitLabMcpEndpoint(connector.baseUrl)
      try {
        const response = await (context.fetchImpl ?? globalThis.fetch)(endpoint, { method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${token}` } })
        if (response.status === 404) return status({ state: 'error', detailKey: 'gitlab.instance-or-group-mcp-disabled' })
        if (response.status === 401) return status({ state: 'reauthorization-required', detailKey: 'gitlab.authorization-expired' })
        if (response.status === 403) return status({ state: 'missing-permission', detailKey: 'gitlab.permission-denied' })
        if (!response.ok && response.status >= 500) return status({ state: 'error', detailKey: 'gitlab.server-error' })
        return status({ state: 'ready' })
      } catch {
        return status({ state: 'error', detailKey: 'gitlab.network-error' })
      }
    },
  }
}
