import { describe, expect, it } from 'vitest'

import { REDACTED_VALUE } from '../src/core/limits.ts'
import {
  hasUnresolvedSensitive,
  isSensitiveCliFlag,
  isSensitiveKey,
  redactEnvAssignments,
  redactJsonFamily,
  redactStructured,
  redactYamlLines,
} from '../src/core/redact.ts'
import { SAMPLE_SECRET } from './helpers.ts'

function expectHidden(text: string): void {
  expect(text).toContain(REDACTED_VALUE)
  expect(text).not.toContain(SAMPLE_SECRET)
}

describe('redactJsonFamily', () => {
  it('redacts token, API key, authorization, cookie and related fields', () => {
    const source = JSON.stringify({
      token: SAMPLE_SECRET,
      access_token: SAMPLE_SECRET,
      api_key: SAMPLE_SECRET,
      apiKey: SAMPLE_SECRET,
      secret: SAMPLE_SECRET,
      client_secret: SAMPLE_SECRET,
      clientSecret: SAMPLE_SECRET,
      password: SAMPLE_SECRET,
      authorization: SAMPLE_SECRET,
      cookie: SAMPLE_SECRET,
      private_key: SAMPLE_SECRET,
      'X-Tapd-Access-Token': SAMPLE_SECRET,
      mcpServers: { demo: { command: 'npx' } },
    })
    const result = redactJsonFamily(source, 'json')
    expect(result.jsonInvalid).toBe(false)
    expect(result.redacted).toBe(true)
    expectHidden(result.text)
    expect(result.text).toContain('mcpServers')
    expect(result.text).toContain('npx')
  })

  it('redacts compound MCP keys and keeps count-like fields', () => {
    const result = redactJsonFamily(JSON.stringify({
      GITHUB_PERSONAL_ACCESS_TOKEN: SAMPLE_SECRET,
      DINGTALK_Client_Secret: SAMPLE_SECRET,
      OPENAI_API_KEY: SAMPLE_SECRET,
      refresh_token: SAMPLE_SECRET,
      authorization: SAMPLE_SECRET,
      tokenCount: 3,
      maxTokens: 99,
      secretary: 'office',
      mcpServers: { demo: { command: 'npx' } },
    }), 'json')
    expect(result.jsonInvalid).toBe(false)
    expectHidden(result.text)
    expect(result.text).toContain('"tokenCount": 3')
    expect(result.text).toContain('"maxTokens": 99')
    expect(result.text).toContain('"secretary": "office"')
    expect(result.text).toContain('npx')
  })

  it('does not treat nested non-sensitive strings as secrets', () => {
    const result = redactJsonFamily(JSON.stringify({ name: 'local-demo', token: SAMPLE_SECRET }), 'json')
    expect(result.text).toContain('local-demo')
    expectHidden(result.text)
  })

  it('uses conservative key edits when JSON cannot be parsed', () => {
    const broken = `{ "api_key": "${SAMPLE_SECRET}", "broken"`
    const result = redactJsonFamily(broken, 'json')
    expect(result.jsonInvalid).toBe(true)
    expectHidden(result.text)
  })

  it('parses JSONC comments then redacts', () => {
    const source = `// demo\n{ "api_key": "${SAMPLE_SECRET}", }\n`
    const result = redactJsonFamily(source, 'jsonc')
    expect(result.jsonInvalid).toBe(false)
    expectHidden(result.text)
  })
})

describe('redactYamlLines', () => {
  it('redacts YAML scalars for known keys', () => {
    const result = redactYamlLines(`host: example\napi_key: ${SAMPLE_SECRET}\n`)
    expect(result.redacted).toBe(true)
    expectHidden(result.text)
    expect(result.text).toContain('host: example')
  })

  it('collapses sensitive YAML block scalars including chomping indicators', () => {
    const indicators = ['|', '>', '|-', '>-', '|+', '>+'] as const
    for (const indicator of indicators) {
      const source = [
        'keep: yes',
        `token: ${indicator}`,
        `  ${SAMPLE_SECRET}`,
        '  another-line',
        `client_secret: ${indicator}`,
        `  ${SAMPLE_SECRET}`,
        'after: ok',
      ].join('\n')
      const result = redactYamlLines(source)
      expect(result.redacted).toBe(true)
      expectHidden(result.text)
      expect(result.text).toContain(`token: ${REDACTED_VALUE}`)
      expect(result.text).toContain(`client_secret: ${REDACTED_VALUE}`)
      expect(result.text).toContain('keep: yes')
      expect(result.text).toContain('after: ok')
      expect(result.text).not.toContain('another-line')
    }
  })
})

