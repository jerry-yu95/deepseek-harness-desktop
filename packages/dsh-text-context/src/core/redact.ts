/**
 * Best-effort redaction of credential-like fields in JSON / JSONC / YAML
 * and conservative env-assignment lines in ordinary text.
 * Never logs or returns the original secret separately from the rewritten text.
 */

import { REDACTED_VALUE } from './limits.ts'
import type { TextSyntax } from './classify.ts'
import { isHeaderCarrierArg, isSensitiveCliFlag, isSensitiveKey } from './sensitive-key.ts'

export {
  isHeaderCarrierArg,
  isSensitiveCliFlag,
  isSensitiveKey,
  keySegments,
  normalizeKey,
} from './sensitive-key.ts'

/** Result of rewriting one document. */
export interface RedactResult {
  /** Text safe to insert into the composer. Empty when blocked. */
  text: string
  /** True when at least one sensitive value was replaced. */
  redacted: boolean
  /** True when JSON/JSONC could not be parsed and a conservative path was used. */
  jsonInvalid: boolean
  /**
   * True when sensitive keys or CLI flags were present but could not be
   * rewritten reliably. Callers must not insert `text`.
   */
  blocked: boolean
}

type RedactPass = {
  text: string
  redacted: boolean
  blocked: boolean
}

const YAML_BLOCK_INDICATOR = /^[|>][+-]?(?:\d+)?\s*(?:#.*)?$/u

/**
 * Redact according to the file's syntax family.
 * @param text - UTF-8 document body (BOM already stripped).
 * @param syntax - classified syntax.
 */
export function redactStructured(text: string, syntax: TextSyntax): RedactResult {
  if (syntax === 'json' || syntax === 'jsonc') return redactJsonFamily(text, syntax)
  if (syntax === 'yaml') {
    const asJson = tryParseAndRedactJson(text)
    if (asJson !== undefined) return asJson
    return finishTextFamily(text)
  }
  return finishTextFamily(text)
}

/**
 * Parse JSON or JSONC, then rewrite; fall back to conservative key-value edits.
 * Unparseable documents that still contain sensitive keys or flags are blocked
 * when those values cannot be rewritten reliably.
 * @param text - original document.
 * @param syntax - json vs jsonc (comments stripped only for jsonc).
 */
export function redactJsonFamily(text: string, syntax: 'json' | 'jsonc'): RedactResult {
  const stripped = syntax === 'jsonc' ? stripJsonc(text) : text
  for (const candidate of [stripped, stripTrailingCommas(stripped)]) {
    const parsed = tryParseAndRedactJson(candidate)
    if (parsed !== undefined) return parsed
  }
  let current: RedactPass = { text, redacted: false, blocked: false }
  current = applyPass(current, redactPlaintextKeys)
  current = applyPass(current, redactUnquotedKeys)
  current = applyPass(current, redactCliFlagsInText)
  current = applyPass(current, redactInlineArgvSecrets)
  current = applyPass(current, redactEnvAssignments)
  current = applyPass(current, redactYamlInlineMaps)
  return finish(current, true, true)
}

function finishTextFamily(text: string): RedactResult {
  let current: RedactPass = { text, redacted: false, blocked: false }
  current = applyPass(current, redactYamlLines)
  current = applyPass(current, redactYamlInlineMaps)
  current = applyPass(current, redactEnvAssignments)
  current = applyPass(current, redactCliFlagsInText)
  current = applyPass(current, redactInlineArgvSecrets)
  return finish(current, false, true)
}

function tryParseAndRedactJson(text: string): RedactResult | undefined {
  try {
    const value = JSON.parse(text) as unknown
    const rewritten = redactUnknown(value)
    return finish({
      text: `${JSON.stringify(rewritten.value, null, 2)}\n`,
      redacted: rewritten.redacted,
      blocked: false,
    }, false, true)
  } catch {
    return undefined
  }
}

function redactUnknown(value: unknown): { value: unknown; redacted: boolean } {
  if (typeof value === 'string') return redactArgvString(value)
  if (Array.isArray(value)) return redactCliArgList(value)
  if (value !== null && typeof value === 'object') {
    const next: Record<string, unknown> = {}
    let redacted = false
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        next[key] = REDACTED_VALUE
        redacted = true
        continue
      }
      const inner = redactUnknown(nested)
      next[key] = inner.value
      redacted = redacted || inner.redacted
    }
    return { value: next, redacted }
  }
  return { value, redacted: false }
}

