import { createHash, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname } from 'node:path'

import { oauthCredentialReferences } from './connector-secrets.mjs'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const PROVIDER_PATTERN = /^(github|feishu|gitlab|dingtalk)$/u

function oauthError(code, message = code) {
  const error = new Error(message)
  error.code = code
  return error
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertNonEmptyString(value, field, maxLength = 2048) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) throw new TypeError(`invalid ${field}`)
  return value
}

function providerReference(providerId) {
  if (typeof providerId !== 'string' || !PROVIDER_PATTERN.test(providerId)) throw new TypeError('unsupported OAuth provider')
  return oauthCredentialReferences(providerId)
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

export function createPkceVerifier() {
  return base64Url(randomBytes(32))
}

export function createPkceChallenge(verifier) {
  assertNonEmptyString(verifier, 'codeVerifier', 128)
  return createHash('sha256').update(verifier, 'utf8').digest('base64url')
}

/** Validate remote OAuth endpoints. Plain HTTP is allowed only for loopback tests. */
export function validateOAuthEndpoint(raw, { allowInsecureLoopback = false } = {}) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new TypeError('invalid OAuth endpoint')
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !(allowInsecureLoopback && loopback && url.protocol === 'http:')) {
    throw new Error('OAuth endpoints must use https')
  }
  return url
}

async function readJsonResponse(response) {
  try {
    const body = await response.json()
    return isRecord(body) ? body : {}
  } catch {
    return {}
  }
}

async function fetchJson(fetchImpl, url, init, { allowInsecureLoopback = false, errorCode = 'oauth-request-failed' } = {}) {
  validateOAuthEndpoint(url, { allowInsecureLoopback })
  let response
  try {
    response = await fetchImpl(url, init)
  } catch {
    throw oauthError(errorCode)
  }
  const body = await readJsonResponse(response)
  if (!response.ok) {
    if (response.status === 401 || body.error === 'invalid_grant') throw oauthError('reauthorization-required')
    throw oauthError(errorCode)
  }
  return body
}

function metadataUrlForIssuer(issuer) {
  return `${issuer.replace(/\/$/u, '')}/.well-known/oauth-authorization-server`
}

/** Discover MCP protected-resource and authorization-server metadata. */
export async function discoverAuthorizationServer(resourceEndpoint, { fetchImpl = globalThis.fetch, allowInsecureLoopback = false } = {}) {
  const resource = validateOAuthEndpoint(resourceEndpoint, { allowInsecureLoopback })
  const resourceMetadata = await fetchJson(fetchImpl, resource.href, undefined, { allowInsecureLoopback, errorCode: 'oauth-resource-metadata-failed' })
  const issuer = resourceMetadata.authorization_servers?.[0]
  if (typeof issuer !== 'string') throw oauthError('oauth-authorization-server-missing')
  const issuerUrl = validateOAuthEndpoint(issuer, { allowInsecureLoopback })
  const metadata = await fetchJson(fetchImpl, metadataUrlForIssuer(issuerUrl.href), undefined, { allowInsecureLoopback, errorCode: 'oauth-server-metadata-failed' })
  for (const field of ['authorization_endpoint', 'token_endpoint']) {
    if (typeof metadata[field] !== 'string') throw oauthError(`oauth-${field}-missing`)
    validateOAuthEndpoint(metadata[field], { allowInsecureLoopback })
  }
  if (metadata.registration_endpoint !== undefined) validateOAuthEndpoint(metadata.registration_endpoint, { allowInsecureLoopback })
  return { ...metadata, issuer: metadata.issuer ?? issuerUrl.href }
}

export function validateDynamicClientRegistrationResponse(response) {
  if (!isRecord(response) || typeof response.client_id !== 'string' || response.client_id.length === 0 || response.client_id.length > 256) {
    throw new TypeError('invalid client_id in DCR response')
  }
  if (response.client_secret !== undefined && (typeof response.client_secret !== 'string' || response.client_secret.length === 0)) {
    throw new TypeError('invalid client_secret in DCR response')
  }
  return { clientId: response.client_id }
}

