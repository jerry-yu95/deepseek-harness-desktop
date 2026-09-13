import { describe, expect, it } from 'vitest'

import { moveTags } from '../src/core/tags.ts'

describe('knowledge tag moves', () => {
  it('moves, adds, and clears tags without duplicating the destination', () => {
    expect(moveTags(['A', 'X'], { from: 'A', to: 'B' })).toEqual(['X', 'B'])
    expect(moveTags(['A'], { from: null, to: 'B' })).toEqual(['A', 'B'])
    expect(moveTags(['A', 'B'], { from: 'A', to: 'B' })).toEqual(['B'])
    expect(moveTags([], { from: null, to: 'B' })).toEqual(['B'])
    expect(moveTags(['A', 'B'], { from: 'A', to: null })).toEqual([])
  })

  it('keeps exact case and NFC while rejecting a reserved virtual group and overflow', () => {
    expect(moveTags(['Cafe\u0301'], { from: null, to: '复盘' })).toEqual(['Café', '复盘'])
    expect(() => moveTags([], { from: null, to: '其他' })).toThrow(/reserved/u)
    expect(() => moveTags(Array.from({ length: 8 }, (_, index) => `tag-${index}`), { from: null, to: 'new' })).toThrow(/8/u)
  })
})
