import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const STORE_VERSION = 1
const CREDENTIAL_REF_PATTERN = /^DSH_CONNECTOR_[A-Z0-9_]+$/u
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
const OAUTH_PROVIDER_PATTERN = /^(github|feishu|gitlab|dingtalk)$/u

/** Return stable opaque references used by provider OAuth adapters. */
export function oauthCredentialReferences(providerId) {
  if (typeof providerId !== 'string' || !OAUTH_PROVIDER_PATTERN.test(providerId)) {
    throw new TypeError('unsupported OAuth provider')
  }
  const prefix = providerId.toUpperCase()
  return {
    accessToken: `DSH_CONNECTOR_${prefix}_OAUTH_ACCESS_TOKEN`,
    refreshToken: `DSH_CONNECTOR_${prefix}_OAUTH_REFRESH_TOKEN`,
  }
}

function assertCredentialRef(value) {
  if (typeof value !== 'string' || !CREDENTIAL_REF_PATTERN.test(value)) throw new TypeError('credential reference must use DSH_CONNECTOR_* format')
  return value
}

function entriesFrom(value) {
  if (value instanceof Map) return [...value.entries()]
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.entries(value)
  throw new TypeError('connector secrets must be an object or Map')
}

function validateCiphertext(value, reference) {
  if (typeof value !== 'string' || value.length === 0 || !BASE64_PATTERN.test(value)) {
    throw new Error(`secure-storage-corrupt:${reference}`)
  }
  try {
    if (Buffer.from(value, 'base64').length === 0) throw new Error('empty ciphertext')
  } catch {
    throw new Error(`secure-storage-corrupt:${reference}`)
  }
  return value
}

async function atomicJsonWrite(path, data) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`
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

/**
 * Main-process-only encrypted storage for connector credentials.
 * The renderer sees only configured/unconfigured state through higher layers;
 * decrypted values are kept in memory for the Host launch environment.
 */
export class ConnectorSecretStore {
  constructor({ path, isEncryptionAvailable = () => false, encrypt = () => { throw new Error('encryption unavailable') }, decrypt = () => { throw new Error('decryption unavailable') } }) {
    if (typeof path !== 'string' || path.length === 0) throw new TypeError('secret store path is required')
    this.path = path
    this.isEncryptionAvailable = isEncryptionAvailable
    this.encrypt = encrypt
    this.decrypt = decrypt
    this.entries = Object.create(null)
    this.loaded = false
  }

  async load() {
    if (this.loaded) return this
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.version !== STORE_VERSION || !parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) {
        throw new Error('invalid secret store shape')
      }
      const entries = Object.create(null)
      for (const [reference, ciphertext] of Object.entries(parsed.entries)) {
        assertCredentialRef(reference)
        entries[reference] = validateCiphertext(ciphertext, reference)
      }
      this.entries = entries
    } catch (error) {
      if (error?.code === 'ENOENT') this.entries = Object.create(null)
      else if (error?.message?.startsWith('secure-storage-corrupt')) throw error
      else throw new Error(`secure-storage-corrupt:${error.message}`)
    }
    this.loaded = true
    return this
  }

  #assertLoaded() {
    if (!this.loaded) throw new Error('connector secret store is not loaded')
  }

  #assertEncryption() {
    if (this.isEncryptionAvailable() !== true) throw new Error('secure-storage-unavailable')
  }

  has(reference) {
    this.#assertLoaded()
    assertCredentialRef(reference)
    return Object.hasOwn(this.entries, reference)
  }

  async setMany(values) {
    await this.load()
    const input = entriesFrom(values)
    if (input.length === 0) return
    this.#assertEncryption()
    const next = { ...this.entries }
    for (const [rawReference, rawValue] of input) {
      const reference = assertCredentialRef(rawReference)
      if (typeof rawValue !== 'string' || rawValue.length === 0) throw new TypeError(`credential value for ${reference} must be a non-empty string`)
      const encrypted = this.encrypt(rawValue)
      const bytes = Buffer.isBuffer(encrypted) || encrypted instanceof Uint8Array ? encrypted : Buffer.from(String(encrypted), 'utf8')
      if (bytes.length === 0) throw new Error('secure-storage-encrypt-failed')
      next[reference] = bytes.toString('base64')
    }
    await atomicJsonWrite(this.path, { version: STORE_VERSION, entries: Object.fromEntries(Object.entries(next).toSorted(([left], [right]) => left.localeCompare(right))) })
    this.entries = Object.assign(Object.create(null), next)
  }

  async removeMany(references) {
    await this.load()
    if (!Array.isArray(references)) throw new TypeError('credential references must be an array')
    const next = { ...this.entries }
    let changed = false
    for (const rawReference of references) {
      const reference = assertCredentialRef(rawReference)
      if (Object.hasOwn(next, reference)) {
        delete next[reference]
        changed = true
      }
    }
    if (!changed) return
    await atomicJsonWrite(this.path, { version: STORE_VERSION, entries: Object.fromEntries(Object.entries(next).toSorted(([left], [right]) => left.localeCompare(right))) })
    this.entries = Object.assign(Object.create(null), next)
  }

  resolveMany(references) {
    this.#assertLoaded()
    if (!Array.isArray(references)) throw new TypeError('credential references must be an array')
    if (references.length === 0) return {}
    this.#assertEncryption()
    const output = {}
    try {
      for (const rawReference of references) {
        const reference = assertCredentialRef(rawReference)
        const ciphertext = this.entries[reference]
        if (ciphertext === undefined) throw new Error(`missing credential ${reference}`)
        const decrypted = this.decrypt(Buffer.from(validateCiphertext(ciphertext, reference), 'base64'))
        if (typeof decrypted !== 'string' || decrypted.length === 0) throw new Error(`invalid credential ${reference}`)
        output[reference] = decrypted
      }
    } catch {
      throw new Error('secure-storage-corrupt')
    }
    return output
  }

  environment() {
    this.#assertLoaded()
    return this.resolveMany(Object.keys(this.entries))
  }
}
