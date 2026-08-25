import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PROVIDERS = new Set(['github', 'feishu', 'gitlab', 'dingtalk'])
const MODES = new Set(['oauth', 'pat', 'official-cli', 'app-credentials'])
const RESULTS = new Set(['pass', 'fail', 'blocked'])
const TOP_LEVEL_KEYS = new Set(['provider', 'platform', 'authMode', 'operations', 'result', 'testedAt', 'disconnectResult'])
const SAFE_TEXT = /^[a-z0-9][a-z0-9._:/-]{0,127}$/i
const TOKEN_LIKE = /(?:bearer\s+|token\s*[=:]|secret\s*[=:]|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|api[_ -]?key|pat[_ -]?|ghp_|glpat-|dingtalk_)/i
const URL_WITH_QUERY = /^https?:\/\/[^\s?]+\?[^\s]+$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertSafeScalar(value, field) {
  assert(typeof value === 'string' && value.length > 0 && value.length <= 256, `${field} must be a short string`)
  assert(!TOKEN_LIKE.test(value), `${field} contains credential-shaped text`)
  assert(!URL_WITH_QUERY.test(value), `${field} must not contain a URL query string`)
  assert(!EMAIL.test(value), `${field} must not contain an email address`)
}

function validateEvidence(value, filename = 'evidence') {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${filename} must be an object`)
  for (const key of Object.keys(value)) assert(TOP_LEVEL_KEYS.has(key), `${filename} contains unsupported field ${key}`)
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') assertSafeScalar(item, `${filename}.${key}`)
  }

  assert(PROVIDERS.has(value.provider), `${filename} has an unsupported provider`)
  assert(typeof value.platform === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+){1,3}$/.test(value.platform), `${filename} has an invalid platform`)
  assert(MODES.has(value.authMode), `${filename} has an unsupported auth mode`)
  assert(Array.isArray(value.operations) && value.operations.length > 0 && value.operations.length <= 16, `${filename} must list operations`)
  for (const operation of value.operations) {
    assert(typeof operation === 'string', `${filename} has an invalid operation`)
    assert(!TOKEN_LIKE.test(operation), `${filename} operation contains credential-shaped text`)
    assert(SAFE_TEXT.test(operation), `${filename} has an invalid operation`)
  }
  assert(RESULTS.has(value.result), `${filename} has an invalid result`)
  assert(typeof value.testedAt === 'string' && !Number.isNaN(Date.parse(value.testedAt)), `${filename} has an invalid testedAt`)
  if (value.disconnectResult !== undefined) assert(RESULTS.has(value.disconnectResult), `${filename} has an invalid disconnectResult`)

  return value
}

export async function verifyEvidenceDirectory(directory, { requireAll = false } = {}) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name))
  assert(entries.length > 0, 'no JSON evidence files found')

  const seen = new Set()
  for (const entry of entries) {
    const filename = path.join(directory, entry.name)
    let value
    try {
      value = JSON.parse(await readFile(filename, 'utf8'))
    } catch (error) {
      throw new Error(`${entry.name} is not valid JSON: ${error.message}`)
    }
    validateEvidence(value, entry.name)
    assert(!seen.has(value.provider), `duplicate evidence for ${value.provider}`)
    seen.add(value.provider)
  }
  if (requireAll) {
    for (const provider of PROVIDERS) assert(seen.has(provider), `missing evidence for ${provider}`)
  }
  return { files: entries.length, providers: [...seen].sort() }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  const directory = process.argv[2] ?? '.local-evidence/connectors/0.1.36'
  const result = await verifyEvidenceDirectory(directory, { requireAll: true })
  process.stdout.write(`verified ${result.files} redacted connector evidence files: ${result.providers.join(', ')}\n`)
}