describe('redactEnvAssignments', () => {
  it('redacts KEY=value and export assignments in ordinary text', () => {
    const source = [
      `API_KEY=${SAMPLE_SECRET}`,
      `export GITHUB_TOKEN="${SAMPLE_SECRET}"`,
      `DINGTALK_CLIENT_SECRET: ${SAMPLE_SECRET}`,
      'please mention token in passing',
      'the secret to success is practice',
    ].join('\n')
    const result = redactEnvAssignments(source)
    expect(result.redacted).toBe(true)
    expectHidden(result.text)
    expect(result.text).toContain(`API_KEY=${REDACTED_VALUE}`)
    expect(result.text).toContain(`export GITHUB_TOKEN="${REDACTED_VALUE}"`)
    expect(result.text).toContain(`DINGTALK_CLIENT_SECRET: ${REDACTED_VALUE}`)
    expect(result.text).toContain('please mention token in passing')
    expect(result.text).toContain('the secret to success is practice')
  })
})

describe('redactStructured', () => {
  it('leaves ordinary markdown prose alone', () => {
    const body = '# notes\nplease mention token in passing\nthe secret to success is practice\n'
    const result = redactStructured(body, 'markdown')
    expect(result.redacted).toBe(false)
    expect(result.text).toBe(body)
    expect(result.text).not.toContain(SAMPLE_SECRET)
  })

  it('matches compound MCP field names and ignores count-like words', () => {
    expect(isSensitiveKey('API_KEY')).toBe(true)
    expect(isSensitiveKey('Authorization')).toBe(true)
    expect(isSensitiveKey('GITHUB_PERSONAL_ACCESS_TOKEN')).toBe(true)
    expect(isSensitiveKey('DINGTALK_Client_Secret')).toBe(true)
    expect(isSensitiveKey('TAPD_ACCESS_TOKEN')).toBe(true)
    expect(isSensitiveKey('OPENAI_API_KEY')).toBe(true)
    expect(isSensitiveKey('ANTHROPIC_API_KEY')).toBe(true)
    expect(isSensitiveKey('CLIENT_SECRET')).toBe(true)
    expect(isSensitiveKey('REFRESH_TOKEN')).toBe(true)
    expect(isSensitiveKey('AWS_ACCESS_KEY_ID')).toBe(true)
    expect(isSensitiveKey('AWS_SECRET_ACCESS_KEY')).toBe(true)
    expect(isSensitiveKey('AWS_SESSION_TOKEN')).toBe(true)
    expect(isSensitiveKey('AWS_SECURITY_TOKEN')).toBe(true)
    expect(isSensitiveKey('AZURE_CLIENT_SECRET')).toBe(true)
    expect(isSensitiveKey('GOOGLE_APPLICATION_CREDENTIALS')).toBe(true)
    expect(isSensitiveKey('tokenCount')).toBe(false)
    expect(isSensitiveKey('maxTokens')).toBe(false)
    expect(isSensitiveKey('secretary')).toBe(false)
    expect(isSensitiveKey('access')).toBe(false)
    expect(isSensitiveKey('key')).toBe(false)
    expect(isSensitiveKey('access_key')).toBe(false)
  })
})

