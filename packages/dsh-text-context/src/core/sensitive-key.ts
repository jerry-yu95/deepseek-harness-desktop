/**
 * Sensitive field-name matching: case, separators, and compound suffixes.
 * Uses trailing word segments so tokenCount / maxTokens / secretary stay clean.
 */

/** Canonical names after case-fold and separator strip. */
const SENSITIVE_CANONICAL = new Set([
  'token',
  'accesstoken',
  'refreshtoken',
  'personalaccesstoken',
  'apikey',
  'secret',
  'clientsecret',
  'password',
  'authorization',
  'cookie',
  'privatekey',
  'bearertoken',
  'credential',
  'credentials',
  'pat',
  'awsaccesskeyid',
  'awssecretaccesskey',
  'awssessiontoken',
  'awssecuritytoken',
  'azureclientsecret',
  'googleapplicationcredentials',
  'secretaccesskey',
  'accesskeyid',
])

/**
 * Fold a field name: lowercase, drop spaces / underscores / hyphens / dots.
 * @param key - object key, YAML key, or env var name.
 */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_.-]+/gu, '')
}

/**
 * Split a key into alphanumeric word segments (snake, kebab, and camelCase).
 * @param key - original field name.
 */
export function keySegments(key: string): string[] {
  const pieces = key.split(/[^A-Za-z0-9]+/u).filter(part => part.length > 0)
  const segs: string[] = []
  for (const piece of pieces) {
    const split = piece
      .replace(/([a-z0-9])([A-Z])/gu, '$1\0$2')
      .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1\0$2')
    for (const bit of split.split('\0')) {
      if (bit.length > 0) segs.push(bit.toLowerCase())
    }
  }
  return segs
}

/**
 * Whether this object / YAML / env key should have its value hidden.
 * Matches exact canonical names and trailing compound suffixes
 * (OPENAI_API_KEY, GITHUB_PERSONAL_ACCESS_TOKEN), not substrings like secretary.
 * @param key - field name.
 */
export function isSensitiveKey(key: string): boolean {
  if (key.length === 0) return false
  const folded = normalizeKey(key)
  if (SENSITIVE_CANONICAL.has(folded)) return true
  const segs = keySegments(key)
  if (segs.length === 0) return false
  let suffix = ''
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    suffix = `${segs[i]}${suffix}`
    if (SENSITIVE_CANONICAL.has(suffix)) return true
  }
  return false
}

/**
 * Flag name inside a CLI argument, without leading dashes or `=value`.
 * @param arg - one argv element, e.g. `--token` or `--api-key=...`.
 */
export function cliFlagName(arg: string): string | undefined {
  if (!arg.startsWith('-')) return undefined
  const stripped = arg.replace(/^-+/u, '')
  if (stripped.length === 0) return undefined
  const eq = stripped.indexOf('=')
  const name = eq === -1 ? stripped : stripped.slice(0, eq)
  return name.length > 0 ? name : undefined
}

/**
 * Whether this argv element is a sensitive flag (`--token`, `--api-key=...`).
 * Uses the same name rules as object keys, so `--maxTokens` / `--tokenCount` stay clean.
 * @param arg - one argv element.
 */
export function isSensitiveCliFlag(arg: string): boolean {
  const name = cliFlagName(arg)
  return name !== undefined && isSensitiveKey(name)
}

/**
 * curl-style header carriers: `--header` / `--Header` and `-H` (not `-h` / help).
 * @param arg - one argv element, with or without `=value`.
 */
export function isHeaderCarrierArg(arg: string): boolean {
  const name = cliFlagName(arg)
  if (name === undefined) return false
  if (name === 'H') return true
  return name.toLowerCase() === 'header'
}