/**
 * Rewrite sensitive CLI flags in an argv-style array (`--token value`, `--api-key=value`).
 * @param items - parsed JSON array (nested objects are still walked).
 */
export function redactCliArgList(items: readonly unknown[]): { value: unknown[]; redacted: boolean } {
  const next = items.map(item => item)
  let redacted = false
  let i = 0
  while (i < next.length) {
    const item = next[i]
    if (typeof item !== 'string') {
      const inner = redactUnknown(item)
      next[i] = inner.value
      redacted = redacted || inner.redacted
      i += 1
      continue
    }
    if (isHeaderCarrierArg(item) && !item.includes('=')) {
      const nxt = next[i + 1]
      if (typeof nxt === 'string' && !nxt.startsWith('-')) {
        const header = redactHttpHeaderLine(nxt) ?? redactPlainArgvAssignment(nxt)
        if (header.redacted) {
          next[i + 1] = header.value
          redacted = true
          i += 2
          continue
        }
      }
    }
    if (isSensitiveCliFlag(item) && !item.includes('=')) {
      const nxt = next[i + 1]
      if (nxt !== undefined && !(typeof nxt === 'string' && nxt.startsWith('-'))) {
        if (nxt !== null && typeof nxt === 'object') {
          i += 1
          continue
        }
        next[i + 1] = REDACTED_VALUE
        redacted = true
        i += 2
        continue
      }
    }
    const rewritten = redactArgvString(item)
    next[i] = rewritten.value
    redacted = redacted || rewritten.redacted
    i += 1
  }
  return { value: next, redacted }
}

const AUTH_SCHEME = /^(Bearer|Basic|Token|Digest)$/iu

function looksLikeUrl(arg: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//iu.test(arg)
}

/**
 * Rewrite one argv element: `--flag=value`, `KEY=value`, or `Header: Bearer value`.
 * @param arg - a single CLI argument string.
 */
export function redactArgvString(arg: string): { value: string; redacted: boolean } {
  const eq = /^(?<dashes>-{1,2})(?<name>[^=]+)=(?<val>[\s\S]*)$/u.exec(arg)
  if (eq?.groups !== undefined) {
    const flagToken = `${eq.groups.dashes}${eq.groups.name}`
    if (isHeaderCarrierArg(flagToken)) {
      const inner = redactHttpHeaderLine(eq.groups.val) ?? redactPlainArgvAssignment(eq.groups.val)
      if (inner.redacted) return { value: `${flagToken}=${inner.value}`, redacted: true }
      return { value: arg, redacted: false }
    }
    if (isSensitiveKey(eq.groups.name)) {
      return { value: `${flagToken}=${REDACTED_VALUE}`, redacted: true }
    }
  }
  return redactPlainArgvAssignment(arg)
}

function redactPlainArgvAssignment(arg: string): { value: string; redacted: boolean } {
  const header = redactHttpHeaderLine(arg)
  if (header !== undefined) return header
  if (looksLikeUrl(arg)) return { value: arg, redacted: false }
  const env = /^(?<key>[A-Za-z_][A-Za-z0-9_.-]*)=(?<val>[\s\S]*)$/u.exec(arg)
  if (env?.groups !== undefined && isSensitiveKey(env.groups.key)) {
    return { value: `${env.groups.key}=${REDACTED_VALUE}`, redacted: true }
  }
  return { value: arg, redacted: false }
}

function redactHttpHeaderLine(text: string): { value: string; redacted: boolean } | undefined {
  const match = /^(?<name>[A-Za-z][A-Za-z0-9_.-]*)\s*:\s*(?<rest>[\s\S]*)$/u.exec(text)
  if (match?.groups === undefined) return undefined
  if (!isSensitiveKey(match.groups.name)) return undefined
  const rest = match.groups.rest.trim()
  const scheme = /^(?<kind>Bearer|Basic|Token|Digest)\s+(?<token>[\s\S]*)$/iu.exec(rest)
  if (scheme?.groups !== undefined) {
    return {
      value: `${match.groups.name}: ${scheme.groups.kind} ${REDACTED_VALUE}`,
      redacted: true,
    }
  }
  return { value: `${match.groups.name}: ${REDACTED_VALUE}`, redacted: true }
}