describe('MCP argv redaction', () => {
  it('redacts --token followed by a separate value in args', () => {
    const source = JSON.stringify({ command: 'npx', args: ['--token', SAMPLE_SECRET] })
    const result = redactJsonFamily(source, 'json')
    expect(result.jsonInvalid).toBe(false)
    expect(result.blocked).toBe(false)
    expect(result.redacted).toBe(true)
    expectHidden(result.text)
    expect(result.text).toContain('npx')
    expect(result.text).toContain('--token')
    expect(result.text).toContain(`"${REDACTED_VALUE}"`)
  })

  it('redacts --api-key=value equals form in args', () => {
    const source = JSON.stringify({ command: 'npx', args: [`--api-key=${SAMPLE_SECRET}`] })
    const result = redactJsonFamily(source, 'json')
    expect(result.blocked).toBe(false)
    expectHidden(result.text)
    expect(result.text).toContain(`--api-key=${REDACTED_VALUE}`)
    expect(result.text).toContain('npx')
  })

  it('covers case, underscore, hyphen, and equals CLI flags without touching count fields', () => {
    const source = JSON.stringify({
      command: 'npx',
      args: [
        '--Token', SAMPLE_SECRET,
        '--access-token', SAMPLE_SECRET,
        `--ACCESS_TOKEN=${SAMPLE_SECRET}`,
        `--api_key=${SAMPLE_SECRET}`,
        '--client-secret', SAMPLE_SECRET,
        `--Client-Secret=${SAMPLE_SECRET}`,
        '--max-tokens', '99',
        '--maxTokens', '80',
        '--tokenCount', '3',
        '--verbose',
      ],
      tokenCount: 3,
      maxTokens: 99,
    })
    const result = redactJsonFamily(source, 'json')
    expect(result.blocked).toBe(false)
    expectHidden(result.text)
    expect(result.text).toContain('--Token')
    expect(result.text).toContain('--access-token')
    expect(result.text).toContain(`--ACCESS_TOKEN=${REDACTED_VALUE}`)
    expect(result.text).toContain(`--api_key=${REDACTED_VALUE}`)
    expect(result.text).toContain('--client-secret')
    expect(result.text).toContain(`--Client-Secret=${REDACTED_VALUE}`)
    expect(result.text).toContain('--max-tokens')
    expect(result.text).toContain('"99"')
    expect(result.text).toContain('--maxTokens')
    expect(result.text).toContain('"80"')
    expect(result.text).toContain('--tokenCount')
    expect(result.text).toContain('"3"')
    expect(result.text).toContain('--verbose')
    expect(result.text).toContain('"tokenCount": 3')
    expect(result.text).toContain('"maxTokens": 99')
    expect(isSensitiveCliFlag('--token')).toBe(true)
    expect(isSensitiveCliFlag('--api-key=x')).toBe(true)
    expect(isSensitiveCliFlag('--maxTokens')).toBe(false)
    expect(isSensitiveCliFlag('--tokenCount')).toBe(false)
  })

  it('redacts --header Authorization Bearer values and keeps the header name', () => {
    const source = JSON.stringify({
      command: 'npx',
      args: ['--header', `Authorization: Bearer ${SAMPLE_SECRET}`],
    })
    const result = redactJsonFamily(source, 'json')
    expect(result.blocked).toBe(false)
    expect(result.redacted).toBe(true)
    expectHidden(result.text)
    expect(result.text).toContain('--header')
    expect(result.text).toContain('Authorization: Bearer <REDACTED>')
    expect(result.text).toContain('npx')
  })

  it('redacts KEY=value argv strings and --header= / -H forms', () => {
    const source = JSON.stringify({
      command: 'npx',
      args: [
        `GITHUB_TOKEN=${SAMPLE_SECRET}`,
        `OPENAI_API_KEY=${SAMPLE_SECRET}`,
        `AWS_SECRET_ACCESS_KEY=${SAMPLE_SECRET}`,
        `--header=X-Api-Key: ${SAMPLE_SECRET}`,
        '-H',
        `Cookie: ${SAMPLE_SECRET}`,
        '--maxTokens',
        '80',
        '--tokenCount',
        '3',
        'https://example.com/callback',
      ],
      tokenCount: 3,
      maxTokens: 99,
    })
    const result = redactJsonFamily(source, 'json')
    expect(result.blocked).toBe(false)
    expectHidden(result.text)
    expect(result.text).toContain(`GITHUB_TOKEN=${REDACTED_VALUE}`)
    expect(result.text).toContain(`OPENAI_API_KEY=${REDACTED_VALUE}`)
    expect(result.text).toContain(`AWS_SECRET_ACCESS_KEY=${REDACTED_VALUE}`)
    expect(result.text).toContain(`--header=X-Api-Key: ${REDACTED_VALUE}`)
    expect(result.text).toContain('-H')
    expect(result.text).toContain(`Cookie: ${REDACTED_VALUE}`)
    expect(result.text).toContain('--maxTokens')
    expect(result.text).toContain('"80"')
    expect(result.text).toContain('--tokenCount')
    expect(result.text).toContain('"3"')
    expect(result.text).toContain('https://example.com/callback')
    expect(result.text).toContain('"tokenCount": 3')
    expect(result.text).toContain('"maxTokens": 99')
  })

  it('redacts cloud credential object keys without treating ordinary access/key fields as secrets', () => {
    const result = redactJsonFamily(JSON.stringify({
      AWS_ACCESS_KEY_ID: SAMPLE_SECRET,
      AWS_SECRET_ACCESS_KEY: SAMPLE_SECRET,
      AWS_SESSION_TOKEN: SAMPLE_SECRET,
      AWS_SECURITY_TOKEN: SAMPLE_SECRET,
      AZURE_CLIENT_SECRET: SAMPLE_SECRET,
      GOOGLE_APPLICATION_CREDENTIALS: SAMPLE_SECRET,
      access: 'public',
      key: 'name',
      tokenCount: 3,
      maxTokens: 99,
    }), 'json')
    expect(result.blocked).toBe(false)
    expectHidden(result.text)
    expect(result.text).toContain('"access": "public"')
    expect(result.text).toContain('"key": "name"')
    expect(result.text).toContain('"tokenCount": 3')
    expect(result.text).toContain('"maxTokens": 99')
  })

  it('blocks a URL query that still carries an env assignment after argv rewrite', () => {
    const source = JSON.stringify({
      command: 'npx',
      args: [`https://example.com/callback?GITHUB_TOKEN=${SAMPLE_SECRET}`],
    })
    const result = redactJsonFamily(source, 'json')
    expect(result.blocked).toBe(true)
    expect(result.text).toBe('')
    expect(JSON.stringify(result)).not.toContain(SAMPLE_SECRET)
  })
})

