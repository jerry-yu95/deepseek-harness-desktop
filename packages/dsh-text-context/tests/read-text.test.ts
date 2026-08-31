import { describe, expect, it } from 'vitest'

import { batchLimitError, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from '../src/core/limits.ts'
import { looksBinary, readTextFile } from '../src/core/read-text.ts'
import { makeFile } from './helpers.ts'

describe('readTextFile', () => {
  it('strips a UTF-8 BOM', async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])
    const result = await readTextFile(makeFile('a.json', bom, 'application/json'), MAX_FILE_BYTES)
    expect(result).toEqual({ ok: true, text: '{}', bytes: 5 })
  })

  it('rejects a file over 256 KiB', async () => {
    const oversized = makeFile('big.json', new Uint8Array(MAX_FILE_BYTES + 1), 'application/json')
    const result = await readTextFile(oversized, MAX_FILE_BYTES)
    expect(result).toEqual({ ok: false, reason: 'too-large' })
  })

  it('rejects non UTF-8 bytes', async () => {
    const result = await readTextFile(makeFile('bad.txt', new Uint8Array([0x80]), 'text/plain'), MAX_FILE_BYTES)
    expect(result).toEqual({ ok: false, reason: 'utf8' })
  })

  it('rejects NUL bytes', async () => {
    const result = await readTextFile(makeFile('nul.txt', new Uint8Array([0x61, 0x00, 0x62]), 'text/plain'), MAX_FILE_BYTES)
    expect(result).toEqual({ ok: false, reason: 'binary' })
  })

  it('flags control-heavy payloads as binary', () => {
    expect(looksBinary('ok\n')).toBe(false)
    expect(looksBinary('\u0001'.repeat(12))).toBe(true)
  })
})

describe('batchLimitError', () => {
  it('rejects more than four files', () => {
    expect(batchLimitError([1, 2, 3, 4, 5].map(() => ({ size: 10 })))).toBe('too-many')
  })

  it('rejects a single file over 256 KiB', () => {
    expect(batchLimitError([{ size: MAX_FILE_BYTES + 1 }])).toBe('too-large')
  })

  it('rejects a batch whose sizes sum past 1 MiB', () => {
    expect(batchLimitError([
      { size: 300_000 },
      { size: 300_000 },
      { size: 300_000 },
      { size: 300_000 },
    ], { maxFiles: 4, maxFileBytes: 400_000, maxTotalBytes: 500_000 })).toBe('total-too-large')
  })
})
