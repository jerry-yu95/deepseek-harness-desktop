import { randomBytes, createHash } from 'node:crypto'
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'
import { OAuthFlowManager, validateOAuthEndpoint } from './oauth-flow.mjs'

/** Interactive OAuth is explicit and scoped to one connector and endpoint. */
export class RemoteMcpAuth {
  pending = new Map()
  constructor({ secretStore, openExternal, fetchImpl = fetch, authImpl = auth, allowInsecureLoopback = false }) {
    this.callback = new OAuthFlowManager({ secretStore })
    this.openExternal = openExternal
    this.fetchImpl = fetchImpl
    this.authImpl = authImpl
    this.allowInsecureLoopback = allowInsecureLoopback
  }

  cancel(id) { this.pending.get(id)?.abort() }
  dispose() { for (const controller of this.pending.values()) controller.abort() }

  async authorize(connector) {
    if (connector.kind !== 'mcp' || connector.transport !== 'streamable-http') throw new Error('remote-oauth-unsupported')
    if (this.pending.has(connector.id)) throw new Error('remote-oauth-busy')
    const validate = value => {
      const url = validateOAuthEndpoint(value, { allowInsecureLoopback: this.allowInsecureLoopback })
      if (url.username || url.password || url.hash) throw new Error('remote-oauth-invalid-endpoint')
      return url
    }
    validate(connector.url)
    const controller = new AbortController()
    this.pending.set(connector.id, controller)
    const timer = setTimeout(() => controller.abort(), 120_000)
    let callback
    let tokens
    let clientInformation
    let verifier
    let discovery
    try {
      const state = randomBytes(32).toString('base64url')
      callback = await this.callback.openCallback({ expectedState: state, signal: controller.signal })
      const provider = {
        redirectUrl: callback.redirectUri,
        clientMetadata: { client_name: 'JIWEI', redirect_uris: [callback.redirectUri], grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none' },
        state: () => state,
        clientInformation: () => clientInformation,
        saveClientInformation: value => { clientInformation = value },
        tokens: () => tokens,
        saveTokens: value => { tokens = value },
        saveCodeVerifier: value => { verifier = value },
        codeVerifier: () => verifier,
        discoveryState: () => discovery,
        saveDiscoveryState: value => { discovery = value },
        redirectToAuthorization: async value => {
          const url = validate(value)
          if (url.searchParams.get('state') !== state) throw new Error('remote-oauth-invalid-state')
          await this.openExternal(url.href)
        },
      }
      const fetchFn = async (url, init = {}) => {
        validate(url)
        controller.signal.throwIfAborted()
        const response = await this.fetchImpl(url, { ...init, redirect: 'manual', signal: controller.signal })
        // Never forward token requests through redirects.
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel()
          throw new Error('remote-oauth-redirected')
        }
        return response
      }
      let result = await this.authImpl(provider, { serverUrl: connector.url, fetchFn })
      if (result === 'REDIRECT') {
        const { code } = await callback.wait
        controller.signal.throwIfAborted()
        result = await this.authImpl(provider, { serverUrl: connector.url, authorizationCode: code, fetchFn })
      }
      if (result !== 'AUTHORIZED' || typeof tokens?.access_token !== 'string' || !tokens.access_token
        || tokens.access_token.length > 8192 || /[\r\n]/u.test(tokens.access_token) || tokens.token_type?.toLowerCase() !== 'bearer') throw new Error('remote-oauth-invalid-token')
      controller.signal.throwIfAborted()
      const key = createHash('sha256').update(`${connector.id}\0${connector.url}`).digest('hex').toUpperCase()
      return { reference: `DSH_CONNECTOR_REMOTE_${key}`, accessToken: tokens.access_token }
    } catch {
      throw new Error(controller.signal.aborted ? 'remote-oauth-cancelled' : 'remote-oauth-failed')
    } finally {
      clearTimeout(timer)
      callback?.cancel()
      tokens = undefined
      verifier = undefined
      clientInformation = undefined
      discovery = undefined
      this.pending.delete(connector.id)
    }
  }
}