/**
 * Line-oriented YAML: replace sensitive scalars and collapse block scalars.
 * @param text - YAML document.
 */
export function redactYamlLines(text: string): RedactPass {
  const lines = text.split('\n')
  const out: string[] = []
  let redacted = false
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    const match = /^(?<indent>\s*)(?<key>["'][^"']+["']|[A-Za-z0-9_.-]+)(?<sep>\s*:\s*)(?<rest>.*)$/u.exec(line)
    if (match?.groups === undefined) {
      out.push(line)
      index += 1
      continue
    }
    const rawKey = match.groups.key.replace(/^['"]|['"]$/gu, '')
    if (!isSensitiveKey(rawKey)) {
      out.push(line)
      index += 1
      continue
    }
    redacted = true
    const rest = match.groups.rest
    const trimmed = rest.trim()
    out.push(`${match.groups.indent}${match.groups.key}${match.groups.sep}${REDACTED_VALUE}`)
    index += 1
    if (YAML_BLOCK_INDICATOR.test(trimmed)) {
      index = skipYamlBlock(lines, index, match.groups.indent.length)
    }
  }
  return { text: out.join('\n'), redacted, blocked: false }
}

function skipYamlBlock(lines: readonly string[], start: number, baseIndent: number): number {
  let index = start
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim().length === 0) {
      index += 1
      continue
    }
    const indent = /^\s*/u.exec(line)?.[0].length ?? 0
    if (indent > baseIndent) {
      index += 1
      continue
    }
    break
  }
  return index
}

/**
 * Conservative env / assignment lines: KEY=value, export KEY="value", KEY: value.
 * Does not rewrite prose that merely mentions the words token or secret.
 * @param text - plaintext, markdown, or leftover YAML.
 */
export function redactEnvAssignments(text: string): RedactPass {
  let redacted = false
  const lines = text.split('\n')
  const next = lines.map(line => {
    const match = /^(?<prefix>\s*(?:export\s+)?)(?<key>[A-Za-z_][A-Za-z0-9_.-]*)(?<sep>\s*[=:]\s*)(?<value>.*)$/u.exec(line)
    if (match?.groups === undefined) return line
    if (!isSensitiveKey(match.groups.key)) return line
    const trimmed = match.groups.value.trim()
    if (YAML_BLOCK_INDICATOR.test(trimmed)) return line
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return line
    redacted = true
    return `${match.groups.prefix}${match.groups.key}${match.groups.sep}${quotedRedacted(match.groups.value)}`
  })
  return { text: next.join('\n'), redacted, blocked: false }
}

function quotedRedacted(original: string): string {
  const trimmed = original.trimStart()
  if (trimmed.startsWith('"')) return `"${REDACTED_VALUE}"`
  if (trimmed.startsWith("'")) return `'${REDACTED_VALUE}'`
  return REDACTED_VALUE
}

function replaceScalarKeepWs(valueRaw: string): string {
  const lead = /^\s*/u.exec(valueRaw)?.[0] ?? ''
  const trail = /\s*$/u.exec(valueRaw)?.[0] ?? ''
  if (lead.length + trail.length >= valueRaw.length) return valueRaw
  const core = valueRaw.slice(lead.length, valueRaw.length - trail.length)
  return `${lead}${quotedRedacted(core)}${trail}`
}

/**
 * Conservative edits for unparseable JSON: only rewrite values of known keys.
 * Does not scan for token-shaped strings.
 * @param text - original bytes decoded as UTF-8.
 */
export function redactPlaintextKeys(text: string): RedactPass {
  let redacted = false
  const next = text.replace(
    /(?<key>"(?:\\.|[^"\\])*")\s*:\s*(?<value>"(?:\\.|[^"\\])*")/gu,
    (whole, keyQuoted: string, valueQuoted: string) => {
      void whole
      void valueQuoted
      let key: string
      try {
        key = JSON.parse(keyQuoted) as string
      } catch {
        return whole
      }
      if (!isSensitiveKey(key)) return whole
      redacted = true
      return `${keyQuoted}: "${REDACTED_VALUE}"`
    },
  )
  return { text: next, redacted, blocked: false }
}

/**
 * Rewrite unquoted `GITHUB_TOKEN: "value"` / `Authorization: value` assignments.
 * Nested `{` / `[` values are left for the unresolved/block check.
 * @param text - unparseable JSON or JS-object literal.
 */
