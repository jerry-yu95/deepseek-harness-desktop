import { afterEach, describe, expect, it } from 'vitest'

import { zh } from '../src/client/locales.ts'
import { REDACTED_VALUE } from '../src/core/limits.ts'
import { redactStructured, type RedactResult } from '../src/core/redact.ts'
import type { TextSyntax } from '../src/core/classify.ts'
import {
  dispatchFiles,
  install,
  makeFile,
  mountComposer,
  SAMPLE_SECRET,
  settle,
  toastMessages,
  uploadedFiles,
} from './helpers.ts'

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-dsh-extension-active')
})

function dumpResult(result: RedactResult): string {
  return `${result.text}\n${JSON.stringify(result)}`
}

function probe(text: string, syntax: TextSyntax): {
  redacted: boolean
  leaked: boolean
  blocked: boolean
  jsonInvalid: boolean
} {
  const result = redactStructured(text, syntax)
  return {
    redacted: result.redacted,
    leaked: dumpResult(result).includes(SAMPLE_SECRET),
    blocked: result.blocked,
    jsonInvalid: result.jsonInvalid,
  }
}

function expectSafeProbe(label: string, outcome: ReturnType<typeof probe>): void {
  expect(outcome.leaked, `${label} leaked`).toBe(false)
  expect(outcome.redacted || outcome.blocked, `${label} neither redacted nor blocked`).toBe(true)
}

describe('deterministic leak probes', () => {
  it('probe 1: JSON args --token value', () => {
    const source = '{"command":"npx","args":["--token","test-redact-value"]}'
    const outcome = probe(source, 'json')
    expectSafeProbe('probe-1', outcome)
    expect(outcome.blocked).toBe(false)
    expect(outcome.redacted).toBe(true)
    expect(redactStructured(source, 'json').text).toContain(REDACTED_VALUE)
  })

  it('probe 2: JSON args --api-key=value', () => {
    const source = '{"command":"npx","args":["--api-key=test-redact-value"]}'
    const outcome = probe(source, 'json')
    expectSafeProbe('probe-2', outcome)
    expect(outcome.blocked).toBe(false)
    expect(redactStructured(source, 'json').text).toContain(`--api-key=${REDACTED_VALUE}`)
  })

  it('probe 3: unquoted GITHUB_TOKEN invalid JSON', () => {
    const source = '{ GITHUB_TOKEN: "test-redact-value" }'
    const outcome = probe(source, 'json')
    expectSafeProbe('probe-3', outcome)
    expect(outcome.leaked).toBe(false)
  })

  it('probe 4: YAML inline headers Authorization mapping', () => {
    const source = 'headers: { Authorization: test-redact-value }'
    const outcome = probe(source, 'yaml')
    expectSafeProbe('probe-4', outcome)
    expect(outcome.blocked).toBe(false)
    expect(redactStructured(source, 'yaml').text).toContain('Authorization')
    expect(redactStructured(source, 'yaml').text).toContain(REDACTED_VALUE)
  })

  it('probe 5: JSON args --header Authorization Bearer', () => {
    const source = '{"command":"npx","args":["--header","Authorization: Bearer test-redact-value"]}'
    const outcome = probe(source, 'json')
    expectSafeProbe('probe-5', outcome)
    expect(outcome.leaked).toBe(false)
    expect(outcome.redacted).toBe(true)
    expect(outcome.blocked).toBe(false)
    expect(redactStructured(source, 'json').text).toContain('Authorization: Bearer <REDACTED>')
  })

  it('probe 6: JSON args GITHUB_TOKEN=value', () => {
    const source = '{"command":"npx","args":["GITHUB_TOKEN=test-redact-value"]}'
    const outcome = probe(source, 'json')
    expectSafeProbe('probe-6', outcome)
    expect(outcome.leaked).toBe(false)
    expect(outcome.redacted).toBe(true)
    expect(outcome.blocked).toBe(false)
    expect(redactStructured(source, 'json').text).toContain(`GITHUB_TOKEN=${REDACTED_VALUE}`)
  })

  it('probe 7: JSON AWS_SECRET_ACCESS_KEY object key', () => {
    const source = '{"AWS_SECRET_ACCESS_KEY":"test-redact-value"}'
    const outcome = probe(source, 'json')
    expectSafeProbe('probe-7', outcome)
    expect(outcome.leaked).toBe(false)
    expect(outcome.redacted).toBe(true)
    expect(outcome.blocked).toBe(false)
    expect(redactStructured(source, 'json').text).toContain(`"${REDACTED_VALUE}"`)
  })

  it('intake probes never leak the sample secret into composer or toasts', async () => {
    const stop = install()
    const ta = mountComposer({ value: 'draft-keep' }) as HTMLTextAreaElement
    const cases: Array<{ name: string; body: string; mime: string }> = [
      { name: 'p1.json', body: '{"command":"npx","args":["--token","test-redact-value"]}', mime: 'application/json' },
      { name: 'p2.json', body: '{"command":"npx","args":["--api-key=test-redact-value"]}', mime: 'application/json' },
      { name: 'p3.json', body: '{ GITHUB_TOKEN: "test-redact-value" }', mime: 'application/json' },
      { name: 'p4.yaml', body: 'headers: { Authorization: test-redact-value }', mime: 'application/yaml' },
      { name: 'p5.json', body: '{"command":"npx","args":["--header","Authorization: Bearer test-redact-value"]}', mime: 'application/json' },
      { name: 'p6.json', body: '{"command":"npx","args":["GITHUB_TOKEN=test-redact-value"]}', mime: 'application/json' },
      { name: 'p7.json', body: '{"AWS_SECRET_ACCESS_KEY":"test-redact-value"}', mime: 'application/json' },
    ]
    for (const item of cases) {
      ta.value = 'draft-keep'
      dispatchFiles('drop', [makeFile(item.name, item.body, item.mime)])
      await settle()
      expect(ta.value, item.name).not.toContain(SAMPLE_SECRET)
      expect(JSON.stringify(toastMessages()), item.name).not.toContain(SAMPLE_SECRET)
      for (const message of toastMessages()) {
        expect(message, item.name).not.toContain(SAMPLE_SECRET)
      }
      expect(ta.value === 'draft-keep' || ta.value.includes(`@${item.name}`), item.name).toBe(true)
      if (ta.value === 'draft-keep') {
        expect(toastMessages()).toContain(zh['toast.unsafeRedact'])
      } else {
        const stored = Buffer.from(uploadedFiles.at(-1)?.base64 ?? '', 'base64').toString('utf8')
        expect(stored).toContain(REDACTED_VALUE)
        expect(stored).not.toContain(SAMPLE_SECRET)
        expect(ta.value).not.toContain(item.body)
      }
    }
    stop()
  })
})