/** Replace provider-controlled error text with a stable, secret-free diagnostic. */
export function redactOAuthError(error) {
  const code = error?.code && /^[a-z0-9-]+$/u.test(error.code) ? error.code : 'oauth-error'
  return `oauth-error:${code}`
}

async function atomicMetadataWrite(path, data) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${randomBytes(8).toString('hex')}`
  try {
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    if (process.platform !== 'win32') await chmod(temporary, 0o600)
    await rename(temporary, path)
    if (process.platform !== 'win32') await chmod(path, 0o600)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

function scopesFromTokenResponse(response, fallback = []) {
  if (typeof response.scope === 'string') return [...new Set(response.scope.split(/\s+/u).filter(Boolean))]
  return [...new Set(fallback)]
}

function safeStatus(providerId, metadata) {
  return {
    connectorId: providerId,
    providerId,
    mode: 'oauth',
    state: 'ready',
    ...(metadata.expiresAt ? { expiresAt: metadata.expiresAt } : {}),
    ...(metadata.grantedScopes?.length ? { grantedScopes: metadata.grantedScopes } : {}),
    ...(metadata.checkedAt ? { checkedAt: metadata.checkedAt } : {}),
  }
}

/**
 * Desktop-main-process OAuth coordinator. It never returns token payloads;
 * only encrypted secret references and renderer-safe status metadata leave it.
 */
export class OAuthFlowManager {
  #refreshInFlight = new Map()

  constructor({ secretStore, metadataPath, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
    if (!isRecord(secretStore) || typeof secretStore.setMany !== 'function') throw new TypeError('OAuth secret store is required')
    this.secretStore = secretStore
    this.metadataPath = metadataPath
    this.fetchImpl = fetchImpl
    this.now = now
  }

  createAuthorizationRequest({ authorizationEndpoint, clientId, redirectUri, scope = [] }) {
    const endpoint = validateOAuthEndpoint(authorizationEndpoint)
    validateOAuthEndpoint(redirectUri, { allowInsecureLoopback: true })
    assertNonEmptyString(clientId, 'clientId', 256)
    if (!Array.isArray(scope)) throw new TypeError('scope must be an array')
    const state = base64Url(randomBytes(24))
    const codeVerifier = createPkceVerifier()
    const url = new URL(endpoint)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', scope.join(' '))
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', createPkceChallenge(codeVerifier))
    url.searchParams.set('code_challenge_method', 'S256')
    return { url: url.href, state, codeVerifier, redirectUri }
  }

  async openCallback({ expectedState, timeoutMs = 120000, host = '127.0.0.1' }) {
    assertNonEmptyString(expectedState, 'expectedState', 256)
    if (!LOOPBACK_HOSTS.has(host)) throw new TypeError('OAuth callback host must be loopback')
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10 * 60 * 1000) throw new TypeError('invalid callback timeout')

    let resolveWait
    let rejectWait
    let finished = false
    let timer
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', `http://${host}`)
      if (requestUrl.pathname !== '/callback') {
        response.statusCode = 404
        response.end('not found')
        return
      }
      if (requestUrl.searchParams.get('state') !== expectedState) {
        response.statusCode = 400
        response.end('state mismatch')
        finish(oauthError('state-mismatch'))
        return
      }
      const code = requestUrl.searchParams.get('code')
      if (!code) {
        response.statusCode = 400
        response.end('missing code')
        finish(oauthError('authorization-code-missing'))
        return
      }
      response.statusCode = 200
      response.end('Authorization complete. You may close this window.')
      finish(undefined, { code, state: expectedState })
    })
    const wait = new Promise((resolve, reject) => {
      resolveWait = resolve
      rejectWait = reject
    })
    const finish = (error, value) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      server.close(() => {})
      if (error) rejectWait(error)
      else resolveWait(value)
    }
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, host, resolve)
    })
    const address = server.address()
    timer = setTimeout(() => finish(oauthError('callback-timeout')), timeoutMs)
    return {
      redirectUri: `http://${host}:${address.port}/callback`,
      wait,
      cancel: (reason = 'browser-closed') => finish(oauthError(reason)),
    }
  }

  async #tokenRequest({ tokenEndpoint, params, allowInsecureLoopback = false }) {
    const endpoint = validateOAuthEndpoint(tokenEndpoint, { allowInsecureLoopback })
    return fetchJson(this.fetchImpl, endpoint.href, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
    }, { allowInsecureLoopback, errorCode: 'oauth-token-request-failed' })
  }

  async #persist(providerId, response, { clientId, issuer, scopes = [] } = {}) {
    const refs = providerReference(providerId)
    if (typeof response.access_token !== 'string' || response.access_token.length === 0) throw oauthError('oauth-access-token-missing')
    const values = { [refs.accessToken]: response.access_token }
    if (typeof response.refresh_token === 'string' && response.refresh_token.length > 0) values[refs.refreshToken] = response.refresh_token
    await this.secretStore.setMany(values)
    const grantedScopes = scopesFromTokenResponse(response, scopes)
    const metadata = {
      providerId,
      ...(clientId ? { clientId } : {}),
      ...(issuer ? { issuer } : {}),
      grantedScopes,
      ...(Number.isFinite(Number(response.expires_in)) ? { expiresAt: new Date(this.now().getTime() + Number(response.expires_in) * 1000).toISOString() } : {}),
      lastRefreshAt: this.now().toISOString(),
    }
    if (this.metadataPath) await atomicMetadataWrite(this.metadataPath, metadata)
    return safeStatus(providerId, { ...metadata, checkedAt: this.now().toISOString() })
  }

  async exchangeAuthorizationCode({ providerId, tokenEndpoint, allowInsecureLoopback = false, code, clientId, redirectUri, codeVerifier, issuer, scopes = [] }) {
    providerReference(providerId)
    assertNonEmptyString(code, 'authorization code', 4096)
    assertNonEmptyString(clientId, 'clientId', 256)
    assertNonEmptyString(redirectUri, 'redirectUri', 2048)
    assertNonEmptyString(codeVerifier, 'codeVerifier', 128)
    try {
      const response = await this.#tokenRequest({ tokenEndpoint, allowInsecureLoopback, params: {
        grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirectUri, code_verifier: codeVerifier,
      } })
      return await this.#persist(providerId, response, { clientId, issuer, scopes })
    } catch (error) {
      if (error?.code === 'reauthorization-required') throw error
      throw oauthError(error?.code ?? 'oauth-token-request-failed')
    }
  }

  refreshAccessToken({ providerId, tokenEndpoint, allowInsecureLoopback = false, clientId, issuer, scopes = [] }) {
    providerReference(providerId)
    if (this.#refreshInFlight.has(providerId)) return this.#refreshInFlight.get(providerId)
    const task = this.#refreshAccessToken({ providerId, tokenEndpoint, allowInsecureLoopback, clientId, issuer, scopes })
      .finally(() => this.#refreshInFlight.delete(providerId))
    this.#refreshInFlight.set(providerId, task)
    return task
  }

  async #refreshAccessToken({ providerId, tokenEndpoint, allowInsecureLoopback, clientId, issuer, scopes }) {
    const refs = providerReference(providerId)
    let resolved
    try {
      resolved = await this.secretStore.resolveMany([refs.refreshToken])
    } catch {
      throw oauthError('reauthorization-required')
    }
    const refreshToken = resolved[refs.refreshToken]
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) throw oauthError('reauthorization-required')
    try {
      const response = await this.#tokenRequest({ tokenEndpoint, allowInsecureLoopback, params: {
        grant_type: 'refresh_token', refresh_token: refreshToken, ...(clientId ? { client_id: clientId } : {}),
      } })
      if (typeof response.refresh_token !== 'string' || response.refresh_token.length === 0) response.refresh_token = refreshToken
      return await this.#persist(providerId, response, { clientId, issuer, scopes })
    } catch (error) {
      if (error?.code === 'reauthorization-required') throw error
      throw oauthError(error?.code ?? 'oauth-token-request-failed')
    }
  }
}
