import assert from 'node:assert/strict'
import test from 'node:test'

import { endpointFor, normalizeInput, projectModelProviderTestResult, testModelProvider } from '../src/model-provider-test.mjs'

test('custom provider probe sends a minimal OpenAI-compatible inference request', async () => {
  let observed
  const result = await testModelProvider({
    baseURL: 'https://example.com/v4/', api: 'openai-completions', apiKey: 'private-key', model: 'glm-5.3-flash',
  }, {
    fetch: async (url, init) => {
      observed = { url, init, body: JSON.parse(init.body) }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 })
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.model, 'glm-5.3-flash')
  assert.equal(result.category, 'ready')
  assert.equal(observed.url, 'https://example.com/v4/chat/completions')
  assert.equal(observed.init.headers.authorization, 'Bearer private-key')
  assert.equal(observed.body.model, 'glm-5.3-flash')
  assert.equal(observed.body.max_tokens, 8)
})

test('custom provider probe supports Responses and Anthropic protocol endpoints', () => {
  assert.equal(endpointFor('https://example.com/v1', 'openai-responses'), 'https://example.com/v1/responses')
  assert.equal(endpointFor('https://example.com/v1', 'anthropic-messages'), 'https://example.com/v1/messages')
})

test('custom provider probe classifies credentials and endpoint failures without echoing secrets', async () => {
  const credentials = await testModelProvider({ baseURL: 'https://example.com/v1', api: 'openai-completions', apiKey: 'secret', model: 'model' }, {
    fetch: async () => new Response(JSON.stringify({ error: { message: 'api_key=do-not-leak rejected' } }), { status: 401 }),
  })
  assert.equal(credentials.category, 'credentials')
  assert.equal(credentials.detail.includes('do-not-leak'), false)

  const missing = await testModelProvider({ baseURL: 'https://example.com/v4', api: 'openai-completions', apiKey: 'secret', model: 'model' }, {
    fetch: async () => new Response('Not Found', { status: 404 }),
  })
  assert.equal(missing.category, 'endpoint-not-found')
  assert.match(missing.detail, /\/v1/u)
})

test('custom provider probe classifies a missing model separately from a missing endpoint', async () => {
  const missingModel = await testModelProvider({ baseURL: 'https://example.com/v1', api: 'openai-completions', apiKey: 'secret', model: 'missing-model' }, {
    fetch: async () => new Response(JSON.stringify({ error: { message: 'model_not_found: missing-model' } }), { status: 404 }),
  })
  assert.equal(missingModel.ok, false)
  assert.equal(missingModel.category, 'model-not-found')
  assert.equal(missingModel.model, 'missing-model')
  assert.match(missingModel.detail, /模型 ID/u)
})

test('custom provider probe projection never forwards secrets or extra fields', () => {
  const projected = projectModelProviderTestResult({
    ok: true, category: 'ready', model: 'glm-5.3-flash', latencyMs: 12, detail: 'ok',
    apiKey: 'secret-key', authorization: 'Bearer secret-key', body: '{"choices":[]}',
  })
  assert.deepEqual(projected, { ok: true, category: 'ready', model: 'glm-5.3-flash', latencyMs: 12, detail: 'ok' })
  assert.equal('apiKey' in projected, false)
  assert.doesNotMatch(JSON.stringify(projected), /secret-key/u)
})

test('custom provider probe rejects incomplete and unsafe drafts before networking', () => {
  assert.throws(() => normalizeInput({ baseURL: 'file:///tmp/model', api: 'openai-completions', apiKey: 'key', model: 'model' }), /HTTP/u)
  assert.throws(() => normalizeInput({ baseURL: 'https://example.com/v1', api: '', apiKey: 'key', model: 'model' }), /API 协议/u)
  assert.throws(() => normalizeInput({ baseURL: 'https://example.com/v1', api: 'openai-completions', apiKey: '', model: 'model' }), /API 密钥/u)
})
