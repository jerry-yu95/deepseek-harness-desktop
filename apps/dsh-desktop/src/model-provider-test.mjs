const TIMEOUT_MS = 20_000
const MAX_BODY_CHARS = 1_024

/** Test an unsaved custom provider with one minimal inference request. */
export async function testModelProvider(input, options = {}) {
  const request = normalizeInput(input)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('model-provider-test-timeout'), options.timeoutMs ?? TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const endpoint = endpointFor(request.baseURL, request.api)
    const response = await (options.fetch ?? fetch)(endpoint, {
      method: 'POST',
      headers: headersFor(request),
      body: JSON.stringify(bodyFor(request)),
      signal: controller.signal,
    })
    const body = await response.text()
    if (!response.ok) return failureForStatus(request.model, response.status, body, Date.now() - startedAt)
    assertInferenceResponse(request.api, body)
    return {
      ok: true,
      category: 'ready',
      model: request.model,
      latencyMs: Date.now() - startedAt,
      detail: '最小推理请求成功，当前配置可用。',
    }
  } catch (error) {
    return failureForError(request.model, error, controller.signal.aborted, Date.now() - startedAt)
  } finally {
    clearTimeout(timer)
  }
}

/** Renderer-safe projection: never pass through API keys, headers, or raw bodies. */
export function projectModelProviderTestResult(result) {
  return {
    ok: result?.ok === true,
    category: typeof result?.category === 'string' ? result.category : 'provider',
    model: typeof result?.model === 'string' ? result.model : '',
    latencyMs: Number.isFinite(result?.latencyMs) ? result.latencyMs : 0,
    detail: typeof result?.detail === 'string' ? result.detail : '',
  }
}

export function normalizeInput(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('模型连接参数无效')
  const baseURL = requiredText(input.baseURL, 'API 地址')
  const parsed = new URL(baseURL)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError('API 地址仅支持 HTTP 或 HTTPS')
  const api = requiredText(input.api, 'API 协议')
  const apiKey = requiredText(input.apiKey, 'API 密钥')
  const model = requiredText(input.model, '模型 ID')
  if (apiKey.length > 16_384 || model.length > 512 || baseURL.length > 4_096) throw new TypeError('模型连接参数过长')
  return { baseURL: parsed.toString().replace(/\/$/u, ''), api, apiKey, model }
}

export function endpointFor(baseURL, api) {
  if (api === 'openai-responses') return appendEndpoint(baseURL, 'responses')
  if (api === 'anthropic-messages') return appendEndpoint(baseURL, 'messages')
  return appendEndpoint(baseURL, 'chat/completions')
}

function appendEndpoint(baseURL, suffix) {
  const normalized = baseURL.replace(/\/$/u, '')
  if (normalized.endsWith(`/${suffix}`)) return normalized
  return `${normalized}/${suffix}`
}

function headersFor(input) {
  if (input.api === 'anthropic-messages') return { 'content-type': 'application/json', 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' }
  return { 'content-type': 'application/json', authorization: `Bearer ${input.apiKey}` }
}

function bodyFor(input) {
  if (input.api === 'openai-responses') return { model: input.model, input: 'Reply with OK only.', max_output_tokens: 8 }
  if (input.api === 'anthropic-messages') return { model: input.model, messages: [{ role: 'user', content: 'Reply with OK only.' }], max_tokens: 8 }
  return { model: input.model, messages: [{ role: 'user', content: 'Reply with OK only.' }], max_tokens: 8, temperature: 0, stream: false }
}

function assertInferenceResponse(api, text) {
  let value
  try { value = JSON.parse(text) } catch { throw new Error('模型服务返回了无法解析的响应') }
  const valid = api === 'openai-responses'
    ? typeof value?.output_text === 'string' || Array.isArray(value?.output)
    : api === 'anthropic-messages'
      ? Array.isArray(value?.content)
      : Array.isArray(value?.choices)
  if (!valid) throw new Error('模型服务响应格式与所选 API 协议不匹配')
}

function failureForStatus(model, status, body, latencyMs) {
  const missingModel = looksLikeMissingModel(body)
  const category = status === 401 || status === 403 ? 'credentials'
    : missingModel && [400, 404, 422].includes(status) ? 'model-not-found'
      : status === 404 ? 'endpoint-not-found'
        : status === 429 ? 'rate-limit'
          : [400, 405, 415, 422].includes(status) ? 'protocol' : 'provider'
  const copy = {
    credentials: '密钥或权限问题：凭证被拒绝，请检查 API Key、授权范围和账号状态。',
    'model-not-found': '模型 ID 不正确，或当前密钥无权使用该模型。',
    'endpoint-not-found': 'API 地址、协议或路径不匹配：服务返回 404，请检查是否包含正确路径（常见为 /v1）。',
    'rate-limit': '提供方已限流或额度不足，请稍后重试并检查账户额度。',
    protocol: '响应格式不兼容：请检查 API 协议、API 地址和模型 ID。',
    provider: `模型服务返回 HTTP ${status}。`,
  }
  return { ok: false, category, model, latencyMs, detail: `${copy[category]}${safeProviderMessage(body)}` }
}

function failureForError(model, error, aborted, latencyMs) {
  const message = error instanceof Error ? error.message : String(error)
  if (aborted || /abort|timeout|timed out/iu.test(message)) {
    return { ok: false, category: 'timeout', model, latencyMs, detail: '连接测试超时，请检查网络、代理和服务可用性。' }
  }
  if (/fetch failed|econn|enotfound|network|socket|dns/iu.test(message)) {
    return { ok: false, category: 'network', model, latencyMs, detail: '无法连接模型服务，请检查网络、代理、DNS 和 API 地址。' }
  }
  if (looksLikeMissingModel(message)) {
    return { ok: false, category: 'model-not-found', model, latencyMs, detail: '模型 ID 不正确，或当前密钥无权使用该模型。' }
  }
  return { ok: false, category: 'protocol', model, latencyMs, detail: redact(message) }
}

function looksLikeMissingModel(value) {
  return /model[_ -]?not[_ -]?found|unknown model|invalid model|no such model|model.{0,80}does not exist/iu.test(String(value ?? ''))
}

function safeProviderMessage(body) {
  if (!body) return ''
  try {
    const parsed = JSON.parse(body)
    const message = parsed?.error?.message ?? parsed?.message
    return typeof message === 'string' ? ` ${redact(message)}` : ''
  } catch { return '' }
}

function redact(value) {
  return String(value)
    .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/(authorization)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]')
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/gu, '[REDACTED]')
    .slice(0, MAX_BODY_CHARS)
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`请填写${label}`)
  return value.trim()
}