describe('unparseable JSON and YAML inline maps', () => {
  it('redacts unquoted GITHUB_TOKEN in invalid JSON', () => {
    const source = `{ GITHUB_TOKEN: "${SAMPLE_SECRET}" }`
    const result = redactJsonFamily(source, 'json')
    expect(result.jsonInvalid).toBe(true)
    expect(result.blocked).toBe(false)
    expectHidden(result.text)
    expect(result.text).toContain('GITHUB_TOKEN')
  })

  it('redacts YAML inline mappings under a non-sensitive parent key', () => {
    const source = `headers: { Authorization: ${SAMPLE_SECRET} }\n`
    const result = redactStructured(source, 'yaml')
    expect(result.blocked).toBe(false)
    expect(result.redacted).toBe(true)
    expectHidden(result.text)
    expect(result.text).toContain('headers:')
    expect(result.text).toContain('Authorization')
  })

  it('blocks invalid JSON when a nested secret cannot be rewritten reliably', () => {
    const source = `{ "api_key": "${SAMPLE_SECRET}`
    const result = redactJsonFamily(source, 'json')
    expect(result.jsonInvalid).toBe(true)
    expect(result.blocked).toBe(true)
    expect(result.text).toBe('')
    expect(JSON.stringify(result)).not.toContain(SAMPLE_SECRET)
    expect(hasUnresolvedSensitive(source)).toBe(true)
  })

  it('blocks YAML inline maps when braces are unbalanced around a sensitive key', () => {
    const source = `headers: { Authorization: { token: ${SAMPLE_SECRET}`
    const result = redactStructured(source, 'yaml')
    expect(result.blocked).toBe(true)
    expect(result.text).toBe('')
    expect(JSON.stringify(result)).not.toContain(SAMPLE_SECRET)
  })

  it('keeps conservative quoted-key JSON insertable after a successful rewrite', () => {
    const broken = `{ "api_key": "${SAMPLE_SECRET}", "broken"`
    const result = redactJsonFamily(broken, 'json')
    expect(result.jsonInvalid).toBe(true)
    expect(result.blocked).toBe(false)
    expectHidden(result.text)
  })
})