export function redactUnquotedKeys(text: string): RedactPass {
  let redacted = false
  const next = text.replace(
    /(^|[{,\s]+)([A-Za-z_][A-Za-z0-9_.-]*)(\s*:\s*)("(?:\\.|[^"\\])*"|'[^']*'|[^\s,}\]]+)/gu,
    (whole, prefix: string, key: string, sep: string, value: string) => {
      if (!isSensitiveKey(key)) return whole
      if (value.startsWith('{') || value.startsWith('[')) return whole
      redacted = true
      return `${prefix}${key}${sep}${quotedRedacted(value)}`
    },
  )
  return { text: next, redacted, blocked: false }
}

/**
 * Conservative CLI-flag rewrites in raw text (invalid JSON, YAML sequences).
 * @param text - document body.
 */
export function redactCliFlagsInText(text: string): RedactPass {
  let redacted = false
  let next = text
  next = next.replace(
    /(-{1,2})([A-Za-z0-9_.-]+)=("(?:\\.|[^"\\])*"|'[^']*'|[^\s,\]}"']+)/gu,
    (whole, dashes: string, name: string, value: string) => {
      if (!isSensitiveKey(name)) return whole
      void value
      redacted = true
      return `${dashes}${name}=${REDACTED_VALUE}`
    },
  )
  next = next.replace(
    /(-{1,2})([A-Za-z0-9_.-]+)"(\s*,\s*)"((?:\\.|[^"\\])*)"/gu,
    (whole, dashes: string, name: string, mid: string, value: string) => {
      if (!isSensitiveKey(name)) return whole
      void value
      redacted = true
      return `${dashes}${name}"${mid}"${REDACTED_VALUE}"`
    },
  )
  next = next.replace(
    /(-{1,2})([A-Za-z0-9_.-]+)'(\s*,\s*)'([^']*)'/gu,
    (whole, dashes: string, name: string, mid: string, value: string) => {
      if (!isSensitiveKey(name)) return whole
      void value
      redacted = true
      return `${dashes}${name}'${mid}'${REDACTED_VALUE}'`
    },
  )
  next = next.replace(
    /(-{1,2})([A-Za-z0-9_.-]+)(\s*,\s*)(?!-|"|')([^\s,\]}]+)/gu,
    (whole, dashes: string, name: string, mid: string, value: string) => {
      if (!isSensitiveKey(name)) return whole
      void value
      redacted = true
      return `${dashes}${name}${mid}${REDACTED_VALUE}`
    },
  )
  next = next.replace(
    /(-{1,2})([A-Za-z0-9_.-]+)(\s+)(?!-|"|')([^\s,\]}]+)/gu,
    (whole, dashes: string, name: string, ws: string, value: string) => {
      if (!isSensitiveKey(name)) return whole
      void value
      redacted = true
      return `${dashes}${name}${ws}${REDACTED_VALUE}`
    },
  )
  return { text: next, redacted, blocked: false }
}

/**
 * Conservative KEY=value and Header: value rewrites inside raw text.
 * Skips ordinary JSON `"key": "value"` pairs (quoted name then `":`).
 * @param text - document body.
 */
export function redactInlineArgvSecrets(text: string): RedactPass {
  let redacted = false
  let next = text
  next = next.replace(
    /(^|["'\s,\[])([A-Za-z_][A-Za-z0-9_.-]*)=([^\s"'\\,}\]]+)/gu,
    (whole, prefix: string, key: string, value: string) => {
      if (!isSensitiveKey(key) || isRedactedScalar(value)) return whole
      redacted = true
      return `${prefix}${key}=${REDACTED_VALUE}`
    },
  )
  next = next.replace(
    /(^|["'\s,\[])([A-Za-z][A-Za-z0-9_.-]*)(\s*:\s*)(Bearer|Basic|Token|Digest)(\s+)([^\s"'\\]+)/gu,
    (whole, prefix: string, name: string, colon: string, scheme: string, space: string, value: string) => {
      if (!isSensitiveKey(name) || isRedactedScalar(`${scheme} ${value}`)) return whole
      redacted = true
      return `${prefix}${name}${colon}${scheme}${space}${REDACTED_VALUE}`
    },
  )
  next = next.replace(
    /(^|["'\s,\[])([A-Za-z][A-Za-z0-9_.-]*)(\s*:\s*)([^\s"'\\,}\]]+)/gu,
    (whole, prefix: string, name: string, colon: string, value: string) => {
      if (!isSensitiveKey(name) || AUTH_SCHEME.test(value) || isRedactedScalar(value)) return whole
      redacted = true
      return `${prefix}${name}${colon}${REDACTED_VALUE}`
    },
  )
  return { text: next, redacted, blocked: false }
}

/**
 * Redact one-level YAML/JSON flow mappings `{ Authorization: secret }`.
 * Nested maps under a sensitive key are collapsed; unparseable sensitive maps block.
 * @param text - document body.
 */
export function redactYamlInlineMaps(text: string): RedactPass {
  let current = text
  let redacted = false
  let blocked = false
  for (let guard = 0; guard < 32; guard += 1) {
    let changed = false
    const next = current.replace(/\{([^{}]*)\}/gu, (whole, inner: string) => {
      const result = redactFlowInner(inner)
      if (!result.ok) {
        if (flowLooksSensitive(inner)) blocked = true
        return whole
      }
      if (result.redacted) {
        redacted = true
        changed = true
      }
      return `{${result.inner}}`
    })
    if (!changed || next === current) {
      current = next
      break
    }
    current = next
  }
  const collapsed = collapseSensitiveNestedFlows(current)
  return {
    text: collapsed.text,
    redacted: redacted || collapsed.redacted,
    blocked: blocked || collapsed.blocked,
  }
}

function flowLooksSensitive(inner: string): boolean {
  for (const match of inner.matchAll(/(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\1\s*:/gu)) {
    if (isSensitiveKey(match[2] ?? '')) return true
  }
  return false
}

type FlowPair = {
  leading: string
  keyRaw: string
  key: string
  colon: string
  valueRaw: string
  suffix: string
}

function redactFlowInner(inner: string): { inner: string; redacted: boolean; ok: boolean } {
  const parsed = tryParseFlowMap(inner)
  if (parsed === null) return { inner, redacted: false, ok: false }
  let redacted = false
  let out = ''
  for (const pair of parsed.pairs) {
    out += pair.leading + pair.keyRaw + pair.colon
    if (isSensitiveKey(pair.key)) {
      redacted = true
      out += replaceScalarKeepWs(pair.valueRaw)
    } else {
      out += pair.valueRaw
    }
    out += pair.suffix
  }
  out += parsed.trailing
  return { inner: out, redacted, ok: true }
}

function tryParseFlowMap(inner: string): { pairs: FlowPair[]; trailing: string } | null {
  let i = 0
  const n = inner.length
  const pairs: FlowPair[] = []

  const eatWs = (): string => {
    const start = i
    while (i < n && /\s/u.test(inner[i] ?? '')) i += 1
    return inner.slice(start, i)
  }

  const readQuoted = (): string | null => {
    const quote = inner[i]
    if (quote !== '"' && quote !== "'") return null
    const start = i
    i += 1
    while (i < n) {
      if (quote === '"' && inner[i] === '\\') {
        i += 2
        continue
      }
      if (inner[i] === quote) {
        i += 1
        return inner.slice(start, i)
      }
      i += 1
    }
    return null
  }

  const readUnquotedKey = (): string | null => {
    if (!/[A-Za-z_]/u.test(inner[i] ?? '')) return null
    const start = i
    i += 1
    while (i < n && /[A-Za-z0-9_.-]/u.test(inner[i] ?? '')) i += 1
    return inner.slice(start, i)
  }

  while (i < n) {
    const leading = eatWs()
    if (i >= n) return { pairs, trailing: leading }

    let keyRaw: string
    let key: string
    if (inner[i] === '"' || inner[i] === "'") {
      const raw = readQuoted()
      if (raw === null) return null
      keyRaw = raw
      key = raw.slice(1, -1)
    } else {
      const raw = readUnquotedKey()
      if (raw === null) return null
      keyRaw = raw
      key = raw
    }

    const wsBeforeColon = eatWs()
    if (inner[i] !== ':') return null
    i += 1
    const wsAfterColon = eatWs()
    const colon = `${wsBeforeColon}:${wsAfterColon}`

    if (inner[i] === '{' || inner[i] === '[') return null

    let valueRaw: string
    if (inner[i] === '"' || inner[i] === "'") {
      const quoted = readQuoted()
      if (quoted === null) return null
      valueRaw = quoted
    } else {
      const start = i
      while (i < n && inner[i] !== ',') i += 1
      valueRaw = inner.slice(start, i)
    }

    const pair: FlowPair = { leading, keyRaw, key, colon, valueRaw, suffix: '' }
    pairs.push(pair)

    const wsAfter = eatWs()
    if (i >= n) return { pairs, trailing: wsAfter }
    if (inner[i] !== ',') return null
    pair.suffix = ','
    i += 1
  }
  return { pairs, trailing: '' }
}

function findBalancedBrace(text: string, openIndex: number): number {
  let depth = 0
  let inString: '"' | "'" | null = null
  let escape = false
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i] ?? ''
    if (inString !== null) {
      if (escape) {
        escape = false
        continue
      }
      if (inString === '"' && char === '\\') {
        escape = true
        continue
      }
      if (char === inString) inString = null
      continue
    }
    if (char === '"' || char === "'") {
      inString = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function collapseSensitiveNestedFlows(text: string): RedactPass {
  let current = text
  let redacted = false
  let blocked = false
  const pattern = /(["']?)([A-Za-z_][A-Za-z0-9_.-]*)\1(\s*:\s*)\{/gu
  for (let guard = 0; guard < 32; guard += 1) {
    const matches = [...current.matchAll(pattern)]
    let replaced = false
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const match = matches[index]
      if (match?.index === undefined) continue
      if (!isSensitiveKey(match[2] ?? '')) continue
      const braceAt = match.index + match[0].length - 1
      const close = findBalancedBrace(current, braceAt)
      if (close < 0) {
        blocked = true
        continue
      }
      current = `${current.slice(0, braceAt)}${REDACTED_VALUE}${current.slice(close + 1)}`
      redacted = true
      replaced = true
      break
    }
    if (!replaced) break
  }
  return { text: current, redacted, blocked }
}

function isRedactedScalar(value: string): boolean {
  const trimmed = value.trim().replace(/^["']|["']$/gu, '')
  if (trimmed.length === 0) return true
  if (trimmed === REDACTED_VALUE) return true
  if (trimmed === `"${REDACTED_VALUE}"` || trimmed === `'${REDACTED_VALUE}'`) return true
  if (/^(Bearer|Basic|Token|Digest)\s+<REDACTED>$/iu.test(trimmed)) return true
  return false
}

/**
 * True when a sensitive key, env assignment, header line, or CLI flag still has
 * a value that is not `<REDACTED>`. Used to fail closed instead of inserting secrets.
 * @param text - rewritten document.
 */
export function hasUnresolvedSensitive(text: string): boolean {
  const quotedKey = /"((?:\\.|[^"\\])*)"\s*:\s*("(?:\\.|[^"\\])*"|'[^']*'|(?:Bearer|Basic|Token|Digest)\s+[^\s,}\]]+|[^\s,}\]]+)/gu
  for (const match of text.matchAll(quotedKey)) {
    let key: string
    try {
      key = JSON.parse(`"${match[1]}"`) as string
    } catch {
      key = match[1] ?? ''
    }
    if (isSensitiveKey(key) && !isRedactedScalar(match[2] ?? '')) return true
  }
  const unquotedKey = /(?:^|[{,\s])([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*("(?:\\.|[^"\\])*"|'[^']*'|(?:Bearer|Basic|Token|Digest)\s+[^\s,}\]]+|[^\s,}\]]+)/gu
  for (const match of text.matchAll(unquotedKey)) {
    if (isSensitiveKey(match[1] ?? '') && !isRedactedScalar(match[2] ?? '')) return true
  }
  const envEq = /(?:^|["'\s,\[?])([A-Za-z_][A-Za-z0-9_.-]*)=([^\s"'\\,}\]]+)/gu
  for (const match of text.matchAll(envEq)) {
    if (isSensitiveKey(match[1] ?? '') && !isRedactedScalar(match[2] ?? '')) return true
  }
  const headerLine = /(?:^|["'\s,\[])([A-Za-z][A-Za-z0-9_.-]*)\s*:\s*((?:Bearer|Basic|Token|Digest)\s+[^\s"']+|[^\s"']+)/gu
  for (const match of text.matchAll(headerLine)) {
    if (isSensitiveKey(match[1] ?? '') && !isRedactedScalar(match[2] ?? '')) return true
  }
  return hasUnconfirmedSensitiveCliFlags(text)
}

function hasUnconfirmedSensitiveCliFlags(text: string): boolean {
  const flag = /(-{1,2})([A-Za-z0-9_.-]+)/gu
  for (const match of text.matchAll(flag)) {
    const token = match[0] ?? ''
    const name = match[2] ?? ''
    const headerCarrier = isHeaderCarrierArg(token)
    if (!isSensitiveKey(name) && !headerCarrier) continue
    const after = text.slice((match.index ?? 0) + match[0].length)
    if (after.startsWith('=')) {
      const value = headerCarrier
        ? /^=("(?:\\.|[^"\\])*"|'[^']*'|[^"'\n]+)/u.exec(after)
        : /^=("(?:\\.|[^"\\])*"|'[^']*'|[^\s,\]}"']+)/u.exec(after)
      if (value === null || followingArgUnresolved(value[1] ?? '', headerCarrier)) return true
      continue
    }
    if (after.startsWith('"')) {
      const paired = /^"(\s*,\s*)"((?:\\.|[^"\\])*)"/u.exec(after)
      if (paired === null) {
        if (/^"\s*,/u.test(after)) return true
        continue
      }
      if (followingArgUnresolved(paired[2] ?? '', headerCarrier)) return true
      continue
    }
    if (after.startsWith("'")) {
      const paired = /^'(\s*,\s*)'([^']*)'/u.exec(after)
      if (paired === null) {
        if (/^'\s*,/u.test(after)) return true
        continue
      }
      if (followingArgUnresolved(paired[2] ?? '', headerCarrier)) return true
      continue
    }
    const spaced = headerCarrier
      ? /^(\s*,\s*|\s+)(?!-|"|')(.+)/u.exec(after)
      : /^(\s*,\s*|\s+)(?!-|"|')([^\s,\]}]+)/u.exec(after)
    if (spaced !== null && followingArgUnresolved(spaced[2] ?? '', headerCarrier)) return true
  }
  return false
}

function followingArgUnresolved(value: string, headerCarrier: boolean): boolean {
  const trimmed = value.trim().replace(/["',\s]+$/u, '')
  if (headerValueIsRedacted(trimmed)) return false
  if (!headerCarrier) return !isRedactedScalar(trimmed)
  const header = /^(?<name>[A-Za-z][A-Za-z0-9_.-]*)\s*:\s*(?<rest>[\s\S]*)$/u.exec(trimmed)
  if (header?.groups === undefined) return true
  if (!isSensitiveKey(header.groups.name)) return false
  return !isRedactedScalar(header.groups.rest)
}

function headerValueIsRedacted(value: string): boolean {
  if (isRedactedScalar(value)) return true
  const header = /^(?<name>[A-Za-z][A-Za-z0-9_.-]*)\s*:\s*(?<rest>[\s\S]*)$/u.exec(value)
  return header?.groups !== undefined
    && isSensitiveKey(header.groups.name)
    && isRedactedScalar(header.groups.rest)
}

function applyPass(current: RedactPass, fn: (text: string) => RedactPass): RedactPass {
  if (current.blocked) return current
  const next = fn(current.text)
  return {
    text: next.text,
    redacted: current.redacted || next.redacted,
    blocked: current.blocked || next.blocked,
  }
}

function finish(current: RedactPass, jsonInvalid: boolean, checkUnresolved: boolean): RedactResult {
  const unresolved = checkUnresolved && hasUnresolvedSensitive(current.text)
  const blocked = current.blocked || unresolved
  return {
    text: blocked ? '' : current.text,
    redacted: current.redacted,
    jsonInvalid,
    blocked,
  }
}

/**
 * Strip `//` and `/* *\/` comments outside of strings. Best-effort JSONC support.
 * @param input - JSONC document.
 */
export function stripJsonc(input: string): string {
  let out = ''
  let i = 0
  let inString = false
  let escape = false
  while (i < input.length) {
    const char = input[i]
    const next = input[i + 1]
    if (inString) {
      out += char
      if (escape) escape = false
      else if (char === '\\') escape = true
      else if (char === '"') inString = false
      i += 1
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      i += 1
      continue
    }
    if (char === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') i += 1
      continue
    }
    if (char === '/' && next === '*') {
      i += 2
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += char
    i += 1
  }
  return out
}

function stripTrailingCommas(text: string): string {
  return text.replace(/,(?<ws>\s*[}\]])/gu, '$<ws>')
}
